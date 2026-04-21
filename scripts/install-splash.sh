#!/usr/bin/env bash
# Replace the Raspberry Pi boot logo with a custom splash image.
#
# Usage:
#   sudo ./scripts/install-splash.sh [path/to/your-logo.png]
#
# If no image is supplied, a simple text splash is generated via ImageMagick.
#
# What this changes:
#   * Installs a Plymouth theme called `family-calendar` that renders the
#     image centered on a dark background.
#   * Sets that theme as the system default and regenerates the initramfs
#     so it kicks in from the very first frame of boot.
#   * Adds `disable_splash=1` to /boot/firmware/config.txt so the stock
#     rainbow square (shown by the Pi firmware before Plymouth) goes away.
#
# Revert with:
#   sudo plymouth-set-default-theme -R pix   # or whatever shipped default you used
#   sudo update-initramfs -u

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo $0 [image.png]" >&2
  exit 1
fi

THEME_NAME="family-calendar"
THEME_DIR="/usr/share/plymouth/themes/$THEME_NAME"
USER_IMAGE="${1:-}"

echo "==> Installing Plymouth + utilities"
apt-get install -y --no-install-recommends plymouth plymouth-themes imagemagick

mkdir -p "$THEME_DIR"

if [[ -n "$USER_IMAGE" ]]; then
  if [[ ! -f "$USER_IMAGE" ]]; then
    echo "Image not found: $USER_IMAGE" >&2
    exit 1
  fi
  echo "==> Using your image: $USER_IMAGE"
  # Normalise to PNG, max 1024px on the long edge, keep alpha.
  convert "$USER_IMAGE" -resize '1024x1024>' -strip "$THEME_DIR/splash.png"
else
  echo "==> Generating a default text splash (drop a logo next time to customise)"
  # 1080p dark splash with a simple wordmark centered.
  convert -size 1920x1080 canvas:'#0f172a' \
    -fill '#f1f5f9' -gravity center \
    -font DejaVu-Sans-Bold -pointsize 110 \
    -annotate +0-40 'Family Calendar' \
    -fill '#94a3b8' -pointsize 36 \
    -annotate +0+80 'Starting up…' \
    "$THEME_DIR/splash.png"
fi

echo "==> Writing Plymouth theme metadata"
cat > "$THEME_DIR/$THEME_NAME.plymouth" <<EOF
[Plymouth Theme]
Name=Family Calendar
Description=Branded splash for the kiosk
ModuleName=script

[script]
ImageDir=$THEME_DIR
ScriptFile=$THEME_DIR/$THEME_NAME.script
EOF

# Minimal Plymouth script: black background, centered splash image.
cat > "$THEME_DIR/$THEME_NAME.script" <<'EOF'
Window.SetBackgroundTopColor(0.059, 0.090, 0.165);      # #0f172a
Window.SetBackgroundBottomColor(0.059, 0.090, 0.165);

splash_image = Image("splash.png");
splash_sprite = Sprite(splash_image);

# Scale down if the image is wider than the screen.
scale = 1.0;
if (splash_image.GetWidth() > Window.GetWidth()) {
    scale = Window.GetWidth() / splash_image.GetWidth();
}
if (splash_image.GetHeight() * scale > Window.GetHeight()) {
    scale = Window.GetHeight() / splash_image.GetHeight();
}
splash_sprite.SetImage(splash_image.Scale(splash_image.GetWidth() * scale,
                                          splash_image.GetHeight() * scale));

splash_sprite.SetX((Window.GetWidth()  - splash_image.GetWidth()  * scale) / 2);
splash_sprite.SetY((Window.GetHeight() - splash_image.GetHeight() * scale) / 2);
EOF

echo "==> Setting $THEME_NAME as the default Plymouth theme"
plymouth-set-default-theme -R "$THEME_NAME"

echo "==> Silencing rainbow splash in config.txt"
CONFIG=/boot/firmware/config.txt
[[ ! -f "$CONFIG" ]] && CONFIG=/boot/config.txt
if [[ -f "$CONFIG" ]]; then
  if ! grep -q "^disable_splash=1" "$CONFIG"; then
    echo "disable_splash=1" >> "$CONFIG"
  fi
fi

# Extend the quiet kernel cmdline if we can so boot messages don't flash.
# `quiet` + `splash` are usually already present on Pi OS.
CMDLINE=/boot/firmware/cmdline.txt
[[ ! -f "$CMDLINE" ]] && CMDLINE=/boot/cmdline.txt
if [[ -f "$CMDLINE" ]]; then
  # Remove console=tty1 so Plymouth owns the display, not getty.
  sed -i 's/ console=tty1//g' "$CMDLINE" 2>/dev/null || true
  # Ensure quiet + splash + loglevel=0
  grep -q ' quiet' "$CMDLINE" || sed -i 's/$/ quiet/' "$CMDLINE"
  grep -q ' splash' "$CMDLINE" || sed -i 's/$/ splash/' "$CMDLINE"
  grep -q ' loglevel=0' "$CMDLINE" || sed -i 's/$/ loglevel=0/' "$CMDLINE"
  grep -q ' vt.global_cursor_default=0' "$CMDLINE" || \
    sed -i 's/$/ vt.global_cursor_default=0/' "$CMDLINE"
fi

echo
echo "Done. Reboot to see the new splash:"
echo "  sudo reboot"
echo
echo "To revert later:"
echo "  sudo plymouth-set-default-theme -R pix"
echo "  sudo update-initramfs -u"
