from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: str
    calendar_id: str
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    rrule: str | None


class EventCreate(BaseModel):
    calendar_id: str
    title: str
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    description: str | None = None
    location: str | None = None


class EventUpdate(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    description: str | None = None
    location: str | None = None


class ChoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    assignee: str | None
    done: bool
    created_at: datetime
    completed_at: datetime | None


class ChoreCreate(BaseModel):
    title: str
    assignee: str | None = None


class ChoreUpdate(BaseModel):
    title: str | None = None
    assignee: str | None = None
    done: bool | None = None


class CalendarOut(BaseModel):
    id: str
    display_name: str
    person: str
    category: str | None
    color: str
    writable: bool


class DiscoveredCalendarOut(BaseModel):
    account_id: str
    display_name: str
    url: str
