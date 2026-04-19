import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Recipe } from "../types";

interface Props {
  onClose: () => void;
}

export function RecipesModal({ onClose }: Props) {
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: api.listRecipes,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-xl shadow-[var(--shadow)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-xl font-semibold">
            {editing === "new"
              ? "New recipe"
              : editing
              ? `Edit: ${editing.name}`
              : "Recipes"}
          </h2>
          <button
            onClick={editing ? () => setEditing(null) : onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label={editing ? "Back to list" : "Close"}
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {editing ? (
            <RecipeForm
              initial={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          ) : (
            <RecipeList
              recipes={recipes}
              onEdit={(r) => setEditing(r)}
              onNew={() => setEditing("new")}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function RecipeList({
  recipes,
  onEdit,
  onNew,
}: {
  recipes: Recipe[];
  onEdit: (r: Recipe) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onNew}
        className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-3 font-medium"
      >
        + New recipe
      </button>
      <ul className="space-y-2">
        {recipes.map((r) => (
          <li
            key={r.id}
            className="rounded-xl bg-[var(--card)] px-4 py-3 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium text-[var(--text)] truncate">{r.name}</div>
              <div className="text-xs text-[var(--text-muted)] truncate">
                {r.ingredients.length} ingredient
                {r.ingredients.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              onClick={() => onEdit(r)}
              className="text-sm text-[var(--text-soft)] hover:text-[var(--text)] px-3 py-1.5 rounded-lg"
            >
              Edit
            </button>
          </li>
        ))}
        {recipes.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-6">
            No recipes yet. Add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}

function RecipeForm({
  initial,
  onDone,
}: {
  initial: Recipe | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [ingredients, setIngredients] = useState<string[]>(() =>
    initial ? initial.ingredients.map((i) => i.name).concat("") : [""]
  );

  const normalizedIngredients = useMemo(
    () => ingredients.map((s) => s.trim()).filter(Boolean),
    [ingredients]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
    queryClient.invalidateQueries({ queryKey: ["grocery"] });
    queryClient.invalidateQueries({ queryKey: ["meals"] });
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        notes: notes.trim() || null,
        ingredients: normalizedIngredients,
      };
      return initial
        ? api.updateRecipe(initial.id, payload)
        : api.createRecipe(payload);
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteRecipe(initial!.id),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  const setIngredient = (i: number, value: string) => {
    setIngredients((arr) => {
      const next = [...arr];
      next[i] = value;
      // Always keep a trailing empty field
      if (next[next.length - 1].trim() !== "") next.push("");
      return next;
    });
  };

  const removeIngredient = (i: number) => {
    setIngredients((arr) => {
      const next = arr.filter((_, idx) => idx !== i);
      if (next.length === 0 || next[next.length - 1].trim() !== "") next.push("");
      return next;
    });
  };

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) saveMut.mutate();
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className={inputCls}
          placeholder="e.g. Taco Tuesday"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-[var(--text-muted)]">Ingredients</label>
          <span className="text-xs text-[var(--text-muted)]">
            {normalizedIngredients.length}
          </span>
        </div>
        <ul className="space-y-2">
          {ingredients.map((ing, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={ing}
                onChange={(e) => setIngredient(i, e.target.value)}
                placeholder={i === ingredients.length - 1 ? "Add ingredient…" : ""}
                className={inputCls}
              />
              {ing && (
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  className="text-[var(--text-muted)] hover:text-[var(--danger)] w-8 h-8 flex items-center justify-center"
                  aria-label="Remove ingredient"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Prep tips, cook time, etc."
          className={`${inputCls} resize-none`}
        />
      </div>

      {(saveMut.error || deleteMut.error) && (
        <div className="text-[var(--danger)] text-xs">
          {((saveMut.error || deleteMut.error) as Error).message}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
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
            onClick={onDone}
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
  );
}
