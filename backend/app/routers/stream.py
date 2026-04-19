from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from ..events_bus import bus

router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.get("")
async def stream(request: Request):
    async def event_generator():
        yield {"event": "hello", "data": "connected"}
        subscriber = bus.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(subscriber.__anext__(), timeout=15.0)
                    yield {"event": "update", "data": event}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
                except StopAsyncIteration:
                    break
        finally:
            await subscriber.aclose()

    return EventSourceResponse(event_generator())
