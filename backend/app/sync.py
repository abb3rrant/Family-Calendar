from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from sqlalchemy import select

from .caldav_client import CalDAVClient, ParsedEvent, clients_for_calendars
from .config import AppConfig
from .db import session_scope
from .events_bus import bus
from .models import Event, SyncState
from .timeutil import to_naive_utc, utc_now_naive

logger = logging.getLogger(__name__)

SYNC_WINDOW_PAST = timedelta(days=30)
SYNC_WINDOW_FUTURE = timedelta(days=365)


def _sync_calendar(client: CalDAVClient, cal_config, now: datetime) -> int:
    start = now - SYNC_WINDOW_PAST
    end = now + SYNC_WINDOW_FUTURE
    events = client.fetch_events(cal_config, start, end)
    seen_uids: set[str] = set()
    with session_scope() as session:
        for ev in events:
            seen_uids.add(ev.uid)
            _upsert(session, ev)
        stmt = select(Event).where(
            Event.calendar_id == cal_config.id,
            Event.deleted.is_(False),
            Event.start_at >= start,
            Event.start_at <= end,
        )
        existing = session.execute(stmt).scalars().all()
        for row in existing:
            if row.uid not in seen_uids:
                row.deleted = True
        state = session.get(SyncState, cal_config.id)
        if state is None:
            state = SyncState(calendar_id=cal_config.id)
            session.add(state)
        state.last_sync_at = utc_now_naive()
    return len(events)


def _upsert(session, ev: ParsedEvent) -> None:
    row = session.get(Event, ev.uid)
    if row is None:
        row = Event(uid=ev.uid)
        session.add(row)
    row.calendar_id = ev.calendar_id
    row.url = ev.url
    row.etag = ev.etag
    row.title = ev.title
    row.description = ev.description
    row.location = ev.location
    row.start_at = to_naive_utc(ev.start_at)
    row.end_at = to_naive_utc(ev.end_at)
    row.all_day = ev.all_day
    row.rrule = ev.rrule
    row.deleted = False


async def run_sync_once(config: AppConfig) -> None:
    enabled = config.enabled_calendars
    if not enabled:
        return
    clients = clients_for_calendars(config.accounts, enabled)
    now = datetime.now(timezone.utc)
    loop = asyncio.get_running_loop()
    for cal_config in enabled:
        client = clients[cal_config.account]
        try:
            count = await loop.run_in_executor(None, _sync_calendar, client, cal_config, now)
            logger.info("Synced %d events from %s", count, cal_config.id)
        except Exception:
            logger.exception("Sync failed for calendar %s", cal_config.id)
    await bus.publish("events-updated")


async def sync_loop(app: FastAPI, stop_event: asyncio.Event, wake_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        # Snapshot the config object reference once per iteration. Settings
        # mutations elsewhere replace `app.state.config` with a freshly-built
        # AppConfig (see main.reload_config), so this iteration sees a stable
        # view even if the user changes things mid-poll.
        config: AppConfig = app.state.config
        try:
            await run_sync_once(config)
        except Exception:
            logger.exception("Unexpected error in sync loop")

        interval = max(5, config.sync.interval_seconds)
        stop_task = asyncio.create_task(stop_event.wait())
        wake_task = asyncio.create_task(wake_event.wait())
        try:
            _, pending = await asyncio.wait(
                {stop_task, wake_task},
                timeout=interval,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        finally:
            if wake_event.is_set():
                wake_event.clear()
