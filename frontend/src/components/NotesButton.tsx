import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Note } from "../types";
import { NotesModal } from "./NotesModal";

export function NotesButton() {
  const [open, setOpen] = useState(false);
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["notes"],
    queryFn: api.listNotes,
    staleTime: 30_000,
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open notes"
        title="Notes"
        className="h-10 px-3 rounded-xl bg-[var(--card)] hover:bg-[var(--card-hover)] flex items-center gap-2 text-sm text-[var(--text-soft)] transition"
      >
        <span className="text-base">📝</span>
        <span className="hidden sm:inline">Notes</span>
        {notes.length > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center">
            {notes.length}
          </span>
        )}
      </button>
      {open && <NotesModal onClose={() => setOpen(false)} />}
    </>
  );
}
