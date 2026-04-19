import type { ViewKind } from "./CalendarView";

const VIEWS: { id: ViewKind; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" },
];

interface Props {
  value: ViewKind;
  onChange: (v: ViewKind) => void;
}

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-xl bg-[var(--card)] p-1">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            value === v.id
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-soft)] hover:text-[var(--text)]"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
