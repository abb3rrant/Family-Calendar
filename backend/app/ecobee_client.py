"""Thin wrapper around the ecobee REST API with PIN-based OAuth.

Docs: https://www.ecobee.com/home/developer/api/documentation/v1

Flow for personal use:
  1. Create a developer app at developer.ecobee.com and save the API key.
  2. POST /authorize?response_type=ecobeePin&client_id=<key>&scope=smartWrite
     -> returns a 4-character PIN and an opaque `code`.
  3. User logs into ecobee.com/consumerportal -> My Apps -> Add Application,
     enters the PIN. (Out of band — nothing the server can automate.)
  4. Poll POST /token with grant_type=ecobeePin&code=<code>&client_id=<key>
     every ~30s. Before the user authorizes, ecobee returns 4xx. After, it
     returns an access + refresh token.
  5. Store refresh_token; exchange for new access tokens (1h life) as needed.

The caller (router) is responsible for persistence — this module is
stateless per call aside from the api_key.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

logger = logging.getLogger(__name__)

AUTH_URL = "https://api.ecobee.com/authorize"
TOKEN_URL = "https://api.ecobee.com/token"
API_BASE = "https://api.ecobee.com/1"

HvacMode = Literal["auto", "heat", "cool", "off", "auxHeatOnly"]
ComfortRef = Literal["home", "away", "sleep"]


class EcobeeError(Exception):
    pass


class EcobeePendingAuthorization(EcobeeError):
    """Raised when the user hasn't entered the PIN yet."""


@dataclass
class PinFlow:
    pin: str
    code: str
    expires_in: int
    interval: int


@dataclass
class Tokens:
    access_token: str
    refresh_token: str
    expires_at: datetime  # UTC


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EcobeeClient:
    def __init__(
        self,
        api_key: str,
        access_token: str | None = None,
        refresh_token: str | None = None,
        expires_at: datetime | None = None,
    ):
        if not api_key:
            raise EcobeeError("Missing ecobee API key")
        self.api_key = api_key
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.expires_at = expires_at

    # ---------- OAuth ----------

    async def start_pin_flow(self) -> PinFlow:
        params = {
            "response_type": "ecobeePin",
            "client_id": self.api_key,
            "scope": "smartWrite",
        }
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(AUTH_URL, params=params)
        data = self._decode_json(r)
        return PinFlow(
            pin=data["ecobeePin"],
            code=data["code"],
            expires_in=int(data.get("expires_in", 540)),
            interval=int(data.get("interval", 30)),
        )

    async def poll_for_tokens(self, code: str) -> Tokens:
        data = {
            "grant_type": "ecobeePin",
            "code": code,
            "client_id": self.api_key,
        }
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(TOKEN_URL, data=data)
        if r.status_code >= 400:
            # ecobee returns {"error":"authorization_pending"} while the PIN
            # is outstanding — surface a typed exception so the router can
            # return 202 without logging noise.
            try:
                payload = r.json()
            except Exception:
                payload = {}
            err = (payload or {}).get("error", "")
            if err in {"authorization_pending", "slow_down"}:
                raise EcobeePendingAuthorization(err)
            raise EcobeeError(
                f"ecobee token exchange failed (HTTP {r.status_code}): {payload}"
            )
        return self._parse_tokens(r.json())

    async def refresh(self) -> Tokens:
        if not self.refresh_token:
            raise EcobeeError("No refresh token — re-authorize required")
        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.api_key,
        }
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(TOKEN_URL, data=data)
        if r.status_code >= 400:
            raise EcobeeError(
                f"ecobee token refresh failed (HTTP {r.status_code}): {r.text}"
            )
        tokens = self._parse_tokens(r.json())
        self.access_token = tokens.access_token
        self.refresh_token = tokens.refresh_token
        self.expires_at = tokens.expires_at
        return tokens

    def _parse_tokens(self, payload: dict[str, Any]) -> Tokens:
        expires_in = int(payload.get("expires_in", 3600))
        return Tokens(
            access_token=payload["access_token"],
            refresh_token=payload["refresh_token"],
            expires_at=_utcnow() + timedelta(seconds=expires_in - 60),
        )

    async def _ensure_access_token(self) -> Tokens | None:
        """Return new Tokens if a refresh happened, else None."""
        if not self.access_token:
            raise EcobeeError("Not authorized — complete the PIN flow")
        if self.expires_at and self.expires_at > _utcnow():
            return None
        return await self.refresh()

    # ---------- thermostat ----------

    async def get_thermostat(self) -> tuple[dict[str, Any], Tokens | None]:
        refreshed = await self._ensure_access_token()
        selection = {
            "selection": {
                "selectionType": "registered",
                "selectionMatch": "",
                "includeRuntime": True,
                "includeSettings": True,
                "includeSensors": True,
                "includeProgram": True,
            }
        }
        params = {"json": self._jsondumps(selection)}
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(
                f"{API_BASE}/thermostat",
                params=params,
                headers=self._auth_headers(),
            )
        data = self._decode_json(r)
        therms = data.get("thermostatList") or []
        if not therms:
            raise EcobeeError("No thermostats on this account")
        return therms[0], refreshed

    async def set_hvac_mode(self, mode: HvacMode) -> Tokens | None:
        refreshed = await self._ensure_access_token()
        body = {
            "selection": {"selectionType": "registered", "selectionMatch": ""},
            "thermostat": {"settings": {"hvacMode": mode}},
        }
        await self._post_thermostat(body)
        return refreshed

    async def set_hold(
        self,
        *,
        heat_f: float | None = None,
        cool_f: float | None = None,
        hold_type: str = "nextTransition",
    ) -> Tokens | None:
        refreshed = await self._ensure_access_token()
        params: dict[str, Any] = {"holdType": hold_type}
        if heat_f is not None:
            params["heatHoldTemp"] = int(round(heat_f * 10))
        if cool_f is not None:
            params["coolHoldTemp"] = int(round(cool_f * 10))
        body = {
            "selection": {"selectionType": "registered", "selectionMatch": ""},
            "functions": [{"type": "setHold", "params": params}],
        }
        await self._post_thermostat(body)
        return refreshed

    async def set_comfort(
        self, ref: ComfortRef, hold_type: str = "nextTransition"
    ) -> Tokens | None:
        refreshed = await self._ensure_access_token()
        body = {
            "selection": {"selectionType": "registered", "selectionMatch": ""},
            "functions": [
                {
                    "type": "setHold",
                    "params": {"holdClimateRef": ref, "holdType": hold_type},
                }
            ],
        }
        await self._post_thermostat(body)
        return refreshed

    async def resume_program(self) -> Tokens | None:
        refreshed = await self._ensure_access_token()
        body = {
            "selection": {"selectionType": "registered", "selectionMatch": ""},
            "functions": [{"type": "resumeProgram", "params": {"resumeAll": True}}],
        }
        await self._post_thermostat(body)
        return refreshed

    # ---------- helpers ----------

    async def _post_thermostat(self, body: dict[str, Any]) -> None:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                f"{API_BASE}/thermostat",
                params={"format": "json"},
                json=body,
                headers=self._auth_headers(),
            )
        data = self._decode_json(r)
        status = (data.get("status") or {}).get("code")
        if status not in (0, None):
            raise EcobeeError(f"ecobee rejected request: {data.get('status')}")

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _decode_json(self, r: httpx.Response) -> dict[str, Any]:
        if r.status_code == 401:
            raise EcobeeError("ecobee rejected the token — re-authorize required")
        try:
            data = r.json()
        except Exception:
            raise EcobeeError(f"ecobee returned non-JSON (HTTP {r.status_code})")
        if not r.is_success:
            raise EcobeeError(f"ecobee error (HTTP {r.status_code}): {data}")
        return data

    @staticmethod
    def _jsondumps(obj: Any) -> str:
        import json

        return json.dumps(obj, separators=(",", ":"))
