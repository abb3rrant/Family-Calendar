"""Wrapper around the unofficial `ring-doorbell` library.

Auth model:
  1. user provides email + password
  2. Ring sends a 2FA code to their phone/email
  3. user provides the code
  4. we get back a refresh-token JSON blob → persist to Settings.ring_token

After that, we recreate `Auth` from the saved blob on every call. The library
silently rotates the refresh token; we persist whatever it gives us so the
session never goes stale.

Live video isn't implemented — Ring uses WebRTC and the official path is
heavy. We expose snapshots instead, which the frontend polls for a
near-live view (1-3s refresh).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import aiohttp
from ring_doorbell import Auth, Ring
from ring_doorbell.exceptions import (
    AuthenticationError,
    Requires2FAError,
)

logger = logging.getLogger(__name__)

USER_AGENT = "FamilyCalendar/1.0"


class RingError(Exception):
    pass


class RingNeed2FA(RingError):
    pass


class RingAuthError(RingError):
    pass


@dataclass
class CameraInfo:
    id: int
    name: str
    kind: str
    family: str  # "doorbells" | "stickup_cams" | etc.
    battery_life: int | None
    has_subscription: bool
    snapshot_supported: bool


def _token_updated_cb(persist: Callable[[dict], None]) -> Callable[[dict], None]:
    """Called by ring-doorbell whenever it rotates the refresh token."""

    def _on_update(token: dict) -> None:
        try:
            persist(token)
        except Exception:
            logger.exception("Failed to persist rotated Ring token")

    return _on_update


class RingClient:
    def __init__(self, token: dict | None, persist_token: Callable[[dict], None]):
        self._token = token
        self._persist = persist_token
        self._auth: Auth | None = None
        self._ring: Ring | None = None
        self._session: aiohttp.ClientSession | None = None

    async def _open(self) -> None:
        if self._auth is not None:
            return
        if self._token is None:
            raise RingAuthError("Not authenticated yet — finish the login flow")
        self._session = aiohttp.ClientSession()
        self._auth = Auth(USER_AGENT, self._token, _token_updated_cb(self._persist))
        self._ring = Ring(self._auth)
        try:
            await self._ring.async_create_session()
            await self._ring.async_update_data()
        except AuthenticationError as exc:
            raise RingAuthError(str(exc))

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None
        self._auth = None
        self._ring = None

    # ---------- auth ----------

    @staticmethod
    async def initial_login(
        email: str, password: str, two_factor_code: str | None = None
    ) -> dict:
        """Run username/password login. Raises RingNeed2FA if a code is needed.

        Returns the token dict on success.
        """
        auth = Auth(USER_AGENT)
        try:
            try:
                await auth.async_fetch_token(email, password, two_factor_code)
            except Requires2FAError:
                raise RingNeed2FA("Ring sent a 2FA code — submit it to finish")
            except AuthenticationError as exc:
                raise RingAuthError(str(exc))
            token = auth.token
            if not token:
                raise RingAuthError("Ring login succeeded but returned no token")
            return token
        finally:
            close = getattr(auth, "async_close", None)
            if callable(close):
                try:
                    await close()
                except Exception:
                    pass

    # ---------- cameras ----------

    async def list_cameras(self) -> list[CameraInfo]:
        await self._open()
        assert self._ring is not None
        out: list[CameraInfo] = []
        for family in ("doorbots", "authorized_doorbots", "stickup_cams"):
            devices = self._ring.devices().get(family, [])
            for d in devices:
                try:
                    out.append(
                        CameraInfo(
                            id=int(d.id),
                            name=d.name,
                            kind=getattr(d, "kind", "") or "",
                            family=family,
                            battery_life=getattr(d, "battery_life", None),
                            has_subscription=bool(
                                getattr(d, "has_subscription", False)
                            ),
                            snapshot_supported=True,
                        )
                    )
                except Exception:
                    logger.exception("Failed to read Ring device %s", d)
        return out

    async def snapshot(self, device_id: int) -> bytes:
        """Return a JPEG snapshot for the camera. May raise RingError."""
        await self._open()
        assert self._ring is not None
        target = None
        for family in ("doorbots", "authorized_doorbots", "stickup_cams"):
            for d in self._ring.devices().get(family, []):
                if int(d.id) == device_id:
                    target = d
                    break
            if target:
                break
        if target is None:
            raise RingError(f"No Ring camera with id {device_id}")
        try:
            data = await target.async_get_snapshot()
        except Exception as exc:
            raise RingError(f"Snapshot failed: {exc}")
        if not data:
            raise RingError("Empty snapshot")
        return data
