from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import load_from_db, maybe_import_yaml_seed
from .db import init_db
from .events_bus import bus
from .routers import (
    chores,
    config as config_router,
    countdowns,
    ecobee,
    events,
    grocery,
    hero,
    lights,
    meals,
    notes,
    photos,
    recipes,
    reminders,
    settings as settings_router,
    stream,
    weather,
)
from .reminder_scheduler import reminder_loop
from .sync import sync_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def reload_config(app: FastAPI) -> None:
    """Refresh app.state.config from DB and nudge the sync worker.

    Callable from any thread (sync FastAPI endpoints run in a worker thread).
    """
    app.state.config = load_from_db()
    loop: asyncio.AbstractEventLoop | None = getattr(app.state, "loop", None)
    wake: asyncio.Event | None = getattr(app.state, "sync_wake", None)
    if loop is not None and wake is not None:
        loop.call_soon_threadsafe(wake.set)
    if loop is not None:
        asyncio.run_coroutine_threadsafe(bus.publish("settings-updated"), loop)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if maybe_import_yaml_seed():
        logger.info("Imported initial settings from config.yaml")

    app.state.config = load_from_db()
    app.state.loop = asyncio.get_running_loop()
    app.state.reload_config = lambda: reload_config(app)

    stop = asyncio.Event()
    wake = asyncio.Event()
    app.state.sync_stop = stop
    app.state.sync_wake = wake
    sync_task = asyncio.create_task(sync_loop(app, stop, wake))
    app.state.sync_task = sync_task

    reminder_stop = asyncio.Event()
    app.state.reminder_stop = reminder_stop
    reminder_task = asyncio.create_task(reminder_loop(app, reminder_stop))
    app.state.reminder_task = reminder_task

    try:
        yield
    finally:
        stop.set()
        wake.set()
        reminder_stop.set()
        sync_task.cancel()
        reminder_task.cancel()
        for t in (sync_task, reminder_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass


app = FastAPI(title="Family Calendar", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # The Pi serves the frontend from the same origin as the API, so CORS
    # only matters for `npm run dev` from a Mac. Locked to localhost +
    # private LAN. Set CALENDAR_CORS_ORIGINS env to override.
    allow_origin_regex=(
        os.environ.get("CALENDAR_CORS_ORIGINS")
        or r"http://(localhost|127\.0\.0\.1|.*\.local|192\.168\..*|10\..*)(:\d+)?"
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(chores.router)
app.include_router(meals.router)
app.include_router(recipes.router)
app.include_router(grocery.router)
app.include_router(lights.router)
app.include_router(ecobee.router)
app.include_router(countdowns.router)
app.include_router(hero.router)
app.include_router(notes.router)
app.include_router(reminders.router)
app.include_router(photos.router)
app.include_router(weather.router)
app.include_router(config_router.router)
app.include_router(settings_router.router)
app.include_router(stream.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
