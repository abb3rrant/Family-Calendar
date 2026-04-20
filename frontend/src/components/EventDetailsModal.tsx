import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "../api";
import type { CalendarEvent, CalendarMeta } from "../types";

interface Props {
  event: CalendarEvent;
  calendars: CalendarMeta[];
  onClose: () => void;
  onEdit: () => void;
}

function formatWhen(ev: CalendarEvent): string {
  const start = new Date(ev.start_at);
  const end = new Date(ev.end_at);
  if (ev.all_day) {
    const sameDay =
      start.toDateString() === new Date(end.getTime() - 1).toDateString();
    if (sameDay) return format(start, "EEEE, MMMM d, yyyy") + " · All day";
    return `${format(start, "EEE, MMM d")} – ${format(end, "EEE, MMM d, yyyy")} · All day`;
  }
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return (
      format(start, "EEEE, MMMM d, yyyy") +
      ` · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
    );
  }
  return `${format(start, "EEE MMM d, h:mm a")} – ${format(end, "EEE MMM d, h:mm a")}`;
}

export function EventDetailsModal({ event, calendars, onClose, onEdit }: Props) {
  const queryClient = useQueryClient();
  const cal = calendars.find((c) => c.id === event.calendar_id);
  const writable = !!cal?.writable;
  const isVirtual = event.calendar_id.startsWith("__");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const deleteMut = useMutation({
    mutationFn: () => api.deleteEvent(event.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-[var(--shadow)]"
      >
        <div className="flex items-start gap-3">
          <span
            className="w-4 h-4 mt-1.5 rounded-sm shrink-0"
            style={{ background: cal?.color ?? "#4A90E2" }}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold break-words">{event.title || "(no title)"}</h2>
            {cal && (
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {cal.person}
                {cal.category ? ` · ${cal.category}` : ""}
                {isVirtual ? " · read-only" : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="text-[var(--text-muted)] shrink-0 w-5 text-center" aria-hidden>
              🕒
            </span>
            <div className="text-[var(--text)]">{formatWhen(event)}</div>
          </div>

          {event.rrule && (
            <div className="flex items-start gap-3">
              <span className="text-[var(--text-muted)] shrink-0 w-5 text-center" aria-hidden>
                🔁
              </span>
              <div className="text-[var(--text-soft)] text-xs font-mono break-all">
                {event.rrule}
              </div>
            </div>
          )}

          {event.location && (
            <div className="flex items-start gap-3">
              <span className="text-[var(--text-muted)] shrink-0 w-5 text-center" aria-hidden>
                📍
              </span>
              <div className="text-[var(--text)]">{event.location}</div>
            </div>
          )}

          {event.description && (
            <div className="flex items-start gap-3">
              <span className="text-[var(--text-muted)] shrink-0 w-5 text-center" aria-hidden>
                📝
              </span>
              <div className="text-[var(--text)] whitespace-pre-wrap break-words">
                {event.description}
              </div>
            </div>
          )}
        </div>

        {writable && (
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
            <button
              onClick={() => {
                if (confirm("Delete this event?")) deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              className="rounded-lg bg-[var(--danger-soft)] hover:opacity-80 text-[var(--danger)] px-3 py-2 text-sm disabled:opacity-60"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={onEdit}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 text-sm font-medium"
            >
              Edit
            </button>
          </div>
        )}

        {deleteMut.error && (
          <div className="text-[var(--danger)] text-xs">
            {(deleteMut.error as Error).message}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
