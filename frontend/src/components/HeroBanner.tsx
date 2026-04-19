import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { HeroPayload } from "../types";

function formatRelativeMinutes(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return d === 1 ? "tomorrow" : `in ${d}d`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HeroBanner() {
  const { data } = useQuery<HeroPayload>({
    queryKey: ["hero"],
    queryFn: api.getHero,
    refetchInterval: 60_000,
  });

  // Tick every minute so "in 2h" stays accurate even between refetches
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  const { next_event, today_badges, countdowns } = data;
  const nothing =
    !next_event && today_badges.length === 0 && countdowns.length === 0;
  if (nothing) return null;

  return (
    <div className="mt-3 px-4 py-2.5 rounded-xl bg-[var(--card-strong)] flex items-center gap-4 overflow-x-auto whitespace-nowrap text-sm">
      {next_event && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[var(--text-muted)] uppercase tracking-wide text-[10px]">
            Up next
          </span>
          <span className="text-[var(--text)] font-medium">{next_event.title}</span>
          <span className="text-[var(--text-muted)]">
            · {formatTime(next_event.start_at)} ·{" "}
            {formatRelativeMinutes(next_event.minutes_until)}
          </span>
          {next_event.location && (
            <span className="text-[var(--text-muted)] truncate max-w-[200px]">
              · {next_event.location}
            </span>
          )}
        </div>
      )}

      {today_badges.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-3 shrink-0">
            {today_badges.map((b, i) => (
              <span key={i} className="text-[var(--text)]">
                {b.emoji} {b.title}
              </span>
            ))}
          </div>
        </>
      )}

      {countdowns.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-2 shrink-0">
            {countdowns.map((c) => (
              <span
                key={`${c.kind}-${c.target_date}-${c.label}`}
                className="rounded-full bg-[var(--card)] px-2.5 py-1 text-xs"
              >
                {c.emoji} {c.label}{" "}
                <span className="text-[var(--text-muted)]">
                  in {c.days_until}d
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <span className="h-5 w-px bg-[var(--border)] shrink-0" aria-hidden />;
}
