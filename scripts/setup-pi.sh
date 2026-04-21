#!/usr/bin/env bash
# Provision a Raspberry Pi (Bookworm 64-bit, with desktop) to run the family calendar.
# Run this once after cloning the repo to /home/pi/calendar (or wherever).
#
# Usage:
#   ./scripts/setup-pi.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

echo "==> Installing system packages"
apt-get update
# Chromium package renamed to `chromium` on Debian Trixie (Pi OS 2024+).
if apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG=chromium
else
  CHROMIUM_PKG=chromium-browser
fi
apt-get install -y \
  python3 python3-venv python3-pip \
  "$CHROMIUM_PKG" \
  unclutter \
  curl ca-certificates

if ! command -v node >/dev/null; then
  echo "==> Installing Node.js 20 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Setting up Python venv"
sudo -u "$USER_NAME" python3 -m venv "$REPO_ROOT/backend/.venv"
sudo -u "$USER_NAME" "$REPO_ROOT/backend/.venv/bin/pip" install --upgrade pip
sudo -u "$USER_NAME" "$REPO_ROOT/backend/.venv/bin/pip" install -e "$REPO_ROOT/backend"

echo "==> Building frontend"
sudo -u "$USER_NAME" bash -lc "cd '$REPO_ROOT/frontend' && npm ci && npm run build"

if [[ ! -f "$REPO_ROOT/config.yaml" ]]; then
  cp "$REPO_ROOT/config.example.yaml" "$REPO_ROOT/config.yaml"
  chown "$USER_NAME":"$USER_NAME" "$REPO_ROOT/config.yaml"
  echo "==> Created config.yaml from example. EDIT IT before starting the service."
fi

echo "==> Installing systemd unit for backend"
sed "s|@USER@|$USER_NAME|g; s|@REPO@|$REPO_ROOT|g" \
  "$REPO_ROOT/scripts/calendar-backend.service.tmpl" \
  > /etc/systemd/system/calendar-backend.service

systemctl daemon-reload
systemctl enable calendar-backend.service

echo "==> Installing kiosk autostart entry for $USER_NAME"
AUTOSTART_DIR="/home/$USER_NAME/.config/autostart"
sudo -u "$USER_NAME" mkdir -p "$AUTOSTART_DIR"
sed "s|@REPO@|$REPO_ROOT|g" \
  "$REPO_ROOT/scripts/calendar-kiosk.desktop.tmpl" \
  > "$AUTOSTART_DIR/calendar-kiosk.desktop"
chown "$USER_NAME":"$USER_NAME" "$AUTOSTART_DIR/calendar-kiosk.desktop"

echo
echo "Setup complete."
echo
echo "Next steps:"
echo "  1. Edit $REPO_ROOT/config.yaml with your iCloud accounts and calendars."
echo "  2. sudo systemctl start calendar-backend"
echo "  3. Reboot to launch the kiosk: sudo reboot"
echo
echo "Useful:"
echo "  journalctl -u calendar-backend -f      # backend logs"
echo "  curl http://localhost:8000/api/health  # check backend"
