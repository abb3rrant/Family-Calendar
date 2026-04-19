import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type {
  EcobeePinFlow,
  GeneralSettings,
  GoveeTestResult,
  PinnedCountdown,
} from "../../types";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "UTC",
];

export function GeneralPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
  });
  const [draft, setDraft] = useState<GeneralSettings | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<GeneralSettings>) => api.updateGeneralSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["general-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["weather"] });
      setDraft(next);
    },
  });

  if (!draft) return <div className="text-[var(--text-muted)]">Loading…</div>;

  const commit = () => {
    if (!data) return;
    const patch: Partial<GeneralSettings> = {};
    (Object.keys(draft) as (keyof GeneralSettings)[]).forEach((key) => {
      if (draft[key] !== data[key]) (patch as any)[key] = draft[key];
    });
    if (Object.keys(patch).length > 0) saveMut.mutate(patch);
  };

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
        <h3 className="font-medium text-[var(--text)]">Weather</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Latitude
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={draft.latitude}
              onChange={(e) =>
                setDraft({ ...draft, latitude: parseFloat(e.target.value) || 0 })
              }
              onBlur={commit}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Longitude
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={draft.longitude}
              onChange={(e) =>
                setDraft({ ...draft, longitude: parseFloat(e.target.value) || 0 })
              }
              onBlur={commit}
              className={inputCls}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!navigator.geolocation) {
              alert("Geolocation not available.");
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const next = {
                  ...draft,
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                };
                setDraft(next);
                saveMut.mutate({
                  latitude: next.latitude,
                  longitude: next.longitude,
                });
              },
              (err) => alert(`Couldn't get location: ${err.message}`)
            );
          }}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Use current location
        </button>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Timezone
          </label>
          <select
            value={draft.timezone}
            onChange={(e) => {
              const next = { ...draft, timezone: e.target.value };
              setDraft(next);
              saveMut.mutate({ timezone: next.timezone });
            }}
            className={inputCls}
          >
            {COMMON_TIMEZONES.includes(draft.timezone) ? null : (
              <option value={draft.timezone}>{draft.timezone}</option>
            )}
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Units</label>
          <div className="inline-flex rounded-lg bg-[var(--card-strong)] p-1">
            {(["fahrenheit", "celsius"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  const next = { ...draft, unit: u };
                  setDraft(next);
                  saveMut.mutate({ unit: u });
                }}
                className={`px-4 py-1.5 rounded-md text-sm capitalize ${
                  draft.unit === u ? "bg-[var(--accent)] text-white" : "text-[var(--text-soft)]"
                }`}
              >
                {u === "fahrenheit" ? "°F" : "°C"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
        <h3 className="font-medium text-[var(--text)]">Holidays</h3>

        <HolidayToggleRow
          label="US federal holidays"
          enabled={draft.show_us_holidays}
          color={draft.us_holiday_color}
          onToggle={(v) => {
            setDraft({ ...draft, show_us_holidays: v });
            saveMut.mutate({ show_us_holidays: v });
          }}
          onColor={(c) => {
            setDraft({ ...draft, us_holiday_color: c });
            saveMut.mutate({ us_holiday_color: c });
          }}
        />
        <HolidayToggleRow
          label="Christian holidays"
          enabled={draft.show_christian_holidays}
          color={draft.christian_holiday_color}
          onToggle={(v) => {
            setDraft({ ...draft, show_christian_holidays: v });
            saveMut.mutate({ show_christian_holidays: v });
          }}
          onColor={(c) => {
            setDraft({ ...draft, christian_holiday_color: c });
            saveMut.mutate({ christian_holiday_color: c });
          }}
        />
        <p className="text-xs text-[var(--text-muted)]">
          US includes MLK, Juneteenth, Independence Day, Thanksgiving, Christmas,
          etc. Christian includes Ash Wednesday, Palm Sunday, Good Friday, Easter
          and its moveable feasts, plus Christmas Eve.
        </p>
      </section>

      <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
        <h3 className="font-medium text-[var(--text)]">Sync</h3>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Poll iCloud every {draft.sync_interval_seconds}s (
            {Math.round(draft.sync_interval_seconds / 60)} min)
          </label>
          <input
            type="range"
            min={30}
            max={900}
            step={15}
            value={draft.sync_interval_seconds}
            onChange={(e) =>
              setDraft({
                ...draft,
                sync_interval_seconds: parseInt(e.target.value, 10),
              })
            }
            onMouseUp={commit}
            onTouchEnd={commit}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>30s</span>
            <span>15 min</span>
          </div>
        </div>
      </section>

      <CountdownsSection />

      <IntegrationsSection
        draft={draft}
        setDraft={setDraft}
        onSave={(patch) => saveMut.mutate(patch)}
      />

      {saveMut.error && (
        <div className="text-[var(--danger)] text-xs">
          {(saveMut.error as Error).message}
        </div>
      )}
    </div>
  );
}

function IntegrationsSection({
  draft,
  setDraft,
  onSave,
}: {
  draft: GeneralSettings;
  setDraft: (s: GeneralSettings) => void;
  onSave: (patch: Partial<GeneralSettings>) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<GoveeTestResult | null>(null);

  const testGovee = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await api.testGovee();
      setResult(r);
    } catch (e) {
      setResult({
        ok: false,
        device_count: 0,
        status: "error",
        message: (e as Error).message,
      });
    } finally {
      setTesting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
      <h3 className="font-medium text-[var(--text)]">Integrations</h3>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Govee API key
        </label>
        <input
          type="text"
          value={draft.govee_api_key ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, govee_api_key: e.target.value || null })
          }
          onBlur={() => onSave({ govee_api_key: draft.govee_api_key || null })}
          autoComplete="off"
          placeholder="Paste your Govee Developer API key"
          className={inputCls}
        />
        <div className="text-xs text-[var(--text-muted)] mt-1">
          Get one from the Govee Home app → Profile → Settings → Apply for API
          Key.
        </div>
      </div>

      {(draft.govee_api_key ?? "").trim() && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={testGovee}
            disabled={testing}
            className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] disabled:opacity-60 text-[var(--text)] px-3 py-2 text-sm"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {result && (
            <span
              className={`text-sm ${
                result.ok ? "text-[var(--accent)]" : "text-[var(--danger)]"
              }`}
            >
              {result.ok
                ? `Connected · ${result.device_count} device${result.device_count === 1 ? "" : "s"}`
                : result.message || "Failed"}
            </span>
          )}
        </div>
      )}

      <EcobeeIntegration draft={draft} setDraft={setDraft} onSave={onSave} />
    </section>
  );
}

function EcobeeIntegration({
  draft,
  setDraft,
  onSave,
}: {
  draft: GeneralSettings;
  setDraft: (s: GeneralSettings) => void;
  onSave: (patch: Partial<GeneralSettings>) => void;
}) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState<EcobeePinFlow | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const startMut = useMutation({
    mutationFn: () => api.ecobeeAuthorizeStart(),
    onSuccess: (res) => {
      setPin(res);
      setPollError(null);
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await api.ecobeeAuthorizePoll(res.code);
          if (status.status === "connected") {
            stopPolling();
            setPin(null);
            queryClient.invalidateQueries({ queryKey: ["general-settings"] });
            queryClient.invalidateQueries({ queryKey: ["thermostat"] });
          }
        } catch (e) {
          setPollError((e as Error).message);
          stopPolling();
        }
      }, Math.max(10_000, res.interval * 1000));
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.ecobeeDisconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["general-settings"] });
      queryClient.invalidateQueries({ queryKey: ["thermostat"] });
    },
  });

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="pt-3 border-t border-[var(--border)] space-y-3">
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          ecobee API key
        </label>
        <input
          type="text"
          value={draft.ecobee_api_key ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, ecobee_api_key: e.target.value || null })
          }
          onBlur={() => onSave({ ecobee_api_key: draft.ecobee_api_key || null })}
          autoComplete="off"
          placeholder="Paste your ecobee Developer API key"
          className={inputCls}
        />
        <div className="text-xs text-[var(--text-muted)] mt-1">
          Create a free developer app at{" "}
          <a
            href="https://developer.ecobee.com"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            developer.ecobee.com
          </a>
          .
        </div>
      </div>

      {(draft.ecobee_api_key ?? "").trim() && (
        <div className="flex items-center gap-2 flex-wrap">
          {draft.ecobee_authorized ? (
            <>
              <span className="text-sm text-[var(--accent)]">
                ✓ Connected to ecobee
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Disconnect ecobee?")) disconnectMut.mutate();
                }}
                className="rounded-lg bg-[var(--danger-soft)] hover:opacity-80 text-[var(--danger)] px-3 py-2 text-sm"
              >
                Disconnect
              </button>
            </>
          ) : pin ? (
            <div className="w-full rounded-lg bg-[var(--card-strong)] p-3 space-y-2">
              <div className="text-xs text-[var(--text-muted)]">
                Step 1: go to{" "}
                <a
                  href="https://www.ecobee.com/consumerportal/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] underline"
                >
                  ecobee.com/consumerportal
                </a>{" "}
                → My Apps → Add Application → enter the PIN below.
              </div>
              <div className="text-center text-4xl font-bold tracking-[0.3em] py-3 bg-[var(--card)] rounded-lg">
                {pin.pin}
              </div>
              <div className="text-xs text-[var(--text-muted)] text-center">
                Waiting for you to authorize… this page will update when done.
              </div>
              {pollError && (
                <div className="text-xs text-[var(--danger)]">{pollError}</div>
              )}
              <button
                type="button"
                onClick={() => {
                  stopPolling();
                  setPin(null);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-3 py-2 text-sm font-medium"
            >
              {startMut.isPending ? "Starting…" : "Authorize ecobee"}
            </button>
          )}
          {startMut.error && (
            <span className="text-xs text-[var(--danger)]">
              {(startMut.error as Error).message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HolidayToggleRow({
  label,
  enabled,
  color,
  onToggle,
  onColor,
}: {
  label: string;
  enabled: boolean;
  color: string;
  onToggle: (v: boolean) => void;
  onColor: (c: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-3 text-sm text-[var(--text)] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      <input
        type="color"
        value={color}
        onChange={(e) => onColor(e.target.value)}
        className="w-8 h-8 rounded-md bg-transparent border-0 cursor-pointer disabled:opacity-40"
        disabled={!enabled}
        aria-label={`${label} color`}
      />
    </div>
  );
}

function CountdownsSection() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [date, setDate] = useState("");

  const { data: countdowns = [] } = useQuery<PinnedCountdown[]>({
    queryKey: ["countdowns"],
    queryFn: api.listCountdowns,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["countdowns"] });
    queryClient.invalidateQueries({ queryKey: ["hero"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      api.createCountdown({
        label: label.trim(),
        emoji: emoji.trim() || null,
        target_date: date,
      }),
    onSuccess: () => {
      setLabel("");
      setEmoji("");
      setDate("");
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteCountdown(id),
    onSuccess: invalidate,
  });

  const inputCls =
    "rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <section className="rounded-xl bg-[var(--card)] p-4 space-y-3">
      <div>
        <h3 className="font-medium text-[var(--text)]">Pinned countdowns</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Show up as chips in the bottom hero banner.
        </p>
      </div>

      <ul className="space-y-2">
        {countdowns.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-lg bg-[var(--card-strong)] px-3 py-2"
          >
            <span className="text-lg">{c.emoji || "📌"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--text)] truncate">{c.label}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {new Date(c.target_date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Remove "${c.label}"?`)) deleteMut.mutate(c.id);
              }}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm px-2"
              aria-label="Delete countdown"
            >
              ✕
            </button>
          </li>
        ))}
        {countdowns.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-3">
            No pinned countdowns yet.
          </li>
        )}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && date) createMut.mutate();
        }}
        className="grid grid-cols-[1fr_60px_140px_auto] gap-2 items-end"
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          className={inputCls}
        />
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="📌"
          maxLength={2}
          className={`${inputCls} text-center`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
        />
        <button
          type="submit"
          disabled={createMut.isPending || !label.trim() || !date}
          className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
        >
          Add
        </button>
      </form>
      {createMut.error && (
        <div className="text-[var(--danger)] text-xs">
          {(createMut.error as Error).message}
        </div>
      )}
    </section>
  );
}
