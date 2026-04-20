from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal
from zoneinfo import available_timezones

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from ..caldav_client import CalDAVClient
from ..config import AccountConfig
from ..db import session_scope
from ..models import Account, Birthday, CalendarProfile, Event, Settings, SyncState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate_color(value: str | None) -> str | None:
    if value is None:
        return None
    if not _HEX_COLOR_RE.match(value):
        raise ValueError("Color must be a 7-character hex like '#A1B2C3'")
    return value


def _validate_timezone(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in available_timezones():
        raise ValueError(f"Unknown timezone: {value}")
    return value


def _safe_caldav_message(exc: Exception) -> str:
    """Map a CalDAV / network exception to a clean message for the UI."""
    text = str(exc)
    lowered = text.lower()
    if "unauthorized" in lowered or "401" in lowered:
        return "iCloud rejected those credentials. Double-check the Apple ID and app-specific password."
    if "name or service" in lowered or "name resolution" in lowered:
        return "Could not reach iCloud (DNS error). Check the Pi's network."
    if "timed out" in lowered or "timeout" in lowered:
        return "iCloud took too long to respond. Try again in a moment."
    if "ssl" in lowered or "certificate" in lowered:
        return "TLS error connecting to iCloud."
    return "Could not connect to iCloud. Check the Apple ID and password and try again."


# ---------- schemas ----------


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    apple_id: str
    has_password: bool = True


class AccountCreate(BaseModel):
    apple_id: str
    app_password: str
    id: str | None = None


class AccountUpdate(BaseModel):
    apple_id: str | None = None
    app_password: str | None = None


class DiscoveredOut(BaseModel):
    account_id: str
    display_name: str
    url: str
    already_added: bool


class CalendarProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    account_id: str
    display_name: str
    person: str
    category: str | None
    color: str
    writable: bool
    enabled: bool


class CalendarProfileCreate(BaseModel):
    account_id: str
    display_name: str
    person: str
    color: str = "#4A90E2"
    category: str | None = None
    writable: bool = True
    enabled: bool = True
    id: str | None = None


class CalendarProfileUpdate(BaseModel):
    display_name: str | None = None
    person: str | None = None
    category: str | None = None
    color: str | None = None
    writable: bool | None = None
    enabled: bool | None = None


class GeneralSettingsOut(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    unit: Literal["fahrenheit", "celsius"]
    sync_interval_seconds: int
    show_us_holidays: bool
    show_christian_holidays: bool
    us_holiday_color: str
    christian_holiday_color: str
    show_birthdays: bool
    birthday_color: str
    govee_api_key: str | None
    ecobee_api_key: str | None
    ecobee_authorized: bool
    slideshow_enabled: bool
    slideshow_idle_minutes: int
    slideshow_per_photo_seconds: int
    slideshow_calendar_every_n: int
    slideshow_calendar_seconds: int
    theme_auto: bool
    theme_dark_start_hour: int
    theme_light_start_hour: int


class GeneralSettingsUpdate(BaseModel):
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    timezone: str | None = None
    unit: Literal["fahrenheit", "celsius"] | None = None
    sync_interval_seconds: int | None = Field(default=None, ge=5, le=3600)
    show_us_holidays: bool | None = None
    show_christian_holidays: bool | None = None
    us_holiday_color: str | None = None
    christian_holiday_color: str | None = None
    show_birthdays: bool | None = None
    birthday_color: str | None = None
    govee_api_key: str | None = None
    ecobee_api_key: str | None = None
    slideshow_enabled: bool | None = None
    slideshow_idle_minutes: int | None = Field(default=None, ge=1, le=120)
    slideshow_per_photo_seconds: int | None = Field(default=None, ge=2, le=60)
    slideshow_calendar_every_n: int | None = Field(default=None, ge=0, le=50)
    slideshow_calendar_seconds: int | None = Field(default=None, ge=3, le=120)
    theme_auto: bool | None = None
    theme_dark_start_hour: int | None = Field(default=None, ge=0, le=23)
    theme_light_start_hour: int | None = Field(default=None, ge=0, le=23)

    @field_validator(
        "us_holiday_color", "christian_holiday_color", "birthday_color"
    )
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        return _validate_color(v)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        return _validate_timezone(v)


class BirthdayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    month: int
    day: int
    birth_year: int | None


class BirthdayCreate(BaseModel):
    name: str
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)


class BirthdayUpdate(BaseModel):
    name: str | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    day: int | None = Field(default=None, ge=1, le=31)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)


# ---------- helpers ----------


def _reload(request: Request) -> None:
    request.app.state.reload_config()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "account"


def _unique_slug(session, model, base: str) -> str:
    slug = base
    counter = 2
    while session.get(model, slug) is not None:
        slug = f"{base}-{counter}"
        counter += 1
    return slug


async def _test_connection(apple_id: str, app_password: str) -> list:
    """Run discover in a thread; raises if auth fails."""
    account = AccountConfig(id="_probe", apple_id=apple_id, app_password=app_password)
    client = CalDAVClient(account)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, client.discover)


# ---------- accounts ----------


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts():
    with session_scope() as session:
        rows = session.execute(select(Account)).scalars().all()
        return [AccountOut(id=a.id, apple_id=a.apple_id) for a in rows]


@router.post("/accounts", response_model=AccountOut, status_code=201)
async def create_account(payload: AccountCreate, request: Request):
    try:
        await _test_connection(payload.apple_id, payload.app_password)
    except Exception as exc:
        logger.warning("CalDAV auth failed for %s: %s", payload.apple_id, exc)
        raise HTTPException(status_code=400, detail=_safe_caldav_message(exc))

    with session_scope() as session:
        existing = session.execute(
            select(Account).where(Account.apple_id == payload.apple_id)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="Account already added")
        slug_base = payload.id or _slugify(payload.apple_id.split("@")[0])
        slug = _unique_slug(session, Account, slug_base)
        account = Account(
            id=slug, apple_id=payload.apple_id, app_password=payload.app_password
        )
        session.add(account)
        session.flush()
        out = AccountOut(id=account.id, apple_id=account.apple_id)

    _reload(request)
    return out


@router.patch("/accounts/{account_id}", response_model=AccountOut)
async def update_account(account_id: str, payload: AccountUpdate, request: Request):
    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        new_apple_id = payload.apple_id or account.apple_id
        new_password = payload.app_password or account.app_password

    try:
        await _test_connection(new_apple_id, new_password)
    except Exception as exc:
        logger.warning("CalDAV auth failed for %s: %s", new_apple_id, exc)
        raise HTTPException(status_code=400, detail=_safe_caldav_message(exc))

    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        account.apple_id = new_apple_id
        account.app_password = new_password
        out = AccountOut(id=account.id, apple_id=account.apple_id)

    _reload(request)
    return out


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: str, request: Request):
    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        cal_ids = [c.id for c in account.calendars]
        for cal_id in cal_ids:
            # drop cached events + sync_state for each removed calendar
            session.query(Event).filter(Event.calendar_id == cal_id).delete(
                synchronize_session=False
            )
            state = session.get(SyncState, cal_id)
            if state is not None:
                session.delete(state)
        session.delete(account)

    _reload(request)


@router.post("/accounts/{account_id}/test")
async def test_account(account_id: str):
    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        apple_id, password = account.apple_id, account.app_password
    try:
        calendars = await _test_connection(apple_id, password)
    except Exception as exc:
        logger.warning("CalDAV test failed for %s: %s", apple_id, exc)
        raise HTTPException(status_code=400, detail=_safe_caldav_message(exc))
    return {"ok": True, "calendar_count": len(calendars)}


@router.get("/accounts/{account_id}/discover", response_model=list[DiscoveredOut])
async def discover_account(account_id: str):
    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        existing_names = {
            c.display_name
            for c in session.execute(
                select(CalendarProfile).where(CalendarProfile.account_id == account_id)
            )
            .scalars()
            .all()
        }
        apple_id, password = account.apple_id, account.app_password

    try:
        discovered = await _test_connection(apple_id, password)
    except Exception as exc:
        logger.warning("CalDAV discover failed for %s: %s", apple_id, exc)
        raise HTTPException(status_code=400, detail=_safe_caldav_message(exc))

    # Filter out reminder lists (iCloud marks them with ⚠️ or returns them as VTODO-only).
    out = []
    for d in discovered:
        if "⚠️" in d.display_name or d.display_name.lower().startswith("reminder"):
            continue
        out.append(
            DiscoveredOut(
                account_id=account_id,
                display_name=d.display_name,
                url=d.url,
                already_added=d.display_name in existing_names,
            )
        )
    return out


# ---------- calendars ----------


@router.get("/calendars", response_model=list[CalendarProfileOut])
def list_calendar_profiles():
    with session_scope() as session:
        rows = session.execute(select(CalendarProfile)).scalars().all()
        return [CalendarProfileOut.model_validate(r) for r in rows]


@router.post("/calendars", response_model=CalendarProfileOut, status_code=201)
def create_calendar_profile(payload: CalendarProfileCreate, request: Request):
    with session_scope() as session:
        if session.get(Account, payload.account_id) is None:
            raise HTTPException(status_code=404, detail="Unknown account")
        slug_base = payload.id or _slugify(
            f"{payload.account_id}-{payload.display_name}"
        )
        slug = _unique_slug(session, CalendarProfile, slug_base)
        row = CalendarProfile(
            id=slug,
            account_id=payload.account_id,
            display_name=payload.display_name,
            person=payload.person,
            category=payload.category,
            color=payload.color,
            writable=payload.writable,
            enabled=payload.enabled,
        )
        session.add(row)
        session.flush()
        out = CalendarProfileOut.model_validate(row)

    _reload(request)
    return out


@router.patch("/calendars/{calendar_id}", response_model=CalendarProfileOut)
def update_calendar_profile(
    calendar_id: str, payload: CalendarProfileUpdate, request: Request
):
    with session_scope() as session:
        row = session.get(CalendarProfile, calendar_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Calendar not found")
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        out = CalendarProfileOut.model_validate(row)

    _reload(request)
    return out


@router.delete("/calendars/{calendar_id}", status_code=204)
def delete_calendar_profile(calendar_id: str, request: Request):
    with session_scope() as session:
        row = session.get(CalendarProfile, calendar_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Calendar not found")
        session.delete(row)
        session.query(Event).filter(Event.calendar_id == calendar_id).delete(
            synchronize_session=False
        )
        state = session.get(SyncState, calendar_id)
        if state is not None:
            session.delete(state)

    _reload(request)


# ---------- general ----------


@router.get("/general", response_model=GeneralSettingsOut)
def get_general():
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        return GeneralSettingsOut(
            latitude=s.latitude,
            longitude=s.longitude,
            timezone=s.timezone,
            unit=s.unit,  # type: ignore[arg-type]
            sync_interval_seconds=s.sync_interval_seconds,
            show_us_holidays=s.show_us_holidays,
            show_christian_holidays=s.show_christian_holidays,
            us_holiday_color=s.us_holiday_color,
            christian_holiday_color=s.christian_holiday_color,
            show_birthdays=s.show_birthdays,
            birthday_color=s.birthday_color,
            govee_api_key=s.govee_api_key,
            ecobee_api_key=s.ecobee_api_key,
            ecobee_authorized=bool(s.ecobee_access_token and s.ecobee_refresh_token),
            slideshow_enabled=s.slideshow_enabled,
            slideshow_idle_minutes=s.slideshow_idle_minutes,
            slideshow_per_photo_seconds=s.slideshow_per_photo_seconds,
            slideshow_calendar_every_n=s.slideshow_calendar_every_n,
            slideshow_calendar_seconds=s.slideshow_calendar_seconds,
            theme_auto=s.theme_auto,
            theme_dark_start_hour=s.theme_dark_start_hour,
            theme_light_start_hour=s.theme_light_start_hour,
        )


@router.patch("/general", response_model=GeneralSettingsOut)
def update_general(payload: GeneralSettingsUpdate, request: Request):
    with session_scope() as session:
        s = session.get(Settings, 1)
        if s is None:
            s = Settings(id=1)
            session.add(s)
            session.flush()
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(s, key, value)
        out = GeneralSettingsOut(
            latitude=s.latitude,
            longitude=s.longitude,
            timezone=s.timezone,
            unit=s.unit,  # type: ignore[arg-type]
            sync_interval_seconds=s.sync_interval_seconds,
            show_us_holidays=s.show_us_holidays,
            show_christian_holidays=s.show_christian_holidays,
            us_holiday_color=s.us_holiday_color,
            christian_holiday_color=s.christian_holiday_color,
            show_birthdays=s.show_birthdays,
            birthday_color=s.birthday_color,
            govee_api_key=s.govee_api_key,
            ecobee_api_key=s.ecobee_api_key,
            ecobee_authorized=bool(s.ecobee_access_token and s.ecobee_refresh_token),
            slideshow_enabled=s.slideshow_enabled,
            slideshow_idle_minutes=s.slideshow_idle_minutes,
            slideshow_per_photo_seconds=s.slideshow_per_photo_seconds,
            slideshow_calendar_every_n=s.slideshow_calendar_every_n,
            slideshow_calendar_seconds=s.slideshow_calendar_seconds,
            theme_auto=s.theme_auto,
            theme_dark_start_hour=s.theme_dark_start_hour,
            theme_light_start_hour=s.theme_light_start_hour,
        )

    _reload(request)
    return out


# ---------- birthdays ----------


@router.get("/birthdays", response_model=list[BirthdayOut])
def list_birthdays():
    with session_scope() as session:
        rows = (
            session.execute(select(Birthday).order_by(Birthday.month, Birthday.day))
            .scalars()
            .all()
        )
        return [BirthdayOut.model_validate(r) for r in rows]


@router.post("/birthdays", response_model=BirthdayOut, status_code=201)
def create_birthday(payload: BirthdayCreate, request: Request):
    with session_scope() as session:
        row = Birthday(
            name=payload.name,
            month=payload.month,
            day=payload.day,
            birth_year=payload.birth_year,
        )
        session.add(row)
        session.flush()
        out = BirthdayOut.model_validate(row)

    _reload(request)
    return out


@router.patch("/birthdays/{birthday_id}", response_model=BirthdayOut)
def update_birthday(birthday_id: int, payload: BirthdayUpdate, request: Request):
    with session_scope() as session:
        row = session.get(Birthday, birthday_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Birthday not found")
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        out = BirthdayOut.model_validate(row)

    _reload(request)
    return out


@router.delete("/birthdays/{birthday_id}", status_code=204)
def delete_birthday(birthday_id: int, request: Request):
    with session_scope() as session:
        row = session.get(Birthday, birthday_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Birthday not found")
        session.delete(row)

    _reload(request)
