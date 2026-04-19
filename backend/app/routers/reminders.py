from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from ..db import session_scope
from ..govee_client import GoveeClient, GoveeError
from ..models import CalendarProfile, ReminderRule, Settings
from ..reminder_engine import play_flash

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

ScopeType = Literal["calendar", "category"]
PatternType = Literal["single", "triple", "pulse"]

import re
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _color(v: str | None) -> str | None:
    if v is None:
        return None
    if not _HEX.match(v):
        raise ValueError("Color must be hex like '#A1B2C3'")
    return v


class ReminderRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str | None
    scope_type: str
    scope_value: str
    lead_minutes: int
    device_id: str
    device_sku: str
    device_name: str | None
    flash_color: str
    flash_pattern: str
    active: bool
    last_error: str | None = None
    last_error_at: datetime | None = None


class ReminderRuleCreate(BaseModel):
    name: str | None = None
    scope_type: ScopeType
    scope_value: str
    lead_minutes: int = Field(ge=1, le=720)
    device_id: str
    device_sku: str
    device_name: str | None = None
    flash_color: str = "#DC2626"
    flash_pattern: PatternType = "single"
    active: bool = True

    @field_validator("flash_color")
    @classmethod
    def _check_color(cls, v: str) -> str:
        return _color(v) or v


class ReminderRuleUpdate(BaseModel):
    name: str | None = None
    scope_type: ScopeType | None = None
    scope_value: str | None = None
    lead_minutes: int | None = Field(default=None, ge=1, le=720)
    device_id: str | None = None
    device_sku: str | None = None
    device_name: str | None = None
    flash_color: str | None = None
    flash_pattern: PatternType | None = None
    active: bool | None = None

    @field_validator("flash_color")
    @classmethod
    def _check_color(cls, v: str | None) -> str | None:
        return _color(v)


@router.get("", response_model=list[ReminderRuleOut])
def list_rules():
    with session_scope() as session:
        rows = (
            session.execute(select(ReminderRule).order_by(ReminderRule.id))
            .scalars()
            .all()
        )
        return [ReminderRuleOut.model_validate(r) for r in rows]


@router.post("", response_model=ReminderRuleOut, status_code=201)
def create_rule(payload: ReminderRuleCreate):
    _validate_scope(payload.scope_type, payload.scope_value)
    with session_scope() as session:
        row = ReminderRule(**payload.model_dump())
        session.add(row)
        session.flush()
        return ReminderRuleOut.model_validate(row)


@router.patch("/{rule_id}", response_model=ReminderRuleOut)
def update_rule(rule_id: int, payload: ReminderRuleUpdate):
    with session_scope() as session:
        row = session.get(ReminderRule, rule_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        data = payload.model_dump(exclude_unset=True)
        new_scope_type = data.get("scope_type", row.scope_type)
        new_scope_value = data.get("scope_value", row.scope_value)
        if "scope_type" in data or "scope_value" in data:
            _validate_scope(new_scope_type, new_scope_value)
        for k, v in data.items():
            setattr(row, k, v)
        return ReminderRuleOut.model_validate(row)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int):
    with session_scope() as session:
        row = session.get(ReminderRule, rule_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        session.delete(row)


@router.post("/{rule_id}/test", status_code=204)
async def test_rule(rule_id: int):
    with session_scope() as session:
        rule = session.get(ReminderRule, rule_id)
        if rule is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        s = session.get(Settings, 1)
        api_key = (s.govee_api_key or "").strip() if s else ""
        sku = rule.device_sku
        device = rule.device_id
        color = rule.flash_color
        pattern = rule.flash_pattern

    if not api_key:
        raise HTTPException(
            status_code=400, detail="Govee API key not configured"
        )
    client = GoveeClient(api_key)
    try:
        await play_flash(client, sku, device, color, pattern)  # type: ignore[arg-type]
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/categories", response_model=list[str])
def available_categories():
    """Distinct category values across configured calendars."""
    with session_scope() as session:
        rows = (
            session.execute(
                select(CalendarProfile.category)
                .where(CalendarProfile.category.is_not(None))
                .distinct()
            )
            .scalars()
            .all()
        )
        return sorted(c for c in rows if c)


def _validate_scope(scope_type: str, scope_value: str) -> None:
    if scope_type == "calendar":
        with session_scope() as session:
            cal = session.get(CalendarProfile, scope_value)
            if cal is None:
                raise HTTPException(
                    status_code=400, detail=f"Unknown calendar id: {scope_value}"
                )
    elif scope_type == "category":
        if not scope_value.strip():
            raise HTTPException(status_code=400, detail="Category cannot be empty")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid scope_type: {scope_type}")
