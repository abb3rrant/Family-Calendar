"""Govee flash patterns for reminder firing.

Each pattern reads the current device state, plays a brief animation, and
restores the previous color/power. We never persist the new color past the
flash — the user's prior look returns within ~3 seconds.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

from .govee_client import GoveeClient, GoveeError

logger = logging.getLogger(__name__)

Pattern = Literal["single", "triple", "pulse"]


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def int_to_rgb(value: int) -> tuple[int, int, int]:
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)


async def play_flash(
    client: GoveeClient,
    sku: str,
    device: str,
    color_hex: str,
    pattern: Pattern,
) -> None:
    """Play a flash animation on a device, restoring its prior state when done."""
    r, g, b = hex_to_rgb(color_hex)

    # Snapshot prior state so we can restore it.
    prior: dict = {}
    try:
        prior = await client.get_state(sku, device)
    except GoveeError as e:
        logger.warning("Could not read prior state for %s: %s", device, e)

    was_on = bool(prior.get("on"))
    prior_color_int = prior.get("color_rgb")
    prior_brightness = prior.get("brightness")

    try:
        if pattern == "single":
            if not was_on:
                await client.set_power(sku, device, True)
            await client.set_color_rgb(sku, device, r, g, b)
            await asyncio.sleep(2.0)
        elif pattern == "triple":
            if not was_on:
                await client.set_power(sku, device, True)
            for i in range(3):
                await client.set_color_rgb(sku, device, r, g, b)
                await asyncio.sleep(0.4)
                if i < 2:
                    # brief dim by switching to a near-black color, then back
                    await client.set_color_rgb(sku, device, 0, 0, 0)
                    await asyncio.sleep(0.3)
        elif pattern == "pulse":
            if not was_on:
                await client.set_power(sku, device, True)
            await client.set_color_rgb(sku, device, r, g, b)
            for level in [100, 30, 100, 30, 100]:
                try:
                    await client.set_brightness(sku, device, level)
                except GoveeError:
                    pass
                await asyncio.sleep(0.5)
        else:
            logger.warning("Unknown flash pattern: %s", pattern)
            return
    finally:
        # Restore. Best-effort — log if it fails but don't raise.
        try:
            if was_on:
                if prior_color_int is not None:
                    pr, pg, pb = int_to_rgb(prior_color_int)
                    await client.set_color_rgb(sku, device, pr, pg, pb)
                if prior_brightness is not None:
                    try:
                        await client.set_brightness(sku, device, int(prior_brightness))
                    except GoveeError:
                        pass
            else:
                await client.set_power(sku, device, False)
        except GoveeError as e:
            logger.warning("Could not restore prior state for %s: %s", device, e)
