from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from ..db import session_scope
from ..events_bus import bus
from ..models import (
    AllowanceChore,
    AllowanceCompletion,
    Person,
    Settings,
)
from ..timeutil import utc_now_naive

router = APIRouter(prefix="/api/allowance", tags=["allowance"])


# ---------- schemas ----------


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    emoji: str | None
    color: str


class PersonCreate(BaseModel):
    name: str
    emoji: str | None = None
    color: str = "#4A90E2"


class PersonUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
    color: str | None = None


class ChoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    emoji: str | None
    points: int
    person_id: int | None


class ChoreCreate(BaseModel):
    name: str
    emoji: str | None = None
    points: int = Field(ge=1, le=1000)
    person_id: int | None = None


class ChoreUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
    points: int | None = Field(default=None, ge=1, le=1000)
    person_id: int | None = None


class CompletionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    chore_id: int
    person_id: int
    points: int
    completed_at: datetime
    paid_out_at: datetime | None


class CompletionCreate(BaseModel):
    chore_id: int
    person_id: int | None = None  # falls back to chore.person_id


class PersonWeekSummary(BaseModel):
    person: PersonOut
    points_total: int
    earnings_cents: int
    completions: list[CompletionOut]


class WeekSummaryOut(BaseModel):
    week_start: date
    week_end: date
    point_value_cents: int
    people: list[PersonWeekSummary]


# ---------- helpers ----------


def _week_bounds(start: date, week_starts_on: int) -> tuple[date, date]:
    """Return (monday_or_sunday_start, saturday_or_sunday_end) containing `start`.

    week_starts_on: Python weekday (0=Mon...6=Sun)? We'll use ISO-ish where 0=Sun
    to match date-fns' `weekStartsOn`.
    """
    # Convert to Python's Mon=0 ... Sun=6
    py_weekday = start.weekday()
    # Python weekday: Mon=0,Tue=1,Wed=2,Thu=3,Fri=4,Sat=5,Sun=6
    # Our setting:   Sun=0,Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6
    # Python -> ours: (py_weekday + 1) % 7
    ours = (py_weekday + 1) % 7
    offset = (ours - week_starts_on) % 7
    begin = start - timedelta(days=offset)
    return begin, begin + timedelta(days=6)


def _settings_snapshot() -> tuple[int, int]:
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        return s.allowance_point_value_cents, s.allowance_week_starts_on


# ---------- people ----------


@router.get("/people", response_model=list[PersonOut])
def list_people():
    with session_scope() as session:
        rows = session.execute(select(Person).order_by(Person.name)).scalars().all()
        return [PersonOut.model_validate(r) for r in rows]


@router.post("/people", response_model=PersonOut, status_code=201)
async def create_person(payload: PersonCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    with session_scope() as session:
        row = Person(name=name, emoji=(payload.emoji or "").strip() or None, color=payload.color)
        session.add(row)
        session.flush()
        out = PersonOut.model_validate(row)
    await bus.publish("allowance-updated")
    return out


@router.patch("/people/{person_id}", response_model=PersonOut)
async def update_person(person_id: int, payload: PersonUpdate):
    with session_scope() as session:
        row = session.get(Person, person_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Person not found")
        data = payload.model_dump(exclude_unset=True)
        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Name cannot be empty")
            row.name = name
        if "emoji" in data:
            row.emoji = (data["emoji"] or "").strip() or None
        if "color" in data and data["color"]:
            row.color = data["color"]
        out = PersonOut.model_validate(row)
    await bus.publish("allowance-updated")
    return out


@router.delete("/people/{person_id}", status_code=204)
async def delete_person(person_id: int):
    with session_scope() as session:
        row = session.get(Person, person_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Person not found")
        session.delete(row)
    await bus.publish("allowance-updated")


# ---------- chores ----------


@router.get("/chores", response_model=list[ChoreOut])
def list_chores():
    with session_scope() as session:
        rows = (
            session.execute(
                select(AllowanceChore).order_by(AllowanceChore.person_id, AllowanceChore.name)
            )
            .scalars()
            .all()
        )
        return [ChoreOut.model_validate(r) for r in rows]


@router.post("/chores", response_model=ChoreOut, status_code=201)
async def create_chore(payload: ChoreCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    with session_scope() as session:
        if payload.person_id is not None and session.get(Person, payload.person_id) is None:
            raise HTTPException(status_code=404, detail="Unknown person")
        row = AllowanceChore(
            name=name,
            emoji=(payload.emoji or "").strip() or None,
            points=payload.points,
            person_id=payload.person_id,
        )
        session.add(row)
        session.flush()
        out = ChoreOut.model_validate(row)
    await bus.publish("allowance-updated")
    return out


@router.patch("/chores/{chore_id}", response_model=ChoreOut)
async def update_chore(chore_id: int, payload: ChoreUpdate):
    with session_scope() as session:
        row = session.get(AllowanceChore, chore_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Chore not found")
        data = payload.model_dump(exclude_unset=True)
        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Name cannot be empty")
            row.name = name
        if "emoji" in data:
            row.emoji = (data["emoji"] or "").strip() or None
        if "points" in data and data["points"] is not None:
            row.points = data["points"]
        if "person_id" in data:
            if data["person_id"] is not None and session.get(Person, data["person_id"]) is None:
                raise HTTPException(status_code=404, detail="Unknown person")
            row.person_id = data["person_id"]
        out = ChoreOut.model_validate(row)
    await bus.publish("allowance-updated")
    return out


@router.delete("/chores/{chore_id}", status_code=204)
async def delete_chore(chore_id: int):
    with session_scope() as session:
        row = session.get(AllowanceChore, chore_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Chore not found")
        session.delete(row)
    await bus.publish("allowance-updated")


# ---------- completions ----------


@router.post("/completions", response_model=CompletionOut, status_code=201)
async def record_completion(payload: CompletionCreate):
    with session_scope() as session:
        chore = session.get(AllowanceChore, payload.chore_id)
        if chore is None:
            raise HTTPException(status_code=404, detail="Chore not found")
        person_id = payload.person_id if payload.person_id is not None else chore.person_id
        if person_id is None:
            raise HTTPException(
                status_code=400,
                detail="Specify a person_id — this chore has no default assignee.",
            )
        if session.get(Person, person_id) is None:
            raise HTTPException(status_code=404, detail="Unknown person")
        row = AllowanceCompletion(
            chore_id=chore.id,
            person_id=person_id,
            points=chore.points,
        )
        session.add(row)
        session.flush()
        out = CompletionOut.model_validate(row)
    await bus.publish("allowance-updated")
    return out


@router.delete("/completions/{completion_id}", status_code=204)
async def delete_completion(completion_id: int):
    with session_scope() as session:
        row = session.get(AllowanceCompletion, completion_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Completion not found")
        session.delete(row)
    await bus.publish("allowance-updated")


# ---------- week summary + payout ----------


@router.get("/week", response_model=WeekSummaryOut)
def week_summary(day: date | None = Query(default=None)):
    """Return per-person totals for the week containing `day` (default today)."""
    point_value_cents, week_starts_on = _settings_snapshot()
    ref = day or date.today()
    begin, end = _week_bounds(ref, week_starts_on)
    start_dt = datetime.combine(begin, datetime.min.time())
    end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())

    out: list[PersonWeekSummary] = []
    with session_scope() as session:
        people = session.execute(select(Person).order_by(Person.name)).scalars().all()
        for p in people:
            completions = (
                session.execute(
                    select(AllowanceCompletion)
                    .where(AllowanceCompletion.person_id == p.id)
                    .where(AllowanceCompletion.completed_at >= start_dt)
                    .where(AllowanceCompletion.completed_at < end_dt)
                    .order_by(AllowanceCompletion.completed_at)
                )
                .scalars()
                .all()
            )
            total_points = sum(c.points for c in completions if c.paid_out_at is None)
            out.append(
                PersonWeekSummary(
                    person=PersonOut.model_validate(p),
                    points_total=total_points,
                    earnings_cents=total_points * point_value_cents,
                    completions=[CompletionOut.model_validate(c) for c in completions],
                )
            )

    return WeekSummaryOut(
        week_start=begin,
        week_end=end,
        point_value_cents=point_value_cents,
        people=out,
    )


class PayoutIn(BaseModel):
    person_id: int
    day: date | None = None  # any day within the week to pay out


@router.post("/payout", status_code=204)
async def mark_paid(payload: PayoutIn):
    _, week_starts_on = _settings_snapshot()
    ref = payload.day or date.today()
    begin, end = _week_bounds(ref, week_starts_on)
    start_dt = datetime.combine(begin, datetime.min.time())
    end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())
    now = utc_now_naive()
    with session_scope() as session:
        session.query(AllowanceCompletion).filter(
            AllowanceCompletion.person_id == payload.person_id,
            AllowanceCompletion.completed_at >= start_dt,
            AllowanceCompletion.completed_at < end_dt,
            AllowanceCompletion.paid_out_at.is_(None),
        ).update({"paid_out_at": now}, synchronize_session=False)
    await bus.publish("allowance-updated")
