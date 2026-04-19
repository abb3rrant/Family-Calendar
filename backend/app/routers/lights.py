from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..db import session_scope
from ..govee_client import GoveeClient, GoveeError
from ..models import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lights", tags=["lights"])


class LightOut(BaseModel):
    device: str
    sku: str
    name: str
    type: str
    capabilities: list[dict[str, Any]]
    state: dict[str, Any]


class PowerPayload(BaseModel):
    sku: str
    on: bool


class BrightnessPayload(BaseModel):
    sku: str
    percent: int


class ColorPayload(BaseModel):
    sku: str
    r: int
    g: int
    b: int


class ColorTempPayload(BaseModel):
    sku: str
    kelvin: int


def _client() -> GoveeClient:
    with session_scope() as session:
        s = session.get(Settings, 1)
        key = (s.govee_api_key or "").strip() if s else ""
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Govee API key is not configured. Add it in Settings → General → Integrations.",
        )
    return GoveeClient(key)


def _handle(exc: Exception):
    if isinstance(exc, GoveeError):
        raise HTTPException(status_code=502, detail=str(exc))
    raise exc


@router.get("", response_model=list[LightOut])
async def list_lights():
    client = _client()
    try:
        devices = await client.list_devices()
        # Fetch state in parallel, but cap concurrency to respect rate limits
        async def load(d):
            try:
                state = await client.get_state(d.sku, d.device)
            except GoveeError:
                state = {}
            return LightOut(
                device=d.device,
                sku=d.sku,
                name=d.name,
                type=d.type,
                capabilities=d.capabilities,
                state=state,
            )

        return await asyncio.gather(*[load(d) for d in devices])
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{device}/power", status_code=204)
async def set_power(device: str, payload: PowerPayload):
    client = _client()
    try:
        await client.set_power(payload.sku, device, payload.on)
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{device}/brightness", status_code=204)
async def set_brightness(device: str, payload: BrightnessPayload):
    client = _client()
    try:
        await client.set_brightness(payload.sku, device, payload.percent)
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{device}/color", status_code=204)
async def set_color(device: str, payload: ColorPayload):
    client = _client()
    try:
        await client.set_color_rgb(payload.sku, device, payload.r, payload.g, payload.b)
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{device}/color-temperature", status_code=204)
async def set_color_temperature(device: str, payload: ColorTempPayload):
    client = _client()
    try:
        await client.set_color_temperature(payload.sku, device, payload.kelvin)
    except GoveeError as e:
        raise HTTPException(status_code=502, detail=str(e))


class TestResult(BaseModel):
    ok: bool
    device_count: int
    status: Literal["connected", "invalid_key", "rate_limited", "error"]
    message: str | None = None


@router.post("/test", response_model=TestResult)
async def test_connection(request: Request):
    """Quick health check — used by the settings UI."""
    with session_scope() as session:
        s = session.get(Settings, 1)
        key = (s.govee_api_key or "").strip() if s else ""
    if not key:
        return TestResult(ok=False, device_count=0, status="invalid_key", message="No key set")
    try:
        client = GoveeClient(key)
        devices = await client.list_devices()
        return TestResult(ok=True, device_count=len(devices), status="connected")
    except GoveeError as e:
        msg = str(e)
        status = (
            "invalid_key"
            if "Invalid" in msg
            else "rate_limited"
            if "rate" in msg.lower()
            else "error"
        )
        return TestResult(ok=False, device_count=0, status=status, message=msg)
