import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="w-10 h-10 rounded-xl bg-[var(--card)] hover:bg-[var(--card-hover)] flex items-center justify-center text-lg transition"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
