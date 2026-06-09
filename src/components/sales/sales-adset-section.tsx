"use client";

import { useEffect, useState } from "react";
import SalesAdSection from "./sales-ad-section";

/**
 * /sales-specific drill-down level 2: ad sets under a single campaign.
 *
 * Same data source as `/meta`'s AdsetSection (`/api/meta/adsets`), but
 * a different column set (Meta vs Real pairs, no Audience/CTR/CPM).
 */

type AdsetRow = {
  id: string;
  meta_adset_id: string;
  name: string | null;
  effective_status: string | null;
  spend: number;
  purchases: number;
  revenue: number | null;
  cpa: number | null;
  roas: number | null;
};

type Props = {
  campaignId: string;
  since: string;
  until: string;
  currency: string;
};

function fmtMoney(currency: string, v: number | null): string {
  if (v === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}
function fmtInt(v: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}
function fmtRoas(v: number | null): string {
  if (v === null) return "—";
  return `×${v.toFixed(2)}`;
}

export default function SalesAdsetSection({
  campaignId,
  since,
  until,
  currency,
}: Props) {
  const [rows, setRows] = useState<AdsetRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Per-adset expand state. Cleared automatically when the parent
  // campaign row collapses (this component unmounts).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          campaign_id: campaignId,
          since,
          until,
        });
        const resp = await fetch(`/api/meta/adsets?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setError(
            typeof data?.error === "string"
              ? data.error
              : "Failed to load ad sets"
          );
          setLoading(false);
          return;
        }
        setRows((data.adsets ?? []) as AdsetRow[]);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load ad sets"
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, since, until, retryTick]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <p className="text-xs text-zinc-500 py-3 px-1">Loading ad sets…</p>;
  }
  if (error) {
    return (
      <div className="flex items-center gap-3 text-xs py-3 px-1">
        <span className="text-rose-300">{error}</span>
        <button
          type="button"
          onClick={() => setRetryTick((v) => v + 1)}
          className="text-[#a99cff] hover:text-white transition"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-xs text-zinc-500 py-3 px-1">
        No ad sets for this campaign in the selected period.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        Ad sets ({rows.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1000px]">
          <thead className="text-[9px] text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="w-6"></th>
              <th className="text-left px-3 py-2 font-medium">Ad set</th>
              <th className="text-right px-3 py-2 font-medium">Spend</th>
              <th className="text-right px-3 py-2 font-medium">Meta rev</th>
              <th className="text-right px-3 py-2 font-medium">Real rev</th>
              <th className="text-right px-3 py-2 font-medium">Meta sales</th>
              <th className="text-right px-3 py-2 font-medium">Real sales</th>
              <th className="text-right px-3 py-2 font-medium">Meta CPA</th>
              <th className="text-right px-3 py-2 font-medium">Real CPA</th>
              <th className="text-right px-3 py-2 font-medium">Meta ROAS</th>
              <th className="text-right px-3 py-2 font-medium">Real ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = expanded.has(r.id);
              return (
                <RowGroup key={r.id}>
                  <tr className="border-t border-[#1B2238]/60 hover:bg-white/[0.02] transition">
                    <td className="px-1 py-2 text-center align-top">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Collapse ads" : "Expand ads"}
                        className="text-[#a99cff] hover:text-white transition"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isOpen ? "rotate(90deg)" : "rotate(0)",
                            transition: "transform 120ms ease",
                          }}
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-left">
                      <div className="text-white truncate max-w-[260px]">
                        {r.name ?? "—"}
                      </div>
                      <div className="text-[9px] text-zinc-500 mt-0.5">
                        {r.meta_adset_id}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-white font-medium">
                      {fmtMoney(currency, r.spend)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-200">
                      {fmtMoney(currency, r.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">—</td>
                    <td className="px-3 py-2 text-right text-zinc-200">
                      {fmtInt(r.purchases)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">—</td>
                    <td className="px-3 py-2 text-right text-zinc-200">
                      {fmtMoney(currency, r.cpa)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">—</td>
                    <td className="px-3 py-2 text-right text-zinc-200">
                      {fmtRoas(r.roas)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">—</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td></td>
                      <td colSpan={10} className="px-3 pb-3">
                        <div className="pl-4 border-l border-[#1B2238]/70">
                          <SalesAdSection
                            adsetId={r.id}
                            since={since}
                            until={until}
                            currency={currency}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </RowGroup>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
