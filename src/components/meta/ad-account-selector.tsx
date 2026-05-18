"use client";

export type MetaAdAccountOption = {
  id: string;
  name: string;
  account_status: number | null;
  currency: string | null;
};

type Props = {
  accounts: MetaAdAccountOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
  bmSelected: boolean;
};

const STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Risk Review",
  8: "Pending Settlement",
  9: "In Grace Period",
  100: "Pending Closure",
  101: "Closed",
  201: "Any Active",
  202: "Any Closed",
};

export default function AdAccountSelector({
  accounts,
  selectedId,
  onSelect,
  loading,
  disabled,
  bmSelected,
}: Props) {
  return (
    <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Active Ad Account</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Choose one Ad Account for this project (V1 — single active account).
        </p>
      </div>

      {!bmSelected && (
        <p className="text-sm text-zinc-500">
          Select a Business Manager first.
        </p>
      )}

      {bmSelected && loading && (
        <p className="text-sm text-zinc-500">Loading Ad Accounts…</p>
      )}

      {bmSelected && !loading && accounts.length === 0 && (
        <p className="text-sm text-zinc-500">
          No Ad Accounts owned by this Business Manager.
        </p>
      )}

      {bmSelected && !loading && accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((a) => {
            const active = a.id === selectedId;
            const statusLabel =
              a.account_status !== null
                ? STATUS_LABELS[a.account_status] ?? `Status ${a.account_status}`
                : "Status unknown";

            return (
              <button
                type="button"
                key={a.id}
                onClick={() => onSelect(a.id)}
                disabled={disabled}
                className={
                  active
                    ? "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#6D5EF8] bg-[#6D5EF8]/15 text-left transition disabled:opacity-50"
                    : "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#1B2238] hover:border-zinc-700 bg-[#050816] text-left transition disabled:opacity-50"
                }
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{a.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {a.id} · {statusLabel}
                    {a.currency ? ` · ${a.currency}` : ""}
                  </p>
                </div>
                <span
                  className={
                    active
                      ? "w-4 h-4 rounded-full border-2 border-[#a99cff] bg-[#6D5EF8] shrink-0"
                      : "w-4 h-4 rounded-full border border-[#1B2238] shrink-0"
                  }
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
