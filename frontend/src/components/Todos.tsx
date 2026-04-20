import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Chore } from "../types";

export function Todos() {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  const { data: chores = [] } = useQuery<Chore[]>({
    queryKey: ["chores"],
    queryFn: api.listChores,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["chores"] });

  const createMut = useMutation({
    mutationFn: (title: string) => api.createChore({ title }),
    onSuccess: () => {
      setNewTitle("");
      invalidate();
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api.updateChore(id, { done }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteChore(id),
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-2xl bg-[var(--card)] p-4 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">To-Dos</h2>
        <span className="text-xs text-[var(--text-muted)]">
          {chores.filter((c) => !c.done).length} open
        </span>
      </div>
      <form
        className="flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) createMut.mutate(newTitle.trim());
        }}
      >
        <input
          className="flex-1 rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="Add a to-do…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-2 text-sm font-medium"
        >
          Add
        </button>
      </form>
      <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {chores.map((chore) => (
          <li
            key={chore.id}
            className="flex items-center gap-3 rounded-lg bg-[var(--card)] px-3 py-2"
          >
            <button
              onClick={() => toggleMut.mutate({ id: chore.id, done: !chore.done })}
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs ${
                chore.done
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "border-[var(--text-faint)] hover:border-[var(--accent)]"
              }`}
              aria-label={chore.done ? "Mark incomplete" : "Mark complete"}
            >
              {chore.done ? "✓" : ""}
            </button>
            <span
              className={`flex-1 text-sm ${
                chore.done
                  ? "line-through text-[var(--text-faint)]"
                  : "text-[var(--text)]"
              }`}
            >
              {chore.title}
            </span>
            <button
              onClick={() => deleteMut.mutate(chore.id)}
              className="text-[var(--text-faint)] hover:text-[var(--danger)] text-sm px-2"
              aria-label="Delete chore"
            >
              ✕
            </button>
          </li>
        ))}
        {chores.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-6">
            No to-dos yet.
          </li>
        )}
      </ul>
    </div>
  );
}
