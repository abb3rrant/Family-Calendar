#!/usr/bin/env bash
# Provision a Raspberry Pi running Raspberry Pi OS Lite (64-bit) as a
# dedicated calendar kiosk. Boots straight to Chromium fullscreen, no
# desktop environment, optimised for low-RAM hardware (Pi 3B / 3B+).
#
# Usage (on the Pi, after cloning the repo):
#   sudo ./scripts/setup-pi-lite.sh
#
# What it does:
#   1. Installs the minimum X stack (xserver, openbox, unclutter) + Chromium
#   2. Installs Node 20, Python 3, builds the frontend, sets up the venv
#   3. Enables auto-login on tty1 for the chosen user
#   4. Drops a .bash_profile entry that launches startx on first login
#   5. Installs ~/.xinitrc (openbox + chromium kiosk) + systemd unit for the backend
#   6. Tunes /boot/firmware/config.txt for kiosk use (gpu_mem, hdmi)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Could not resolve home directory for user $USER_NAME" >&2
  exit 1
fi

echo "==> Updating apt cache"
apt-get update

echo "==> Installing kiosk packages (X, openbox, chromium)"
# Chromium package renamed to `chromium` on Debian Trixie (Pi OS 2024+).
# Older Pi OS Bookworm still ships `chromium-browser`. Prefer the new name,
# fall back to the old one if it's not in the apt repo yet.
if apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG=chromium
else
  CHROMIUM_PKG=chromium-browser
fi
echo "    using package: $CHROMIUM_PKG"

apt-get install -y --no-install-recommends \
  xserver-xorg \
  xserver-xorg-legacy \
  xserver-xorg-input-libinput \
  xserver-xorg-input-evdev \
  xinit \
  x11-xserver-utils \
  openbox \
  unclutter \
  "$CHROMIUM_PKG" \
  fonts-noto-color-emoji \
  fonts-inter \
  curl ca-certificates \
  python3 python3-venv python3-pip

# xserver-xorg-legacy is needed so a non-root user can start X via startx.
# Two things matter on Debian Trixie:
#   - allowed_users=anybody    : any user can launch the X server
#   - needs_root_rights=yes    : X gets the tty0 access it needs to set up VT
cat > /etc/X11/Xwrapper.config <<'EOF'
allowed_users=anybody
needs_root_rights=yes
EOF

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
  echo "==> Seeded config.yaml from example (optional — settings live in DB now)."
fi

echo "==> Installing backend systemd unit"
sed "s|@USER@|$USER_NAME|g; s|@REPO@|$REPO_ROOT|g" \
  "$REPO_ROOT/scripts/calendar-backend.service.tmpl" \
  > /etc/systemd/system/calendar-backend.service

echo "==> Installing kiosk X session launcher"
install -m 0755 "$REPO_ROOT/scripts/xinit-kiosk.sh" /usr/local/bin/calendar-kiosk-session
sed "s|@REPO@|$REPO_ROOT|g" \
  "$REPO_ROOT/scripts/xinitrc.tmpl" \
  > "$USER_HOME/.xinitrc"
chmod +x "$USER_HOME/.xinitrc"
chown "$USER_NAME":"$USER_NAME" "$USER_HOME/.xinitrc"

# Auto-startx after login on tty1. Using `$(tty)` is more reliable than
# checking $XDG_VTNR (which is sometimes unset on Trixie Lite) and
# importantly, it does NOT fire over SSH (which gives /dev/pts/N) — so we
# don't accidentally kill SSH sessions when debugging.
PROFILE_MARKER='# --- calendar kiosk autostart ---'
if ! grep -qF "$PROFILE_MARKER" "$USER_HOME/.bash_profile" 2>/dev/null; then
  # Strip any previous (broken) guard we may have left from older versions
  sed -i '/exec startx -- -nocursor/d' "$USER_HOME/.bash_profile" 2>/dev/null || true
  cat >> "$USER_HOME/.bash_profile" <<'EOF'

# --- calendar kiosk autostart ---
if [ "$(tty)" = "/dev/tty1" ] && [ -z "${DISPLAY:-}" ]; then
  exec startx -- -nocursor
fi
EOF
  chown "$USER_NAME":"$USER_NAME" "$USER_HOME/.bash_profile"
fi

echo "==> Enabling auto-login on tty1 for $USER_NAME"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER_NAME --noclear %I \$TERM
EOF

echo "==> Tuning /boot/firmware/config.txt"
CONFIG=/boot/firmware/config.txt
[[ ! -f "$CONFIG" ]] && CONFIG=/boot/config.txt
if [[ -f "$CONFIG" ]]; then
  # More GPU memory helps Chromium compositing on the Pi 3B VideoCore IV.
  # 256 is generally the sweet spot; the remaining 768MB is plenty for the
  # backend + X + browser on a 1GB Pi 3B.
  if grep -q "^gpu_mem=" "$CONFIG"; then
    sed -i 's/^gpu_mem=.*/gpu_mem=256/' "$CONFIG"
  else
    echo "gpu_mem=256" >> "$CONFIG"
  fi
  # Keep HDMI alive even with no signal at boot
  if ! grep -q "^hdmi_force_hotplug=1" "$CONFIG"; then
    echo "hdmi_force_hotplug=1" >> "$CONFIG"
  fi
  # Disable display blanking by Pi firmware
  if ! grep -q "^disable_overscan=1" "$CONFIG"; then
    echo "disable_overscan=1" >> "$CONFIG"
  fi
  # Only the original Pi 3B (not 3B+ or later) benefits from a modest
  # overclock — stock 1.2 GHz → 1.35 GHz. Pi 3B+ already runs at 1.4 GHz
  # with different silicon and our over_voltage value can destabilise it,
  # so we skip this entirely on anything newer.
  PI_MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo '')"
  if [[ "$PI_MODEL" == "Raspberry Pi 3 Model B Rev"* ]] \
     && ! grep -q "^arm_freq=" "$CONFIG"; then
    {
      echo ""
      echo "# Family Calendar: modest overclock for smoother UI on Pi 3B."
      echo "# Safe with a heatsink; comment out if the Pi ever hits 85°C."
      echo "arm_freq=1350"
      echo "over_voltage=4"
      echo "temp_limit=75"
    } >> "$CONFIG"
    echo "    Applied overclock for Pi 3B"
  elif [[ -n "$PI_MODEL" ]]; then
    echo "    Skipping overclock (detected: $PI_MODEL — already fast enough)"
  fi
fi

systemctl daemon-reload
systemctl enable calendar-backend.service

echo
echo "Setup complete."
echo
echo "Next steps:"
echo "  1. Edit ~/calendar/config.yaml if you want a YAML seed (optional —"
echo "     you can configure everything from the Settings UI after boot)."
echo "  2. sudo systemctl start calendar-backend"
echo "  3. sudo reboot"
echo "     The Pi will auto-login on tty1, start X, and Chromium will open"
echo "     the dashboard fullscreen."
echo
echo "Useful:"
echo "  journalctl -u calendar-backend -f      # backend logs"
echo "  curl http://localhost:8000/api/health  # backend health"
echo "  Ctrl+Alt+F2                            # switch to a tty for shell"
