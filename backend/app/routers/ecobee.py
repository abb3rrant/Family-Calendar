from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import session_scope
from ..ecobee_client import (
    ComfortRef,
    EcobeeClient,
    EcobeeError,
    EcobeePendingAuthorization,
    HvacMode,
    Tokens,
)
from ..models import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ecobee", tags=["ecobee"])


# ---------- schemas ----------


class StartAuthOut(BaseModel):
    pin: str
    code: str
    interval: int
    expires_in: int


class PollAuthIn(BaseModel):
    code: str


class AuthStatusOut(BaseModel):
    status: Literal["pending", "connected"]


class ModeIn(BaseModel):
    mode: HvacMode


class HoldIn(BaseModel):
    heat_f: float | None = None
    cool_f: float | None = None


class ComfortIn(BaseModel):
    ref: ComfortRef


class ThermostatOut(BaseModel):
    name: str
    indoor_temperature_f: float | None
    indoor_humidity: int | None
    hvac_mode: str
    # "heating" | "cooling" | "idle" | "fan" | "off"
    equipment_status: str
    heat_setpoint_f: float | None
    cool_setpoint_f: float | None
    current_climate_ref: str | None
    available_climate_refs: list[str]
    is_held: bool


# ---------- helpers ----------


def _load_settings() -> Settings:
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        # Detach a plain snapshot — session closes on exit.
        session.expunge(s)
        return s


def _require_api_key(s: Settings) -> str:
    key = (s.ecobee_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="ecobee API key not set. Paste it in Settings → General → Integrations.",
        )
    return key


def _require_tokens(s: Settings) -> None:
    if not s.ecobee_access_token or not s.ecobee_refresh_token:
        raise HTTPException(
            status_code=400,
            detail="ecobee not authorized. Open Settings → General → Integrations and tap Authorize.",
        )


def _persist_tokens(tokens: Tokens) -> None:
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        s.ecobee_access_token = tokens.access_token
        s.ecobee_refresh_token = tokens.refresh_token
        s.ecobee_token_expires_at = tokens.expires_at


def _make_client(s: Settings) -> EcobeeClient:
    return EcobeeClient(
        api_key=_require_api_key(s),
        access_token=s.ecobee_access_token,
        refresh_token=s.ecobee_refresh_token,
        expires_at=s.ecobee_token_expires_at,
    )


@asynccontextmanager
async def _ecobee_session() -> AsyncIterator[EcobeeClient]:
    """Yield an EcobeeClient and persist any token rotation that happened.

    Use as the only entry point for any thermostat read or write so we can
    never silently lose a refreshed token.
    """
    s = _load_settings()
    _require_tokens(s)
    client = _make_client(s)
    snapshot_access = client.access_token
    snapshot_refresh = client.refresh_token
    snapshot_expires = client.expires_at
    try:
        yield client
    finally:
        if (
            client.access_token != snapshot_access
            or client.refresh_token != snapshot_refresh
            or client.expires_at != snapshot_expires
        ) and client.access_token and client.refresh_token and client.expires_at:
            _persist_tokens(
                Tokens(
                    access_token=client.access_token,
                    refresh_token=client.refresh_token,
                    expires_at=client.expires_at,
                )
            )


# ---------- OAuth ----------


@router.post("/authorize/start", response_model=StartAuthOut)
async def authorize_start():
    s = _load_settings()
    client = EcobeeClient(api_key=_require_api_key(s))
    try:
        pin = await client.start_pin_flow()
    except EcobeeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return StartAuthOut(
        pin=pin.pin,
        code=pin.code,
        interval=pin.interval,
        expires_in=pin.expires_in,
    )


@router.post("/authorize/poll", response_model=AuthStatusOut)
async def authorize_poll(payload: PollAuthIn):
    s = _load_settings()
    client = EcobeeClient(api_key=_require_api_key(s))
    try:
        tokens = await client.poll_for_tokens(payload.code)
    except EcobeePendingAuthorization:
        return AuthStatusOut(status="pending")
    except EcobeeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    _persist_tokens(tokens)
    return AuthStatusOut(status="connected")


@router.post("/disconnect", status_code=204)
def disconnect():
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            return
        s.ecobee_access_token = None
        s.ecobee_refresh_token = None
        s.ecobee_token_expires_at = None


@router.get("/status")
def status():
    s = _load_settings()
    return {
        "api_key_set": bool((s.ecobee_api_key or "").strip()),
        "authorized": bool(s.ecobee_access_token and s.ecobee_refresh_token),
    }


# ---------- thermostat ----------


def _extract_thermostat(t: dict[str, Any]) -> ThermostatOut:
    runtime = t.get("runtime") or {}
    settings = t.get("settings") or {}
    program = t.get("program") or {}
    events = t.get("events") or []

    actual_f = runtime.get("actualTemperature")
    heat_set = runtime.get("desiredHeat")
    cool_set = runtime.get("desiredCool")

    def _tempF(v: Any) -> float | None:
        if v is None:
            return None
        return round(float(v) / 10.0, 1)

    equipment_status = (t.get("equipmentStatus") or "").strip()
    if not equipment_status:
        equipment_status = "idle"
    elif "heat" in equipment_status.lower():
        equipment_status = "heating"
    elif "cool" in equipment_status.lower() or "compCool" in equipment_status:
        equipment_status = "cooling"
    elif "fan" in equipment_status.lower():
        equipment_status = "fan"

    # The currently-running climate ref is reflected via the active event
    # (a hold) if one exists; otherwise fall back to the current climate ref
    # from the program.
    current_ref = program.get("currentClimateRef")
    is_held = False
    for e in events:
        if e.get("running"):
            is_held = True
            if e.get("holdClimateRef"):
                current_ref = e["holdClimateRef"]
            break

    climates = program.get("climates") or []
    climate_refs = [c.get("climateRef") for c in climates if c.get("climateRef")]

    return ThermostatOut(
        name=t.get("name") or "Thermostat",
        indoor_temperature_f=_tempF(actual_f),
        indoor_humidity=runtime.get("actualHumidity"),
        hvac_mode=settings.get("hvacMode") or "off",
        equipment_status=equipment_status,
        heat_setpoint_f=_tempF(heat_set),
        cool_setpoint_f=_tempF(cool_set),
        current_climate_ref=current_ref,
        available_climate_refs=climate_refs,
        is_held=is_held,
    )


@router.get("/thermostat", response_model=ThermostatOut)
async def get_thermostat():
    async with _ecobee_session() as client:
        try:
            t, _ = await client.get_thermostat()
        except EcobeeError as e:
            raise HTTPException(status_code=502, detail=str(e))
    return _extract_thermostat(t)


@router.post("/thermostat/mode", status_code=204)
async def set_mode(payload: ModeIn):
    async with _ecobee_session() as client:
        try:
            await client.set_hvac_mode(payload.mode)
        except EcobeeError as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.post("/thermostat/hold", status_code=204)
async def set_hold(payload: HoldIn):
    if payload.heat_f is None and payload.cool_f is None:
        raise HTTPException(status_code=400, detail="Provide heat_f and/or cool_f")
    async with _ecobee_session() as client:
        try:
            await client.set_hold(heat_f=payload.heat_f, cool_f=payload.cool_f)
        except EcobeeError as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.post("/thermostat/comfort", status_code=204)
async def set_comfort(payload: ComfortIn):
    async with _ecobee_session() as client:
        try:
            await client.set_comfort(payload.ref)
        except EcobeeError as e:
            raise HTTPException(status_code=502, detail=str(e))


@router.post("/thermostat/resume", status_code=204)
async def resume():
    async with _ecobee_session() as client:
        try:
            await client.resume_program()
        except EcobeeError as e:
            raise HTTPException(status_code=502, detail=str(e))
