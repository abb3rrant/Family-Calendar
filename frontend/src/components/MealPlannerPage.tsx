import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { api } from "../api";
import type { GroceryItem, Meal, MealSlot, Recipe } from "../types";
import { RecipesModal } from "./RecipesModal";
import { GroceryModal } from "./GroceryModal";

const SLOTS: { id: MealSlot; label: string; icon: string }[] = [
  { id: "breakfast", label: "Breakfast", icon: "🌅" },
  { id: "lunch", label: "Lunch", icon: "🥪" },
  { id: "dinner", label: "Dinner", icon: "🍽️" },
];

function toDateString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function MealPlannerPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const queryClient = useQueryClient();

  const { data: meals = [] } = useQuery<Meal[]>({
    queryKey: ["meals", toDateString(weekStart), toDateString(weekEnd)],
    queryFn: () => api.listMeals(toDateString(weekStart), toDateString(weekEnd)),
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: api.listRecipes,
  });

  const { data: grocery = [] } = useQuery<GroceryItem[]>({
    queryKey: ["grocery"],
    queryFn: api.listGrocery,
  });

  const mealMap = useMemo(() => {
    const map = new Map<string, Meal>();
    for (const m of meals) map.set(`${m.date}|${m.slot}`, m);
    return map;
  }, [meals]);

  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [groceryOpen, setGroceryOpen] = useState(false);

  const upsertMut = useMutation({
    mutationFn: ({
      date,
      slot,
      payload,
    }: {
      date: string;
      slot: MealSlot;
      payload: { description?: string; recipe_id?: number | null };
    }) => api.upsertMeal(date, slot, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meals"] });
      queryClient.invalidateQueries({ queryKey: ["grocery"] });
    },
  });

  const today = new Date();
  const rangeLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const openGroceryCount = grocery.filter((i) => !i.done).length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setRecipesOpen(true)}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            📖 Recipes
          </button>
          <button
            onClick={() => setGroceryOpen(true)}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            🛒 Grocery
            {openGroceryCount > 0 && (
              <span className="ml-2 inline-block min-w-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-xs">
                {openGroceryCount}
              </span>
            )}
          </button>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-semibold text-[var(--text)]">Meal Planner</div>
          <div className="text-sm text-[var(--text-muted)]">{rangeLabel}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            ‹
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-2 min-w-[800px]">
          <div />
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                className={`text-center py-2 rounded-lg ${
                  isToday ? "bg-[var(--accent-soft)] text-[var(--text)]" : ""
                }`}
              >
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                  {format(d, "EEE")}
                </div>
                <div
                  className={`text-2xl font-semibold ${
                    isToday ? "text-[var(--accent)]" : "text-[var(--text)]"
                  }`}
                >
                  {format(d, "d")}
                </div>
              </div>
            );
          })}

          {SLOTS.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              days={days}
              mealMap={mealMap}
              onOpenPicker={(key) => setPickerKey(key)}
            />
          ))}
        </div>
      </div>

      {pickerKey &&
        (() => {
          const [dateStr, slotId] = pickerKey.split("|");
          const meal = mealMap.get(pickerKey) ?? null;
          return (
            <MealPicker
              date={dateStr}
              slot={slotId as MealSlot}
              meal={meal}
              recipes={recipes}
              onClose={() => setPickerKey(null)}
              onPick={(payload) => {
                upsertMut.mutate({ date: dateStr, slot: slotId as MealSlot, payload });
                setPickerKey(null);
              }}
            />
          );
        })()}

      {recipesOpen && <RecipesModal onClose={() => setRecipesOpen(false)} />}
      {groceryOpen && <GroceryModal onClose={() => setGroceryOpen(false)} />}
    </div>
  );
}

function SlotRow({
  slot,
  days,
  mealMap,
  onOpenPicker,
}: {
  slot: { id: MealSlot; label: string; icon: string };
  days: Date[];
  mealMap: Map<string, Meal>;
  onOpenPicker: (key: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 text-sm text-[var(--text-soft)]">
        <span className="text-lg">{slot.icon}</span>
        <span>{slot.label}</span>
      </div>
      {days.map((d) => {
        const dateStr = toDateString(d);
        const key = `${dateStr}|${slot.id}`;
        const meal = mealMap.get(key);
        return (
          <button
            key={key}
            onClick={() => onOpenPicker(key)}
            className={`rounded-lg text-left p-2 text-sm min-h-[80px] transition ${
              meal
                ? "bg-[var(--card)] text-[var(--text)] hover:bg-[var(--card-hover)]"
                : "bg-[var(--card)]/40 hover:bg-[var(--card-hover)] text-[var(--text-faint)]"
            }`}
          >
            {meal ? (
              <>
                <div className="font-medium">{meal.description}</div>
                {meal.recipe_id !== null && (
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-1">
                    🛒 On grocery list
                  </div>
                )}
              </>
            ) : (
              "+"
            )}
          </button>
        );
      })}
    </>
  );
}

function MealPicker({
  date,
  slot,
  meal,
  recipes,
  onClose,
  onPick,
}: {
  date: string;
  slot: MealSlot;
  meal: Meal | null;
  recipes: Recipe[];
  onClose: () => void;
  onPick: (payload: { description?: string; recipe_id?: number | null }) => void;
}) {
  const [query, setQuery] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState(meal && meal.recipe_id === null ? meal.description : "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (customMode) inputRef.current?.focus();
  }, [customMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  const label = `${format(new Date(date + "T00:00:00"), "EEE MMM d")} · ${slot[0].toUpperCase() + slot.slice(1)}`;

  return createPortal(
    <div
      className="osk-modal-shift fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] text-[var(--text)] rounded-2xl w-full max-w-md shadow-[var(--shadow)] flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold">Plan meal</h2>
            <div className="text-xs text-[var(--text-muted)]">{label}</div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {customMode ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onPick({ description: custom.trim(), recipe_id: null });
            }}
            className="p-4 space-y-3"
          >
            <label className="block text-xs text-[var(--text-muted)]">
              Custom meal (no recipe / grocery items)
            </label>
            <input
              ref={inputRef}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Leftovers"
              className="w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setCustomMode(false)}
                className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-4 py-2 text-sm"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!custom.trim()}
                className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-[var(--border)]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipes…"
                className="w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <ul className="flex-1 overflow-y-auto p-2 space-y-1">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onPick({ recipe_id: r.id })}
                    className={`w-full text-left rounded-lg px-3 py-2.5 hover:bg-[var(--card-hover)] ${
                      meal?.recipe_id === r.id
                        ? "bg-[var(--accent-soft)]"
                        : "bg-[var(--card)]"
                    }`}
                  >
                    <div className="font-medium text-[var(--text)]">{r.name}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">
                      {r.ingredients.length > 0
                        ? r.ingredients.map((i) => i.name).join(", ")
                        : "No ingredients"}
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-[var(--text-muted)] text-sm text-center py-6">
                  {recipes.length === 0
                    ? "No recipes yet. Tap Recipes up top to add one."
                    : "No recipes match."}
                </li>
              )}
            </ul>
            <div className="border-t border-[var(--border)] p-3 flex items-center justify-between gap-2">
              {meal && (
                <button
                  onClick={() => onPick({ description: "", recipe_id: null })}
                  className="rounded-lg bg-[var(--danger-soft)] text-[var(--danger)] px-3 py-2 text-sm"
                >
                  Clear meal
                </button>
              )}
              <button
                onClick={() => setCustomMode(true)}
                className="ml-auto rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm"
              >
                Custom…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
