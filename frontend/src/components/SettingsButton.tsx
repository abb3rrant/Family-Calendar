import { useState } from "react";
import { SettingsModal } from "./SettingsModal";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open settings"
        title="Settings"
        className="w-10 h-10 rounded-xl bg-[var(--card)] hover:bg-[var(--card-hover)] flex items-center justify-center text-lg transition"
      >
        ⚙️
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
