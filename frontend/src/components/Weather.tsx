import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { WeatherResponse } from "../types";

const WMO_ICON: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  77: "🌨️",
  80: "🌧️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function icon(code: number): string {
  return WMO_ICON[code] ?? "🌡️";
}

export function Weather() {
  const { data } = useQuery<WeatherResponse>({
    queryKey: ["weather"],
    queryFn: api.getWeather,
    refetchInterval: 30 * 60_000,
  });

  if (!data) {
    return <div className="text-[var(--text-muted)] text-sm">Loading weather…</div>;
  }

  const unit = data.current_units?.temperature_2m ?? "°";
  const days = data.daily.time.slice(0, 5);

  return (
    <div className="rounded-2xl bg-[var(--card)] p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-5xl">{icon(data.current.weather_code)}</div>
        <div>
          <div className="text-3xl font-semibold text-[var(--text)]">
            {Math.round(data.current.temperature_2m)}
            {unit}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Right now</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {days.map((d, i) => {
          const date = new Date(d + "T00:00:00");
          const wd = date.toLocaleDateString(undefined, { weekday: "short" });
          return (
            <div key={d} className="text-center text-xs">
              <div className="text-[var(--text-muted)]">{i === 0 ? "Today" : wd}</div>
              <div className="text-2xl my-1">{icon(data.daily.weather_code[i])}</div>
              <div className="text-[var(--text-soft)]">
                {Math.round(data.daily.temperature_2m_max[i])}°
              </div>
              <div className="text-[var(--text-faint)]">
                {Math.round(data.daily.temperature_2m_min[i])}°
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
