import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CalendarEvent, CalendarMeta } from "../types";

function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

interface Props {
  calendars: CalendarMeta[];
  initialEvent: CalendarEvent | null;
  initialStart: Date | null;
  initialEnd: Date | null;
  initialAllDay?: boolean;
  onClose: () => void;
}

export function EventModal({
  calendars,
  initialEvent,
  initialStart,
  initialEnd,
  initialAllDay,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const writableCalendars = calendars.filter((c) => c.writable);
  const isEdit = !!initialEvent;
  const isRecurring = !!initialEvent?.rrule;

  const [calendarId, setCalendarId] = useState(
    initialEvent?.calendar_id ?? writableCalendars[0]?.id ?? ""
  );
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [allDay, setAllDay] = useState(initialEvent?.all_day ?? !!initialAllDay);
  const [startStr, setStartStr] = useState(
    toDateTimeLocal(initialEvent?.start_at ?? initialStart?.toISOString() ?? new Date().toISOString())
  );
  const [endStr, setEndStr] = useState(
    toDateTimeLocal(
      initialEvent?.end_at ??
        initialEnd?.toISOString() ??
        new Date(Date.now() + 60 * 60_000).toISOString()
    )
  );
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["events"] });

  const createMut = useMutation({
    mutationFn: () =>
      api.createEvent({
        calendar_id: calendarId,
        title,
        start_at: fromDateTimeLocal(startStr),
        end_at: fromDateTimeLocal(endStr),
        all_day: allDay,
        location: location || null,
        description: description || null,
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.updateEvent(initialEvent!.uid, {
        title,
        start_at: fromDateTimeLocal(startStr),
        end_at: fromDateTimeLocal(endStr),
        all_day: allDay,
        location: location || null,
        description: description || null,
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteEvent(initialEvent!.uid),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) updateMut.mutate();
    else createMut.mutate();
  };

  const error = createMut.error || updateMut.error || deleteMut.error;

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-[var(--shadow)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{isEdit ? "Edit event" : "New event"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {isRecurring && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs p-2">
            This is a recurring event. Editing will modify the entire series.
          </div>
        )}

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Calendar</label>
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            disabled={isEdit}
            className={`${inputCls} disabled:opacity-60`}
          >
            {writableCalendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.person} — {c.display_name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Start</label>
            <input
              type="datetime-local"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">End</label>
            <input
              type="datetime-local"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        {error && <div className="text-[var(--danger)] text-xs">{(error as Error).message}</div>}

        <div className="flex items-center justify-between pt-2">
          {isEdit ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this event?")) deleteMut.mutate();
              }}
              className="rounded-lg bg-[var(--danger-soft)] hover:opacity-80 text-[var(--danger)] px-3 py-2 text-sm"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
            >
              {createMut.isPending || updateMut.isPending
                ? "Saving…"
                : isEdit
                ? "Save"
                : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
