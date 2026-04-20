import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { api } from "../api";
import type {
  AllowanceChore,
  Person,
  PersonWeekSummary,
  WeekSummary,
} from "../types";
import { PeopleModal } from "./PeopleModal";
import { AllowanceChoreModal } from "./AllowanceChoreModal";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function toDateString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function ChoresPage() {
  const [refDay, setRefDay] = useState<Date>(new Date());
  const queryClient = useQueryClient();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [choreOpen, setChoreOpen] = useState<{ mode: "new" } | { mode: "edit"; chore: AllowanceChore } | null>(null);

  const { data: summary } = useQuery<WeekSummary>({
    queryKey: ["allowance-week", toDateString(refDay)],
    queryFn: () => api.allowanceWeek(toDateString(refDay)),
    refetchInterval: 30_000,
  });
  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ["allowance-people"],
    queryFn: api.listPeople,
  });
  const { data: chores = [] } = useQuery<AllowanceChore[]>({
    queryKey: ["allowance-chores"],
    queryFn: api.listAllowanceChores,
  });

  const unassignedChores = useMemo(
    () => chores.filter((c) => c.person_id === null),
    [chores]
  );

  const completeMut = useMutation({
    mutationFn: (payload: { chore_id: number; person_id?: number }) =>
      api.recordCompletion(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["allowance-week"] }),
  });

  const undoMut = useMutation({
    mutationFn: (id: number) => api.deleteCompletion(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["allowance-week"] }),
  });

  const payoutMut = useMutation({
    mutationFn: (person_id: number) =>
      api.payOutAllowance({ person_id, day: toDateString(refDay) }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["allowance-week"] }),
  });

  if (people.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="text-5xl mb-3">🧒</div>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-1">
          Add family members to start
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-md">
          Add a person, then a chore. Checking off a chore earns points; points convert to dollars for weekly allowance.
        </p>
        <button
          onClick={() => setPeopleOpen(true)}
          className="rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-5 py-3 font-medium"
        >
          + Add first person
        </button>
        {peopleOpen && <PeopleModal onClose={() => setPeopleOpen(false)} />}
      </div>
    );
  }

  const rangeLabel = summary
    ? `${format(new Date(summary.week_start + "T00:00:00"), "MMM d")} – ${format(new Date(summary.week_end + "T00:00:00"), "MMM d")}`
    : "";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setChoreOpen({ mode: "new" })}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            ✨ New chore
          </button>
          <button
            onClick={() => setPeopleOpen(true)}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            👥 People
          </button>
        </div>
        <div className="text-center flex-1">
          <div className="text-lg font-semibold text-[var(--text)]">Chores</div>
          <div className="text-sm text-[var(--text-muted)]">{rangeLabel}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRefDay(addDays(refDay, -7))}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            ‹
          </button>
          <button
            onClick={() => setRefDay(new Date())}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            Today
          </button>
          <button
            onClick={() => setRefDay(addDays(refDay, 7))}
            className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm font-medium"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pr-1">
        {summary?.people.map((ps) => (
          <PersonCard
            key={ps.person.id}
            summary={ps}
            chores={chores.filter((c) => c.person_id === ps.person.id)}
            unassignedChores={unassignedChores}
            onComplete={(chore) =>
              completeMut.mutate({
                chore_id: chore.id,
                person_id: ps.person.id,
              })
            }
            onUndo={(completionId) => undoMut.mutate(completionId)}
            onPayout={() => {
              if (confirm(`Mark ${dollars(ps.earnings_cents)} as paid to ${ps.person.name}?`))
                payoutMut.mutate(ps.person.id);
            }}
            onEditChore={(c) => setChoreOpen({ mode: "edit", chore: c })}
          />
        ))}
      </div>

      {peopleOpen && <PeopleModal onClose={() => setPeopleOpen(false)} />}
      {choreOpen && (
        <AllowanceChoreModal
          initial={choreOpen.mode === "edit" ? choreOpen.chore : null}
          people={people}
          onClose={() => setChoreOpen(null)}
        />
      )}
    </div>
  );
}

function PersonCard({
  summary,
  chores,
  unassignedChores,
  onComplete,
  onUndo,
  onPayout,
  onEditChore,
}: {
  summary: PersonWeekSummary;
  chores: AllowanceChore[];
  unassignedChores: AllowanceChore[];
  onComplete: (chore: AllowanceChore) => void;
  onUndo: (completionId: number) => void;
  onPayout: () => void;
  onEditChore: (chore: AllowanceChore) => void;
}) {
  const { person, points_total, earnings_cents, completions } = summary;
  const openCompletions = completions.filter((c) => c.paid_out_at === null);

  const completionsByChore = useMemo(() => {
    const map = new Map<number, typeof completions>();
    for (const c of openCompletions) {
      const list = map.get(c.chore_id) ?? [];
      list.push(c);
      map.set(c.chore_id, list);
    }
    return map;
  }, [openCompletions]);

  return (
    <div
      className="rounded-2xl bg-[var(--card)] p-4 flex flex-col"
      style={{ borderTop: `4px solid ${person.color}` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-3xl">{person.emoji || "🙂"}</div>
          <div className="min-w-0">
            <div className="font-semibold text-[var(--text)] truncate">
              {person.name}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {points_total} pt{points_total === 1 ? "" : "s"} ·{" "}
              <span className="text-[var(--text)] font-medium">
                {dollars(earnings_cents)}
              </span>
            </div>
          </div>
        </div>
        {earnings_cents > 0 && (
          <button
            onClick={onPayout}
            className="rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent)]/30 text-[var(--accent)] px-2 py-1 text-xs font-medium shrink-0"
          >
            💰 Pay out
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {chores.map((c) => {
          const done = completionsByChore.get(c.id) ?? [];
          return (
            <ChoreRow
              key={c.id}
              chore={c}
              completionCount={done.length}
              onTap={() => onComplete(c)}
              onUndo={done.length > 0 ? () => onUndo(done[done.length - 1].id) : undefined}
              onEdit={() => onEditChore(c)}
            />
          );
        })}
        {chores.length === 0 && unassignedChores.length === 0 && (
          <li className="text-xs text-[var(--text-muted)] text-center py-3">
            No chores yet.
          </li>
        )}
      </ul>

      {unassignedChores.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mt-4 mb-1">
            Shared chores
          </div>
          <ul className="space-y-1.5">
            {unassignedChores.map((c) => {
              const done = completionsByChore.get(c.id) ?? [];
              return (
                <ChoreRow
                  key={c.id}
                  chore={c}
                  completionCount={done.length}
                  onTap={() => onComplete(c)}
                  onUndo={done.length > 0 ? () => onUndo(done[done.length - 1].id) : undefined}
                  onEdit={() => onEditChore(c)}
                />
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ChoreRow({
  chore,
  completionCount,
  onTap,
  onUndo,
  onEdit,
}: {
  chore: AllowanceChore;
  completionCount: number;
  onTap: () => void;
  onUndo?: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-[var(--card-strong)] px-2 py-2">
      <button
        onClick={onTap}
        className="flex-1 flex items-center gap-2 text-left min-w-0"
      >
        <span className="text-lg shrink-0">{chore.emoji || "✅"}</span>
        <span className="flex-1 text-sm text-[var(--text)] truncate">
          {chore.name}
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">
          {chore.points} pt{chore.points === 1 ? "" : "s"}
        </span>
        {completionCount > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold px-1.5 py-0.5 min-w-5 text-center">
            ×{completionCount}
          </span>
        )}
      </button>
      {onUndo && (
        <button
          onClick={onUndo}
          aria-label="Undo last completion"
          title="Undo last completion"
          className="text-[var(--text-muted)] hover:text-[var(--danger)] text-sm px-1"
        >
          ↶
        </button>
      )}
      <button
        onClick={onEdit}
        aria-label="Edit chore"
        title="Edit chore"
        className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs px-1"
      >
        ⋯
      </button>
    </li>
  );
}
