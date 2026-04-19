"""Pre-computed payload for the slim hero banner at the bottom of the dashboard."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import select

from ..birthday_feed import birthday_events
from ..db import session_scope
from ..holiday_feed import all_holiday_events
from ..models import Birthday, Event, PinnedCountdown
from ..timeutil import utc_now_naive

router = APIRouter(prefix="/api/hero", tags=["hero"])


class NextEventOut(BaseModel):
    title: str
    start_at: datetime
    calendar_id: str
    location: str | None
    minutes_until: int


class TodayBadge(BaseModel):
    kind: str  # "birthday" | "holiday"
    title: str
    emoji: str


class CountdownChip(BaseModel):
    kind: str  # "birthday" | "pinned"
    label: str
    emoji: str
    days_until: int
    target_date: date


class HeroOut(BaseModel):
    next_event: NextEventOut | None
    today_badges: list[TodayBadge]
    countdowns: list[CountdownChip]


WINDOW_DAYS = 60  # how far ahead to look for countdowns


@router.get("", response_model=HeroOut)
def get_hero(request: Request):
    cfg = request.app.state.config
    today = date.today()
    now_naive = utc_now_naive()

    # ---- Next event ----
    with session_scope() as session:
        stmt = (
            select(Event)
            .where(Event.deleted.is_(False))
            .where(Event.start_at >= now_naive)
            .where(Event.start_at <= now_naive + timedelta(days=7))
            .order_by(Event.start_at)
            .limit(1)
        )
        row = session.execute(stmt).scalar_one_or_none()
        if row is not None:
            delta = row.start_at - now_naive
            next_event = NextEventOut(
                title=row.title or "(no title)",
                start_at=row.start_at,
                calendar_id=row.calendar_id,
                location=row.location,
                minutes_until=max(0, int(delta.total_seconds() // 60)),
            )
        else:
            next_event = None

    # ---- Today badges ----
    today_badges: list[TodayBadge] = []

    # Birthdays today
    with session_scope() as session:
        birthdays = list(session.execute(select(Birthday)).scalars().all())
    for b in birthdays:
        if b.month == today.month and b.day == today.day:
            today_badges.append(
                TodayBadge(kind="birthday", title=b.name, emoji="🎂")
            )

    # Holidays today
    holidays_today = all_holiday_events(
        today,
        today,
        include_us=cfg.holidays.show_us,
        include_christian=cfg.holidays.show_christian,
    )
    for h in holidays_today:
        emoji = "⛪" if h.calendar_id.endswith("christian__") else "🇺🇸"
        today_badges.append(TodayBadge(kind="holiday", title=h.title, emoji=emoji))

    # ---- Countdown chips: birthdays + pinned, within window, sorted ----
    chips: list[CountdownChip] = []

    end = today + timedelta(days=WINDOW_DAYS)
    bday_events = birthday_events(birthdays, today, end)
    seen_today_birthdays = {b.name for b in birthdays if b.month == today.month and b.day == today.day}
    for be in bday_events:
        d = be.start_at.date()
        if d == today and any(b.name in be.title for b in birthdays if b.name in seen_today_birthdays):
            continue  # already shown as today badge
        days = (d - today).days
        if days <= 0:
            continue
        # Title is "🎂 Alice" or "🎂 Alice turns 11" — drop the leading emoji
        clean = be.title.lstrip("🎂").strip()
        chips.append(
            CountdownChip(
                kind="birthday",
                label=clean,
                emoji="🎂",
                days_until=days,
                target_date=d,
            )
        )

    with session_scope() as session:
        pinned = list(
            session.execute(
                select(PinnedCountdown).order_by(PinnedCountdown.target_date)
            )
            .scalars()
            .all()
        )
    for p in pinned:
        days = (p.target_date - today).days
        if days < 0 or days > WINDOW_DAYS:
            continue
        chips.append(
            CountdownChip(
                kind="pinned",
                label=p.label,
                emoji=p.emoji or "📌",
                days_until=days,
                target_date=p.target_date,
            )
        )

    chips.sort(key=lambda c: c.days_until)

    return HeroOut(
        next_event=next_event,
        today_badges=today_badges,
        countdowns=chips[:6],  # cap at 6 to keep the strip readable
    )
