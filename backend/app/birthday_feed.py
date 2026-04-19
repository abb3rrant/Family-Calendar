"""Virtual birthday events: annual recurrences from the `birthdays` table.

Each birthday row expands into one all-day event per year in the requested
window. If a birth_year is set, the title includes the age ("Alice turns 10").
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .holiday_feed import VirtualEvent
from .models import Birthday

BIRTHDAY_CALENDAR_ID = "__birthdays__"


def birthday_events(
    birthdays: list[Birthday], start: date, end: date
) -> list[VirtualEvent]:
    out: list[VirtualEvent] = []
    for b in birthdays:
        for year in range(start.year, end.year + 1):
            try:
                d = date(year, b.month, b.day)
            except ValueError:
                # Feb 29 in a non-leap year
                continue
            if d < start or d > end:
                continue
            start_dt = datetime.combine(d, datetime.min.time())
            end_dt = start_dt + timedelta(days=1)
            if b.birth_year and year > b.birth_year:
                title = f"🎂 {b.name} turns {year - b.birth_year}"
            else:
                title = f"🎂 {b.name}"
            out.append(
                VirtualEvent(
                    uid=f"birthday-{b.id}-{d.isoformat()}",
                    calendar_id=BIRTHDAY_CALENDAR_ID,
                    title=title,
                    start_at=start_dt,
                    end_at=end_dt,
                )
            )
    return out
