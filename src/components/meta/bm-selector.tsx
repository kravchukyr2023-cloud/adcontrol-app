"use client";

export type MetaBmOption = {
  id: string;
  name: string;
};

type Props = {
  bms: MetaBmOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
};

export default function BmSelector({
  bms,
  selectedId,
  onSelect,
  loading,
  disabled,
}: Props) {
  return (
    <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Business Manager</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Choose one Business Manager for this project (V1 — single selection).
        </p>
      </div>

      {loading && (
        <p className="text-sm text-zinc-500">Loading Business Managers…</p>
      )}

      {!loading && bms.length === 0 && (
        <p className="text-sm text-zinc-500">
          No Business Managers found on this Meta account.
        </p>
      )}

      {!loading && bms.length > 0 && (
        <div className="space-y-2">
          {bms.map((bm) => {
            const active = bm.id === selectedId;
            return (
              <button
                type="button"
                key={bm.id}
                onClick={() => onSelect(bm.id)}
                disabled={disabled}
                className={
                  active
                    ? "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#6D5EF8] bg-[#6D5EF8]/15 text-left transition disabled:opacity-50"
                    : "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[#1B2238] hover:border-zinc-700 bg-[#050816] text-left transition disabled:opacity-50"
                }
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{bm.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    Meta ID: {bm.id}
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
