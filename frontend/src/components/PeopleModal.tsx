import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Person } from "../types";

const DEFAULT_COLORS = [
  "#EC4899",
  "#3B82F6",
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
  "#F97316",
];

export function PeopleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ["allowance-people"],
    queryFn: api.listPeople,
  });

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["allowance-people"] });
    queryClient.invalidateQueries({ queryKey: ["allowance-week"] });
  };

  const addMut = useMutation({
    mutationFn: () =>
      api.createPerson({
        name: name.trim(),
        emoji: emoji.trim() || null,
        color,
      }),
    onSuccess: () => {
      setName("");
      setEmoji("");
      setColor(DEFAULT_COLORS[(people.length + 1) % DEFAULT_COLORS.length]);
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deletePerson(id),
    onSuccess: invalidate,
  });

  const inputCls =
    "rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

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
          <h2 className="text-xl font-semibold">People</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <ul className="space-y-2">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg bg-[var(--card)] px-3 py-2"
                style={{ borderLeft: `4px solid ${p.color}` }}
              >
                <span className="text-2xl">{p.emoji || "🙂"}</span>
                <div className="flex-1 text-[var(--text)]">{p.name}</div>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Remove ${p.name}? All of their chores and completions will be deleted too.`
                      )
                    )
                      deleteMut.mutate(p.id);
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm px-2"
                >
                  ✕
                </button>
              </li>
            ))}
            {people.length === 0 && (
              <li className="text-[var(--text-muted)] text-sm text-center py-3">
                No people yet.
              </li>
            )}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) addMut.mutate();
            }}
            className="rounded-xl bg-[var(--card)] p-3 space-y-2 mt-4"
          >
            <div className="text-xs text-[var(--text-muted)] font-medium">Add person</div>
            <div className="grid grid-cols-[60px_1fr] gap-2">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="👧"
                maxLength={2}
                className={`${inputCls} text-center text-lg`}
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className={inputCls}
                required
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${
                    c === color
                      ? "ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--card)]"
                      : ""
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer"
              />
            </div>
            {addMut.error && (
              <div className="text-[var(--danger)] text-xs">
                {(addMut.error as Error).message}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!name.trim() || addMut.isPending}
                className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
