import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ComfortRef, HvacMode, Light, Thermostat } from "../types";

export function HomePage() {
  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <ThermostatSection />
      <LightsSection />
    </div>
  );
}

// ---------- Thermostat ----------

const MODES: { id: HvacMode; label: string; icon: string }[] = [
  { id: "auto", label: "Auto", icon: "🔄" },
  { id: "heat", label: "Heat", icon: "🔥" },
  { id: "cool", label: "Cool", icon: "❄️" },
  { id: "off", label: "Off", icon: "⏻" },
];

const COMFORT_CHIPS: ComfortRef[] = ["home", "away", "sleep"];

const EQUIPMENT_ICON: Record<Thermostat["equipment_status"], string> = {
  heating: "🔥",
  cooling: "❄️",
  idle: "",
  fan: "💨",
  off: "",
};

function ThermostatSection() {
  const queryClient = useQueryClient();
  const {
    data: t,
    isLoading,
    isError,
    error,
  } = useQuery<Thermostat>({
    queryKey: ["thermostat"],
    queryFn: api.getThermostat,
    refetchInterval: 60_000,
    retry: false,
  });

  const [heat, setHeat] = useState<number | null>(null);
  const [cool, setCool] = useState<number | null>(null);

  useEffect(() => {
    if (t?.heat_setpoint_f != null) setHeat((prev) => prev ?? Math.round(t.heat_setpoint_f!));
    if (t?.cool_setpoint_f != null) setCool((prev) => prev ?? Math.round(t.cool_setpoint_f!));
  }, [t?.heat_setpoint_f, t?.cool_setpoint_f]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["thermostat"] });

  const modeMut = useMutation({
    mutationFn: (mode: HvacMode) => api.setThermostatMode(mode),
    onSuccess: invalidate,
  });
  const holdMut = useMutation({
    mutationFn: (payload: { heat_f?: number; cool_f?: number }) =>
      api.setThermostatHold(payload),
    onSuccess: invalidate,
  });
  const comfortMut = useMutation({
    mutationFn: (ref: ComfortRef) => api.setThermostatComfort(ref),
    onSuccess: invalidate,
  });
  const resumeMut = useMutation({
    mutationFn: () => api.resumeThermostatProgram(),
    onSuccess: invalidate,
  });

  if (isError) {
    const msg = (error as Error).message;
    const setup = msg.includes("API key not set") || msg.includes("not authorized");
    return (
      <div className="rounded-2xl bg-[var(--card)] p-6 text-center">
        <div className="text-3xl mb-2">🌡️</div>
        <div className="text-[var(--text)] font-semibold mb-1">
          {setup ? "Connect your ecobee" : "Thermostat error"}
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {setup
            ? "Settings → General → Integrations to add your API key and authorize."
            : msg}
        </div>
      </div>
    );
  }

  if (isLoading || !t) {
    return (
      <div className="rounded-2xl bg-[var(--card)] p-6 text-center text-[var(--text-muted)]">
        Loading thermostat…
      </div>
    );
  }

  const commitHeat = () => {
    if (heat != null && heat !== Math.round(t.heat_setpoint_f ?? -999)) {
      holdMut.mutate({ heat_f: heat, cool_f: cool ?? undefined });
    }
  };
  const commitCool = () => {
    if (cool != null && cool !== Math.round(t.cool_setpoint_f ?? -999)) {
      holdMut.mutate({ heat_f: heat ?? undefined, cool_f: cool });
    }
  };

  const statusColor =
    t.equipment_status === "heating"
      ? "text-orange-400"
      : t.equipment_status === "cooling"
      ? "text-blue-400"
      : "text-[var(--text-muted)]";

  return (
    <section className="rounded-2xl bg-[var(--card)] p-5">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-sm font-semibold text-[var(--text-soft)]">
            {t.name}
          </div>
          <div className={`text-xs mt-0.5 ${statusColor}`}>
            {EQUIPMENT_ICON[t.equipment_status]}{" "}
            {t.equipment_status === "idle" ? "Idle" : t.equipment_status}
            {t.is_held ? " · hold active" : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-6xl font-light tabular-nums text-[var(--text)] leading-none">
            {t.indoor_temperature_f !== null
              ? Math.round(t.indoor_temperature_f)
              : "--"}
            <span className="text-3xl text-[var(--text-muted)]">°</span>
          </div>
          {t.indoor_humidity !== null && (
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {t.indoor_humidity}% humidity
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        {MODES.map((m) => {
          const active = t.hvac_mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => modeMut.mutate(m.id)}
              className={`rounded-lg py-3 text-center transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-[var(--text)]"
              }`}
            >
              <div className="text-xl">{m.icon}</div>
              <div className="text-xs mt-1">{m.label}</div>
            </button>
          );
        })}
      </div>

      {(t.hvac_mode === "heat" || t.hvac_mode === "auto") && heat != null && (
        <Setpoint
          label="Heat to"
          value={heat}
          setValue={setHeat}
          onCommit={commitHeat}
          accent="text-orange-400"
        />
      )}
      {(t.hvac_mode === "cool" || t.hvac_mode === "auto") && cool != null && (
        <Setpoint
          label="Cool to"
          value={cool}
          setValue={setCool}
          onCommit={commitCool}
          accent="text-blue-400"
        />
      )}

      <div className="grid grid-cols-3 gap-2 mt-5">
        {COMFORT_CHIPS.map((ref) => {
          const active = t.current_climate_ref === ref;
          const available = t.available_climate_refs.includes(ref);
          return (
            <button
              key={ref}
              disabled={!available}
              onClick={() => comfortMut.mutate(ref)}
              className={`capitalize rounded-lg py-2.5 text-sm transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-[var(--text)] disabled:opacity-40"
              }`}
            >
              {ref}
            </button>
          );
        })}
      </div>

      {t.is_held && (
        <button
          onClick={() => resumeMut.mutate()}
          className="w-full mt-4 rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-[var(--text-soft)] py-2.5 text-sm"
        >
          Resume scheduled program
        </button>
      )}
    </section>
  );
}

function Setpoint({
  label,
  value,
  setValue,
  onCommit,
  accent,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  onCommit: () => void;
  accent: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[var(--text-muted)]">{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${accent}`}>
          {value}°
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setValue(value - 1);
          }}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          className="w-12 h-12 rounded-xl bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-2xl font-bold"
        >
          −
        </button>
        <input
          type="range"
          min={45}
          max={90}
          step={1}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10))}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          className="flex-1"
        />
        <button
          onClick={() => {
            setValue(value + 1);
          }}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          className="w-12 h-12 rounded-xl bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-2xl font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------- Lights ----------

const PRESET_COLORS: { name: string; rgb: [number, number, number] }[] = [
  { name: "Warm white", rgb: [255, 214, 170] },
  { name: "Daylight", rgb: [255, 255, 255] },
  { name: "Red", rgb: [255, 60, 60] },
  { name: "Orange", rgb: [255, 140, 40] },
  { name: "Amber", rgb: [255, 180, 60] },
  { name: "Green", rgb: [60, 220, 80] },
  { name: "Teal", rgb: [60, 220, 200] },
  { name: "Blue", rgb: [60, 140, 255] },
  { name: "Purple", rgb: [180, 80, 255] },
  { name: "Pink", rgb: [255, 90, 180] },
];

function rgbInt(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function intToRgb(n: number): [number, number, number] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}
function hasCapability(light: Light, instance: string): boolean {
  return light.capabilities.some((c) => c.instance === instance);
}

function LightsSection() {
  const {
    data: lights = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Light[]>({
    queryKey: ["lights"],
    queryFn: api.listLights,
    refetchInterval: 60_000,
    retry: false,
  });

  if (isError) {
    const msg = (error as Error).message;
    const setup = msg.includes("API key is not configured");
    return (
      <section className="rounded-2xl bg-[var(--card)] p-6 text-center">
        <div className="text-3xl mb-2">💡</div>
        <div className="text-[var(--text)] font-semibold mb-1">
          {setup ? "Connect Govee" : "Lights error"}
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {setup
            ? "Settings → General → Integrations to paste your Govee API key."
            : msg}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-[var(--card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-[var(--text-soft)]">Lights</div>
          <div className="text-xs text-[var(--text-muted)]">
            {isLoading
              ? "Loading…"
              : `${lights.filter((l) => l.state.on).length} of ${lights.length} on`}
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] disabled:opacity-60 text-[var(--text-soft)] px-3 py-2 text-xs"
        >
          {isFetching ? "…" : "Refresh"}
        </button>
      </div>

      {lights.length === 0 && !isLoading ? (
        <div className="text-center text-[var(--text-muted)] text-sm py-6">
          No devices found. Add one in the Govee Home app.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lights.map((light) => (
            <LightTile key={light.device} light={light} />
          ))}
        </div>
      )}
    </section>
  );
}

function LightTile({ light }: { light: Light }) {
  const queryClient = useQueryClient();
  const initialOn = !!light.state.on;
  const initialBrightness = Math.max(1, Math.min(100, light.state.brightness ?? 100));
  const initialColor: [number, number, number] = light.state.color_rgb
    ? intToRgb(light.state.color_rgb)
    : [255, 214, 170];

  const [localOn, setLocalOn] = useState(initialOn);
  const [localBrightness, setLocalBrightness] = useState(initialBrightness);
  const [localColor, setLocalColor] = useState<[number, number, number]>(initialColor);

  const canPower = hasCapability(light, "powerSwitch");
  const canBrightness = hasCapability(light, "brightness");
  const canColor = hasCapability(light, "colorRgb");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lights"] });

  const powerMut = useMutation({
    mutationFn: (on: boolean) => api.setLightPower(light.device, light.sku, on),
    onSuccess: invalidate,
  });
  const brightnessMut = useMutation({
    mutationFn: (pct: number) => api.setLightBrightness(light.device, light.sku, pct),
    onSuccess: invalidate,
  });
  const colorMut = useMutation({
    mutationFn: ([r, g, b]: [number, number, number]) =>
      api.setLightColor(light.device, light.sku, r, g, b),
    onSuccess: invalidate,
  });

  const setColorAndTurnOn = (rgb: [number, number, number]) => {
    setLocalColor(rgb);
    colorMut.mutate(rgb);
    if (!localOn && canPower) {
      setLocalOn(true);
      powerMut.mutate(true);
    }
  };

  return (
    <div
      className={`rounded-xl p-4 border transition ${
        localOn
          ? "bg-[var(--card-strong)] border-[var(--accent)]/40"
          : "bg-[var(--card-strong)]/60 border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text)] truncate">{light.name}</div>
          <div className="text-xs text-[var(--text-muted)]">{light.sku}</div>
        </div>
        {canPower && (
          <button
            onClick={() => {
              const next = !localOn;
              setLocalOn(next);
              powerMut.mutate(next);
            }}
            className={`relative w-14 h-8 rounded-full transition ${
              localOn ? "bg-[var(--accent)]" : "bg-[var(--card)]"
            }`}
            aria-label={localOn ? "Turn off" : "Turn on"}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                localOn ? "left-7" : "left-1"
              }`}
            />
          </button>
        )}
      </div>

      {canBrightness && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Brightness</span>
            <span>{localBrightness}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={localBrightness}
            onChange={(e) => setLocalBrightness(parseInt(e.target.value, 10))}
            onMouseUp={() => brightnessMut.mutate(localBrightness)}
            onTouchEnd={() => brightnessMut.mutate(localBrightness)}
            disabled={!localOn}
            className="w-full disabled:opacity-50"
          />
        </div>
      )}

      {canColor && (
        <ColorControls
          current={localColor}
          onPreset={setColorAndTurnOn}
          onCustom={setColorAndTurnOn}
          disabled={!localOn}
        />
      )}
    </div>
  );
}

function ColorControls({
  current,
  onPreset,
  onCustom,
  disabled,
}: {
  current: [number, number, number];
  onPreset: (rgb: [number, number, number]) => void;
  onCustom: (rgb: [number, number, number]) => void;
  disabled?: boolean;
}) {
  const currentHex = useMemo(() => rgbToHex(...current), [current]);
  const currentInt = useMemo(() => rgbInt(...current), [current]);
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="text-xs text-[var(--text-muted)] mb-2">Color</div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_COLORS.map((p) => {
          const active = rgbInt(...p.rgb) === currentInt;
          return (
            <button
              key={p.name}
              onClick={() => onPreset(p.rgb)}
              title={p.name}
              style={{ background: rgbToHex(...p.rgb) }}
              className={`w-8 h-8 rounded-full border-2 transition ${
                active
                  ? "border-[var(--text)]"
                  : "border-transparent hover:border-[var(--border)]"
              }`}
            />
          );
        })}
        <input
          type="color"
          value={currentHex}
          onChange={(e) => onCustom(hexToRgb(e.target.value))}
          className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer"
          aria-label="Pick custom color"
        />
      </div>
    </div>
  );
}
