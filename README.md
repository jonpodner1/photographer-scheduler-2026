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
   # or, without touching live data:
   npm run emulators    # terminal 1: auth/firestore/functions emulators
   npm run dev:emulators # terminal 2
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

## Photo Drop (Dropbox) setup — one time

The iOS app's Photo Drop uploads student photos to the yearbook's Dropbox via
the `uploadPhotoToDropbox` Cloud Function. The Dropbox credentials live in
Secret Manager, never in the app. To set up:

1. **Create the Dropbox app**: [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)
   → Create app → **Scoped access** → **App folder** (uploads land in
   `Apps/<your-app-name>/`, isolated from the rest of your Dropbox) → name it
   (e.g. "MCHS Photo Drop").
2. **Permissions tab**: check `files.content.write` → Submit.
3. **Settings tab**: note the **App key** and **App secret**.
4. **Mint a refresh token** (signed into the yearbook's Dropbox account):
   - Open (with YOUR_APP_KEY substituted):
     `https://www.dropbox.com/oauth2/authorize?client_id=YOUR_APP_KEY&response_type=code&token_access_type=offline`
   - Approve, copy the code shown, then:
     ```bash
     curl https://api.dropbox.com/oauth2/token \
       -d code=THE_CODE -d grant_type=authorization_code \
       -u YOUR_APP_KEY:YOUR_APP_SECRET
     ```
   - Copy the `refresh_token` from the response.
5. **Store the secrets** (from this folder; each prompts for the value):
   ```bash
   firebase functions:secrets:set DROPBOX_APP_KEY
   firebase functions:secrets:set DROPBOX_APP_SECRET
   firebase functions:secrets:set DROPBOX_REFRESH_TOKEN
   ```
6. Deploy: `firebase deploy --only functions,firestore`

Uploads are filed as `/YYYY-MM-DD/Name - caption - timestamp.jpg` and logged
to the `photo_submissions` collection (admins see everyone's, users their own).

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
