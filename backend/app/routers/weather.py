from __future__ import annotations

from fastapi import APIRouter, Request

from ..weather import get_weather

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("")
async def weather(request: Request):
    return await get_weather(request.app.state.config.weather)
