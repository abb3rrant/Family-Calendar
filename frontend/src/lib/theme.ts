import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { GeneralSettings } from "../types";

export type Theme = "light" | "dark";

const STORAGE_KEY = "calendar-theme";
const AUTO_STATE_KEY = "calendar-theme-auto-state";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Which theme *should* be active right now given the configured boundaries.
 *
 * Dark-start-hour < light-start-hour (e.g. dark at 20, light at 7) means the
 * dark window wraps past midnight. We treat the window [darkStart, lightStart)
 * as "dark" and the complement as "light".
 */
function themeForHour(hour: number, darkStart: number, lightStart: number): Theme {
  if (darkStart === lightStart) return "light"; // degenerate — no dark window
  if (darkStart < lightStart) {
    // Dark window doesn't wrap: [darkStart, lightStart)
    return hour >= darkStart && hour < lightStart ? "dark" : "light";
  }
  // Dark window wraps midnight: [darkStart, 24) ∪ [0, lightStart)
  return hour >= darkStart || hour < lightStart ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const { data: settings } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: api.getGeneralSettings,
  });

  // Apply manually-set theme + persist
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Auto-theme: at every boundary crossing, switch. Between crossings the
  // manual toggle is respected (we only fire on transitions).
  useEffect(() => {
    if (!settings?.theme_auto) return;
    const darkStart = settings.theme_dark_start_hour;
    const lightStart = settings.theme_light_start_hour;

    const maybeApply = () => {
      const now = new Date();
      const hour = now.getHours();
      const expected = themeForHour(hour, darkStart, lightStart);
      // Only switch on a transition: track the last hour we computed so we
      // apply exactly once per boundary crossing, not continuously.
      const last = localStorage.getItem(AUTO_STATE_KEY);
      const key = `${expected}@${darkStart}-${lightStart}-${hour >= darkStart || hour < lightStart ? "dark-window" : "light-window"}`;
      if (last !== key) {
        setTheme(expected);
        localStorage.setItem(AUTO_STATE_KEY, key);
      }
    };

    // Apply once immediately in case a transition happened while we were off.
    // Clear the saved state so the first tick always applies the correct theme.
    const now = new Date();
    const hour = now.getHours();
    const expected = themeForHour(hour, darkStart, lightStart);
    if (expected !== theme) setTheme(expected);
    localStorage.setItem(
      AUTO_STATE_KEY,
      `${expected}@${darkStart}-${lightStart}-${hour >= darkStart || hour < lightStart ? "dark-window" : "light-window"}`
    );

    const id = setInterval(maybeApply, 60_000); // check every minute
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings?.theme_auto,
    settings?.theme_dark_start_hour,
    settings?.theme_light_start_hour,
  ]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle, setTheme };
}
