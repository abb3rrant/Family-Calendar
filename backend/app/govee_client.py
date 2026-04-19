"""Wrapper around Govee's Cloud Developer API v2.

Docs: https://developer.govee.com/reference/get-you-devices

Auth: a single `Govee-API-Key` header. Get the key from the Govee Home app:
Profile -> Settings -> Apply for API Key. They email it to you.

The v2 API is capability-based — each device lists the capabilities it
supports (on_off, brightness, color, color_temperature, scene...), and you
control it by POSTing a capability+value combination.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://openapi.api.govee.com/router/api/v1"


@dataclass
class GoveeDevice:
    sku: str
    device: str  # MAC-style address, serves as the unique id
    name: str
    type: str
    capabilities: list[dict[str, Any]]


class GoveeError(Exception):
    pass


class GoveeClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise GoveeError("Missing Govee API key")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Govee-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f"{BASE_URL}{path}", json=body, headers=self._headers())
        return self._decode(r)

    async def _get(self, path: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{BASE_URL}{path}", headers=self._headers())
        return self._decode(r)

    def _decode(self, r: httpx.Response) -> dict[str, Any]:
        if r.status_code == 401:
            raise GoveeError("Invalid Govee API key")
        if r.status_code == 429:
            raise GoveeError("Govee API rate limit hit (10/min/device, 10k/day)")
        try:
            data = r.json()
        except Exception:
            raise GoveeError(f"Govee returned non-JSON (HTTP {r.status_code})")
        if not r.is_success:
            msg = data.get("message") if isinstance(data, dict) else str(data)
            raise GoveeError(f"Govee error (HTTP {r.status_code}): {msg}")
        if isinstance(data, dict) and data.get("code") not in (200, None):
            raise GoveeError(f"Govee error ({data.get('code')}): {data.get('message')}")
        return data

    async def list_devices(self) -> list[GoveeDevice]:
        data = await self._get("/user/devices")
        out: list[GoveeDevice] = []
        for d in data.get("data", []) or []:
            out.append(
                GoveeDevice(
                    sku=d.get("sku", ""),
                    device=d.get("device", ""),
                    name=d.get("deviceName", ""),
                    type=d.get("type", ""),
                    capabilities=d.get("capabilities", []) or [],
                )
            )
        return out

    async def get_state(self, sku: str, device: str) -> dict[str, Any]:
        """Return current on/brightness/color state, decoded to a flat dict."""
        body = {
            "requestId": str(uuid.uuid4()),
            "payload": {"sku": sku, "device": device},
        }
        data = await self._post("/device/state", body)
        payload = data.get("payload", {}) or {}
        caps = payload.get("capabilities", []) or []
        state: dict[str, Any] = {}
        for cap in caps:
            inst = cap.get("instance")
            val = (cap.get("state") or {}).get("value")
            if inst == "powerSwitch":
                state["on"] = bool(val)
            elif inst == "brightness":
                state["brightness"] = val
            elif inst == "colorRgb":
                state["color_rgb"] = val
            elif inst == "colorTemperatureK":
                state["color_temperature_k"] = val
        return state

    async def _control(
        self, sku: str, device: str, cap_type: str, instance: str, value: Any
    ) -> None:
        body = {
            "requestId": str(uuid.uuid4()),
            "payload": {
                "sku": sku,
                "device": device,
                "capability": {
                    "type": cap_type,
                    "instance": instance,
                    "value": value,
                },
            },
        }
        await self._post("/device/control", body)

    async def set_power(self, sku: str, device: str, on: bool) -> None:
        await self._control(
            sku, device, "devices.capabilities.on_off", "powerSwitch", 1 if on else 0
        )

    async def set_brightness(self, sku: str, device: str, percent: int) -> None:
        pct = max(1, min(100, int(percent)))
        await self._control(
            sku, device, "devices.capabilities.range", "brightness", pct
        )

    async def set_color_rgb(self, sku: str, device: str, r: int, g: int, b: int) -> None:
        r = max(0, min(255, int(r)))
        g = max(0, min(255, int(g)))
        b = max(0, min(255, int(b)))
        value = (r << 16) | (g << 8) | b
        await self._control(
            sku, device, "devices.capabilities.color_setting", "colorRgb", value
        )

    async def set_color_temperature(self, sku: str, device: str, kelvin: int) -> None:
        await self._control(
            sku,
            device,
            "devices.capabilities.color_setting",
            "colorTemperatureK",
            int(kelvin),
        )
