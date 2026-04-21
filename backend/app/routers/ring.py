from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from ..db import session_scope
from ..models import Settings
from ..ring_client import (
    CameraInfo,
    RingAuthError,
    RingClient,
    RingError,
    RingNeed2FA,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ring", tags=["ring"])


# In-memory session table for 2FA (cleared on server restart). Sessions
# expire after PENDING_TTL seconds; pruned lazily on each access.
PENDING_TTL = 600  # 10 minutes
_pending: dict[str, tuple[str, str, float]] = {}  # session_id -> (email, pwd, ts)


def _prune_pending() -> None:
    now = time.time()
    expired = [k for k, v in _pending.items() if now - v[2] > PENDING_TTL]
    for k in expired:
        _pending.pop(k, None)


def _persist_token(token: dict) -> None:
    serialized = json.dumps(token)
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        s.ring_token = serialized


def _load_token() -> dict | None:
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None or not s.ring_token:
            return None
        try:
            return json.loads(s.ring_token)
        except json.JSONDecodeError:
            logger.warning("Stored Ring token is corrupt; clearing")
            s.ring_token = None
            return None


def _make_client() -> RingClient:
    token = _load_token()
    if token is None:
        raise HTTPException(
            status_code=400,
            detail="Ring not connected. Open Settings → General → Integrations.",
        )
    return RingClient(token, _persist_token)


# ---------- schemas ----------


class StartLoginIn(BaseModel):
    email: str
    password: str


class StartLoginOut(BaseModel):
    status: str  # "connected" | "needs_2fa" | "error"
    session_id: str | None = None
    detail: str | None = None


class TwoFactorIn(BaseModel):
    session_id: str
    code: str


class StatusOut(BaseModel):
    connected: bool


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: str
    family: str
    battery_life: int | None
    has_subscription: bool
    snapshot_supported: bool


# ---------- auth ----------


@router.post("/auth/start", response_model=StartLoginOut)
async def start_login(payload: StartLoginIn):
    _prune_pending()
    try:
        token = await RingClient.initial_login(payload.email, payload.password)
    except RingNeed2FA:
        sid = uuid.uuid4().hex
        _pending[sid] = (payload.email, payload.password, time.time())
        return StartLoginOut(status="needs_2fa", session_id=sid)
    except RingAuthError as e:
        logger.warning("Ring login failed for %s: %s", payload.email, e)
        return StartLoginOut(
            status="error",
            detail="Ring rejected those credentials. Double-check the email and password.",
        )
    _persist_token(token)
    return StartLoginOut(status="connected")


@router.post("/auth/2fa", response_model=StartLoginOut)
async def submit_2fa(payload: TwoFactorIn):
    _prune_pending()
    pending = _pending.get(payload.session_id)
    if pending is None:
        raise HTTPException(
            status_code=410,
            detail="That login flow expired. Start the connection again.",
        )
    email, password, _ = pending
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="2FA code is required")
    try:
        token = await RingClient.initial_login(email, password, two_factor_code=code)
    except RingAuthError as e:
        return StartLoginOut(status="error", detail=str(e))
    except RingNeed2FA:
        return StartLoginOut(
            status="error", detail="Ring asked for another 2FA — try once more."
        )
    _pending.pop(payload.session_id, None)
    _persist_token(token)
    return StartLoginOut(status="connected")


@router.post("/disconnect", status_code=204)
def disconnect():
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is not None:
            s.ring_token = None


@router.get("/status", response_model=StatusOut)
def status():
    return StatusOut(connected=_load_token() is not None)


# ---------- cameras ----------


@router.get("/cameras", response_model=list[CameraOut])
async def list_cameras():
    client = _make_client()
    try:
        cams = await client.list_cameras()
    except RingAuthError as e:
        await client.close()
        raise HTTPException(status_code=401, detail=str(e))
    except RingError as e:
        await client.close()
        raise HTTPException(status_code=502, detail=str(e))
    await client.close()
    return [CameraOut(**c.__dict__) for c in cams]


@router.get(
    "/cameras/{device_id}/snapshot",
    responses={200: {"content": {"image/jpeg": {}}}},
)
async def camera_snapshot(device_id: int):
    client = _make_client()
    try:
        data = await client.snapshot(device_id)
    except RingAuthError as e:
        await client.close()
        raise HTTPException(status_code=401, detail=str(e))
    except RingError as e:
        await client.close()
        raise HTTPException(status_code=502, detail=str(e))
    await client.close()
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            # Always-fresh: prevent any caching so the next poll fetches a new frame
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            # Helps the kiosk Chromium not hold a stale image
            "Last-Modified": datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT"),
        },
    )
