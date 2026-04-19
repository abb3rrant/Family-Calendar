from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import PinnedCountdown

router = APIRouter(prefix="/api/countdowns", tags=["countdowns"])


class CountdownOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str
    emoji: str | None
    target_date: date


class CountdownCreate(BaseModel):
    label: str
    emoji: str | None = None
    target_date: date


class CountdownUpdate(BaseModel):
    label: str | None = None
    emoji: str | None = None
    target_date: date | None = None


@router.get("", response_model=list[CountdownOut])
def list_countdowns():
    with session_scope() as session:
        rows = (
            session.execute(select(PinnedCountdown).order_by(PinnedCountdown.target_date))
            .scalars()
            .all()
        )
        return [CountdownOut.model_validate(r) for r in rows]


@router.post("", response_model=CountdownOut, status_code=201)
async def create_countdown(payload: CountdownCreate):
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    with session_scope() as session:
        row = PinnedCountdown(
            label=label,
            emoji=(payload.emoji or "").strip() or None,
            target_date=payload.target_date,
        )
        session.add(row)
        session.flush()
        out = CountdownOut.model_validate(row)
    await bus.publish("countdowns-updated")
    return out


@router.patch("/{countdown_id}", response_model=CountdownOut)
async def update_countdown(countdown_id: int, payload: CountdownUpdate):
    with session_scope() as session:
        row = session.get(PinnedCountdown, countdown_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Countdown not found")
        if payload.label is not None:
            label = payload.label.strip()
            if not label:
                raise HTTPException(status_code=400, detail="Label cannot be empty")
            row.label = label
        if payload.emoji is not None:
            row.emoji = payload.emoji.strip() or None
        if payload.target_date is not None:
            row.target_date = payload.target_date
        out = CountdownOut.model_validate(row)
    await bus.publish("countdowns-updated")
    return out


@router.delete("/{countdown_id}", status_code=204)
async def delete_countdown(countdown_id: int):
    with session_scope() as session:
        row = session.get(PinnedCountdown, countdown_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Countdown not found")
        session.delete(row)
    await bus.publish("countdowns-updated")
