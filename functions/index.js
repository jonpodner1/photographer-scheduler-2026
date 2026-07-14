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
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const USERS = "scheduler_users";
const EVENTS = "scheduler_events";
const NOTIFICATIONS = "scheduler_notifications";

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

async function requireAdmin(uid) {
  const snap = await db.collection(USERS).doc(uid).get();
  if (!snap.exists || snap.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return snap.data();
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

async function getUsersByRole(role) {
  const snap = await db.collection(USERS).where("role", "==", role).get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// ─── signUpForEvent ───────────────────────────────────────────────────────────
// Transactional signup: re-reads the event inside the transaction and rejects
// if full / cancelled / already signed up.
exports.signUpForEvent = onCall(async (request) => {
  const uid = requireAuth(request);
  const { eventId, requestedCamera = false } = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "eventId is required.");

  const eventRef = db.collection(EVENTS).doc(eventId);
  const userRef = db.collection(USERS).doc(uid);

  const event = await db.runTransaction(async (txn) => {
    const [eventSnap, userSnap] = await Promise.all([txn.get(eventRef), txn.get(userRef)]);
    if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "User profile not found.");

    // Accounts awaiting approval (or denied) cannot take slots.
    const callerStatus = userSnap.data().status;
    if (callerStatus === "pending" || callerStatus === "denied") {
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
        photographerName: userSnap.data().displayName || "Photographer",
        acceptedAt: Timestamp.now(),
        requestedCamera: Boolean(requestedCamera),
      },
    ];

    txn.update(eventRef, {
      slots: newSlots,
      photographerIds: newSlots.map((s) => s.photographerId),
      status: newSlots.length >= data.slotsNeeded ? "filled" : "open",
    });

    return { ...data, newSlotName: userSnap.data().displayName || "Photographer" };
  });

  // Notify admins (server-side fan-out; previously done in the Flutter client).
  try {
    const admins = await getUsersByRole("admin");
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
  const photographerRef = db.collection(USERS).doc(photographerId);

  const event = await db.runTransaction(async (txn) => {
    const [eventSnap, photographerSnap] = await Promise.all([
      txn.get(eventRef),
      txn.get(photographerRef),
    ]);
    if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
    if (!photographerSnap.exists) throw new HttpsError("not-found", "Photographer not found.");

    const data = eventSnap.data();
    const slots = data.slots || [];
    const name = photographerSnap.data().displayName || "Photographer";

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

  const photographers = (await getUsersByRole("photographer")).filter(
    (p) => p.status !== "pending" && p.status !== "denied"
  );
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

  const admins = await getUsersByRole("admin");
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
// Ported from the Flutter project's sendPushNotification, pointed at the
// scheduler_* collections. The APNs payload is kept for the future iOS client;
// web clients simply won't have an fcmToken and are skipped.
exports.sendPushNotification = onDocumentCreated(
  `${NOTIFICATIONS}/{notifId}`,
  async (event) => {
    const notification = event.data.data();
    const userId = notification.userId;
    if (!userId) return null;

    const userDoc = await db.collection(USERS).doc(userId).get();
    if (!userDoc.exists) return null;

    const fcmToken = userDoc.data().fcmToken;
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
