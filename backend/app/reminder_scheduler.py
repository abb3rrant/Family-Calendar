"""Background task that fires Govee flashes for reminder rules.

Polls every 30s. For each active rule, finds events in the firing window
([now+lead-30s, now+lead+90s]) that haven't been flashed yet, fires the flash,
and records (rule_id, event_uid, scheduled_for) so we don't double-fire.

Recurring events (with rrule) are expanded for the next ~24h to find their
occurrences.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from dateutil.rrule import rrulestr
from fastapi import FastAPI
from sqlalchemy import select

from .db import session_scope
from .events_bus import bus
from .govee_client import GoveeClient, GoveeError
from .models import (
    CalendarProfile,
    Event,
    ReminderFired,
    ReminderRule,
    Settings,
)
from .reminder_engine import play_flash
from .timeutil import utc_now_naive

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30
WINDOW_BEFORE_SECONDS = 30  # tolerance for "we're slightly late"
WINDOW_AFTER_SECONDS = 90   # catch events that fall between polls
FIRED_RETENTION_DAYS = 90   # delete ReminderFired rows older than this


def _expand_event_starts(
    event: Event, window_start: datetime, window_end: datetime
) -> tuple[list[datetime], str | None]:
    """Return (occurrences inside window, error message or None).

    error message is set when an rrule fails to parse so the caller can
    surface it on the rule.
    """
    if not event.rrule:
        if window_start <= event.start_at <= window_end:
            return [event.start_at], None
        return [], None
    try:
        rrule_str = f"DTSTART:{event.start_at.strftime('%Y%m%dT%H%M%S')}\nRRULE:{event.rrule}"
        rule = rrulestr(rrule_str)
    except Exception as exc:
        logger.warning(
            "Failed to parse rrule for event %s (%s): %s",
            event.uid,
            event.title,
            exc,
        )
        return [], f"Could not parse rrule for '{event.title}': {exc}"
    occurrences = [
        d.replace(tzinfo=None) if d.tzinfo else d
        for d in rule.between(window_start, window_end, inc=True)
    ]
    return occurrences, None


def _scope_calendar_ids(session, rule: ReminderRule) -> set[str]:
    """Resolve a rule's scope into the set of matching calendar IDs."""
    if rule.scope_type == "calendar":
        return {rule.scope_value}
    if rule.scope_type == "category":
        rows = (
            session.execute(
                select(CalendarProfile.id).where(
                    CalendarProfile.category == rule.scope_value
                )
            )
            .scalars()
            .all()
        )
        return set(rows)
    return set()


def _govee_key() -> str | None:
    with session_scope() as session:
        s = session.get(Settings, 1)
        return (s.govee_api_key or "").strip() if s else None


async def _check_and_fire_once(loop_now: datetime) -> int:
    """One polling pass. Returns number of flashes fired."""
    fired = 0
    api_key = _govee_key()
    if not api_key:
        return 0

    with session_scope() as session:
        rules = (
            session.execute(
                select(ReminderRule).where(ReminderRule.active.is_(True))
            )
            .scalars()
            .all()
        )
        if not rules:
            return 0

        plan: list[tuple[ReminderRule, str, str, datetime]] = []
        rule_errors: dict[int, str] = {}
        for rule in rules:
            scope_ids = _scope_calendar_ids(session, rule)
            if not scope_ids:
                continue

            # window for the *event start time*: now + lead +/- tolerance
            target = loop_now + timedelta(minutes=rule.lead_minutes)
            ws = target - timedelta(seconds=WINDOW_BEFORE_SECONDS)
            we = target + timedelta(seconds=WINDOW_AFTER_SECONDS)
            # also expand rrules over a slightly wider window to catch them
            rrule_expand_start = loop_now
            rrule_expand_end = loop_now + timedelta(
                minutes=rule.lead_minutes + 1
            )

            events = (
                session.execute(
                    select(Event)
                    .where(Event.calendar_id.in_(scope_ids))
                    .where(Event.deleted.is_(False))
                )
                .scalars()
                .all()
            )

            for ev in events:
                # find any occurrence inside the firing window
                if ev.rrule:
                    occurrences, err = _expand_event_starts(
                        ev, rrule_expand_start, rrule_expand_end
                    )
                    if err is not None:
                        rule_errors[rule.id] = err
                    candidate = next(
                        (o for o in occurrences if ws <= o <= we), None
                    )
                else:
                    candidate = ev.start_at if ws <= ev.start_at <= we else None

                if candidate is None:
                    continue

                # dedup
                already = (
                    session.execute(
                        select(ReminderFired).where(
                            ReminderFired.rule_id == rule.id,
                            ReminderFired.event_uid == ev.uid,
                            ReminderFired.scheduled_for == candidate,
                        )
                    )
                    .scalars()
                    .first()
                )
                if already is not None:
                    continue

                plan.append((rule, ev.uid, ev.title, candidate))

    # Record any rrule parse errors on the rule for the UI to surface
    if rule_errors:
        with session_scope() as session:
            now = utc_now_naive()
            for rule_id, err in rule_errors.items():
                rule_row = session.get(ReminderRule, rule_id)
                if rule_row is not None:
                    rule_row.last_error = err
                    rule_row.last_error_at = now

    if not plan:
        return 0

    client = GoveeClient(api_key)
    for rule, event_uid, event_title, scheduled_for in plan:
        try:
            await play_flash(
                client,
                rule.device_sku,
                rule.device_id,
                rule.flash_color,
                rule.flash_pattern,  # type: ignore[arg-type]
            )
            fired += 1
            logger.info(
                "Reminder fired: rule=%s event=%s '%s' scheduled=%s",
                rule.id,
                event_uid,
                event_title,
                scheduled_for.isoformat(),
            )
        except GoveeError as e:
            logger.warning("Reminder flash failed: %s", e)

        with session_scope() as session:
            session.add(
                ReminderFired(
                    rule_id=rule.id,
                    event_uid=event_uid,
                    scheduled_for=scheduled_for,
                )
            )

    if fired:
        await bus.publish("reminders-fired")
    return fired


def _prune_old_fired(now: datetime) -> int:
    """Delete ReminderFired rows older than retention. Returns rows deleted."""
    cutoff = now - timedelta(days=FIRED_RETENTION_DAYS)
    with session_scope() as session:
        result = session.query(ReminderFired).filter(
            ReminderFired.scheduled_for < cutoff
        ).delete(synchronize_session=False)
    return int(result or 0)


async def reminder_loop(_app: FastAPI, stop_event: asyncio.Event) -> None:
    iteration = 0
    while not stop_event.is_set():
        try:
            now = utc_now_naive()
            await _check_and_fire_once(now)
            # Prune ReminderFired rows once an hour (every 120 polls @ 30s)
            if iteration % 120 == 0:
                deleted = await asyncio.get_running_loop().run_in_executor(
                    None, _prune_old_fired, now
                )
                if deleted:
                    logger.info("Pruned %d old ReminderFired rows", deleted)
            iteration += 1
        except Exception:
            logger.exception("Unexpected error in reminder loop")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
