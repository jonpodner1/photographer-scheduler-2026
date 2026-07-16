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
} = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
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
 * Maps a scheduler_users doc or an iOS-app users doc to one shape:
 * { displayName, email, role: 'admin'|'photographer', active: bool, fcmToken }.
 * Returns null if neither doc exists.
 */
function normalizeProfile(schedulerSnap, appSnap) {
  if (schedulerSnap && schedulerSnap.exists) {
    const d = schedulerSnap.data();
    return {
      displayName: d.displayName || d.email || "Photographer",
      email: d.email || "",
      role: d.role === "admin" ? "admin" : "photographer",
      active: d.status !== "pending" && d.status !== "denied",
      fcmToken: d.fcmToken || (appSnap && appSnap.exists ? appSnap.data().fcmToken : null) || null,
    };
  }
  if (appSnap && appSnap.exists) {
    const d = appSnap.data();
    const name = `${d.firstName || ""} ${d.lastName || ""}`.trim();
    return {
      displayName: name || d.email || "Photographer",
      email: d.email || "",
      role: d.isAdmin === true ? "admin" : "photographer",
      // iOS approval = the isPhotographer capability flag (admins implicitly ok)
      active: d.isPhotographer === true || d.isAdmin === true,
      fcmToken: d.fcmToken || null,
    };
  }
  return null;
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
      // A withdrawal reopens the event unless it was cancelled.
      status: data.status === "cancelled" ? "cancelled" : "open",
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
        status:
          data.status === "cancelled"
            ? "cancelled"
            : slots.length >= data.slotsNeeded
              ? data.status
              : "open",
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

// ─── Photo Drop: upload to the school Dropbox ─────────────────────────────────
// Any signed-in user with a profile can submit photos. The Dropbox credentials
// live in Secret Manager (never in the app), uploads land in the Dropbox app
// folder under /YYYY-MM-DD/, filenames carry the submitter's name, and every
// upload is logged to photo_submissions so admins can see who sent what.
//
// One-time setup (see README): create a scoped Dropbox app, mint a refresh
// token, then `firebase functions:secrets:set` DROPBOX_APP_KEY,
// DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN.
const DROPBOX_APP_KEY = defineSecret("DROPBOX_APP_KEY");
const DROPBOX_APP_SECRET = defineSecret("DROPBOX_APP_SECRET");
const DROPBOX_REFRESH_TOKEN = defineSecret("DROPBOX_REFRESH_TOKEN");

// Short-lived Dropbox access token, cached per function instance.
let dropboxAccess = { token: null, expiresAt: 0 };

async function dropboxAccessToken() {
  if (dropboxAccess.token && Date.now() < dropboxAccess.expiresAt - 60_000) {
    return dropboxAccess.token;
  }
  const basic = Buffer.from(
    `${DROPBOX_APP_KEY.value()}:${DROPBOX_APP_SECRET.value()}`
  ).toString("base64");
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: DROPBOX_REFRESH_TOKEN.value(),
    }),
  });
  if (!res.ok) {
    console.error("Dropbox token refresh failed:", res.status, await res.text());
    throw new HttpsError("internal", "Dropbox authentication failed — check the Dropbox secrets.");
  }
  const json = await res.json();
  dropboxAccess = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 14400) * 1000,
  };
  return dropboxAccess.token;
}

/** Strip characters Dropbox filenames can't take, collapse whitespace. */
function safeFileComponent(s, maxLength) {
  return (s || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

exports.uploadPhotoToDropbox = onCall(
  {
    secrets: [DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const uid = requireAuth(request);
    const profile = await resolveProfile(uid);
    if (!profile) throw new HttpsError("failed-precondition", "User profile not found.");

    const { imageBase64, caption = "", contentType = "image/jpeg" } = request.data || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "imageBase64 is required.");
    }
    // ~20 MB binary ceiling (callable requests cap at 32 MB with base64 overhead).
    if (imageBase64.length > 28_000_000) {
      throw new HttpsError("invalid-argument", "Photo is too large — please try a smaller one.");
    }

    let buffer;
    try {
      buffer = Buffer.from(imageBase64, "base64");
    } catch {
      throw new HttpsError("invalid-argument", "Invalid image data.");
    }

    // /2026-07-16/Jon Podner - homecoming parade - 1721145600000.jpg
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const who = safeFileComponent(profile.displayName, 40) || "Unknown";
    const what = safeFileComponent(caption, 40);
    const ext = contentType === "image/png" ? "png" : contentType === "image/heic" ? "heic" : "jpg";
    const path = `/${day}/${who}${what ? ` - ${what}` : ""} - ${Date.now()}.${ext}`;

    const token = await dropboxAccessToken();
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: true }),
      },
      body: buffer,
    });
    if (!res.ok) {
      console.error("Dropbox upload failed:", res.status, await res.text());
      throw new HttpsError("internal", "Upload to Dropbox failed. Please try again.");
    }
    const meta = await res.json();

    // Submission log: who sent what, when, and where it landed.
    await db.collection("photo_submissions").add({
      uid,
      name: profile.displayName,
      email: profile.email || "",
      caption: caption.slice(0, 200),
      fileName: meta.name,
      dropboxPath: meta.path_display,
      size: meta.size || buffer.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, fileName: meta.name };
  }
);

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
      status:
        data.status === "cancelled"
          ? "cancelled"
          : newSlots.length >= data.slotsNeeded
            ? "filled"
            : "open",
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

// ─── Cancellation fan-out ─────────────────────────────────────────────────────
// When an admin flips status to 'cancelled', notify every signed-up photographer.
exports.onEventUpdated = onDocumentUpdated(`${EVENTS}/{eventId}`, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === "cancelled" || after.status !== "cancelled") return;

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
