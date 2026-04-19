import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AccountsPanel } from "./settings/AccountsPanel";
import { CalendarsPanel } from "./settings/CalendarsPanel";
import { GeneralPanel } from "./settings/GeneralPanel";
import { BirthdaysPanel } from "./settings/BirthdaysPanel";
import { RemindersPanel } from "./settings/RemindersPanel";
import { PhotosPanel } from "./settings/PhotosPanel";

type Tab =
  | "accounts"
  | "calendars"
  | "birthdays"
  | "reminders"
  | "photos"
  | "general";

const TABS: { id: Tab; label: string }[] = [
  { id: "accounts", label: "Accounts" },
  { id: "calendars", label: "Calendars" },
  { id: "birthdays", label: "Birthdays" },
  { id: "reminders", label: "Reminders" },
  { id: "photos", label: "Photos" },
  { id: "general", label: "General" },
];

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("accounts");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-2xl shadow-[var(--shadow)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="inline-flex rounded-xl bg-[var(--card)] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-soft)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {tab === "accounts" && <AccountsPanel />}
          {tab === "calendars" && <CalendarsPanel />}
          {tab === "birthdays" && <BirthdaysPanel />}
          {tab === "reminders" && <RemindersPanel />}
          {tab === "photos" && <PhotosPanel />}
          {tab === "general" && <GeneralPanel />}
        </div>
      </div>
    </div>,
    document.body
  );
}
