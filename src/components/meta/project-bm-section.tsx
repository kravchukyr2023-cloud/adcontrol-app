"use client";

import { useEffect, useState } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { MetaOverviewBusinessManager } from "@/hooks/use-meta-overview";

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Risk Review",
  8: "Pending Settlement",
  9: "In Grace Period",
  100: "Pending Closure",
  101: "Closed",
};

type AvailableAa = {
  id: string;
  name: string;
  account_status: number | null;
  currency: string | null;
};

type Props = {
  bm: MetaOverviewBusinessManager;
  /** Active project this BM section belongs to — used to scope /api/meta/ad-accounts to the project's connection. */
  projectId: string;
  /**
   * True when the project has reached its per-project Ad Account limit.
   * In that state, unselected AAs are disabled; already-selected AAs can
   * still be toggled off.
   */
  atAaLimit: boolean;
  /** Per-project AA limit from current plan (for inline message). */
  aaLimit: number;
  /** Current plan name (for inline message). */
  planName: string;
  onChanged: () => void;
};

/**
 * BM section card with AA toggle list + Remove BM.
 * Used inside Data Sources Meta Ads card.
 */
export default function ProjectBmSection({
  bm,
  projectId,
  atAaLimit,
  aaLimit,
  planName,
  onChanged,
}: Props) {
  const { plan } = useEntitlements();
  const [available, setAvailable] = useState<AvailableAa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [quotaBanner, setQuotaBanner] = useState<{
    scope: "bm" | "aa";
    limit: number;
    used: number;
  } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const selectedByMetaId = new Map(
    bm.ad_accounts
      .filter((a) => a.meta_ad_account_id)
      .map((a) => [a.meta_ad_account_id!, a])
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!bm.meta_bm_id) {
        if (!cancelled) {
          setAvailable([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
      try {
        const resp = await fetch(
          `/api/meta/ad-accounts?bmId=${encodeURIComponent(bm.meta_bm_id)}&project_id=${encodeURIComponent(projectId)}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (data.error) setError(String(data.error));
        const list = (data.accounts ?? []) as AvailableAa[];
        setAvailable(list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load Ad Accounts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bm.meta_bm_id, projectId]);

  async function toggleAa(aa: AvailableAa) {
    setPendingId(aa.id);
    setQuotaBanner(null);
    setError(null);
    const existing = selectedByMetaId.get(aa.id);
    try {
      if (existing) {
        const resp = await fetch(`/api/meta/project-aas/${existing.id}`, {
          method: "DELETE",
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error || "Failed to deselect");
        }
      } else {
        const resp = await fetch("/api/meta/project-aas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_meta_business_manager_id: bm.id,
            meta_ad_account_id: aa.id,
          }),
        });
        if (resp.status === 402) {
          const d = await resp.json().catch(() => ({}));
          setQuotaBanner({
            scope: d.scope,
            limit: Number(d.limit ?? 0),
            used: Number(d.used ?? 0),
          });
          return;
        }
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error || "Failed to select");
        }
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemoveBm() {
    setRemoving(true);
    try {
      const resp = await fetch(`/api/meta/project-bms/${bm.id}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || "Failed to remove BM");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoving(false);
      setRemoveOpen(false);
    }
  }

  return (
    <div className="border border-[#1B2238] rounded-xl bg-[#050816]/40">
      <div className="px-4 py-3 border-b border-[#1B2238] flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {bm.name ?? "—"}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">
            Meta ID: {bm.meta_bm_id ?? "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRemoveOpen(true)}
          className="h-8 px-3 rounded-lg border border-[#1B2238] hover:border-rose-500/50 hover:text-rose-300 text-xs text-zinc-400 transition shrink-0"
        >
          Remove BM
        </button>
      </div>

      <div className="p-3 space-y-2">
        {loading && (
          <p className="text-sm text-zinc-500 px-2 py-3">
            Loading Ad Accounts…
          </p>
        )}

        {error && (
          <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {quotaBanner && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg px-3 py-2 text-xs text-amber-200">
            {quotaBanner.scope === "bm"
              ? `Business Manager limit reached for this project. Your ${plan.name} plan allows ${quotaBanner.limit} BM${quotaBanner.limit === 1 ? "" : "s"} per project.`
              : `Ad Account limit reached for this project. Your ${plan.name} plan allows ${quotaBanner.limit} Ad Account${quotaBanner.limit === 1 ? "" : "s"} per project.`}
          </div>
        )}

        {atAaLimit && !quotaBanner && (
          <div className="border border-zinc-500/20 bg-black/30 rounded-lg px-3 py-2 text-xs text-zinc-400">
            Ad Account limit reached for this project. Your {planName} plan
            allows {aaLimit} Ad Account{aaLimit === 1 ? "" : "s"} per project.
            Deselect an Ad Account first or upgrade plan.
          </div>
        )}

        {!loading && available.length === 0 && (
          <p className="text-sm text-zinc-500 px-2 py-3">
            No Ad Accounts owned by this Business Manager.
          </p>
        )}

        {!loading &&
          available.map((aa) => {
            const selected = selectedByMetaId.has(aa.id);
            const pending = pendingId === aa.id;
            // Block selecting MORE when at limit; always allow deselect.
            const blockedByLimit = atAaLimit && !selected;
            const disabled = pending || blockedByLimit;
            const statusLabel =
              aa.account_status != null
                ? ACCOUNT_STATUS_LABELS[aa.account_status] ??
                  `Status ${aa.account_status}`
                : "Status unknown";
            return (
              <button
                key={aa.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleAa(aa)}
                className={
                  selected
                    ? "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[#6D5EF8] bg-[#6D5EF8]/15 text-left transition disabled:opacity-50"
                    : "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[#1B2238] hover:border-zinc-700 bg-[#050816] text-left transition disabled:opacity-50 disabled:cursor-not-allowed"
                }
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{aa.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {aa.id} · {statusLabel}
                    {aa.currency ? ` · ${aa.currency}` : ""}
                  </p>
                </div>
                <span
                  className={
                    selected
                      ? "w-5 h-5 rounded border-2 border-[#a99cff] bg-[#6D5EF8] flex items-center justify-center shrink-0"
                      : "w-5 h-5 rounded border border-[#1B2238] shrink-0"
                  }
                >
                  {selected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
      </div>

      {removeOpen && (
        <div
          onClick={() => !removing && setRemoveOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-2xl p-6"
          >
            <h3 className="text-base font-semibold mb-2">
              Remove this Business Manager?
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
              <span className="text-white">{bm.name}</span> and all its selected
              Ad Accounts will be removed from this project. Bindings are
              soft-deactivated; sync history is preserved.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRemoveOpen(false)}
                disabled={removing}
                className="flex-1 h-10 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-sm text-zinc-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveBm}
                disabled={removing}
                className="flex-1 h-10 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
