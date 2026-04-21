#!/usr/bin/env bash
# Launch Chromium in kiosk mode pointed at $1 (the dashboard URL).
# Tuned for low-end Raspberry Pi hardware (3B / 3B+ / Zero 2 W).

set -euo pipefail

URL="${1:-http://localhost:8000/}"

# Trixie ships `chromium`; Bookworm ships `chromium-browser`. Pick whichever
# is on PATH.
if command -v chromium >/dev/null 2>&1; then
  CHROMIUM=chromium
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM=chromium-browser
else
  echo "Neither chromium nor chromium-browser is installed" >&2
  exit 1
fi

# Wait up to 90s for the backend to answer before launching Chromium.
# On a cold Pi 3B boot the backend can take ~30-40s to come up.
for _ in $(seq 1 90); do
  if curl -fsS --max-time 1 "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec "$CHROMIUM" \
  --kiosk \
  --ozone-platform=x11 \
  --touch-events=enabled \
  --pull-to-refresh=0 \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-features=Translate,TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --use-fake-ui-for-media-stream \
  --disable-component-update \
  --disable-background-networking \
  --enable-features=OverlayScrollbar \
  --start-fullscreen \
  --app="$URL"
