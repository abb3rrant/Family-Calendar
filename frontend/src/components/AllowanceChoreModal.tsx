import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AllowanceChore, Person } from "../types";

export function AllowanceChoreModal({
  initial,
  people,
  onClose,
}: {
  initial: AllowanceChore | null;
  people: Person[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [points, setPoints] = useState<number>(initial?.points ?? 1);
  const [personId, setPersonId] = useState<number | "unassigned">(
    initial?.person_id ?? (people[0]?.id ?? "unassigned")
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["allowance-chores"] });
    queryClient.invalidateQueries({ queryKey: ["allowance-week"] });
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        emoji: emoji.trim() || null,
        points,
        person_id: personId === "unassigned" ? null : personId,
      };
      return initial
        ? api.updateAllowanceChore(initial.id, payload)
        : api.createAllowanceChore(payload);
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteAllowanceChore(initial!.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) saveMut.mutate();
        }}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md shadow-[var(--shadow)] p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {initial ? "Edit chore" : "New chore"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-[60px_1fr] gap-2">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🍽️"
            maxLength={2}
            className={`${inputCls} text-center text-lg`}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Chore name (e.g. Dishes)"
            required
            autoFocus
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Points each time
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={points}
              onChange={(e) =>
                setPoints(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Assigned to
            </label>
            <select
              value={personId}
              onChange={(e) =>
                setPersonId(
                  e.target.value === "unassigned"
                    ? "unassigned"
                    : parseInt(e.target.value, 10)
                )
              }
              className={inputCls}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ""}{p.name}
                </option>
              ))}
              <option value="unassigned">Shared (anyone)</option>
            </select>
          </div>
        </div>

        {(saveMut.error || deleteMut.error) && (
          <div className="text-[var(--danger)] text-xs">
            {((saveMut.error || deleteMut.error) as Error).message}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {initial ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${initial.name}"?`)) deleteMut.mutate();
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
              onClick={onClose}
              className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMut.isPending || !name.trim()}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
            >
              {saveMut.isPending ? "Saving…" : initial ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
