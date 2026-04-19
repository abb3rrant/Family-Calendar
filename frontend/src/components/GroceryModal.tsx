import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { GroceryItem } from "../types";

interface Props {
  onClose: () => void;
}

export function GroceryModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: items = [] } = useQuery<GroceryItem[]>({
    queryKey: ["grocery"],
    queryFn: api.listGrocery,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["grocery"] });

  const createMut = useMutation({
    mutationFn: (name: string) => api.createGrocery(name),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api.updateGrocery(id, { done }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteGrocery(id),
    onSuccess: invalidate,
  });
  const clearDoneMut = useMutation({
    mutationFn: () => api.clearDoneGrocery(),
    onSuccess: invalidate,
  });

  const { open, done } = useMemo(() => {
    return {
      open: items.filter((i) => !i.done),
      done: items.filter((i) => i.done),
    };
  }, [items]);

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
            <h2 className="text-xl font-semibold">Grocery list</h2>
            <div className="text-xs text-[var(--text-muted)]">
              {open.length} to buy · {done.length} done
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

        <div className="p-4 overflow-y-auto">
          <form
            className="flex gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createMut.mutate(newName.trim());
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Add item…"
              className="flex-1 rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 text-sm font-medium"
            >
              Add
            </button>
          </form>

          <ul className="space-y-1.5">
            {open.map((item) => (
              <GroceryRow
                key={item.id}
                item={item}
                onToggle={() => toggleMut.mutate({ id: item.id, done: true })}
                onDelete={() => deleteMut.mutate(item.id)}
              />
            ))}
            {open.length === 0 && (
              <li className="text-[var(--text-muted)] text-sm text-center py-4">
                Nothing to buy right now.
              </li>
            )}
          </ul>

          {done.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-6 mb-2">
                <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Done
                </div>
                <button
                  onClick={() => clearDoneMut.mutate()}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-1.5">
                {done.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleMut.mutate({ id: item.id, done: false })}
                    onDelete={() => deleteMut.mutate(item.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function GroceryRow({
  item,
  onToggle,
  onDelete,
}: {
  item: GroceryItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-[var(--card)] px-3 py-2">
      <button
        onClick={onToggle}
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs shrink-0 ${
          item.done
            ? "bg-[var(--accent)] border-[var(--accent)] text-white"
            : "border-[var(--text-faint)] hover:border-[var(--accent)]"
        }`}
        aria-label={item.done ? "Mark not bought" : "Mark bought"}
      >
        {item.done ? "✓" : ""}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm truncate ${
            item.done
              ? "line-through text-[var(--text-faint)]"
              : "text-[var(--text)]"
          }`}
        >
          {item.name}
        </div>
        {item.source_meal_id !== null && (
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
            From a planned meal
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm px-2"
        aria-label="Delete item"
      >
        ✕
      </button>
    </li>
  );
}
