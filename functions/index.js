/**
 * Cloud Functions for the photographer scheduler.
 *
 * All slot mutations (signup / withdraw / assign) run here inside Firestore
 * transactions — this fixes the read-modify-write race that existed in the old
 * Flutter client — and all notification fan-out happens server-side instead of
 * from the client.
 *
 * Collections are namespaced (scheduler_*) so this app can share a Firebase
 * project with the existing iOS app.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const USERS = "scheduler_users";
const EVENTS = "scheduler_events";
const NOTIFICATIONS = "scheduler_notifications";
// The MCHS iOS app's own user collection. iOS users don't have scheduler_users
// docs — their photographer/admin capability lives on users/{uid} as booleans
// (isPhotographer / isAdmin), so identity is resolved from either collection.
const APP_USERS = "users";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "May 5" — matches the Flutter notification date format. */
function formatDate(tsOrDate) {
  const d = tsOrDate.toDate ? tsOrDate.toDate() : tsOrDate;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth.uid;
}

/**
 * Event status after a slot or slotsNeeded change: cancelled sticks, otherwise
 * filled/open by count. Used by every path that touches slots so the two
 * clients never see a stale status.
 */
function nextStatus(currentStatus, slotCount, slotsNeeded) {
  if (currentStatus === "cancelled") return "cancelled";
  return slotCount >= (slotsNeeded || 1) ? "filled" : "open";
}

/**
 * Maps a scheduler_users doc and/or an iOS-app users doc to one shape:
 * { displayName, email, role: 'admin'|'photographer', active: bool, fcmToken }.
 * Returns null if neither doc exists.
 *
 * ONE identity rule, shared with the security rules (isAdmin) and both clients
 * (web AuthContext.mergeProfiles, iOS AuthService):
 *   - admin in EITHER pool → admin (and always active);
 *   - otherwise, if the scheduler doc exists its approval status governs;
 *   - otherwise the iOS isPhotographer capability flag governs.
 */
function normalizeProfile(schedulerSnap, appSnap) {
  const s = schedulerSnap && schedulerSnap.exists ? schedulerSnap.data() : null;
  const a = appSnap && appSnap.exists ? appSnap.data() : null;
  if (!s && !a) return null;

  const isAdmin = (s && s.role === "admin") || (a && a.isAdmin === true) || false;
  const appName = a ? `${a.firstName || ""} ${a.lastName || ""}`.trim() : "";
  const active = isAdmin
    ? true
    : s
      ? s.status !== "pending" && s.status !== "denied"
      : a.isPhotographer === true;

  return {
    displayName: (s && s.displayName) || appName || (s && s.email) || (a && a.email) || "Photographer",
    email: (s && s.email) || (a && a.email) || "",
    role: isAdmin ? "admin" : "photographer",
    active,
    fcmToken: (s && s.fcmToken) || (a && a.fcmToken) || null,
  };
}

/** Loads a user from scheduler_users, falling back to the iOS app's users collection. */
async function resolveProfile(uid) {
  const [schedulerSnap, appSnap] = await Promise.all([
    db.collection(USERS).doc(uid).get(),
    db.collection(APP_USERS).doc(uid).get(),
  ]);
  return normalizeProfile(schedulerSnap, appSnap);
}

async function requireAdmin(uid) {
  const profile = await resolveProfile(uid);
  if (!profile || profile.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return profile;
}

/** Writes one notification doc per (userId) entry. Chunked to stay under the 500-op batch limit. */
async function writeNotifications(entries) {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const entry of entries.slice(i, i + 400)) {
      batch.set(db.collection(NOTIFICATIONS).doc(), {
        ...entry,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

/** Admins from both user collections, deduped by uid. */
async function getAdmins() {
  const [web, app] = await Promise.all([
    db.collection(USERS).where("role", "==", "admin").get(),
    db.collection(APP_USERS).where("isAdmin", "==", true).get(),
  ]);
  const byUid = new Map();
  web.docs.forEach((d) => byUid.set(d.id, { uid: d.id, ...d.data() }));
  app.docs.forEach((d) => { if (!byUid.has(d.id)) byUid.set(d.id, { uid: d.id, ...d.data() }); });
  return [...byUid.values()];
}

/** Approved photographers from both user collections, deduped by uid. */
async function getPhotographers() {
  const [web, app] = await Promise.all([
    db.collection(USERS).where("role", "==", "photographer").get(),
    db.collection(APP_USERS).where("isPhotographer", "==", true).get(),
  ]);
  const byUid = new Map();
  web.docs.forEach((d) => {
    const u = d.data();
    if (u.status !== "pending" && u.status !== "denied") byUid.set(d.id, { uid: d.id, ...u });
  });
  app.docs.forEach((d) => { if (!byUid.has(d.id)) byUid.set(d.id, { uid: d.id, ...d.data() }); });
  return [...byUid.values()];
}

// ─── signUpForEvent ───────────────────────────────────────────────────────────
// Transactional signup: re-reads the event inside the transaction and rejects
// if full / cancelled / already signed up.
exports.signUpForEvent = onCall(async (request) => {
  const uid = requireAuth(request);
  const { eventId, requestedCamera = false } = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "eventId is required.");

  const eventRef = db.collection(EVENTS).doc(eventId);

  const event = await db.runTransaction(async (txn) => {
    const [eventSnap, schedulerSnap, appSnap] = await txn.getAll(
      eventRef,
      db.collection(USERS).doc(uid),
      db.collection(APP_USERS).doc(uid),
    );
    if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

    const profile = normalizeProfile(schedulerSnap, appSnap);
    if (!profile) throw new HttpsError("failed-precondition", "User profile not found.");
    // Web accounts awaiting approval / iOS accounts without the photographer
    // capability cannot take slots.
    if (!profile.active) {
      throw new HttpsError("permission-denied", "Your account has not been approved yet.");
    }

    const data = eventSnap.data();
    const slots = data.slots || [];

    if (data.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This event has been cancelled.");
    }
    if (slots.some((s) => s.photographerId === uid)) {
      throw new HttpsError("already-exists", "You are already signed up for this event.");
    }
    if (slots.length >= data.slotsNeeded) {
      throw new HttpsError("failed-precondition", "This event is already full.");
    }

    const newSlots = [
      ...slots,
      {
        photographerId: uid,
        photographerName: profile.displayName,
        acceptedAt: Timestamp.now(),
        requestedCamera: Boolean(requestedCamera),
      },
    ];

    txn.update(eventRef, {
      slots: newSlots,
      photographerIds: newSlots.map((s) => s.photographerId),
      status: newSlots.length >= data.slotsNeeded ? "filled" : "open",
    });

    return { ...data, newSlotName: profile.displayName };
  });

  // Notify admins (server-side fan-out; previously done in the Flutter client).
  try {
    const admins = await getAdmins();
    await writeNotifications(
      admins.map((a) => ({
        userId: a.uid,
        type: "photographerSignedUp",
        title: "Photographer Signed Up",
        body: `${event.newSlotName} signed up for ${event.eventName}`,
        eventId,
        eventName: event.eventName,
      }))
    );
  } catch (err) {
    console.error("signup notification fan-out failed", err);
  }

  return { ok: true };
});

// ─── withdrawFromEvent ────────────────────────────────────────────────────────
// Self-withdrawal, or admin removal of another photographer via targetUid.
exports.withdrawFromEvent = onCall(async (request) => {
  const uid = requireAuth(request);
  const { eventId, targetUid } = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "eventId is required.");

  const removeUid = targetUid || uid;
  const removedByAdmin = removeUid !== uid;
  if (removedByAdmin) await requireAdmin(uid);

  const eventRef = db.collection(EVENTS).doc(eventId);

  const result = await db.runTransaction(async (txn) => {
    const eventSnap = await txn.get(eventRef);
    if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

    const data = eventSnap.data();
    const slots = data.slots || [];
    const removedSlot = slots.find((s) => s.photographerId === removeUid);
    if (!removedSlot) {
      throw new HttpsError("failed-precondition", "That photographer is not signed up for this event.");
    }

    const newSlots = slots.filter((s) => s.photographerId !== removeUid);
    txn.update(eventRef, {
      slots: newSlots,
      photographerIds: newSlots.map((s) => s.photographerId),
      // Reopens unless cancelled — or still full after an admin over-assignment.
      status: nextStatus(data.status, newSlots.length, data.slotsNeeded),
    });

    return { data, removedSlot };
  });

  if (removedByAdmin) {
    try {
      await writeNotifications([
        {
          userId: removeUid,
          type: "photographerRemoved",
          title: "Removed from Event",
          body: `You have been removed from ${result.data.eventName} on ${formatDate(result.data.date)}`,
          eventId,
          eventName: result.data.eventName,
        },
      ]);
    } catch (err) {
      console.error("removal notification failed", err);
    }
  }

  return { ok: true };
});

// ─── deleteAccount ────────────────────────────────────────────────────────────
// Self-service account deletion (App Store guideline 5.1.1(v)). Removes the
// caller from every event slot, deletes their notifications, follows, and
// profile docs in both user collections, then deletes the Auth account.
// Server-side deletion also avoids Firebase's "recent login required" error.
exports.deleteAccount = onCall(async (request) => {
  const uid = requireAuth(request);

  // Remove from all event slots (their name is personal data).
  const eventsSnap = await db
    .collection(EVENTS)
    .where("photographerIds", "array-contains", uid)
    .get();
  for (const doc of eventsSnap.docs) {
    await db.runTransaction(async (txn) => {
      const snap = await txn.get(doc.ref);
      if (!snap.exists) return;
      const data = snap.data();
      const slots = (data.slots || []).filter((s) => s.photographerId !== uid);
      txn.update(doc.ref, {
        slots,
        photographerIds: slots.map((s) => s.photographerId),
        status: nextStatus(data.status, slots.length, data.slotsNeeded),
      });
    });
  }

  // Their notifications.
  const notifs = await db.collection(NOTIFICATIONS).where("userId", "==", uid).get();
  for (let i = 0; i < notifs.docs.length; i += 400) {
    const batch = db.batch();
    notifs.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // iOS app subcollection (game follows), then both profile docs.
  const follows = await db.collection(APP_USERS).doc(uid).collection("follows").get();
  for (const d of follows.docs) await d.ref.delete();
  await db.collection(USERS).doc(uid).delete();
  await db.collection(APP_USERS).doc(uid).delete();

  // Auth account last, so a failure above leaves the user able to retry.
  await getAuth().deleteUser(uid);
  return { ok: true };
});

// ─── Photo Drop: direct-to-Wasabi uploads via presigned URLs ─────────────────
// Wasabi is S3-compatible, so the AWS SDK talks to it with a custom endpoint.
// Files can be up to 2 GB, so they never pass through Cloud Functions
// (32 MB request cap) — instead createUploadUrl mints a short-lived presigned
// PUT URL (server controls the key/filename), the device uploads straight to
// the bucket, and completeUpload verifies the object landed and finalizes the
// photo_submissions log entry so admins can see who sent what.
//
// One-time setup (see README): create the Wasabi bucket + access keys, then
// `firebase functions:secrets:set` WASABI_ACCESS_KEY / WASABI_SECRET_KEY and
// set WASABI_BUCKET / WASABI_REGION in functions/.env.
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const WASABI_ACCESS_KEY = defineSecret("WASABI_ACCESS_KEY");
const WASABI_SECRET_KEY = defineSecret("WASABI_SECRET_KEY");
const WASABI_BUCKET = defineString("WASABI_BUCKET");
const WASABI_REGION = defineString("WASABI_REGION", { default: "us-east-1" });

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per file

function wasabiClient() {
  return new S3Client({
    region: WASABI_REGION.value(),
    endpoint: `https://s3.${WASABI_REGION.value()}.wasabisys.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: WASABI_ACCESS_KEY.value(),
      secretAccessKey: WASABI_SECRET_KEY.value(),
    },
  });
}

/** Strip characters object keys/filenames shouldn't carry, collapse whitespace. */
function safeFileComponent(s, maxLength) {
  return (s || "")
    .replace(/[\\/:*?"<>|#%{}^\[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const EXT_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/gif": "gif",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
};

exports.createUploadUrl = onCall(
  { secrets: [WASABI_ACCESS_KEY, WASABI_SECRET_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const profile = await resolveProfile(uid);
    if (!profile) throw new HttpsError("failed-precondition", "User profile not found.");

    const {
      caption = "",
      contentType = "application/octet-stream",
      fileExtension = "",
      fileSize = 0,
    } = request.data || {};

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new HttpsError("invalid-argument", "fileSize is required.");
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      throw new HttpsError("invalid-argument", "Files must be 2 GB or smaller.");
    }

    const cleanExt = String(fileExtension).replace(/^\./, "").toLowerCase();
    const ext = /^[a-z0-9]{1,8}$/.test(cleanExt)
      ? cleanExt
      : EXT_BY_CONTENT_TYPE[contentType] || "bin";

    // Same naming structure as before: 2026-07-16/Jon Podner - homecoming - 1721145600000.jpg
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const who = safeFileComponent(profile.displayName, 40) || "Unknown";
    const what = safeFileComponent(caption, 40);
    const key = `${day}/${who}${what ? ` - ${what}` : ""} - ${Date.now()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      wasabiClient(),
      new PutObjectCommand({
        Bucket: WASABI_BUCKET.value(),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 6 * 60 * 60 } // slow connections + big files
    );

    const ref = await db.collection("photo_submissions").add({
      uid,
      name: profile.displayName,
      email: profile.email || "",
      caption: caption.slice(0, 200),
      fileName: key.split("/").pop(),
      storageKey: key,
      size: fileSize,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { uploadUrl, submissionId: ref.id, contentType };
  }
);

exports.completeUpload = onCall(
  { secrets: [WASABI_ACCESS_KEY, WASABI_SECRET_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const { submissionId } = request.data || {};
    if (!submissionId) throw new HttpsError("invalid-argument", "submissionId is required.");

    const ref = db.collection("photo_submissions").doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Submission not found.");
    if (snap.data().uid !== uid) {
      throw new HttpsError("permission-denied", "Not your submission.");
    }

    // Confirm the object actually landed in the bucket.
    let head;
    try {
      head = await wasabiClient().send(
        new HeadObjectCommand({
          Bucket: WASABI_BUCKET.value(),
          Key: snap.data().storageKey,
        })
      );
    } catch (err) {
      console.error("completeUpload: object not found", snap.data().storageKey, err.name);
      throw new HttpsError("failed-precondition", "The upload didn't finish — please try again.");
    }

    await ref.update({
      status: "uploaded",
      size: head.ContentLength || snap.data().size,
      uploadedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  }
);

// ─── Event photo uploads (web app) ────────────────────────────────────────────
// Photographers upload the photos they shot at an event they're signed up for,
// straight from the browser into a Wasabi bucket an admin sets up on the
// website's Settings page. Unlike Photo Drop above, the bucket and keys are
// runtime settings rather than deploy-time params, so they live in Firestore:
//
//   scheduler_settings/photoUploads  { enabled } — readable by any signed-in
//                                    user; drives the Upload Photos button.
//   scheduler_private/photoUploads   bucket, region, folder, access keys. The
//                                    rules deny every client, admins included,
//                                    and these functions never return the keys
//                                    (only the access key's last 4 characters),
//                                    so saved keys are never shown to anyone.
//   scheduler_photo_folders/{hash}   next file number for one bucket folder.
//
// Bucket layout (every event gets its own folder, named with its date so two
// events called "Varsity Football" never mix):
//   <folder>/<Event Name YYYY-MM-DD>/<Event Name YYYY-MM-DD> <n>.<ext>
// n counts 1, 2, 3… per folder and is handed out inside a transaction, so
// photographers uploading at the same time never collide or overwrite.
//
// Files go directly to Wasabi via short-lived presigned PUT URLs; Wasabi
// answers browser CORS preflights on every bucket by default, so the bucket
// needs no CORS setup.
const crypto = require("node:crypto");

const PHOTO_UPLOADS_FLAG_DOC = "scheduler_settings/photoUploads";
const PHOTO_UPLOADS_CONFIG_DOC = "scheduler_private/photoUploads";
const PHOTO_UPLOAD_FOLDERS = "scheduler_photo_folders";
// Event dates are stored as local midnight; the school runs on Central time.
const SCHOOL_TIME_ZONE = "America/Chicago";
const MAX_PHOTO_URLS_PER_CALL = 25;
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const WASABI_REGION_RE = /^[a-z]{2}-[a-z]+-\d{1,2}$/;

// Accepted photo extensions (common formats plus camera RAW) → Content-Type
// stored on the object. Mirrored by PHOTO_EXTENSIONS in the web app, which
// filters the picker; this list is the one that's enforced.
const PHOTO_CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng",
  cr2: "image/x-canon-cr2",
  cr3: "image/x-canon-cr3",
  nef: "image/x-nikon-nef",
  nrw: "image/x-nikon-nrw",
  arw: "image/x-sony-arw",
  raf: "image/x-fuji-raf",
  orf: "image/x-olympus-orf",
  rw2: "image/x-panasonic-rw2",
  pef: "image/x-pentax-pef",
  srw: "image/x-samsung-srw",
};

/** Client for the admin-configured bucket (not the Photo Drop one). */
function photoUploadsClient(cfg) {
  return new S3Client({
    region: cfg.region,
    // PHOTO_UPLOADS_ENDPOINT exists only for local testing against an S3 mock
    // (set in functions/.env.local, which the emulator reads and deploys skip).
    endpoint: process.env.PHOTO_UPLOADS_ENDPOINT || `https://s3.${cfg.region}.wasabisys.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // Otherwise the SDK adds a CRC32 of an *empty* body to every presigned PUT
    // URL, which S3-compatible stores may check against the real file.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/**
 * One folder/file name component: no path separators, control characters, or
 * characters that break object keys or desktop filesystems when downloaded.
 */
function safePathSegment(s, maxLength) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[/\\]/g, "-")
    .replace(/[\p{Cc}:*?"<>|#%{}^[\]`~]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    // No leading/trailing dots or spaces ("." / ".." segments, Windows names).
    .replace(/^[\s.]+|[\s.]+$/g, "");
}

/** The admin's folder setting → "Yearbook/2026-27" (no outer slashes); "" = bucket root. */
function cleanUploadFolder(s) {
  return String(s || "")
    .split(/[/\\]+/)
    .map((segment) => safePathSegment(segment, 60))
    .filter(Boolean)
    .slice(0, 5)
    .join("/");
}

/** "Homecoming Game 2026-10-03" — the event's folder and file-name stem. */
function eventUploadName(event) {
  const d = event.date && event.date.toDate ? event.date.toDate() : new Date();
  // Legacy events stored 2-digit years (e.g. 0025) — same fix as the web model.
  if (d.getUTCFullYear() < 100) d.setUTCFullYear(d.getUTCFullYear() + 2000);
  const day = d.toLocaleDateString("en-CA", { timeZone: SCHOOL_TIME_ZONE });
  return `${safePathSegment(event.eventName, 80) || "Event"} ${day}`;
}

async function loadPhotoUploads() {
  const [flagSnap, configSnap] = await Promise.all([
    db.doc(PHOTO_UPLOADS_FLAG_DOC).get(),
    db.doc(PHOTO_UPLOADS_CONFIG_DOC).get(),
  ]);
  return {
    enabled: flagSnap.exists && flagSnap.data().enabled === true,
    config: configSnap.exists ? configSnap.data() : {},
  };
}

/** What admins see on the Settings page — never the keys themselves. */
function photoUploadsView(enabled, config) {
  return {
    enabled,
    bucket: config.bucket || "",
    region: config.region || "us-east-1",
    folder: config.folder || "",
    accessKeyHint: config.accessKeyId ? config.accessKeyId.slice(-4) : null,
    hasSecretKey: Boolean(config.secretAccessKey),
  };
}

/** Proves the bucket exists in that region and the keys can reach it; throws a readable error. */
async function checkUploadBucket(config) {
  try {
    await photoUploadsClient(config).send(new HeadBucketCommand({ Bucket: config.bucket }), {
      abortSignal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    const code = err.code || (err.cause && err.cause.code);
    console.warn("photo uploads: bucket check failed", config.bucket, config.region, err.name, status || code);
    let message = "Couldn't connect to Wasabi with these settings. Check them and try again.";
    if (status === 301 || err.name === "PermanentRedirect") {
      message = `Bucket "${config.bucket}" is in a different region. Check the region.`;
    } else if (status === 401 || status === 403) {
      message =
        "Wasabi refused these keys. Check the access key and secret key, and that they're allowed to use this bucket.";
    } else if (status === 404 || err.name === "NotFound" || err.name === "NoSuchBucket") {
      message = `Wasabi has no bucket named "${config.bucket}" in ${config.region}.`;
    } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      message = `Couldn't reach Wasabi region "${config.region}". Check the region.`;
    }
    throw new HttpsError("failed-precondition", message);
  }
}

// ─── getPhotoUploadSettings / savePhotoUploadSettings (admin only) ────────────
exports.getPhotoUploadSettings = onCall(async (request) => {
  await requireAdmin(requireAuth(request));
  const { enabled, config } = await loadPhotoUploads();
  return photoUploadsView(enabled, config);
});

// Omitted fields keep their saved value, and blank key fields keep the saved
// keys — the page never has them to send back. Turning uploads on tests the
// bucket and keys first, so photographers never see a half-configured upload.
exports.savePhotoUploadSettings = onCall(async (request) => {
  const uid = requireAuth(request);
  const admin = await requireAdmin(uid);

  const input = request.data || {};
  const enabled = input.enabled === true;
  const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const { config: saved } = await loadPhotoUploads();

  const config = {
    bucket: (text(input.bucket, 63) ?? saved.bucket ?? "").toLowerCase(),
    region: (text(input.region, 32) ?? saved.region ?? "us-east-1").toLowerCase(),
    folder: input.folder !== undefined ? cleanUploadFolder(text(input.folder, 400)) : saved.folder || "",
    accessKeyId: text(input.accessKeyId, 256) || saved.accessKeyId || "",
    secretAccessKey: text(input.secretAccessKey, 256) || saved.secretAccessKey || "",
  };

  if (enabled) {
    if (!BUCKET_NAME_RE.test(config.bucket)) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a valid bucket name (lowercase letters, numbers, dots, and hyphens)."
      );
    }
    if (!WASABI_REGION_RE.test(config.region)) {
      throw new HttpsError("invalid-argument", "Enter a valid Wasabi region, like us-east-1.");
    }
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new HttpsError("invalid-argument", "Enter the Wasabi access key and secret key.");
    }
    await checkUploadBucket(config);
  }

  const batch = db.batch();
  batch.set(db.doc(PHOTO_UPLOADS_CONFIG_DOC), {
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
    updatedByName: admin.displayName,
  });
  batch.set(db.doc(PHOTO_UPLOADS_FLAG_DOC), {
    enabled,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return photoUploadsView(enabled, config);
});

// ─── createPhotoUploadUrls ────────────────────────────────────────────────────
// Reserves the next file numbers in the event's folder and returns one
// presigned PUT URL per file, in the order given. The browser asks for a few
// at a time as it uploads, so a closed tab leaves at most a small gap.
exports.createPhotoUploadUrls = onCall(async (request) => {
  const uid = requireAuth(request);
  const { eventId, files } = request.data || {};
  if (typeof eventId !== "string" || !eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_PHOTO_URLS_PER_CALL) {
    throw new HttpsError("invalid-argument", `Send between 1 and ${MAX_PHOTO_URLS_PER_CALL} files.`);
  }

  const photos = files.map((f) => {
    const ext = String((f && f.extension) || "").replace(/^\./, "").toLowerCase();
    const size = f && f.size;
    if (!Object.hasOwn(PHOTO_CONTENT_TYPES, ext)) {
      throw new HttpsError("invalid-argument", "Only photo files can be uploaded.");
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      throw new HttpsError("invalid-argument", "Photos must be 2 GB or smaller.");
    }
    return { ext, contentType: PHOTO_CONTENT_TYPES[ext] };
  });

  const [{ enabled, config }, eventSnap, profile] = await Promise.all([
    loadPhotoUploads(),
    db.collection(EVENTS).doc(eventId).get(),
    resolveProfile(uid),
  ]);
  if (!enabled) {
    throw new HttpsError("failed-precondition", "Photo uploads are turned off.");
  }
  if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new HttpsError("failed-precondition", "Photo uploads aren't set up yet. Ask an admin.");
  }
  if (!profile || !profile.active) {
    throw new HttpsError("permission-denied", "Your account has not been approved yet.");
  }
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

  const event = eventSnap.data();
  if (event.status === "cancelled") {
    throw new HttpsError("failed-precondition", "This event was cancelled.");
  }
  if (!(event.slots || []).some((s) => s.photographerId === uid)) {
    throw new HttpsError("permission-denied", "You can only upload photos for events you're signed up for.");
  }

  const name = eventUploadName(event);
  const prefix = config.folder ? `${config.folder}/${name}` : name;
  // Object keys max out at 1024 bytes; leave room for " <n>.<ext>".
  if (Buffer.byteLength(`${prefix}/${name}`) > 1000) {
    throw new HttpsError("failed-precondition", "The upload folder and event name are too long for Wasabi.");
  }

  // One counter per bucket folder (not per event): renaming an event or
  // changing the folder setting starts a fresh folder at 1, and two events
  // that resolve to the same folder share numbering instead of overwriting.
  const counterRef = db
    .collection(PHOTO_UPLOAD_FOLDERS)
    .doc(crypto.createHash("sha256").update(`${config.bucket}/${prefix}`).digest("hex"));
  const first = await db.runTransaction(async (txn) => {
    const snap = await txn.get(counterRef);
    const next = (snap.exists && snap.data().nextNumber) || 1;
    txn.set(counterRef, {
      bucket: config.bucket,
      prefix,
      eventId,
      nextNumber: next + photos.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return next;
  });

  const client = photoUploadsClient(config);
  const uploads = await Promise.all(
    photos.map(async (photo, i) => ({
      url: await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: `${prefix}/${name} ${first + i}.${photo.ext}`,
        }),
        { expiresIn: 6 * 60 * 60 } // slow connections + big RAW files
      ),
      contentType: photo.contentType,
    }))
  );

  return { uploads };
});

// ─── assignPhotographer (admin only) ─────────────────────────────────────────
// May exceed slotsNeeded, matching the Flutter admin behavior.
exports.assignPhotographer = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireAdmin(uid);

  const { eventId, photographerId } = request.data || {};
  if (!eventId || !photographerId) {
    throw new HttpsError("invalid-argument", "eventId and photographerId are required.");
  }

  const eventRef = db.collection(EVENTS).doc(eventId);

  const event = await db.runTransaction(async (txn) => {
    const [eventSnap, schedulerSnap, appSnap] = await txn.getAll(
      eventRef,
      db.collection(USERS).doc(photographerId),
      db.collection(APP_USERS).doc(photographerId),
    );
    if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

    const photographer = normalizeProfile(schedulerSnap, appSnap);
    if (!photographer) throw new HttpsError("not-found", "Photographer not found.");

    const data = eventSnap.data();
    const slots = data.slots || [];
    const name = photographer.displayName;

    if (data.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This event has been cancelled.");
    }
    if (slots.some((s) => s.photographerId === photographerId)) {
      throw new HttpsError("already-exists", `${name} is already assigned to this event.`);
    }

    const newSlots = [
      ...slots,
      {
        photographerId,
        photographerName: name,
        acceptedAt: Timestamp.now(),
        requestedCamera: false,
      },
    ];

    txn.update(eventRef, {
      slots: newSlots,
      photographerIds: newSlots.map((s) => s.photographerId),
      status: nextStatus(data.status, newSlots.length, data.slotsNeeded),
    });

    return data;
  });

  try {
    await writeNotifications([
      {
        userId: photographerId,
        type: "assignedToEvent",
        title: "You Have Been Assigned",
        body: `You have been assigned to ${event.eventName} on ${formatDate(event.date)} at ${event.location}`,
        eventId,
        eventName: event.eventName,
      },
    ]);
  } catch (err) {
    console.error("assignment notification failed", err);
  }

  return { ok: true };
});

// ─── setUserRole (admin only) ─────────────────────────────────────────────────
// Promote or demote someone in BOTH user pools at once. Accounts created in the
// MCHS app hold admin as users/{uid}.isAdmin, which the security rules refuse
// to let any client change directly; accounts created on the website hold it
// as scheduler_users/{uid}.role. Writing both (where they exist) keeps every
// resolver — rules, functions, web, iOS — in agreement.
exports.setUserRole = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireAdmin(uid);

  const { targetUid, role } = request.data || {};
  if (!targetUid || (role !== "admin" && role !== "photographer")) {
    throw new HttpsError("invalid-argument", "targetUid and role ('admin' | 'photographer') are required.");
  }
  if (targetUid === uid && role !== "admin") {
    throw new HttpsError("failed-precondition", "You can't remove your own admin access.");
  }

  const schedulerRef = db.collection(USERS).doc(targetUid);
  const appRef = db.collection(APP_USERS).doc(targetUid);
  const [schedulerSnap, appSnap] = await Promise.all([schedulerRef.get(), appRef.get()]);
  if (!schedulerSnap.exists && !appSnap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  const batch = db.batch();
  if (schedulerSnap.exists) {
    // Promotion implies approval; demotion leaves them an approved photographer.
    batch.update(schedulerRef, { role, status: "active" });
  }
  if (appSnap.exists) {
    batch.update(
      appRef,
      role === "admin"
        ? { isAdmin: true }
        : { isAdmin: false, isPhotographer: true, photographerRequested: false }
    );
  }
  await batch.commit();
  return { ok: true };
});

// ─── New-event fan-out ────────────────────────────────────────────────────────
// One in-app notification per photographer when an event is created. This was
// done client-side in the Flutter app; the CSV importer sets
// notifyOnCreate=false to skip fan-out on bulk imports.
exports.onEventCreated = onDocumentCreated(`${EVENTS}/{eventId}`, async (event) => {
  const data = event.data.data();
  if (data.notifyOnCreate === false) return;

  const photographers = await getPhotographers();
  await writeNotifications(
    photographers.map((p) => ({
      userId: p.uid,
      type: "newEvent",
      title: "New Event Available",
      body: `${data.eventName} on ${formatDate(data.date)} at ${data.location}`,
      eventId: event.params.eventId,
      eventName: data.eventName,
    }))
  );
});

// ─── Account approval workflow ────────────────────────────────────────────────
// New signups start status='pending' (enforced by security rules). Tell every
// admin there's an account to review, and tell the user when they're approved.
exports.onUserCreated = onDocumentCreated(`${USERS}/{uid}`, async (event) => {
  const data = event.data.data();
  if (data.status !== "pending") return;

  const admins = await getAdmins();
  await writeNotifications(
    admins.map((a) => ({
      userId: a.uid,
      type: "accountPending",
      title: "New Account Awaiting Approval",
      body: `${data.displayName || data.email} signed up and is waiting for approval`,
      eventId: "",
      eventName: "",
    }))
  );
});

exports.onUserUpdated = onDocumentUpdated(`${USERS}/{uid}`, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status !== "pending" || after.status !== "active") return;

  await writeNotifications([
    {
      userId: event.params.uid,
      type: "accountApproved",
      title: "Account Approved",
      body: "Your account has been approved — you can now sign up for events!",
      eventId: "",
      eventName: "",
    },
  ]);
});

// MCHS app photographer requests: when photographerRequested flips on (at
// signup or later), tell every admin there's a request to review — mirrors
// the web signup notification. Approval flips isPhotographer, and that user
// gets a welcome notification.
exports.onAppUserWritten = onDocumentWritten(`${APP_USERS}/{uid}`, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;

  const name =
    `${after.firstName || ""} ${after.lastName || ""}`.trim() || after.email || "Someone";

  if (after.photographerRequested === true && before?.photographerRequested !== true) {
    const admins = await getAdmins();
    await writeNotifications(
      admins.map((a) => ({
        userId: a.uid,
        type: "accountPending",
        title: "Photographer Request",
        body: `${name} requested photographer access in the MCHS app`,
        eventId: "",
        eventName: "",
      }))
    );
  }

  if (after.isPhotographer === true && before?.isPhotographer !== true) {
    await writeNotifications([
      {
        userId: event.params.uid,
        type: "accountApproved",
        title: "Photographer Access Approved",
        body: "You're in! You can now sign up for events from the Photographer menu.",
        eventId: "",
        eventName: "",
      },
    ]);
  }
});

// ─── Event updates: status normalization + cancellation fan-out ──────────────
// Both clients edit slotsNeeded directly (rules-gated) without recomputing
// status, so a 'filled' event given more slots stayed 'filled' and vanished
// from the web's open-events query while iOS still listed it. Normalize here
// so every path converges; the write is skipped when nothing changes, which
// also stops the trigger re-firing itself.
exports.onEventUpdated = onDocumentUpdated(`${EVENTS}/{eventId}`, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (after.status !== "cancelled") {
    const expected = nextStatus(after.status, (after.slots || []).length, after.slotsNeeded);
    if (after.status !== expected) {
      await event.data.after.ref.update({ status: expected });
    }
    return;
  }

  // When an admin flips status to 'cancelled', notify every signed-up photographer.
  if (before.status === "cancelled") return;

  const slots = after.slots || [];
  if (slots.length === 0) return;

  await writeNotifications(
    slots.map((s) => ({
      userId: s.photographerId,
      type: "eventCancelled",
      title: "Event Cancelled",
      body: `${after.eventName} on ${formatDate(after.date)} has been cancelled`,
      eventId: event.params.eventId,
      eventName: after.eventName,
    }))
  );
});

// ─── Push notifications ───────────────────────────────────────────────────────
// Forwards each in-app notification via FCM. The token is looked up on
// scheduler_users first, then the iOS app's users doc (which is where the MCHS
// app stores its fcmToken) — so scheduler notices reach iOS devices too.
exports.sendPushNotification = onDocumentCreated(
  `${NOTIFICATIONS}/{notifId}`,
  async (event) => {
    const notification = event.data.data();
    const userId = notification.userId;
    if (!userId) return null;

    const profile = await resolveProfile(userId);
    const fcmToken = profile && profile.fcmToken;
    if (!fcmToken) return null;

    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: "default",
          },
        },
      },
      data: {
        eventId: notification.eventId || "",
        type: notification.type || "",
      },
    };

    try {
      await getMessaging().send(message);
      console.log("Push notification sent to:", userId);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }

    return null;
  }
);
