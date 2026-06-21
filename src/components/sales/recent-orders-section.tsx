"use client";

import { useState } from "react";
import type { SalesRecentOrder } from "@/hooks/use-sales-analytics";

type Props = {
  projectId: string | null;
  loading: boolean;
  error: string | null;
  orders: SalesRecentOrder[];
  matchedCount: number;
  unmatchedCount: number;
  manualCount: number;
  onRematched: () => void;
};

function formatMoney(currency: string, v: number): string {
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

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AttributionBadge({
  attribution_status: status,
  matched_campaign_name,
  matched_adset_name,
  matched_ad_name,
}: SalesRecentOrder) {
  const cls: Record<string, string> = {
    matched: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    partial: "text-amber-300 border-amber-500/30 bg-amber-500/10",
    unmatched: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    manual: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  };
  const dotCls: Record<string, string> = {
    matched: "bg-emerald-400",
    partial: "bg-amber-400",
    unmatched: "bg-rose-400",
    manual: "bg-violet-400",
  };

  const label =
    status === "matched"
      ? "Matched"
      : status === "partial"
      ? "Partial"
      : status === "manual"
      ? "Manual"
      : "Unmatched";

  const detail =
    status === "matched"
      ? matched_ad_name ?? matched_adset_name ?? matched_campaign_name ?? null
      : status === "partial"
      ? matched_adset_name ?? matched_campaign_name ?? null
      : null;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
          cls[status] ?? cls.unmatched
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            dotCls[status] ?? dotCls.unmatched
          }`}
        />
        {label}
      </span>
      {detail && (
        <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">
          → {detail}
        </span>
      )}
    </div>
  );
}

const COLS = [
  "Date",
  "Customer",
  "Source",
  "Product",
  "Revenue",
  "Attribution",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

function SourceBadge({ source_type }: { source_type: string | null }) {
  // Brand-tinted neutral badge — Shopify emerald (their brand green),
  // Google Sheets sky (their brand blue), manual zinc. Unknown source
  // is intentionally rendered as an em-dash so the column stays compact
  // without padding around an invisible element.
  if (!source_type) {
    return <span className="text-zinc-500">—</span>;
  }

  let cls: string;
  let label: string;
  switch (source_type) {
    case "shopify":
      cls = "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
      label = "Shopify";
      break;
    case "google_sheets":
      cls = "text-sky-300 border-sky-500/30 bg-sky-500/10";
      label = "Sheets";
      break;
    case "manual":
      cls = "text-zinc-300 border-zinc-700/60 bg-zinc-700/20";
      label = "Manual";
      break;
    default:
      return <span className="text-zinc-500">—</span>;
  }

  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

export default function RecentOrdersSection({
  projectId,
  loading,
  error,
  orders,
  matchedCount,
  unmatchedCount,
  manualCount,
  onRematched,
}: Props) {
  const [rematching, setRematching] = useState(false);
  const [rematchBanner, setRematchBanner] = useState<string | null>(null);

  async function handleRematch() {
    if (!projectId) return;
    setRematching(true);
    setRematchBanner(null);
    try {
      const resp = await fetch("/api/attribution/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        matched?: number;
        partial?: number;
        unmatched?: number;
        updated?: number;
        considered?: number;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setRematchBanner(data.error ?? `Re-match failed (${resp.status})`);
      } else {
        setRematchBanner(
          `Re-matched ${data.considered ?? 0} orders — ${data.matched ?? 0} matched, ${
            data.partial ?? 0
          } partial, ${data.unmatched ?? 0} unmatched (${data.updated ?? 0} updated)`
        );
        onRematched();
      }
    } catch (err) {
      setRematchBanner(
        err instanceof Error ? err.message : "Network error"
      );
    } finally {
      setRematching(false);
    }
  }

  return (
    <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1B2238] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Recent Orders</h3>
          <span className="text-xs text-zinc-500">
            {orders.length} most recent
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-zinc-200">{matchedCount}</span> matched
            </span>
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span className="text-zinc-200">{unmatchedCount}</span> unmatched
            </span>
            {manualCount > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="text-zinc-200">{manualCount}</span> manual
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleRematch}
            disabled={rematching || !projectId}
            title="Re-run UTM-based attribution against the latest Meta entities"
            className="h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition disabled:opacity-50"
          >
            {rematching ? "Re-matching…" : "Re-run attribution"}
          </button>
        </div>
      </div>

      {rematchBanner && (
        <div className="px-6 py-3 border-b border-[#1B2238] text-xs text-zinc-300 bg-black/30">
          {rematchBanner}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
            <tr>
              {COLS.map((c, i) => (
                <th
                  key={c}
                  className={
                    i === 0
                      ? "text-left px-6 py-3 font-medium"
                      : "text-left px-3 py-3 font-medium"
                  }
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  Loading orders…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="text-center px-6 py-12 text-rose-400 text-sm"
                >
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && orders.length === 0 && (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  No orders yet.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              orders.map((o) => {
                const customer =
                  o.customer_name ?? o.customer_email ?? "—";
                return (
                  <tr
                    key={o.id}
                    className="border-t border-[#1B2238] hover:bg-white/[0.02] transition"
                  >
                    <td className="px-6 py-3 text-zinc-200">
                      {formatDate(o.order_date)}
                    </td>
                    <td className="px-3 py-3 text-zinc-200 truncate max-w-[180px]">
                      {customer}
                    </td>
                    <td className="px-3 py-3">
                      <SourceBadge source_type={o.source_type} />
                    </td>
                    <td className="px-3 py-3 text-zinc-300 truncate max-w-[180px]">
                      {o.product_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-white font-medium">
                      {formatMoney(o.currency, o.revenue)}
                    </td>
                    <td className="px-3 py-3">
                      <AttributionBadge {...o} />
                    </td>
                    <td className="px-3 py-3 text-zinc-400 truncate max-w-[160px]">
                      {o.utm_source ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-zinc-400 truncate max-w-[160px]">
                      {o.utm_medium ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-zinc-400 truncate max-w-[160px]">
                      {o.utm_campaign ?? "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
