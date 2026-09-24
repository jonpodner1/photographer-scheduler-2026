# Setup Guide

Step-by-step, one-time setup for the Photographer Scheduler web app. Do these in
order on your Mac. You'll need the Firebase project the iOS app uses (the web app
stores its data in separate `scheduler_*` collections, so nothing collides).

## 1. Enable Email/Password sign-in

1. Open [Firebase console](https://console.firebase.google.com/) → your project.
2. **Build → Authentication → Sign-in method**.
3. Enable **Email/Password** (just the first toggle; email link not needed).

## 2. Create a web app & get the config

1. Console → **Project settings** (gear icon) → **Your apps**.
2. Click **Add app → Web** (`</>` icon). Name it e.g. "Scheduler Web". No hosting needed.
3. You'll be shown a `firebaseConfig` object. Keep it open for the next step.

## 3. Fill in `.env.local`

```bash
cp .env.example .env.local
```

Edit `.env.local` and paste each value from the config object:

| .env.local variable | firebaseConfig field |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

`.env.local` is gitignored — never commit it.

## 4. Firebase CLI

```bash
npm install -g firebase-tools   # if not installed
firebase login
firebase use <your-project-id>
```

## 5. Upgrade to the Blaze plan (required for Cloud Functions)

Console → bottom-left **Upgrade** → Blaze (pay as you go). Required to deploy
Cloud Functions; a school-sized app stays comfortably in the free allowances.

## 6. Deploy rules, indexes, and functions

```bash
# security rules + composite indexes
firebase deploy --only firestore

# Cloud Functions (installs deps first)
cd functions && npm install && cd ..
firebase deploy --only functions
```

If Firestore isn't enabled yet, the console will prompt you to create the
database first (**Build → Firestore Database → Create database**, production mode).

## 7. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## 8. Create the first account & make it admin

1. In the app, click **Create an account** and sign up (this creates a
   `scheduler_users` doc with role `photographer` and status `pending`).
2. Console → **Firestore Database → scheduler_users** → open your user's doc.
3. Edit **both** fields: `role` → `admin` **and** `status` → `active`.
   (With `status` still `pending` you'd be stuck on the "Waiting for approval"
   page with nobody able to approve you.)
4. Refresh the app — you'll land in the admin view. From now on you can
   approve sign-ups and promote/demote anyone from the app's **Users** tab.
   Make Admin works for accounts created in the MCHS iOS app too (it goes
   through the `setUserRole` Cloud Function, which updates both user records).

If you already have an admin account in the MCHS iOS app (`users/{uid}` with
`isAdmin: true`), just sign in to the website with it — no web signup needed.

## 9. Production one-time steps

- **DNS**: add an A record for `events.mchsyearbook.org` pointing at your server.
- **Authorized domains**: Console → Authentication → Settings → Authorized
  domains → add `events.mchsyearbook.org` (otherwise sign-in fails in prod).
- Deploy the site to the server — see [README.md](README.md) and
  [deploy/deploy-events.sh](deploy/deploy-events.sh).

## Optional: local emulators

Runs the whole app on your Mac without touching live data. The emulators run
under a `demo-scheduler` project, which Firebase keeps fully offline. The
Firestore emulator needs Java 21+ (`brew install openjdk@21`, then put it on
PATH, e.g. `export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`).

```bash
# terminal 1 — emulators (auth :9099, firestore :8080, functions :5001, UI :4000)
cd functions && npm install && cd ..
npm run emulators

# terminal 2 — test accounts and events, then the app pointed at the emulators
npm run emulators:seed
npm run dev:emulators
```

Sign in at http://localhost:5173 with `admin@example.com` or
`photographer@example.com` (password `password`; the seed script lists all
four accounts). Emulator data is thrown away when the emulators stop; re-run
`npm run emulators:seed` after each restart.

Photo uploads work locally too: enable them on the Settings page with your
real Wasabi bucket and keys, and files from the local app land in Wasabi.
