from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..events_bus import bus
from ..models import GroceryItem

router = APIRouter(prefix="/api/grocery", tags=["grocery"])


class GroceryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    done: bool
    source_meal_id: int | None


class GroceryCreate(BaseModel):
    name: str


class GroceryUpdate(BaseModel):
    name: str | None = None
    done: bool | None = None


@router.get("", response_model=list[GroceryOut])
def list_items():
    with session_scope() as session:
        rows = (
            session.execute(
                select(GroceryItem).order_by(GroceryItem.done, GroceryItem.created_at)
            )
            .scalars()
            .all()
        )
        return [GroceryOut.model_validate(r) for r in rows]


@router.post("", response_model=GroceryOut, status_code=201)
async def create_item(payload: GroceryCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    with session_scope() as session:
        row = GroceryItem(name=name)
        session.add(row)
        session.flush()
        out = GroceryOut.model_validate(row)
    await bus.publish("grocery-updated")
    return out


@router.patch("/{item_id}", response_model=GroceryOut)
async def update_item(item_id: int, payload: GroceryUpdate):
    with session_scope() as session:
        row = session.get(GroceryItem, item_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        if payload.name is not None:
            new_name = payload.name.strip()
            if not new_name:
                raise HTTPException(status_code=400, detail="Name is required")
            row.name = new_name
        if payload.done is not None:
            row.done = payload.done
        out = GroceryOut.model_validate(row)
    await bus.publish("grocery-updated")
    return out


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: int):
    with session_scope() as session:
        row = session.get(GroceryItem, item_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        session.delete(row)
    await bus.publish("grocery-updated")


@router.post("/clear-done", status_code=204)
async def clear_done():
    with session_scope() as session:
        session.query(GroceryItem).filter(GroceryItem.done.is_(True)).delete(
            synchronize_session=False
        )
    await bus.publish("grocery-updated")
