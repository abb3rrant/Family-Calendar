import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Birthday, GeneralSettings } from "../../types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`;
}

export function BirthdaysPanel() {
  const queryClient = useQueryClient();

  const { data: birthdays = [] } = useQuery<Birthday[]>({
    queryKey: ["birthdays"],
    queryFn: api.listBirthdays,
  });
  const { data: settings } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["birthdays"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
  };

  const saveGeneralMut = useMutation({
    mutationFn: (patch: Partial<GeneralSettings>) => api.updateGeneralSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["general-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  return (
    <div className="space-y-4">
      {settings && (
        <div className="rounded-xl bg-[var(--card)] p-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-sm text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.show_birthdays}
              onChange={(e) =>
                saveGeneralMut.mutate({ show_birthdays: e.target.checked })
              }
            />
            <span>Show birthdays on the calendar</span>
          </label>
          <input
            type="color"
            value={settings.birthday_color}
            onChange={(e) =>
              saveGeneralMut.mutate({ birthday_color: e.target.value })
            }
            disabled={!settings.show_birthdays}
            className="w-8 h-8 rounded-md bg-transparent border-0 cursor-pointer disabled:opacity-40"
            aria-label="Birthday color"
          />
        </div>
      )}

      <AddBirthdayForm onAdded={invalidate} />

      <ul className="space-y-2">
        {birthdays.map((b) => (
          <BirthdayRow key={b.id} birthday={b} onChange={invalidate} />
        ))}
        {birthdays.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-4">
            No birthdays yet.
          </li>
        )}
      </ul>
    </div>
  );
}

function AddBirthdayForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [birthYear, setBirthYear] = useState<string>("");

  const createMut = useMutation({
    mutationFn: () =>
      api.createBirthday({
        name: name.trim(),
        month,
        day,
        birth_year: birthYear ? parseInt(birthYear, 10) : null,
      }),
    onSuccess: () => {
      setName("");
      setBirthYear("");
      onAdded();
    },
  });

  const inputCls =
    "rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) createMut.mutate();
      }}
      className="rounded-xl bg-[var(--card)] p-4 space-y-3"
    >
      <h3 className="font-medium text-[var(--text)]">Add a birthday</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Alice)"
        className={`${inputCls} w-full`}
        required
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value, 10))}
          className={inputCls}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={day}
          onChange={(e) => setDay(parseInt(e.target.value, 10) || 1)}
          className={inputCls}
        />
        <input
          type="number"
          inputMode="numeric"
          min={1900}
          max={2100}
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          placeholder="Year (opt.)"
          className={inputCls}
        />
      </div>
      {createMut.error && (
        <div className="text-[var(--danger)] text-xs">
          {(createMut.error as Error).message}
        </div>
      )}
      <button
        type="submit"
        disabled={createMut.isPending || !name.trim()}
        className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
      >
        {createMut.isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function BirthdayRow({
  birthday,
  onChange,
}: {
  birthday: Birthday;
  onChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(birthday);

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateBirthday(birthday.id, {
        name: draft.name,
        month: draft.month,
        day: draft.day,
        birth_year: draft.birth_year,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["birthdays"] });
      onChange();
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteBirthday(birthday.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["birthdays"] });
      onChange();
    },
  });

  const inputCls =
    "rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  if (!editing) {
    return (
      <li className="flex items-center justify-between rounded-lg bg-[var(--card)] px-3 py-2">
        <div>
          <div className="text-sm text-[var(--text)]">🎂 {birthday.name}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {formatDate(birthday.month, birthday.day)}
            {birthday.birth_year ? ` · born ${birthday.birth_year}` : ""}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm px-2"
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove ${birthday.name}'s birthday?`)) deleteMut.mutate();
            }}
            className="text-[var(--danger)] hover:bg-[var(--danger-soft)] px-2 rounded text-sm"
          >
            ✕
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg bg-[var(--card)] p-3 space-y-2">
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className={`${inputCls} w-full`}
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={draft.month}
          onChange={(e) => setDraft({ ...draft, month: parseInt(e.target.value, 10) })}
          className={inputCls}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={draft.day}
          onChange={(e) => setDraft({ ...draft, day: parseInt(e.target.value, 10) || 1 })}
          className={inputCls}
        />
        <input
          type="number"
          inputMode="numeric"
          min={1900}
          max={2100}
          value={draft.birth_year ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              birth_year: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
          placeholder="Year (opt.)"
          className={inputCls}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => {
            setDraft(birthday);
            setEditing(false);
          }}
          className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 text-sm"
        >
          Save
        </button>
      </div>
    </li>
  );
}
