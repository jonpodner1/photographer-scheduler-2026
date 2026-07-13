#!/usr/bin/env bash
#
# update-events.sh — fast redeploy for events.mchsyearbook.org.
#
# Pulls the latest code from GitHub, rebuilds, and republishes the static
# output. Skips all system setup (nginx, certbot, Node installs) — use
# deploy-events.sh for first-time setup; use this for everyday updates.
#
# USAGE (on the server):
#   sudo update-events              # if you set up the symlink (see below)
#   sudo /opt/photographer-scheduler/deploy/update-events.sh
#   sudo /opt/photographer-scheduler/deploy/update-events.sh --force   # rebuild even if no new commits
#
# Optional one-time nicety — make it a command:
#   sudo ln -s /opt/photographer-scheduler/deploy/update-events.sh /usr/local/bin/update-events
#
# NOTE: changes under firebase/ or functions/ do NOT deploy here — they go to
# Firebase from your Mac:  firebase deploy --only firestore,functions
#
set -euo pipefail

APP_DIR="/opt/photographer-scheduler"
WEB_ROOT="/var/www/events.mchsyearbook.org"
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0 $*" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "No checkout at ${APP_DIR} — run deploy-events.sh first." >&2
  exit 1
fi

cd "${APP_DIR}"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
OLD=$(git rev-parse HEAD)
git fetch --prune origin
NEW=$(git rev-parse "origin/${BRANCH}")

if [[ "${OLD}" == "${NEW}" ]] && ! $FORCE; then
  echo "Already up to date: $(git log -1 --format='%h %s')"
  echo "(use --force to rebuild anyway)"
  exit 0
fi

if [[ "${OLD}" != "${NEW}" ]]; then
  echo "==> Updating ${OLD:0:7} → ${NEW:0:7}:"
  git log --oneline "${OLD}..${NEW}" | sed 's/^/      /'
  git reset --hard "origin/${BRANCH}"
fi

# npm ci is the slow part — only run it when the lockfile changed (or --force).
if $FORCE || [[ ! -d node_modules ]] || ! git diff --quiet "${OLD}" "${NEW}" -- package-lock.json; then
  echo "==> Installing dependencies…"
  npm ci
else
  echo "==> Dependencies unchanged — skipping npm ci."
fi

echo "==> Building…"
npm run build

echo "==> Publishing to ${WEB_ROOT}…"
rsync -a --delete dist/ "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

# No nginx reload needed: it's static files, and index.html is served
# with no-cache so browsers pick up the new build immediately.
echo ""
echo "==> Live: $(git log -1 --format='%h %s')"
