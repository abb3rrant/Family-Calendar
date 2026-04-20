from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "calendar.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


@contextmanager
def session_scope():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    from . import models  # noqa: F401 - register models

    Base.metadata.create_all(engine)
    _run_light_migrations()


# Columns added after the initial schema. SQLite can only ADD COLUMN, which is
# all we need — we never rename or drop. Each entry: (table, column, DDL).
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("settings", "show_us_holidays", "BOOLEAN NOT NULL DEFAULT 1"),
    ("settings", "show_christian_holidays", "BOOLEAN NOT NULL DEFAULT 1"),
    ("settings", "us_holiday_color", "VARCHAR NOT NULL DEFAULT '#DC2626'"),
    ("settings", "christian_holiday_color", "VARCHAR NOT NULL DEFAULT '#7C3AED'"),
    ("settings", "show_birthdays", "BOOLEAN NOT NULL DEFAULT 1"),
    ("settings", "birthday_color", "VARCHAR NOT NULL DEFAULT '#EC4899'"),
    ("meals", "recipe_id", "INTEGER REFERENCES recipes(id) ON DELETE SET NULL"),
    ("reminder_rules", "last_error", "TEXT"),
    ("reminder_rules", "last_error_at", "DATETIME"),
    ("settings", "govee_api_key", "VARCHAR"),
    ("settings", "ecobee_api_key", "VARCHAR"),
    ("settings", "ecobee_access_token", "TEXT"),
    ("settings", "ecobee_refresh_token", "VARCHAR"),
    ("settings", "ecobee_token_expires_at", "DATETIME"),
    ("settings", "slideshow_enabled", "BOOLEAN NOT NULL DEFAULT 1"),
    ("settings", "slideshow_idle_minutes", "INTEGER NOT NULL DEFAULT 10"),
    ("settings", "slideshow_per_photo_seconds", "INTEGER NOT NULL DEFAULT 8"),
    ("settings", "slideshow_calendar_every_n", "INTEGER NOT NULL DEFAULT 5"),
    ("settings", "slideshow_calendar_seconds", "INTEGER NOT NULL DEFAULT 15"),
    ("settings", "theme_auto", "BOOLEAN NOT NULL DEFAULT 0"),
    ("settings", "theme_dark_start_hour", "INTEGER NOT NULL DEFAULT 20"),
    ("settings", "theme_light_start_hour", "INTEGER NOT NULL DEFAULT 7"),
]


def _run_light_migrations() -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {ddl}'))
    _ensure_indexes()


# Indexes added after the initial schema. Idempotent — `IF NOT EXISTS` is safe
# in SQLite. Any new index goes here; SQLAlchemy's create_all only adds those
# declared on the class via Index() / index=True the first time the table is
# created.
_EXTRA_INDEXES: list[tuple[str, str, str]] = [
    ("ix_meals_recipe_id", "meals", "recipe_id"),
    ("ix_reminder_fired_scheduled_for", "reminder_fired", "scheduled_for"),
]


def _ensure_indexes() -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for name, table, column in _EXTRA_INDEXES:
            if table not in inspector.get_table_names():
                continue
            existing = {ix["name"] for ix in inspector.get_indexes(table)}
            if name in existing:
                continue
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({column})"))
