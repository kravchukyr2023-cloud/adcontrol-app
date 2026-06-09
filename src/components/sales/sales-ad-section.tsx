"use client";

import { useEffect, useState } from "react";

/**
 * /sales-specific drill-down level 3: ads under a single ad set.
 *
 * Reuses the same `/api/meta/ads` endpoint as `/meta`'s AdSection but
 * renders a different column set: Meta vs Real pairs instead of
 * Audience/Type/CTR/CPM/UTM/Diagnosis. Kept as a separate component
 * (rather than parameterising AdSection) so /meta's already-shipped
 * drill-down stays unchanged.
 */

type AdRow = {
  id: string;
  meta_ad_id: string;
  name: string | null;
  effective_status: string | null;
  spend: number;
  purchases: number;
  revenue: number | null;
  cpa: number | null;
  roas: number | null;
};

type Props = {
  adsetId: string;
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

export default function SalesAdSection({
  adsetId,
  since,
  until,
  currency,
}: Props) {
  const [rows, setRows] = useState<AdRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          adset_id: adsetId,
          since,
          until,
        });
        const resp = await fetch(`/api/meta/ads?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setError(
            typeof data?.error === "string" ? data.error : "Failed to load ads"
          );
          setLoading(false);
          return;
        }
        // Keep only the subset of fields /sales needs — pass everything
        // through as the server already shapes it. Untouched fields just
        // go unread by the renderer below.
        setRows((data.ads ?? []) as AdRow[]);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load ads");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adsetId, since, until, retryTick]);

  if (loading) {
    return <p className="text-xs text-zinc-500 py-3 px-1">Loading ads…</p>;
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
        No ads for this ad set in the selected period.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
        Ads ({rows.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1000px]">
          <thead className="text-[9px] text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Ad</th>
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
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-[#1B2238]/60 hover:bg-white/[0.02] transition"
              >
                <td className="px-3 py-2 text-left">
                  <div className="text-white truncate max-w-[260px]">
                    {r.name ?? "—"}
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-0.5">
                    {r.meta_ad_id}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
