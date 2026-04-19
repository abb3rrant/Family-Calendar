from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import Chore
from ..schemas import ChoreCreate, ChoreOut, ChoreUpdate
from ..timeutil import utc_now_naive

router = APIRouter(prefix="/api/chores", tags=["chores"])


@router.get("", response_model=list[ChoreOut])
def list_chores():
    with session_scope() as session:
        rows = session.execute(select(Chore).order_by(Chore.done, Chore.created_at)).scalars().all()
        return [ChoreOut.model_validate(r) for r in rows]


@router.post("", response_model=ChoreOut, status_code=201)
async def create_chore(payload: ChoreCreate):
    with session_scope() as session:
        row = Chore(title=payload.title, assignee=payload.assignee)
        session.add(row)
        session.flush()
        out = ChoreOut.model_validate(row)
    await bus.publish("chores-updated")
    return out


@router.patch("/{chore_id}", response_model=ChoreOut)
async def update_chore(chore_id: int, payload: ChoreUpdate):
    with session_scope() as session:
        row = session.get(Chore, chore_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Chore not found")
        if payload.title is not None:
            row.title = payload.title
        if payload.assignee is not None:
            row.assignee = payload.assignee
        if payload.done is not None and payload.done != row.done:
            row.done = payload.done
            row.completed_at = utc_now_naive() if payload.done else None
        out = ChoreOut.model_validate(row)
    await bus.publish("chores-updated")
    return out


@router.delete("/{chore_id}", status_code=204)
async def delete_chore(chore_id: int):
    with session_scope() as session:
        row = session.get(Chore, chore_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Chore not found")
        session.delete(row)
    await bus.publish("chores-updated")
