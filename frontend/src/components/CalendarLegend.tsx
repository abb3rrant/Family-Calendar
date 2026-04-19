import type { CalendarMeta } from "../types";

interface Props {
  calendars: CalendarMeta[];
}

export function CalendarLegend({ calendars }: Props) {
  const real = calendars.filter((c) => !c.id.startsWith("__"));
  if (real.length === 0) return null;
  return (
    <div className="rounded-2xl bg-[var(--card)] p-4">
      <h2 className="text-sm font-semibold text-[var(--text-soft)] mb-2">Calendars</h2>
      <ul className="space-y-1.5 text-sm">
        {real.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ background: c.color }}
            />
            <span className="text-[var(--text)] truncate">
              {c.person}
              {c.category ? ` · ${c.category}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
