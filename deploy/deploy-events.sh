#!/usr/bin/env bash
#
# deploy-events.sh — build & deploy the photographer scheduler web app to
# https://events.mchsyearbook.org on a fresh Ubuntu 22.04/24.04 server.
#
# WHAT THIS DEPLOYS: the static Vite build (dist/) served by nginx.
#
# WHAT THIS DOES NOT DEPLOY: Firestore rules, indexes, and Cloud Functions.
# Those run on Firebase, not on this server — deploy them from your Mac:
#     firebase deploy --only firestore,functions
#
# USAGE
#   1. Edit REPO_URL below to point at your GitHub repo.
#   2. First run (before DNS points here):   sudo ./deploy-events.sh
#      → installs everything, builds, serves over plain HTTP.
#   3. After the DNS A record for events.mchsyearbook.org resolves to this
#      server:                               sudo ./deploy-events.sh --with-ssl
#      → obtains the Let's Encrypt certificate and switches nginx to HTTPS.
#   4. Every later deploy (after a git push): sudo ./deploy-events.sh
#      → pulls, rebuilds, republishes. Fully idempotent.
#
set -euo pipefail

# ── EDIT THIS ─────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/jonpodner1/photographer-scheduler-2026.git"
# ──────────────────────────────────────────────────────────────────────────────

DOMAIN="events.mchsyearbook.org"
APP_DIR="/opt/photographer-scheduler"
WEB_ROOT="/var/www/${DOMAIN}"
NODE_MAJOR=22   # any Node >=20 works for the Vite build; 22 is current LTS
CERTBOT_EMAIL=""   # optional: set to skip the certbot email prompt

WITH_SSL=false
[[ "${1:-}" == "--with-ssl" ]] && WITH_SSL=true

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0 $*" >&2
  exit 1
fi

echo "==> Installing system packages (nginx, git, certbot)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx git certbot python3-certbot-nginx ca-certificates curl gnupg

# ── Node.js (NodeSource) — only if missing or too old ────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  echo "==> Installing Node.js ${NODE_MAJOR}.x…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo "    node $(node -v) / npm $(npm -v)"

# ── Clone or update the repo ──────────────────────────────────────────────────
if [[ -d "${APP_DIR}/.git" ]]; then
  echo "==> Updating existing checkout in ${APP_DIR}…"
  git -C "${APP_DIR}" fetch --prune
  git -C "${APP_DIR}" reset --hard "origin/$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD)"
else
  echo "==> Cloning ${REPO_URL} into ${APP_DIR}…"
  git clone "${REPO_URL}" "${APP_DIR}"
fi

# ── .env.local — created once, never overwritten, never in git ───────────────
ENV_FILE="${APP_DIR}/.env.local"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo ""
  echo "==> First run: enter your Firebase web-app config values."
  echo "    (Firebase console → Project settings → Your apps → Web app)"
  read -rp "  VITE_FIREBASE_API_KEY: "             FB_API_KEY
  read -rp "  VITE_FIREBASE_AUTH_DOMAIN: "         FB_AUTH_DOMAIN
  read -rp "  VITE_FIREBASE_PROJECT_ID: "          FB_PROJECT_ID
  read -rp "  VITE_FIREBASE_STORAGE_BUCKET: "      FB_STORAGE_BUCKET
  read -rp "  VITE_FIREBASE_MESSAGING_SENDER_ID: " FB_SENDER_ID
  read -rp "  VITE_FIREBASE_APP_ID: "              FB_APP_ID
  cat > "${ENV_FILE}" <<EOF
VITE_FIREBASE_API_KEY=${FB_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${FB_AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${FB_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${FB_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${FB_SENDER_ID}
VITE_FIREBASE_APP_ID=${FB_APP_ID}
VITE_USE_EMULATORS=false
EOF
  chmod 600 "${ENV_FILE}"
  echo "    Wrote ${ENV_FILE} (chmod 600)."
else
  echo "==> Reusing existing ${ENV_FILE}."
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "==> Installing dependencies and building…"
cd "${APP_DIR}"
npm ci
npm run build

# ── Publish static output ─────────────────────────────────────────────────────
echo "==> Publishing dist/ to ${WEB_ROOT}…"
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${APP_DIR}/dist/" "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"

# ── nginx server block ────────────────────────────────────────────────────────
# Written only if absent or still the pre-SSL version; certbot rewrites it for
# HTTPS, and we must not clobber certbot's changes on redeploys.
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
if [[ ! -f "${NGINX_SITE}" ]] || ! grep -q "ssl_certificate" "${NGINX_SITE}"; then
  echo "==> Writing nginx config for ${DOMAIN}…"
  cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Hashed build assets are immutable — cache aggressively.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    # index.html must never be cached so new deploys are picked up immediately.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # SPA fallback: react-router handles all paths client-side.
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${DOMAIN}"
  rm -f /etc/nginx/sites-enabled/default
else
  echo "==> nginx config already SSL-enabled — leaving it untouched."
fi

nginx -t
# Fresh installs: nginx may not be running yet; make sure it's enabled at boot,
# then reload if active or start it if not.
systemctl enable --now nginx
systemctl reload-or-restart nginx

# ── HTTPS (run with --with-ssl once DNS resolves to this server) ─────────────
if $WITH_SSL; then
  echo "==> Obtaining/renewing Let's Encrypt certificate for ${DOMAIN}…"
  if [[ -n "${CERTBOT_EMAIL}" ]]; then
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect
  else
    certbot --nginx -d "${DOMAIN}" --agree-tos --redirect
  fi
  # certbot installs a systemd timer for auto-renewal; verify it's active.
  systemctl list-timers certbot.timer --no-pager | head -3 || true
  echo "    Auto-renewal handled by certbot.timer."
elif [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo ""
  echo "NOTE: serving plain HTTP. After the DNS A record for ${DOMAIN}"
  echo "      points at this server, run:  sudo $0 --with-ssl"
fi

echo ""
echo "==> Done. ${DOMAIN} is serving the latest build from ${WEB_ROOT}."
echo "    Reminder: firestore rules/functions deploy from your Mac with"
echo "    'firebase deploy --only firestore,functions' — never from this server."
