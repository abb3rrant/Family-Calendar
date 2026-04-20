"""Helpers for showing the dashboard's LAN URL on the screen.

Used by the Photo Drop QR code: family members scan the QR from their phones
and land on the mobile upload page. The URL has to be something their phones
can reach over the local network, not `localhost`.
"""

from __future__ import annotations

import logging
import socket
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/network", tags=["network"])


class LanUrlOut(BaseModel):
    drop_url: str
    dashboard_url: str
    host: str


def _outgoing_ip() -> str | None:
    """Return the IP the Pi would use to reach the internet.

    Works without an actual connection — UDP doesn't send a packet until the
    first sendto(). Fails gracefully on hosts without a route to 8.8.8.8.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        if ip == "0.0.0.0":
            return None
        return ip
    except Exception as exc:
        logger.debug("LAN IP detection fell back: %s", exc)
        return None
    finally:
        s.close()


@router.get("/lan-url", response_model=LanUrlOut)
def lan_url(request: Request) -> Any:
    ip = _outgoing_ip()
    if ip is None:
        # Fall back to whatever the request arrived on
        ip = request.url.hostname or "localhost"
    port = request.url.port
    base = f"http://{ip}" + (f":{port}" if port and port not in (80, None) else "")
    return LanUrlOut(
        drop_url=f"{base}/drop",
        dashboard_url=base,
        host=ip,
    )
