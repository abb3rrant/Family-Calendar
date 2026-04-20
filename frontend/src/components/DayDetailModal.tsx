import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { format, isSameDay } from "date-fns";
import { RRule, rrulestr } from "rrule";
import type { CalendarEvent, CalendarMeta } from "../types";

interface Props {
  date: Date;
  events: CalendarEvent[];
  calendars: CalendarMeta[];
  onClose: () => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onCreateEvent: (date: Date) => void;
}

/**
 * Return true if `ev` occurs on `day` (local time). Handles rrule expansion
 * for recurring events by checking if any occurrence overlaps that day.
 */
function eventOccursOn(ev: CalendarEvent, day: Date): boolean {
  const start = new Date(ev.start_at);
  const end = new Date(ev.end_at);

  if (!ev.rrule) {
    // Non-recurring: overlap check
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    return start <= dayEnd && end > dayStart;
  }

  // Recurring: expand rrule over the day and check for any occurrence
  try {
    const compact = ev.start_at.replace(/[-:]/g, "").split(".")[0];
    const dtstart = compact.endsWith("Z") ? compact : compact + "Z";
    const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${ev.rrule}`) as RRule;
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const occurrences = rule.between(dayStart, dayEnd, true);
    return occurrences.length > 0;
  } catch {
    return false;
  }
}

export function DayDetailModal({
  date,
  events,
  calendars,
  onClose,
  onOpenEvent,
  onCreateEvent,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matching = useMemo(() => {
    const out = events.filter((ev) => eventOccursOn(ev, date));
    // All-day first, then by start time
    return out.sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });
  }, [events, date]);

  const writableCalendars = calendars.filter(
    (c) => c.writable && !c.id.startsWith("__")
  );
  const canCreate = writableCalendars.length > 0;

  const isToday = isSameDay(date, new Date());

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md shadow-[var(--shadow)] flex flex-col max-h-[85vh]"
      >
        <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
              {format(date, "EEEE")}
              {isToday && " · Today"}
            </div>
            <h2 className="text-2xl font-semibold tabular-nums">
              {format(date, "MMMM d, yyyy")}
            </h2>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {matching.length === 0
                ? "No events"
                : `${matching.length} event${matching.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {matching.length === 0 ? (
            <div className="text-[var(--text-muted)] text-sm text-center py-6">
              Nothing scheduled.
            </div>
          ) : (
            <ul className="space-y-2">
              {matching.map((ev) => (
                <EventRow
                  key={ev.uid + ev.start_at}
                  event={ev}
                  calendars={calendars}
                  day={date}
                  onClick={() => onOpenEvent(ev)}
                />
              ))}
            </ul>
          )}
        </div>

        {canCreate && (
          <div className="p-4 border-t border-[var(--border)]">
            <button
              onClick={() => onCreateEvent(date)}
              className="w-full rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-2.5 text-sm font-medium"
            >
              + New event on this day
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function EventRow({
  event,
  calendars,
  day,
  onClick,
}: {
  event: CalendarEvent;
  calendars: CalendarMeta[];
  day: Date;
  onClick: () => void;
}) {
  const cal = calendars.find((c) => c.id === event.calendar_id);
  const color = cal?.color ?? "#4A90E2";

  // For recurring events, show the occurrence time on `day` (if found)
  const occurrenceStart = useMemo(() => {
    if (!event.rrule) return new Date(event.start_at);
    try {
      const compact = event.start_at.replace(/[-:]/g, "").split(".")[0];
      const dtstart = compact.endsWith("Z") ? compact : compact + "Z";
      const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${event.rrule}`) as RRule;
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const occs = rule.between(dayStart, dayEnd, true);
      return occs[0] ?? new Date(event.start_at);
    } catch {
      return new Date(event.start_at);
    }
  }, [event, day]);

  const timeLabel = event.all_day
    ? "All day"
    : format(occurrenceStart, "h:mm a");

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] p-3 flex items-start gap-3 transition"
      >
        <span
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--text)] truncate">
            {event.title || "(no title)"}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {timeLabel}
            {event.location ? ` · ${event.location}` : ""}
          </div>
        </div>
        {event.rrule && (
          <span
            className="text-[var(--text-muted)] text-xs shrink-0"
            aria-label="Recurring"
            title="Recurring"
          >
            🔁
          </span>
        )}
      </button>
    </li>
  );
}
