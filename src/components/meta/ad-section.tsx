"use client";

import { useEffect, useState } from "react";

/**
 * Drill-down level 3: ads belonging to a single ad set.
 *
 * Lifecycle:
 *   - Mounts when the parent ad-set row is expanded.
 *   - Owns its own fetch state (loading / data / error / retry).
 *   - Unmounts when parent collapses or the global period changes —
 *     by design, the parent table drops drill-down state in those
 *     cases so a remount is a fresh fetch.
 */

type AdRow = {
  id: string;
  meta_ad_id: string;
  name: string | null;
  effective_status: string | null;
  creative_type: string | null;
  utm: string | null;
  spend: number;
  purchases: number;
  revenue: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
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
function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(2)}%`;
}
function fmtRoas(v: number | null): string {
  if (v === null) return "—";
  return `×${v.toFixed(2)}`;
}

// Creative-type → badge color. `null` ⇒ "Other" (zinc); future types
// (video/static/ugc/carousel) land here as creative-sync is built.
const TYPE_BADGE: Record<string, string> = {
  video: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  static: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  ugc: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  carousel: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
};
function typeLabel(t: string | null): string {
  if (!t) return "Other";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function AdSection({ adsetId, since, until, currency }: Props) {
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
    return (
      <p className="text-xs text-zinc-500 py-3 px-1">Loading ads…</p>
    );
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
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="text-[9px] text-zinc-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Ad</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-right px-3 py-2 font-medium">Spend</th>
              <th className="text-right px-3 py-2 font-medium">Purch.</th>
              <th className="text-right px-3 py-2 font-medium">CPA</th>
              <th className="text-right px-3 py-2 font-medium">Impr.</th>
              <th className="text-right px-3 py-2 font-medium">CPM</th>
              <th className="text-right px-3 py-2 font-medium">Clicks</th>
              <th className="text-right px-3 py-2 font-medium">CPC</th>
              <th className="text-right px-3 py-2 font-medium">CTR</th>
              <th className="text-right px-3 py-2 font-medium">Revenue</th>
              <th className="text-right px-3 py-2 font-medium">ROAS</th>
              <th className="text-left px-3 py-2 font-medium">UTM</th>
              <th className="text-right px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const badge =
                (r.creative_type && TYPE_BADGE[r.creative_type]) ||
                "bg-zinc-500/10 border-zinc-500/30 text-zinc-300";
              return (
                <tr
                  key={r.id}
                  className="border-t border-[#1B2238]/60 hover:bg-white/[0.02] transition"
                >
                  <td className="px-3 py-2 text-left">
                    <div className="text-white truncate max-w-[240px]">
                      {r.name ?? "—"}
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-0.5">
                      {r.meta_ad_id}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium border ${badge}`}
                    >
                      {typeLabel(r.creative_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-white font-medium">
                    {fmtMoney(currency, r.spend)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtInt(r.purchases)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtMoney(currency, r.cpa)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtInt(r.impressions)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtMoney(currency, r.cpm)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtInt(r.clicks)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtMoney(currency, r.cpc)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtPct(r.ctr)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtMoney(currency, r.revenue)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {fmtRoas(r.roas)}
                  </td>
                  <td className="px-3 py-2 text-left text-zinc-400 truncate max-w-[160px]">
                    {r.utm ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Diagnosis is placeholder (T-feature). Disabled by
                        design — wired to nothing yet. */}
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="text-[10px] text-zinc-600 cursor-not-allowed border border-[#1B2238] rounded-md px-2 py-1"
                    >
                      Open Diagnosis
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
