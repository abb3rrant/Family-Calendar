import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { AccountInfo } from "../../types";

export function AccountsPanel() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: accounts = [] } = useQuery<AccountInfo[]>({
    queryKey: ["accounts"],
    queryFn: api.listAccounts,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <div className="text-sm text-[var(--text-soft)]">
        Each household member adds their Apple ID + app-specific password. The
        password is generated once at{" "}
        <a
          href="https://appleid.apple.com"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] underline"
        >
          appleid.apple.com
        </a>{" "}
        → Sign-In and Security → App-Specific Passwords.
      </div>

      <ul className="space-y-2">
        {accounts.map((acct) => (
          <li
            key={acct.id}
            className="flex items-center justify-between rounded-xl bg-[var(--card)] px-4 py-3"
          >
            <div>
              <div className="font-medium text-[var(--text)]">{acct.apple_id}</div>
              <div className="text-xs text-[var(--text-muted)]">id: {acct.id}</div>
            </div>
            <button
              onClick={() => {
                if (
                  confirm(
                    `Remove ${acct.apple_id}? All of its calendars and cached events will be deleted too.`
                  )
                )
                  deleteMut.mutate(acct.id);
              }}
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)] px-3 py-1.5 rounded-lg text-sm"
            >
              Remove
            </button>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="text-[var(--text-muted)] text-sm text-center py-6">
            No Apple IDs added yet.
          </li>
        )}
      </ul>

      {showAdd ? (
        <AddAccountForm onDone={() => {
          invalidate();
          setShowAdd(false);
        }} onCancel={() => setShowAdd(false)} />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-3 font-medium"
        >
          + Add Apple ID
        </button>
      )}
    </div>
  );
}

function AddAccountForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.createAccount({ apple_id: appleId, app_password: password }),
    onSuccess: onDone,
  });

  const inputCls =
    "w-full rounded-lg bg-[var(--card-strong)] text-[var(--text)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createMut.mutate();
      }}
      className="rounded-xl bg-[var(--card)] p-4 space-y-3"
    >
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Apple ID email
        </label>
        <input
          type="email"
          required
          value={appleId}
          onChange={(e) => setAppleId(e.target.value)}
          className={inputCls}
          placeholder="you@icloud.com"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          App-specific password
        </label>
        <input
          type="text"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder="abcd-efgh-ijkl-mnop"
          autoComplete="off"
        />
        <div className="text-xs text-[var(--text-muted)] mt-1">
          Not your regular Apple password. Generate one at appleid.apple.com.
        </div>
      </div>
      {createMut.error && (
        <div className="text-[var(--danger)] text-xs">
          {(createMut.error as Error).message}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text)] px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMut.isPending}
          className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
        >
          {createMut.isPending ? "Testing…" : "Add account"}
        </button>
      </div>
    </form>
  );
}
