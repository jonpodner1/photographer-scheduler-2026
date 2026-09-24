/**
 * Seeds the local Firebase emulators (npm run emulators) with test accounts and
 * events so the app can be tried end to end. Safe to re-run: it overwrites the
 * same docs. Only ever talks to the emulators (demo-scheduler project).
 *
 *   npm run emulators        # terminal 1
 *   npm run emulators:seed   # terminal 2, once the emulators are up
 *   npm run dev:emulators    # then open http://localhost:5173
 */
const path = require("node:path");
const { createRequire } = require("node:module");

// firebase-admin is installed for the Cloud Functions, not the web app.
const requireFromFunctions = createRequire(path.join(__dirname, "../functions/package.json"));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getAuth } = requireFromFunctions("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = requireFromFunctions("firebase-admin/firestore");

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

initializeApp({ projectId: "demo-scheduler" });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = "password";

const USERS = [
  { uid: "admin-1", email: "admin@example.com", displayName: "Ada Admin", role: "admin" },
  { uid: "admin-2", email: "admin2@example.com", displayName: "Grace Admin", role: "admin" },
  { uid: "photog-1", email: "photographer@example.com", displayName: "Pat Photographer", role: "photographer" },
  { uid: "photog-2", email: "photographer2@example.com", displayName: "Sam Shooter", role: "photographer" },
];

/** Local midnight `offset` days from today, plus an optional hour (like the web app stores them). */
function day(offset, hour = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, hour);
}

const slot = (uid, name) => ({
  photographerId: uid,
  photographerName: name,
  acceptedAt: Timestamp.now(),
  requestedCamera: false,
});
const PAT = slot("photog-1", "Pat Photographer");

const TAGS = [
  { id: "tag-football", name: "Football" },
  { id: "tag-fine-arts", name: "Fine Arts" },
];

const EVENTS = [
  { id: "homecoming", eventName: "Homecoming Game", tagId: "tag-football", offset: 0, hour: 19, location: "Main Stadium", slotsNeeded: 2, slots: [PAT] },
  { id: "choir", eventName: "Fall Choir Concert", tagId: "tag-fine-arts", offset: -5, hour: 18, location: "Auditorium", slotsNeeded: 1, slots: [PAT] },
  { id: "senior-night", eventName: "Senior Night: Volleyball / Soccer", offset: -2, hour: 17, location: "Gym", slotsNeeded: 2, slots: [PAT] },
  { id: "football-1", eventName: "Varsity Football", tagId: "tag-football", offset: 7, hour: 19, location: "Main Stadium", slotsNeeded: 2, slots: [PAT] },
  { id: "football-2", eventName: "Varsity Football", tagId: "tag-football", offset: 14, hour: 19, location: "Main Stadium", slotsNeeded: 2, slots: [] },
  { id: "spirit-week", eventName: "Spirit Week Assembly", offset: 3, hour: 9, location: "Gym", slotsNeeded: 1, slots: [PAT], status: "cancelled" },
];

async function upsertUser(u) {
  try {
    await auth.updateUser(u.uid, { email: u.email, password: PASSWORD, displayName: u.displayName });
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    await auth.createUser({ uid: u.uid, email: u.email, password: PASSWORD, displayName: u.displayName });
  }
  await db.collection("scheduler_users").doc(u.uid).set({
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: "active",
    phone: null,
    photoUrl: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function main() {
  for (const u of USERS) await upsertUser(u);

  await db.collection("scheduler_settings").doc("branding").set({
    orgName: "MCHS Yearbook (local)",
    logoUrl: null,
    primaryColorValue: 0xff1a237e,
    accentColorValue: 0xffff6f00,
    pdfHeaderLine1: "Photographer Schedule",
    pdfHeaderLine2: "",
    selfSignupEnabled: true,
  });

  for (const t of TAGS) {
    await db.collection("scheduler_tags").doc(t.id).set({
      name: t.name,
      createdBy: "admin-1",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  for (const e of EVENTS) {
    const slots = e.slots;
    await db.collection("scheduler_events").doc(e.id).set({
      eventName: e.eventName,
      date: Timestamp.fromDate(day(e.offset)),
      startTime: Timestamp.fromDate(day(e.offset, e.hour)),
      endTime: Timestamp.fromDate(day(e.offset, e.hour + 2)),
      location: e.location,
      notes: null,
      slotsNeeded: e.slotsNeeded,
      slots,
      photographerIds: slots.map((s) => s.photographerId),
      status: e.status || (slots.length >= e.slotsNeeded ? "filled" : "open"),
      tagId: e.tagId || null,
      createdBy: "admin-1",
      createdAt: FieldValue.serverTimestamp(),
      notifyOnCreate: false,
    });
  }

  console.log("Seeded the emulators. Sign in at http://localhost:5173 with (password: %s):", PASSWORD);
  for (const u of USERS) console.log(`  ${u.email.padEnd(28)} ${u.role}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Seeding failed — are the emulators running (npm run emulators)?", err);
    process.exit(1);
  }
);
