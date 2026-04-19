"""Virtual holiday events, computed on the fly rather than stored in the DB.

Two feeds:
- US federal holidays (via the `holidays` package)
- Major Christian holidays (hand-rolled around dateutil's Easter calculator)

Each feed returns ParsedEvent-shaped dicts that the events router can merge
into its response. The calendar_id is a synthetic string (`__holidays_us__`,
`__holidays_christian__`) so the frontend can color-code them like any other
calendar while knowing they're not editable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import holidays as _holidays
from dateutil.easter import easter

US_CALENDAR_ID = "__holidays_us__"
CHRISTIAN_CALENDAR_ID = "__holidays_christian__"


@dataclass
class VirtualEvent:
    uid: str
    calendar_id: str
    title: str
    start_at: datetime
    end_at: datetime
    all_day: bool = True
    description: str | None = None
    location: str | None = None
    rrule: str | None = None


def _year_range(start: date, end: date) -> range:
    return range(start.year, end.year + 1)


def us_federal_events(start: date, end: date) -> list[VirtualEvent]:
    out: list[VirtualEvent] = []
    us = _holidays.country_holidays(
        "US", years=list(_year_range(start, end)), observed=False
    )
    for day, name in sorted(us.items()):
        if day < start or day > end:
            continue
        start_dt = datetime.combine(day, datetime.min.time())
        end_dt = start_dt + timedelta(days=1)
        out.append(
            VirtualEvent(
                uid=f"us-{day.isoformat()}",
                calendar_id=US_CALENDAR_ID,
                title=str(name),
                start_at=start_dt,
                end_at=end_dt,
            )
        )
    return out


def _christian_events_for_year(year: int) -> list[tuple[date, str]]:
    e = easter(year)
    moveable = [
        (e - timedelta(days=46), "Ash Wednesday"),
        (e - timedelta(days=7), "Palm Sunday"),
        (e - timedelta(days=2), "Good Friday"),
        (e, "Easter Sunday"),
        (e + timedelta(days=1), "Easter Monday"),
        (e + timedelta(days=39), "Ascension Day"),
        (e + timedelta(days=49), "Pentecost"),
    ]
    fixed = [
        (date(year, 1, 6), "Epiphany"),
        (date(year, 11, 1), "All Saints' Day"),
        (date(year, 12, 24), "Christmas Eve"),
        (date(year, 12, 25), "Christmas Day"),
    ]
    return moveable + fixed


def christian_events(
    start: date, end: date, exclude: set[tuple[date, str]] | None = None
) -> list[VirtualEvent]:
    out: list[VirtualEvent] = []
    exclude = exclude or set()
    for year in _year_range(start, end):
        for day, name in _christian_events_for_year(year):
            if day < start or day > end:
                continue
            if (day, name) in exclude:
                continue
            start_dt = datetime.combine(day, datetime.min.time())
            end_dt = start_dt + timedelta(days=1)
            out.append(
                VirtualEvent(
                    uid=f"christian-{day.isoformat()}-{name.lower().replace(' ', '-')}",
                    calendar_id=CHRISTIAN_CALENDAR_ID,
                    title=name,
                    start_at=start_dt,
                    end_at=end_dt,
                )
            )
    return out


def all_holiday_events(
    start: date,
    end: date,
    *,
    include_us: bool,
    include_christian: bool,
) -> list[VirtualEvent]:
    events: list[VirtualEvent] = []
    us_keys: set[tuple[date, str]] = set()
    if include_us:
        us = us_federal_events(start, end)
        events.extend(us)
        # Dedupe: if Christmas Day already shows as US federal, don't double it
        # with the Christian entry on the same day.
        us_keys = {(e.start_at.date(), e.title) for e in us}
    if include_christian:
        events.extend(christian_events(start, end, exclude=us_keys))
    return events
