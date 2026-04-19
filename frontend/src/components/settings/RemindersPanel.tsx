import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type {
  CalendarProfile,
  Light,
  ReminderPattern,
  ReminderRule,
  ReminderScopeType,
} from "../../types";

const LEAD_TIME_PRESETS = [5, 10, 15, 30, 60, 120];

const PATTERNS: { id: ReminderPattern; label: string; desc: string }[] = [
  { id: "single", label: "Single", desc: "One 2s flash" },
  { id: "triple", label: "Triple", desc: "Three quick flashes" },
  { id: "pulse", label: "Pulse", desc: "Brightness pulses" },
];

export function RemindersPanel() {
  const [editing, setEditing] = useState<ReminderRule | "new" | null>(null);

  const { data: rules = [] } = useQuery<ReminderRule[]>({
    queryKey: ["reminder-rules"],
    queryFn: api.listReminderRules,
  });
  const { data: lights = [] } = useQuery<Light[]>({
    queryKey: ["lights"],
    queryFn: api.listLights,
    retry: false,
  });
  const { data: calendars = [] } = useQuery<CalendarProfile[]>({
    queryKey: ["calendar-profiles"],
    queryFn: api.listCalendarProfiles,
  });
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["reminder-categories"],
    queryFn: api.reminderCategories,
  });

  const realCalendars = useMemo(
    () => calendars.filter((c) => !c.id.startsWith("__")),
    [calendars]
  );

  if (editing) {
    return (
      <RuleForm
        initial={editing === "new" ? null : editing}
        lights={lights}
        calendars={realCalendars}
        categories={categories}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--text-soft)]">
        Set up explicit rules that flash a Govee light before specific events. Rules
        are opt-in: nothing alerts unless you create a rule for it.
      </div>

      {lights.length === 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs p-3">
          Connect a Govee light first (Settings → General → Integrations) before
          creating rules.
        </div>
      )}

      <ul className="space-y-2">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            calendars={realCalendars}
            onEdit={() => setEditing(rule)}
          />
        ))}
        {rules.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-6">
            No reminder rules yet.
          </li>
        )}
      </ul>

      <button
        onClick={() => setEditing("new")}
        disabled={lights.length === 0}
        className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white py-3 font-medium"
      >
        + New rule
      </button>
    </div>
  );
}

function RuleRow({
  rule,
  calendars,
  onEdit,
}: {
  rule: ReminderRule;
  calendars: CalendarProfile[];
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [testingMessage, setTestingMessage] = useState<string | null>(null);

  const toggleMut = useMutation({
    mutationFn: (active: boolean) =>
      api.updateReminderRule(rule.id, { active }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reminder-rules"] }),
  });

  const testMut = useMutation({
    mutationFn: () => api.testReminderRule(rule.id),
    onSuccess: () => {
      setTestingMessage("Flashed");
      setTimeout(() => setTestingMessage(null), 2500);
    },
    onError: (e) => {
      setTestingMessage(`Failed: ${(e as Error).message}`);
      setTimeout(() => setTestingMessage(null), 5000);
    },
  });

  const scopeLabel =
    rule.scope_type === "calendar"
      ? calendars.find((c) => c.id === rule.scope_value)?.display_name ||
        rule.scope_value
      : rule.scope_value;

  return (
    <li className="rounded-xl bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggleMut.mutate(!rule.active)}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            rule.active ? "bg-[var(--accent)]" : "bg-[var(--card-strong)]"
          }`}
          aria-label={rule.active ? "Disable rule" : "Enable rule"}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              rule.active ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
        <span
          className="w-3 h-3 rounded-sm shrink-0"
          style={{ background: rule.flash_color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[var(--text)] truncate">
            {rule.name || `${scopeLabel} · ${rule.lead_minutes}m before`}
          </div>
          <div className="text-xs text-[var(--text-muted)] truncate">
            {rule.scope_type === "calendar" ? "Calendar" : "Category"}: {scopeLabel} ·{" "}
            {rule.lead_minutes}m before · {rule.device_name || rule.device_id} ·{" "}
            {rule.flash_pattern}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] disabled:opacity-60 text-[var(--text)] px-3 py-1.5 text-xs"
          >
            {testMut.isPending ? "Flashing…" : "Test"}
          </button>
          <button
            onClick={onEdit}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm px-2"
          >
            Edit
          </button>
        </div>
      </div>
      {testingMessage && (
        <div className="text-xs text-[var(--text-muted)] mt-2">
          {testingMessage}
        </div>
      )}
      {rule.last_error && (
        <div className="text-xs text-amber-500 mt-2 flex items-start gap-1">
          <span>⚠️</span>
          <span>{rule.last_error}</span>
        </div>
      )}
    </li>
  );
}

function RuleForm({
  initial,
  lights,
  calendars,
  categories,
  onDone,
}: {
  initial: ReminderRule | null;
  lights: Light[];
  calendars: CalendarProfile[];
  categories: string[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [scopeType, setScopeType] = useState<ReminderScopeType>(
    initial?.scope_type ?? "calendar"
  );
  const [scopeValue, setScopeValue] = useState(
    initial?.scope_value ??
      (calendars.length > 0 ? calendars[0].id : categories[0] ?? "")
  );
  const [leadMinutes, setLeadMinutes] = useState(initial?.lead_minutes ?? 15);
  const [device, setDevice] = useState(() => {
    if (initial)
      return {
        device_id: initial.device_id,
        device_sku: initial.device_sku,
        device_name: initial.device_name,
      };
    if (lights.length > 0) {
      const l = lights[0];
      return { device_id: l.device, device_sku: l.sku, device_name: l.name };
    }
    return { device_id: "", device_sku: "", device_name: null };
  });
  const [color, setColor] = useState(initial?.flash_color ?? "#DC2626");
  const [pattern, setPattern] = useState<ReminderPattern>(
    initial?.flash_pattern ?? "single"
  );

  // Reset scope value when scope type changes
  useEffect(() => {
    if (initial && scopeType === initial.scope_type) return;
    if (scopeType === "calendar" && calendars.length > 0)
      setScopeValue(calendars[0].id);
    else if (scopeType === "category" && categories.length > 0)
      setScopeValue(categories[0]);
    else setScopeValue("");
  }, [scopeType, initial, calendars, categories]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim() || null,
        scope_type: scopeType,
        scope_value: scopeValue,
        lead_minutes: leadMinutes,
        device_id: device.device_id,
        device_sku: device.device_sku,
        device_name: device.device_name,
        flash_color: color,
        flash_pattern: pattern,
        active: initial?.active ?? true,
      };
      return initial
        ? api.updateReminderRule(initial.id, payload)
        : api.createReminderRule(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-rules"] });
      onDone();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteReminderRule(initial!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-rules"] });
      onDone();
    },
  });

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  const canSave = !!scopeValue && !!device.device_id;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) saveMut.mutate();
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Name (optional)
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Soccer practice flash"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Scope
          </label>
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as ReminderScopeType)}
            className={inputCls}
          >
            <option value="calendar">Calendar</option>
            <option value="category" disabled={categories.length === 0}>
              Category{categories.length === 0 ? " (none yet)" : ""}
            </option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            {scopeType === "calendar" ? "Calendar" : "Category"}
          </label>
          {scopeType === "calendar" ? (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className={inputCls}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.person})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className={inputCls}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Lead time
        </label>
        <div className="flex flex-wrap gap-2">
          {LEAD_TIME_PRESETS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setLeadMinutes(m)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                leadMinutes === m
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--card-strong)] text-[var(--text-soft)]"
              }`}
            >
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            value={leadMinutes}
            onChange={(e) =>
              setLeadMinutes(Math.max(1, Math.min(720, parseInt(e.target.value) || 1)))
            }
            className={`${inputCls} w-24`}
          />
          <span className="self-center text-xs text-[var(--text-muted)]">min before</span>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">Light</label>
        <select
          value={device.device_id}
          onChange={(e) => {
            const l = lights.find((l) => l.device === e.target.value);
            if (l)
              setDevice({
                device_id: l.device,
                device_sku: l.sku,
                device_name: l.name,
              });
          }}
          className={inputCls}
        >
          {lights.map((l) => (
            <option key={l.device} value={l.device}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Flash color
        </label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-12 h-10 rounded-md bg-transparent border-0 cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-2">Pattern</label>
        <div className="grid grid-cols-3 gap-2">
          {PATTERNS.map((p) => {
            const active = pattern === p.id;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setPattern(p.id)}
                className={`rounded-lg p-3 text-left ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--card-strong)] text-[var(--text)]"
                }`}
              >
                <div className="font-medium text-sm">{p.label}</div>
                <div
                  className={`text-xs ${
                    active ? "text-white/80" : "text-[var(--text-muted)]"
                  }`}
                >
                  {p.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(saveMut.error || deleteMut.error) && (
        <div className="text-[var(--danger)] text-xs">
          {((saveMut.error || deleteMut.error) as Error).message}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {initial ? (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this rule?")) deleteMut.mutate();
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
            onClick={onDone}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMut.isPending || !canSave}
            className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
          >
            {saveMut.isPending ? "Saving…" : initial ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </form>
  );
}
