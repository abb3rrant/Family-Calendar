"""Thin wrapper over the `caldav` library for iCloud.

iCloud CalDAV endpoint: https://caldav.icloud.com/
Auth: Apple ID + app-specific password from https://appleid.apple.com/ (Sign-In and
Security -> App-Specific Passwords).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable

import caldav
from caldav.elements import dav
from icalendar import Calendar as ICalendar
from icalendar import Event as IEvent

from .config import AccountConfig, CalendarConfig

logger = logging.getLogger(__name__)

ICLOUD_URL = "https://caldav.icloud.com/"


@dataclass
class ParsedEvent:
    uid: str
    calendar_id: str
    url: str
    etag: str | None
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    rrule: str | None


@dataclass
class DiscoveredCalendar:
    account_id: str
    display_name: str
    url: str


class CalDAVClient:
    def __init__(self, account: AccountConfig):
        self.account = account
        self._client = caldav.DAVClient(
            url=ICLOUD_URL,
            username=account.apple_id,
            password=account.app_password,
        )
        self._principal = None

    @property
    def principal(self):
        if self._principal is None:
            self._principal = self._client.principal()
        return self._principal

    def discover(self) -> list[DiscoveredCalendar]:
        out = []
        for cal in self.principal.calendars():
            name = cal.get_properties([dav.DisplayName()]).get(
                "{DAV:}displayname", str(cal.url)
            )
            out.append(
                DiscoveredCalendar(
                    account_id=self.account.id,
                    display_name=name or "(unnamed)",
                    url=str(cal.url),
                )
            )
        return out

    def _find_calendar(self, cal_config: CalendarConfig):
        for cal in self.principal.calendars():
            name = cal.get_properties([dav.DisplayName()]).get("{DAV:}displayname", "")
            if name == cal_config.display_name:
                return cal
        raise LookupError(
            f"Calendar '{cal_config.display_name}' not found for account {self.account.id}"
        )

    def fetch_events(
        self,
        cal_config: CalendarConfig,
        start: datetime,
        end: datetime,
    ) -> list[ParsedEvent]:
        cal = self._find_calendar(cal_config)
        results = cal.search(
            start=start,
            end=end,
            event=True,
            expand=False,
        )
        events: list[ParsedEvent] = []
        for item in results:
            try:
                events.extend(_parse_event(item, cal_config.id))
            except Exception:
                logger.exception("Failed to parse event %s", item.url)
        return events

    def create_event(
        self,
        cal_config: CalendarConfig,
        *,
        title: str,
        start_at: datetime,
        end_at: datetime,
        all_day: bool,
        description: str | None = None,
        location: str | None = None,
    ) -> ParsedEvent:
        cal = self._find_calendar(cal_config)
        uid = str(uuid.uuid4())
        ical = _build_ical(
            uid=uid,
            title=title,
            start_at=start_at,
            end_at=end_at,
            all_day=all_day,
            description=description,
            location=location,
        )
        obj = cal.save_event(ical)
        parsed = _parse_event(obj, cal_config.id)
        return parsed[0]

    def update_event(
        self,
        cal_config: CalendarConfig,
        uid: str,
        url: str,
        *,
        title: str,
        start_at: datetime,
        end_at: datetime,
        all_day: bool,
        description: str | None = None,
        location: str | None = None,
    ) -> ParsedEvent:
        # iCloud's CalDAV rejects REPORT-by-UID with 412, so we target the
        # event's URL directly (we cached it when we first synced the event).
        cal = self._find_calendar(cal_config)
        ical = _build_ical(
            uid=uid,
            title=title,
            start_at=start_at,
            end_at=end_at,
            all_day=all_day,
            description=description,
            location=location,
        )
        obj = caldav.Event(client=self._client, url=url, parent=cal, data=ical)
        obj.save()
        parsed = _parse_event(obj, cal_config.id)
        return parsed[0]

    def delete_event(self, cal_config: CalendarConfig, url: str) -> None:
        cal = self._find_calendar(cal_config)
        obj = caldav.Event(client=self._client, url=url, parent=cal)
        obj.delete()


def _build_ical(
    *,
    uid: str,
    title: str,
    start_at: datetime,
    end_at: datetime,
    all_day: bool,
    description: str | None,
    location: str | None,
) -> str:
    ical = ICalendar()
    ical.add("prodid", "-//raspi-calendar//EN")
    ical.add("version", "2.0")
    ev = IEvent()
    ev.add("uid", uid)
    ev.add("summary", title)
    if all_day:
        ev.add("dtstart", start_at.date())
        ev.add("dtend", end_at.date())
    else:
        ev.add("dtstart", _ensure_aware(start_at))
        ev.add("dtend", _ensure_aware(end_at))
    ev.add("dtstamp", datetime.now(timezone.utc))
    if description:
        ev.add("description", description)
    if location:
        ev.add("location", location)
    ical.add_component(ev)
    return ical.to_ical().decode("utf-8")


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_event(item, calendar_id: str) -> list[ParsedEvent]:
    data = item.data
    if isinstance(data, bytes):
        data = data.decode("utf-8")
    ical = ICalendar.from_ical(data)
    etag = getattr(item, "etag", None)
    url = str(item.url)
    out: list[ParsedEvent] = []
    for component in ical.walk("VEVENT"):
        dtstart = component.get("dtstart").dt
        dtend_prop = component.get("dtend")
        dtend = dtend_prop.dt if dtend_prop else dtstart
        all_day = isinstance(dtstart, date) and not isinstance(dtstart, datetime)
        if all_day:
            start_at = datetime.combine(dtstart, datetime.min.time(), tzinfo=timezone.utc)
            end_at = datetime.combine(dtend, datetime.min.time(), tzinfo=timezone.utc)
        else:
            start_at = _ensure_aware(dtstart)
            end_at = _ensure_aware(dtend)
        rrule_prop = component.get("rrule")
        rrule = rrule_prop.to_ical().decode("utf-8") if rrule_prop else None
        out.append(
            ParsedEvent(
                uid=str(component.get("uid")),
                calendar_id=calendar_id,
                url=url,
                etag=etag,
                title=str(component.get("summary") or ""),
                description=str(component.get("description")) if component.get("description") else None,
                location=str(component.get("location")) if component.get("location") else None,
                start_at=start_at,
                end_at=end_at,
                all_day=all_day,
                rrule=rrule,
            )
        )
    return out


def clients_for_calendars(
    accounts: Iterable[AccountConfig], calendars: Iterable[CalendarConfig]
) -> dict[str, CalDAVClient]:
    by_account = {a.id: a for a in accounts}
    clients: dict[str, CalDAVClient] = {}
    for cal in calendars:
        if cal.account not in clients:
            if cal.account not in by_account:
                raise KeyError(f"Calendar '{cal.id}' references unknown account '{cal.account}'")
            clients[cal.account] = CalDAVClient(by_account[cal.account])
    return clients
