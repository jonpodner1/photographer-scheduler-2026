# Photographer Scheduler (Web)

Web app for scheduling yearbook photographers, replacing the previous Flutter
app. Admins create events; photographers sign up for open slots. Lives at
https://events.mchsyearbook.org.

- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui (components
  live in `src/components/ui/`, themed via CSS variables so org branding colors
  apply at runtime), react-router (browser history), FullCalendar, PapaParse.
  Pure static SPA — `npm run build` emits `dist/` served by nginx.
- **Backend:** Firebase — Auth (email/password), Firestore, Cloud Functions.
  Collections are namespaced `scheduler_*` so the app shares a project with the
  iOS app without data collisions.

First-time setup (Firebase console, `.env.local`, first admin account):
**see [SETUP.md](SETUP.md)**.

## Everyday workflow

```
┌──────────────┐    git push     ┌──────────┐   ssh + deploy script   ┌────────────────┐
│  local dev   │ ──────────────► │  GitHub  │ ──────────────────────► │ Ubuntu server  │
│  npm run dev │                 └──────────┘                         │ nginx + HTTPS  │
└──────────────┘                                                      └────────────────┘
```

1. **Develop locally**

   ```bash
   npm install
   npm run dev          # against the real Firebase project
   # or, without touching live data (see SETUP.md → local emulators):
   npm run emulators       # terminal 1: auth/firestore/functions emulators
   npm run emulators:seed  # terminal 2: test accounts + events
   npm run dev:emulators   # terminal 2: app at http://localhost:5173
   ```

2. **Push to GitHub**

   ```bash
   git add -A && git commit -m "..." && git push
   ```

3. **Deploy the site** (on the server)

   ```bash
   sudo /opt/photographer-scheduler/deploy/deploy-events.sh
   ```

   The script pulls the latest code, builds, and republishes. First-ever run:
   copy `deploy/deploy-events.sh` to the server, edit `REPO_URL` at the top,
   and run it — it installs nginx/git/certbot/Node, prompts once for the
   `VITE_FIREBASE_*` values, and writes the nginx site config.

4. **Deploy backend changes** (from your Mac, not the server) — only needed
   when `firebase/` or `functions/` change:

   ```bash
   firebase deploy --only firestore,functions
   ```

## One-time production steps

- **DNS**: A record for `events.mchsyearbook.org` → server IP. Once it
  resolves, run `sudo ./deploy-events.sh --with-ssl` to get the Let's Encrypt
  certificate (auto-renews via certbot's systemd timer). Certbot fails before
  DNS propagates, which is why this is a separate flag.
- **Firebase Auth authorized domains**: add `events.mchsyearbook.org`
  (Authentication → Settings → Authorized domains) or production sign-in fails.
- **Blaze plan**: required for Cloud Functions (see SETUP.md).

## Project layout

```
src/                     React app (pages/, components/, services/, context/)
firebase/firestore.rules Security rules (namespaced, signup role locked to 'photographer')
firebase/firestore.indexes.json  Composite indexes for the queries the app runs
functions/               Cloud Functions (Node 20)
deploy/deploy-events.sh  Server deploy script (nginx + certbot + SPA fallback)
firebase.json            Wires rules/indexes/functions/emulators
.env.example             Template for .env.local (VITE_FIREBASE_* config)
```

## Photo Drop (Wasabi) setup — one time

The iOS app's Photo Drop sends student photos/videos to a Wasabi storage
bucket (S3-compatible). Devices upload **directly** to the bucket using
short-lived presigned URLs minted by the `createUploadUrl` Cloud Function —
so files up to 2 GB work, credentials never ship in the app, and the server
controls filenames. `completeUpload` verifies the object landed and finalizes
the submission log. To set up:

1. **Create the bucket**: [console.wasabisys.com](https://console.wasabisys.com)
   → Buckets → Create Bucket → name it (e.g. `mchs-photo-drop`), pick a region
   (note it, e.g. `us-central-1`), leave versioning/logging off → Create.
2. **Create access keys**: console → Access Keys → Create New Access Key
   (root key is simplest; a sub-user policy-scoped to just this bucket is
   better if you want least privilege). Save the **Access Key** and
   **Secret Key** — the secret is shown only once.
3. **Point the functions at the bucket**: edit [functions/.env](functions/.env)
   and set `WASABI_BUCKET` and `WASABI_REGION` to match step 1.
4. **Store the keys** (from this folder; each prompts for the value):
   ```bash
   firebase functions:secrets:set WASABI_ACCESS_KEY
   firebase functions:secrets:set WASABI_SECRET_KEY
   ```
5. Deploy: `firebase deploy --only functions,firestore`

Uploads are filed as `YYYY-MM-DD/Name - caption - timestamp.ext` in the
bucket and logged to the `photo_submissions` collection (admins see
everyone's, users their own). Per-file limit: 2 GB, enforced in the app and
in `createUploadUrl`.

## Event photo uploads (web) — one time

Photographers upload the photos they shot from any event they're signed up
for (My Schedule, Past Events, or their Dashboard). Files go straight from the
browser to a Wasabi bucket; photographers only ever see a progress bar.
This is separate from Photo Drop above (different settings, and it can use a
different bucket).

1. Deploy the backend (new functions + rules): `firebase deploy --only firestore,functions`
2. In Wasabi, create (or reuse) a bucket and an access key. The key needs
   `s3:ListBucket` (Settings checks the bucket when you save) and
   `s3:PutObject`. No CORS setup is needed; Wasabi allows browser uploads on
   every bucket by default.
3. On the website: **Admin → Settings → Photo Uploads**, turn it on, enter the
   bucket, region, keys, and an optional folder, then **Save**. Saving tests the
   bucket and keys first. Saved keys are never shown again to anyone; admins
   only see the access key's last 4 characters.
4. Optional: **Settings → Event Tags** to create tags like Football, then pick
   a tag on each event (Edit Event, or New tag right in the form).

Files are named by the server, numbered 1, 2, 3… per event folder:

```
<folder>/<Tag>/<Event Name YYYY-MM-DD>/<Event Name YYYY-MM-DD> 1.jpg
<folder>/<Event Name YYYY-MM-DD>/<Event Name YYYY-MM-DD> 1.jpg     (untagged)
```

- Keys and bucket settings live in `scheduler_private/photoUploads`, which the
  rules close to every client (admins included). Only the functions read it.
- Numbers come from a counter per folder (`scheduler_photo_folders`), handed
  out in a transaction, so simultaneous uploads never collide or overwrite.
  A browser asks for a few numbers at a time, so a closed tab leaves at most a
  small gap in the numbering.
- Renaming an event, changing its tag, or renaming a tag only affects photos
  uploaded afterward. Files already in Wasabi stay where they are.

## Architecture notes

- **Signups are transactional.** The browser never writes `slots` directly;
  it calls the `signUpForEvent` / `withdrawFromEvent` / `assignPhotographer`
  callable functions, which re-read the event in a Firestore transaction and
  reject when full / cancelled / duplicate. (The old Flutter client had a
  read-modify-write race here.)
- **Notifications fan out server-side.** Cloud Function triggers create
  `scheduler_notifications` docs on event creation and cancellation; the
  callables write the signed-up/removed/assigned notices. Clients cannot create
  notification docs at all. `sendPushNotification` forwards each notification
  doc via FCM (APNs payload kept for the future iOS client).
- **`photographerIds` mirror array.** The functions maintain a flat uid array
  on each event so "My Schedule" is a real `array-contains` query instead of a
  full-collection scan.
- **Range queries.** Calendar/reports use `date >=` / `<` range queries with
  the composite indexes in `firebase/firestore.indexes.json` — no client-side
  filtering of the whole collection.
- **New accounts are always photographers** — enforced by security rules, not
  the UI. Promote admins from the Users tab (or the console).
- **Branding** (`scheduler_settings/branding`) drives the app colors via CSS
  variables and uses the same ARGB int format as the Flutter/iOS model.
