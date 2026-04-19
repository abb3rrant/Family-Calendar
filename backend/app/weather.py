from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import httpx

from .config import WeatherConfig
from .timeutil import utc_now_naive

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


_cache: dict[str, Any] = {"data": None, "fetched_at": None}
CACHE_TTL = timedelta(minutes=15)


async def get_weather(cfg: WeatherConfig) -> dict[str, Any]:
    now = utc_now_naive()
    if _cache["data"] is not None and (now - _cache["fetched_at"]) < CACHE_TTL:
        return _cache["data"]

    params = {
        "latitude": cfg.latitude,
        "longitude": cfg.longitude,
        "current": "temperature_2m,weather_code,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": cfg.timezone,
        "forecast_days": 7,
        "temperature_unit": cfg.unit,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    _cache["data"] = data
    _cache["fetched_at"] = now
    return data
