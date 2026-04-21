from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .timeutil import utc_now_naive as _utc_now_naive


def utcnow() -> datetime:
    """Naive UTC. Used for `default=` on naive DB columns."""
    return _utc_now_naive()


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    apple_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    app_password: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    calendars: Mapped[list[CalendarProfile]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
    )


class CalendarProfile(Base):
    __tablename__ = "calendar_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String, ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String)
    person: Mapped[str] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#4A90E2")
    writable: Mapped[bool] = mapped_column(Boolean, default=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[Account] = relationship(back_populates="calendars")


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    latitude: Mapped[float] = mapped_column(Float, default=37.7749)
    longitude: Mapped[float] = mapped_column(Float, default=-122.4194)
    timezone: Mapped[str] = mapped_column(String, default="America/Los_Angeles")
    unit: Mapped[str] = mapped_column(String, default="fahrenheit")
    sync_interval_seconds: Mapped[int] = mapped_column(Integer, default=120)
    show_us_holidays: Mapped[bool] = mapped_column(Boolean, default=True)
    show_christian_holidays: Mapped[bool] = mapped_column(Boolean, default=True)
    us_holiday_color: Mapped[str] = mapped_column(String, default="#DC2626")
    christian_holiday_color: Mapped[str] = mapped_column(String, default="#7C3AED")
    show_birthdays: Mapped[bool] = mapped_column(Boolean, default=True)
    birthday_color: Mapped[str] = mapped_column(String, default="#EC4899")
    govee_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    ecobee_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    ecobee_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    ecobee_refresh_token: Mapped[str | None] = mapped_column(String, nullable=True)
    ecobee_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    slideshow_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    slideshow_idle_minutes: Mapped[int] = mapped_column(Integer, default=10)
    slideshow_per_photo_seconds: Mapped[int] = mapped_column(Integer, default=8)
    slideshow_calendar_every_n: Mapped[int] = mapped_column(Integer, default=5)
    slideshow_calendar_seconds: Mapped[int] = mapped_column(Integer, default=15)
    theme_auto: Mapped[bool] = mapped_column(Boolean, default=False)
    theme_dark_start_hour: Mapped[int] = mapped_column(Integer, default=20)
    theme_light_start_hour: Mapped[int] = mapped_column(Integer, default=7)
    allowance_point_value_cents: Mapped[int] = mapped_column(Integer, default=25)
    allowance_week_starts_on: Mapped[int] = mapped_column(Integer, default=0)  # 0=Sun
    ring_token: Mapped[str | None] = mapped_column(Text, nullable=True)


class Event(Base):
    __tablename__ = "events"

    uid: Mapped[str] = mapped_column(String, primary_key=True)
    calendar_id: Mapped[str] = mapped_column(String, index=True)
    url: Mapped[str] = mapped_column(String)
    etag: Mapped[str | None] = mapped_column(String, nullable=True)

    title: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)

    start_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)

    rrule: Mapped[str | None] = mapped_column(String, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


Index("ix_events_range", Event.start_at, Event.end_at)


class Chore(Base):
    __tablename__ = "chores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String)
    assignee: Mapped[str | None] = mapped_column(String, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SyncState(Base):
    __tablename__ = "sync_state"

    calendar_id: Mapped[str] = mapped_column(String, primary_key=True)
    ctag: Mapped[str | None] = mapped_column(String, nullable=True)
    last_sync_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Birthday(Base):
    __tablename__ = "birthdays"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    month: Mapped[int] = mapped_column(Integer)
    day: Mapped[int] = mapped_column(Integer)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PinnedCountdown(Base):
    __tablename__ = "pinned_countdowns"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String)
    emoji: Mapped[str | None] = mapped_column(String, nullable=True)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ReminderRule(Base):
    __tablename__ = "reminder_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    scope_type: Mapped[str] = mapped_column(String)  # "calendar" | "category"
    scope_value: Mapped[str] = mapped_column(String, index=True)
    lead_minutes: Mapped[int] = mapped_column(Integer)
    device_id: Mapped[str] = mapped_column(String)
    device_sku: Mapped[str] = mapped_column(String)
    device_name: Mapped[str | None] = mapped_column(String, nullable=True)
    flash_color: Mapped[str] = mapped_column(String, default="#DC2626")
    flash_pattern: Mapped[str] = mapped_column(String, default="single")  # single|triple|pulse
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String, unique=True)  # stored on disk
    original_name: Mapped[str | None] = mapped_column(String, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    emoji: Mapped[str | None] = mapped_column(String, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#4A90E2")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AllowanceChore(Base):
    __tablename__ = "allowance_chores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    emoji: Mapped[str | None] = mapped_column(String, nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=1)
    person_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AllowanceCompletion(Base):
    __tablename__ = "allowance_completions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chore_id: Mapped[int] = mapped_column(
        ForeignKey("allowance_chores.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), index=True
    )
    points: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    paid_out_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReminderFired(Base):
    __tablename__ = "reminder_fired"
    __table_args__ = (
        UniqueConstraint(
            "rule_id", "event_uid", "scheduled_for", name="uq_reminder_fired"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("reminder_rules.id", ondelete="CASCADE"), index=True
    )
    event_uid: Mapped[str] = mapped_column(String, index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime)
    fired_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Meal(Base):
    __tablename__ = "meals"
    __table_args__ = (UniqueConstraint("date", "slot", name="uq_meal_date_slot"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    slot: Mapped[str] = mapped_column(String)  # "breakfast" | "lunch" | "dinner"
    description: Mapped[str] = mapped_column(String)
    recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    ingredients: Mapped[list[RecipeIngredient]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredient.position",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String)
    position: Mapped[int] = mapped_column(Integer, default=0)

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")


class GroceryItem(Base):
    __tablename__ = "grocery_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    source_meal_id: Mapped[int | None] = mapped_column(
        ForeignKey("meals.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
