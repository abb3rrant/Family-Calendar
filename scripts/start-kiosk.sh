#!/usr/bin/env bash
# Launch Chromium in kiosk mode, pointing at the local backend.
# Invoked by ~/.config/autostart/calendar-kiosk.desktop on session start.

set -euo pipefail

URL="http://localhost:8000/"

# Wait for the backend to be reachable before opening the browser.
for _ in $(seq 1 60); do
  if curl -fsS --max-time 1 "$URL" >/dev/null; then
    break
  fi
  sleep 1
done

# Hide the cursor after 1s of inactivity.
unclutter -idle 1 -root &

# Disable screen blanking (X11 path; harmless on Wayland).
xset s off || true
xset -dpms || true
xset s noblank || true

# Wipe restore-prompt state so a previous crash doesn't cause a popup.
PROFILE_DIR="${HOME}/.config/chromium"
PREFS="${PROFILE_DIR}/Default/Preferences"
if [[ -f "$PREFS" ]]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PREFS" || true
fi

exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-features=Translate,TranslateUI \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --password-store=basic \
  --disable-component-update \
  --disable-background-networking \
  --start-fullscreen \
  --app="$URL"
