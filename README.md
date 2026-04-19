<div align="center">

# 🗓️ Family Calendar

**A self-hosted Skylight-style family wall calendar for the Raspberry Pi.**

Two-way syncs with Apple iCloud, displays the week/month at a glance, plans meals, builds your grocery list, runs the lights, watches the thermostat — and shows your family photos when nobody's looking.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-3B%2B%20%E2%86%92%205-A22846?logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com)

</div>

---

## ✨ What it does

| | |
|---|---|
| 🍎 **Apple iCloud sync** | Two-way CalDAV with multiple Apple IDs. Color-code per person and per category (Soccer / Work / Practice). |
| 🍳 **Meal planner + grocery** | Build a recipe library with ingredients. Schedule meals for the week → grocery list auto-populates. Manual items always survive. |
| 💡 **Govee lights** | Control on/off, brightness, and color from the dashboard. |
| 🌡️ **ecobee thermostat** | Live temp/humidity, mode, comfort settings, and target temperature — right in the sidebar. |
| 🎂 **Birthdays + holidays** | US federal + Christian holidays as toggleable virtual calendars. Birthdays show as annual events with age. |
| 📌 **Hero banner** | Slim strip at the bottom shows next event, today's birthdays/holidays, and pinned countdowns. |
| 📝 **Family notes** | Shared sticky-note board, accessible from any page. |
| 📸 **Photo slideshow** | Fades in after idle, with date/time/weather/next-event overlay. Periodically peeks at the calendar. |
| ⏰ **Reminders → light flash** | Per-event opt-in flash a Govee light any color N minutes before an event. |
| ⌨️ **On-screen keyboard** | Auto-pops up on touch devices for any text input. |
| ☀️ **Weather** | Current + 5-day forecast. No API key (Open-Meteo). |

All settings live in a Settings UI on the dashboard — no config files to babysit after first install.

## 🏗️ Architecture

```
┌────────────────────────────┐    CalDAV     ┌──────────────────┐
│  FastAPI backend           │ ────────────▶ │ iCloud           │
│  - SQLite (events, notes,  │ ◀──────────── │ caldav.icloud.com│
│    meals, photos, ...)     │               └──────────────────┘
│  - Sync worker (~2 min)    │
│  - Reminder scheduler      │ ───┐  Govee API
│  - REST + SSE              │    ├─▶ ecobee API
└──────────┬─────────────────┘    └─▶ Open-Meteo (weather)
           │ HTTP / SSE
           ▼
┌────────────────────────────┐
│  React + Vite + FullCalendar │  ←─  Chromium kiosk on the Pi
│  + TanStack Query + Tailwind │      (autostarts on boot)
└────────────────────────────┘
```

## 📦 What's where

```
backend/         FastAPI app, SQLite, integrations
  app/
    routers/    REST endpoints (events, meals, photos, settings, ...)
    *_client.py CalDAV / Govee / ecobee
    *_feed.py   Holiday + birthday virtual events
    sync.py     iCloud poller
    reminder_scheduler.py  Background light-flash scheduler

frontend/        React + Vite UI
  src/components/   Page components, modals, settings panels
  src/lib/sse.ts    Live updates from backend

scripts/         setup-pi-lite.sh, kiosk launcher, systemd units
```

## 🛠️ Hardware

- **Raspberry Pi 3B+ / 4 / 5** (Pi 3B 1.2 with 1GB RAM works fine — use the Lite kiosk path below)
- **Touchscreen monitor** with USB-HID touch (most plug-and-play USB monitors work — see the [touchscreen guide](#-touchscreen-monitor-tips))
- 32GB+ microSD card
- Official Pi power supply
- HDMI cable + VESA mount or stand

---

## 🚀 Local development (Mac/Linux)

You'll iterate on a Mac, then deploy to the Pi.

```bash
# Clone
git clone https://github.com/<you>/Calendar ~/Calendar
cd ~/Calendar

# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -e .

# Frontend
cd ../frontend
npm install
```

In two terminals:

```bash
# Terminal 1 — backend on :8000
cd backend && .venv/bin/uvicorn app.main:app --reload

# Terminal 2 — frontend on :5173 (proxies /api to :8000)
cd frontend && npm run dev
```

Open <http://localhost:5173> and click the ⚙️ gear in the top-right to configure everything.

---

## 🍎 Connecting iCloud

You'll need an **app-specific password** (not your real Apple password):

1. Sign in at [appleid.apple.com](https://appleid.apple.com).
2. **Sign-In and Security → App-Specific Passwords → +**.
3. Name it "Family Calendar" → copy the password (looks like `abcd-efgh-ijkl-mnop`).
4. In the dashboard: **⚙️ Settings → Accounts → + Add Apple ID** → paste your Apple ID + the password.
5. **Calendars tab → Add from iCloud** → pick which calendars to display, set their colors and people.

Each family member can add their own Apple ID — each Apple ID = one entry in the Accounts tab.

> 💡 **Color coding tip**: make a separate iCloud calendar per category ("Soccer", "Practice", "Work") and have everyone subscribe to it. Per-category color overrides per-person on the grid.

---

## 📺 Pi deployment

### ⭐ Recommended: Pi OS Lite + minimal kiosk

The lean path — no LXDE/labwc, just X + openbox + Chromium. Saves ~300MB RAM and is much snappier on a Pi 3B (1GB RAM).

1. Flash **Raspberry Pi OS Lite (64-bit, Bookworm)** with [Raspberry Pi Imager](https://www.raspberrypi.com/software/). In the imager's gear menu, set username, password, Wi-Fi, hostname, and enable SSH.
2. Boot the Pi. SSH in (`ssh pi@<hostname>.local`).
3. Clone + run the setup:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/<you>/Calendar ~/calendar
cd ~/calendar
sudo ./scripts/setup-pi-lite.sh
sudo systemctl start calendar-backend
sudo reboot
```

That's it. The Pi will:

1. Auto-login on `tty1`
2. `startx` runs `~/.xinitrc` → openbox + Chromium kiosk
3. Browser opens fullscreen at `http://localhost:8000/`

To pop into a shell from the kiosk: **Ctrl+Alt+F2** (return with `F1`).

### Updating after a code change

```bash
cd ~/calendar
git pull
cd frontend && npm ci && npm run build
sudo systemctl restart calendar-backend
# Refresh the kiosk: Ctrl+R in Chromium
```

### Logs

```bash
journalctl -u calendar-backend -f
```

### Alternative: existing Pi OS Desktop install

```bash
sudo ./scripts/setup-pi.sh
sudo systemctl start calendar-backend
sudo reboot
```

This relies on the Bookworm desktop autostart mechanism — heavier but works if the Pi already runs other GUI apps.

### Pi 3B-specific notes

- **Performance**: month view + photo slideshow are the heaviest bits. Drop the slideshow per-photo seconds if it stutters; disable Christian holidays if you don't use them (fewer events to render).
- **Memory**: keep `CONF_SWAPSIZE=200` in `/etc/dphys-swapfile`. Bigger swap thrashes the SD card.
- **GPU memory**: the Lite setup script sets `gpu_mem=128` automatically.
- **Wi-Fi power save**: disable if you see flaky network — `iwconfig wlan0 power off` (or `iw wlan0 set power_save off`).

---

## 🖐️ Touchscreen monitor tips

Most USB-HID touchscreens work out of the box on Linux — the kernel's `hid-multitouch` driver handles them without any setup. Verify after plugging in:

```bash
xinput list
```

You should see something like `↳ ILITEK Multi-Touch    id=8 [slave pointer (2)]`. If yes, touch will work in Chromium.

**Cabling for a typical touchscreen + Pi 3B**: HDMI for video + USB-A↔USB-C *data* cable for touch + the monitor's own USB-C wall plug for power. The Pi can't power a 15.6" panel from its USB ports.

---

## ⚙️ Optional: seed from YAML

Drop a `config.yaml` at the repo root before the backend's first boot to pre-populate accounts/calendars/weather. See [`config.example.yaml`](config.example.yaml). After first boot the database is the source of truth — the YAML file is never written to.

---

## 🗺️ Roadmap

- Discord bot for grocery list + reminders
- Instacart "shop this list" QR code export
- Photo slideshow from iCloud Shared Album URL
- Drag-to-resize / drag-to-move events on the grid
- Multi-source calendars (Google, Outlook)
- Ring / Nest doorbell page

---

## 🐞 Troubleshooting

| Symptom | Most likely cause |
|---|---|
| `Calendar 'X' not found` after iCloud connect | Calendar names must match iCloud exactly — use **Add from iCloud** in Settings rather than typing them by hand. |
| Auth errors in `journalctl -u calendar-backend` | Used your real Apple password instead of an app-specific one, or the password was rotated/revoked. |
| Kiosk doesn't open on boot | Confirm Pi OS Lite + `setup-pi-lite.sh` was run. Check `cat ~/.bash_profile` ends with `exec startx -- -nocursor`. |
| Touch detected by `xinput` but Chromium ignores taps | Re-launch Chromium with `--enable-features=OverlayScrollbar` (already in the kiosk launcher). Restart the kiosk session. |
| Reminder light flash never fires | Settings → Reminders → check `last_error` shown on the rule. Common: malformed RRULE on a recurring event. |
| Photos not appearing in slideshow | Settings → Photos → upload them through the drag-drop zone. Files dropped directly into `backend/photos/` *also* work but skip the size check. |
| ecobee says "not authorized" out of nowhere | Token was rotated or app was revoked at ecobee.com/consumerportal. Re-authorize in Settings → General → Integrations. |

---

## 📄 License

MIT — see [LICENSE](LICENSE) if present, otherwise treat as personal use.

## 🙏 Acknowledgments

- [FullCalendar](https://fullcalendar.io/) for the calendar grid
- [python-holidays](https://github.com/vacanza/holidays) for the US holiday list
- [Open-Meteo](https://open-meteo.com/) for free weather without an API key
- [caldav](https://github.com/python-caldav/caldav) for iCloud sync
- [react-simple-keyboard](https://github.com/hodgef/react-simple-keyboard) for the on-screen keyboard
- Inspired by [Skylight Calendar](https://www.skylightframe.com/), but self-hosted and Apple-first

---

<div align="center">

Made for a wall · Built on a Pi · Kept by a family

</div>
