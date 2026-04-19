#!/usr/bin/env bash
# Launch Chromium in kiosk mode pointed at $1 (the dashboard URL).
# Tuned for low-end Raspberry Pi hardware (3B / 3B+ / Zero 2 W).

set -euo pipefail

URL="${1:-http://localhost:8000/}"

exec chromium-browser \
  --kiosk \
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
