import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";
import { useQuery } from "@tanstack/react-query";
import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import { addDays, endOfMonth, startOfMonth, subDays } from "date-fns";
import { api } from "../api";
import type { CalendarEvent, CalendarMeta } from "../types";
import { EventModal } from "./EventModal";

export type ViewKind = "week" | "month" | "agenda";

const VIEW_MAP: Record<ViewKind, string> = {
  week: "timeGridWeek",
  month: "dayGridMonth",
  agenda: "listWeek",
};

interface Props {
  view: ViewKind;
  calendars: CalendarMeta[];
}

export function CalendarView({ view, calendars }: Props) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [windowStart, setWindowStart] = useState(() => subDays(startOfMonth(new Date()), 14));
  const [windowEnd, setWindowEnd] = useState(() => addDays(endOfMonth(new Date()), 60));
  const [modalState, setModalState] = useState<
    | { kind: "closed" }
    | { kind: "edit"; event: CalendarEvent }
    | { kind: "create"; start: Date; end: Date; allDay: boolean }
  >({ kind: "closed" });

  useEffect(() => {
    calendarRef.current?.getApi().changeView(VIEW_MAP[view]);
  }, [view]);

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["events", windowStart.toISOString(), windowEnd.toISOString()],
    queryFn: () => api.listEvents(windowStart, windowEnd),
  });

  const calendarColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of calendars) map[c.id] = c.color;
    return map;
  }, [calendars]);

  const fcEvents = useMemo<EventInput[]>(() => {
    return events.map((ev) => {
      const color = calendarColor[ev.calendar_id] ?? "#4A90E2";
      const base: EventInput = {
        id: ev.uid,
        title: ev.title,
        backgroundColor: color,
        borderColor: color,
        allDay: ev.all_day,
        extendedProps: { event: ev },
      };
      if (ev.rrule) {
        const durationMs = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
        return {
          ...base,
          rrule: rruleStringFor(ev.start_at, ev.rrule),
          duration: msToDurationStr(durationMs),
        };
      }
      return { ...base, start: ev.start_at, end: ev.end_at };
    });
  }, [events, calendarColor]);

  return (
    <>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
        initialView={VIEW_MAP[view]}
        headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
        height="100%"
        nowIndicator
        selectable
        selectMirror
        editable={false}
        firstDay={0}
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        scrollTime="07:00:00"
        expandRows
        events={fcEvents}
        eventDisplay="block"
        eventContent={(arg) =>
          arg.view.type === "listWeek" ? undefined : <EventContent arg={arg} />
        }
        datesSet={(arg) => {
          if (arg.start < windowStart || arg.end > windowEnd) {
            setWindowStart(subDays(arg.start, 14));
            setWindowEnd(addDays(arg.end, 14));
          }
        }}
        select={(arg: DateSelectArg) => {
          setModalState({
            kind: "create",
            start: arg.start,
            end: arg.end,
            allDay: arg.allDay,
          });
        }}
        eventClick={(arg: EventClickArg) => {
          const ev = arg.event.extendedProps.event as CalendarEvent;
          const cal = calendars.find((c) => c.id === ev.calendar_id);
          if (!cal || !cal.writable) return;
          setModalState({ kind: "edit", event: ev });
        }}
      />
      {modalState.kind !== "closed" && (
        <EventModal
          calendars={calendars}
          initialEvent={modalState.kind === "edit" ? modalState.event : null}
          initialStart={modalState.kind === "create" ? modalState.start : null}
          initialEnd={modalState.kind === "create" ? modalState.end : null}
          initialAllDay={modalState.kind === "create" ? modalState.allDay : false}
          onClose={() => setModalState({ kind: "closed" })}
        />
      )}
    </>
  );
}

function rruleStringFor(startIso: string, rrule: string): string {
  const compact = startIso.replace(/[-:]/g, "").split(".")[0];
  const dtstart = compact.endsWith("Z") ? compact : compact + "Z";
  return `DTSTART:${dtstart}\nRRULE:${rrule}`;
}

function msToDurationStr(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function EventContent({ arg }: { arg: EventContentArg }) {
  // dayGridMonth lays events out inline (single horizontal row).
  // timeGrid stacks vertically. Mirror each layout to avoid breaking
  // FullCalendar's default sizing.
  const isMonth = arg.view.type === "dayGridMonth";
  if (isMonth) {
    return (
      <div className="flex items-center gap-1 w-full min-w-0 px-1">
        {arg.timeText && (
          <span className="fc-event-time shrink-0 text-[0.75rem] opacity-90">
            {arg.timeText}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <MarqueeText text={arg.event.title || ""} />
        </div>
      </div>
    );
  }
  return (
    <div className="fc-event-main-frame w-full min-w-0">
      {arg.timeText && <div className="fc-event-time">{arg.timeText}</div>}
      <div className="fc-event-title-container min-w-0">
        <MarqueeText text={arg.event.title || ""} />
      </div>
    </div>
  );
}

function MarqueeText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    if (!containerRef.current || !textRef.current) return;
    const measure = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      const o = t.scrollWidth - c.clientWidth;
      setOverflow(o > 6 ? o : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  // ~30px/sec scroll speed; 5s pause-and-return at each end (alternate)
  const duration = overflow > 0 ? Math.max(5, Math.round(overflow / 30) + 4) : 0;

  return (
    <div ref={containerRef} className="fc-event-title overflow-hidden w-full">
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap"
        style={
          overflow > 0
            ? {
                animation: `eventTitleMarquee ${duration}s ease-in-out infinite alternate`,
                ["--marquee-distance" as string]: `-${overflow}px`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}

