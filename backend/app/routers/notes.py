from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import Note

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    created_at: datetime
    updated_at: datetime


class NoteCreate(BaseModel):
    text: str


class NoteUpdate(BaseModel):
    text: str


@router.get("", response_model=list[NoteOut])
def list_notes():
    with session_scope() as session:
        rows = (
            session.execute(select(Note).order_by(Note.created_at.desc()))
            .scalars()
            .all()
        )
        return [NoteOut.model_validate(r) for r in rows]


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(payload: NoteCreate):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    with session_scope() as session:
        row = Note(text=text)
        session.add(row)
        session.flush()
        out = NoteOut.model_validate(row)
    await bus.publish("notes-updated")
    return out


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(note_id: int, payload: NoteUpdate):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    with session_scope() as session:
        row = session.get(Note, note_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Note not found")
        row.text = text
        out = NoteOut.model_validate(row)
    await bus.publish("notes-updated")
    return out


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: int):
    with session_scope() as session:
        row = session.get(Note, note_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Note not found")
        session.delete(row)
    await bus.publish("notes-updated")
