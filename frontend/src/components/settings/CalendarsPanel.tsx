import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { AccountInfo, CalendarProfile, DiscoveredCalendar } from "../../types";

const DEFAULT_COLORS = [
  "#FF6B6B",
  "#4A90E2",
  "#4ECDC4",
  "#F5A623",
  "#7B61FF",
  "#2ECC71",
  "#E056FD",
  "#FF9F43",
];

export function CalendarsPanel() {
  const { data: accounts = [] } = useQuery<AccountInfo[]>({
    queryKey: ["accounts"],
    queryFn: api.listAccounts,
  });
  const { data: profiles = [] } = useQuery<CalendarProfile[]>({
    queryKey: ["calendar-profiles"],
    queryFn: api.listCalendarProfiles,
  });

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-[var(--text-muted)]">
        Add an Apple ID on the Accounts tab first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {accounts.map((acct) => (
        <AccountCalendarsSection
          key={acct.id}
          account={acct}
          profiles={profiles.filter((p) => p.account_id === acct.id)}
        />
      ))}
    </div>
  );
}

function AccountCalendarsSection({
  account,
  profiles,
}: {
  account: AccountInfo;
  profiles: CalendarProfile[];
}) {
  const queryClient = useQueryClient();
  const [discoverOpen, setDiscoverOpen] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  return (
    <div className="rounded-xl bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-medium text-[var(--text)]">{account.apple_id}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {profiles.length} calendar{profiles.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={() => setDiscoverOpen((v) => !v)}
          className="rounded-lg bg-[var(--card-strong)] hover:bg-[var(--card-hover)] text-[var(--text)] px-3 py-2 text-sm"
        >
          {discoverOpen ? "Hide" : "Add from iCloud"}
        </button>
      </div>

      {discoverOpen && (
        <DiscoverList
          accountId={account.id}
          onAdded={() => {
            invalidate();
          }}
        />
      )}

      <ul className="space-y-2 mt-3">
        {profiles.map((p) => (
          <CalendarRow key={p.id} profile={p} onChange={invalidate} />
        ))}
        {profiles.length === 0 && !discoverOpen && (
          <li className="text-[var(--text-muted)] text-sm text-center py-4">
            No calendars configured yet.
          </li>
        )}
      </ul>
    </div>
  );
}

function DiscoverList({
  accountId,
  onAdded,
}: {
  accountId: string;
  onAdded: () => void;
}) {
  const { data: discovered = [], isFetching } = useQuery<DiscoveredCalendar[]>({
    queryKey: ["discover", accountId],
    queryFn: () => api.discoverForAccount(accountId),
  });

  const addMut = useMutation({
    mutationFn: (d: DiscoveredCalendar) =>
      api.createCalendarProfile({
        account_id: d.account_id,
        display_name: d.display_name,
        person: d.display_name,
        color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
        enabled: true,
      }),
    onSuccess: onAdded,
  });

  if (isFetching) {
    return <div className="text-[var(--text-muted)] text-sm py-3">Discovering…</div>;
  }

  return (
    <ul className="space-y-2 mb-3">
      {discovered.map((d) => (
        <li
          key={d.url}
          className="flex items-center justify-between rounded-lg bg-[var(--card-strong)] px-3 py-2"
        >
          <div className="text-sm text-[var(--text)]">{d.display_name}</div>
          {d.already_added ? (
            <span className="text-xs text-[var(--text-muted)]">Already added</span>
          ) : (
            <button
              onClick={() => addMut.mutate(d)}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 text-sm"
            >
              Add
            </button>
          )}
        </li>
      ))}
      {discovered.length === 0 && (
        <li className="text-[var(--text-muted)] text-sm text-center py-3">
          No calendars found for this account.
        </li>
      )}
    </ul>
  );
}

function CalendarRow({
  profile,
  onChange,
}: {
  profile: CalendarProfile;
  onChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(profile);

  const updateMut = useMutation({
    mutationFn: (patch: Partial<CalendarProfile>) =>
      api.updateCalendarProfile(profile.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-profiles"] });
      onChange();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteCalendarProfile(profile.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-profiles"] });
      onChange();
    },
  });

  return (
    <li className="rounded-lg bg-[var(--card-strong)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={() =>
            updateMut.mutate({ enabled: !profile.enabled })
          }
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] ${
            profile.enabled
              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
              : "border-[var(--text-faint)]"
          }`}
          aria-label={profile.enabled ? "Disable" : "Enable"}
        >
          {profile.enabled ? "✓" : ""}
        </button>
        <span
          className="w-4 h-4 rounded-sm shrink-0"
          style={{ background: profile.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[var(--text)] truncate">
            {profile.display_name}
          </div>
          <div className="text-xs text-[var(--text-muted)] truncate">
            {profile.person}
            {profile.category ? ` · ${profile.category}` : ""}
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm px-2"
        >
          {expanded ? "Done" : "Edit"}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--border)] pt-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Person
            </label>
            <input
              value={draft.person}
              onChange={(e) => setDraft({ ...draft, person: e.target.value })}
              onBlur={() =>
                draft.person !== profile.person &&
                updateMut.mutate({ person: draft.person })
              }
              className="w-full rounded-lg bg-[var(--card)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Category (optional)
            </label>
            <input
              value={draft.category ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, category: e.target.value || null })
              }
              onBlur={() =>
                draft.category !== profile.category &&
                updateMut.mutate({ category: draft.category })
              }
              placeholder="Soccer, Work, Practice…"
              className="w-full rounded-lg bg-[var(--card)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, color: c });
                    updateMut.mutate({ color: c });
                  }}
                  style={{ background: c }}
                  className={`w-8 h-8 rounded-md ${
                    draft.color === c ? "ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--surface)]" : ""
                  }`}
                />
              ))}
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                onBlur={() =>
                  draft.color !== profile.color &&
                  updateMut.mutate({ color: draft.color })
                }
                className="w-8 h-8 rounded-md bg-transparent border-0 cursor-pointer"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={draft.writable}
              onChange={(e) => {
                setDraft({ ...draft, writable: e.target.checked });
                updateMut.mutate({ writable: e.target.checked });
              }}
            />
            Allow editing events from this dashboard
          </label>
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (confirm(`Remove "${profile.display_name}"? It will stop displaying and its cached events will be cleared.`))
                  deleteMut.mutate();
              }}
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)] px-3 py-1.5 rounded-lg text-sm"
            >
              Remove calendar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
