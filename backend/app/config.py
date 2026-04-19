"""Runtime configuration loaded from SQLite.

`config.yaml` is used only as a one-time seed: on first boot, if the DB has no
accounts/calendars/settings, we read it and import the contents, then future
edits happen through the settings API. The YAML file is never written to.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field
from sqlalchemy import select

from .db import session_scope
from .models import Account, CalendarProfile, Settings


class WeatherConfig(BaseModel):
    latitude: float
    longitude: float
    timezone: str = "America/Los_Angeles"
    unit: Literal["fahrenheit", "celsius"] = "fahrenheit"


class SyncConfig(BaseModel):
    interval_seconds: int = 120


class AccountConfig(BaseModel):
    id: str
    apple_id: str
    app_password: str


class CalendarConfig(BaseModel):
    id: str
    account: str
    display_name: str
    person: str
    category: str | None = None
    color: str = "#4A90E2"
    writable: bool = True
    enabled: bool = True


class HolidayConfig(BaseModel):
    show_us: bool = True
    show_christian: bool = True
    us_color: str = "#DC2626"
    christian_color: str = "#7C3AED"


class BirthdayConfig(BaseModel):
    show: bool = True
    color: str = "#EC4899"


class AppConfig(BaseModel):
    weather: WeatherConfig
    sync: SyncConfig = Field(default_factory=SyncConfig)
    holidays: HolidayConfig = Field(default_factory=HolidayConfig)
    birthdays: BirthdayConfig = Field(default_factory=BirthdayConfig)
    accounts: list[AccountConfig] = Field(default_factory=list)
    calendars: list[CalendarConfig] = Field(default_factory=list)

    def account_by_id(self, account_id: str) -> AccountConfig:
        for a in self.accounts:
            if a.id == account_id:
                return a
        raise KeyError(f"Unknown account: {account_id}")

    def calendar_by_id(self, calendar_id: str) -> CalendarConfig:
        for c in self.calendars:
            if c.id == calendar_id:
                return c
        raise KeyError(f"Unknown calendar: {calendar_id}")

    @property
    def enabled_calendars(self) -> list[CalendarConfig]:
        return [c for c in self.calendars if c.enabled]


DEFAULT_WEATHER = WeatherConfig(
    latitude=37.7749,
    longitude=-122.4194,
    timezone="America/Los_Angeles",
    unit="fahrenheit",
)


def load_from_db() -> AppConfig:
    with session_scope() as session:
        settings = session.get(Settings, 1)
        if settings is None:
            settings = Settings(id=1)
            session.add(settings)
            session.flush()

        accounts = [
            AccountConfig(id=a.id, apple_id=a.apple_id, app_password=a.app_password)
            for a in session.execute(select(Account)).scalars().all()
        ]
        calendars = [
            CalendarConfig(
                id=c.id,
                account=c.account_id,
                display_name=c.display_name,
                person=c.person,
                category=c.category,
                color=c.color,
                writable=c.writable,
                enabled=c.enabled,
            )
            for c in session.execute(select(CalendarProfile)).scalars().all()
        ]
        weather = WeatherConfig(
            latitude=settings.latitude,
            longitude=settings.longitude,
            timezone=settings.timezone,
            unit=settings.unit,
        )
        sync = SyncConfig(interval_seconds=settings.sync_interval_seconds)
        holidays_cfg = HolidayConfig(
            show_us=settings.show_us_holidays,
            show_christian=settings.show_christian_holidays,
            us_color=settings.us_holiday_color,
            christian_color=settings.christian_holiday_color,
        )
        birthdays_cfg = BirthdayConfig(
            show=settings.show_birthdays,
            color=settings.birthday_color,
        )
    return AppConfig(
        weather=weather,
        sync=sync,
        holidays=holidays_cfg,
        birthdays=birthdays_cfg,
        accounts=accounts,
        calendars=calendars,
    )


def maybe_import_yaml_seed(yaml_path: Path | None = None) -> bool:
    """If the DB is empty and a config.yaml exists, import its contents.

    Returns True if an import happened.
    """
    if yaml_path is None:
        yaml_path = Path(__file__).resolve().parent.parent.parent / "config.yaml"
    if not yaml_path.exists():
        return False

    with session_scope() as session:
        has_account = session.execute(select(Account).limit(1)).first()
        has_calendar = session.execute(select(CalendarProfile).limit(1)).first()
        has_settings = session.get(Settings, 1)
        if has_account or has_calendar:
            return False

        with yaml_path.open() as f:
            raw = yaml.safe_load(f) or {}

        weather_raw = raw.get("weather")
        sync_raw = raw.get("sync") or {}
        if weather_raw:
            if has_settings is None:
                has_settings = Settings(id=1)
                session.add(has_settings)
            has_settings.latitude = float(weather_raw.get("latitude", DEFAULT_WEATHER.latitude))
            has_settings.longitude = float(weather_raw.get("longitude", DEFAULT_WEATHER.longitude))
            has_settings.timezone = weather_raw.get("timezone", DEFAULT_WEATHER.timezone)
            has_settings.unit = weather_raw.get("unit", DEFAULT_WEATHER.unit)
            has_settings.sync_interval_seconds = int(sync_raw.get("interval_seconds", 120))

        for a in raw.get("accounts") or []:
            session.add(
                Account(
                    id=a["id"],
                    apple_id=a["apple_id"],
                    app_password=a["app_password"],
                )
            )
        session.flush()

        for c in raw.get("calendars") or []:
            session.add(
                CalendarProfile(
                    id=c["id"],
                    account_id=c["account"],
                    display_name=c["display_name"],
                    person=c.get("person", c["id"]),
                    category=c.get("category"),
                    color=c.get("color", "#4A90E2"),
                    writable=c.get("writable", True),
                    enabled=c.get("enabled", True),
                )
            )
    return True
