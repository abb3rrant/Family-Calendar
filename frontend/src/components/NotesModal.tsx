import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Note } from "../types";

interface Props {
  onClose: () => void;
}

export function NotesModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["notes"],
    queryFn: api.listNotes,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notes"] });

  const createMut = useMutation({
    mutationFn: (text: string) => api.createNote(text),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      api.updateNote(id, text),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteNote(id),
    onSuccess: invalidate,
  });

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md shadow-[var(--shadow)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-xl font-semibold">Notes</h2>
            <div className="text-xs text-[var(--text-muted)]">
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex flex-col gap-3 min-h-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) createMut.mutate(draft.trim());
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note for the family…"
              rows={2}
              className="w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              autoFocus
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!draft.trim() || createMut.isPending}
                className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
              >
                {createMut.isPending ? "Adding…" : "Add note"}
              </button>
            </div>
          </form>

          <ul className="space-y-2 overflow-y-auto">
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                onSave={(text) => updateMut.mutate({ id: note.id, text })}
                onDelete={() => deleteMut.mutate(note.id)}
              />
            ))}
            {notes.length === 0 && (
              <li className="text-[var(--text-muted)] text-sm text-center py-6">
                No notes yet.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NoteRow({
  note,
  onSave,
  onDelete,
}: {
  note: Note;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  if (editing) {
    return (
      <li className="rounded-lg bg-[var(--card)] p-3 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(6, Math.max(2, draft.split("\n").length))}
          className="w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setDraft(note.text);
              setEditing(false);
            }}
            className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (draft.trim() && draft.trim() !== note.text) {
                onSave(draft.trim());
              }
              setEditing(false);
            }}
            className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 text-sm"
          >
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg bg-[var(--card)] p-3 group">
      <div className="text-sm text-[var(--text)] whitespace-pre-wrap break-words">
        {note.text}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-[var(--text-muted)]">
          {formatRelative(note.updated_at)}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this note?")) onDelete();
            }}
            className="text-[var(--text-muted)] hover:text-[var(--danger)]"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
