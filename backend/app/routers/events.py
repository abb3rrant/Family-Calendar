from __future__ import annotations

import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select

from ..birthday_feed import birthday_events
from ..caldav_client import clients_for_calendars
from ..db import session_scope
from ..events_bus import bus
from ..holiday_feed import all_holiday_events
from ..models import Birthday, Event
from ..schemas import EventCreate, EventOut, EventUpdate
from ..timeutil import to_naive_utc

router = APIRouter(prefix="/api/events", tags=["events"])


def _config(request: Request):
    return request.app.state.config


@router.get("", response_model=list[EventOut])
def list_events(
    request: Request,
    start: datetime = Query(...),
    end: datetime = Query(...),
):
    start_naive = to_naive_utc(start)
    end_naive = to_naive_utc(end)
    with session_scope() as session:
        stmt = (
            select(Event)
            .where(Event.deleted.is_(False))
            .where(Event.start_at < end_naive)
            .where(Event.end_at > start_naive)
            .order_by(Event.start_at)
        )
        rows = session.execute(stmt).scalars().all()
        real_events = [EventOut.model_validate(r) for r in rows]

    app_cfg = _config(request)
    hol_cfg = app_cfg.holidays
    virtual = all_holiday_events(
        start.date(),
        end.date(),
        include_us=hol_cfg.show_us,
        include_christian=hol_cfg.show_christian,
    )

    if app_cfg.birthdays.show:
        with session_scope() as session:
            birthdays = list(session.execute(select(Birthday)).scalars().all())
        virtual.extend(birthday_events(birthdays, start.date(), end.date()))

    virtual_out = [
        EventOut(
            uid=v.uid,
            calendar_id=v.calendar_id,
            title=v.title,
            description=v.description,
            location=v.location,
            start_at=v.start_at,
            end_at=v.end_at,
            all_day=v.all_day,
            rrule=v.rrule,
        )
        for v in virtual
    ]
    return real_events + virtual_out


@router.post("", response_model=EventOut, status_code=201)
async def create_event(payload: EventCreate, request: Request):
    config = _config(request)
    try:
        cal = config.calendar_by_id(payload.calendar_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    if not cal.writable:
        raise HTTPException(status_code=403, detail="Calendar is read-only")

    clients = clients_for_calendars(config.accounts, [cal])
    client = clients[cal.account]
    loop = asyncio.get_running_loop()

    def _do():
        return client.create_event(
            cal,
            title=payload.title,
            start_at=payload.start_at,
            end_at=payload.end_at,
            all_day=payload.all_day,
            description=payload.description,
            location=payload.location,
        )

    ev = await loop.run_in_executor(None, _do)

    with session_scope() as session:
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

    await bus.publish("events-updated")
    return EventOut.model_validate(ev, from_attributes=True)


@router.patch("/{uid}", response_model=EventOut)
async def update_event(uid: str, payload: EventUpdate, request: Request):
    config = _config(request)
    with session_scope() as session:
        row = session.get(Event, uid)
        if row is None or row.deleted:
            raise HTTPException(status_code=404, detail="Event not found")
        calendar_id = row.calendar_id
        event_url = row.url
    try:
        cal = config.calendar_by_id(calendar_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    if not cal.writable:
        raise HTTPException(status_code=403, detail="Calendar is read-only")

    clients = clients_for_calendars(config.accounts, [cal])
    client = clients[cal.account]
    loop = asyncio.get_running_loop()

    def _do():
        return client.update_event(
            cal,
            uid,
            event_url,
            title=payload.title,
            start_at=payload.start_at,
            end_at=payload.end_at,
            all_day=payload.all_day,
            description=payload.description,
            location=payload.location,
        )

    ev = await loop.run_in_executor(None, _do)

    with session_scope() as session:
        row = session.get(Event, uid)
        if row is None:
            row = Event(uid=uid)
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

    await bus.publish("events-updated")
    return EventOut.model_validate(ev, from_attributes=True)


@router.delete("/{uid}", status_code=204)
async def delete_event(uid: str, request: Request):
    config = _config(request)
    with session_scope() as session:
        row = session.get(Event, uid)
        if row is None or row.deleted:
            raise HTTPException(status_code=404, detail="Event not found")
        calendar_id = row.calendar_id
        event_url = row.url

    try:
        cal = config.calendar_by_id(calendar_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    if not cal.writable:
        raise HTTPException(status_code=403, detail="Calendar is read-only")

    clients = clients_for_calendars(config.accounts, [cal])
    client = clients[cal.account]
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, client.delete_event, cal, event_url)

    with session_scope() as session:
        row = session.get(Event, uid)
        if row is not None:
            row.deleted = True

    await bus.publish("events-updated")
