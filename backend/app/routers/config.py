from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from ..birthday_feed import BIRTHDAY_CALENDAR_ID
from ..caldav_client import CalDAVClient
from ..holiday_feed import CHRISTIAN_CALENDAR_ID, US_CALENDAR_ID
from ..schemas import CalendarOut, DiscoveredCalendarOut

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/calendars", response_model=list[CalendarOut])
def list_calendars(request: Request):
    config = request.app.state.config
    out = [
        CalendarOut(
            id=c.id,
            display_name=c.display_name,
            person=c.person,
            category=c.category,
            color=c.color,
            writable=c.writable,
        )
        for c in config.calendars
        if c.enabled
    ]
    h = config.holidays
    if h.show_us:
        out.append(
            CalendarOut(
                id=US_CALENDAR_ID,
                display_name="US Holidays",
                person="Holidays",
                category="US",
                color=h.us_color,
                writable=False,
            )
        )
    if h.show_christian:
        out.append(
            CalendarOut(
                id=CHRISTIAN_CALENDAR_ID,
                display_name="Christian Holidays",
                person="Holidays",
                category="Christian",
                color=h.christian_color,
                writable=False,
            )
        )
    b = config.birthdays
    if b.show:
        out.append(
            CalendarOut(
                id=BIRTHDAY_CALENDAR_ID,
                display_name="Birthdays",
                person="Birthdays",
                category=None,
                color=b.color,
                writable=False,
            )
        )
    return out


@router.get("/discover/{account_id}", response_model=list[DiscoveredCalendarOut])
async def discover(account_id: str, request: Request):
    config = request.app.state.config
    try:
        account = config.account_by_id(account_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown account")
    client = CalDAVClient(account)
    loop = asyncio.get_running_loop()
    discovered = await loop.run_in_executor(None, client.discover)
    return [DiscoveredCalendarOut(**d.__dict__) for d in discovered]
