"""Datetime conventions for the project.

Two rules everyone follows:

1. **In the database**: naive `datetime` columns store UTC. Always.
2. **In Python code**: prefer aware UTC datetimes. Convert to naive at the
   exact moment we hand the value to SQLAlchemy or compare against a DB row.

These helpers exist so we never accidentally compare aware-vs-naive (raises
TypeError) or strip tzinfo from a non-UTC datetime (off-by-N-hours bug).
"""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Aware UTC `now`. Use this in app code."""
    return datetime.now(timezone.utc)


def utc_now_naive() -> datetime:
    """Naive UTC `now`, suitable for writing to a naive DB column."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(dt: datetime) -> datetime:
    """Convert any datetime (aware or naive) to naive-UTC.

    Naive inputs are assumed to already be UTC. Aware inputs are converted
    to UTC before stripping tzinfo, so a `2026-04-19T00:00-05:00` input
    becomes `2026-04-19T05:00` (the correct UTC instant).
    """
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt
