"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useActiveProject } from "@/hooks/use-active-project";
import { useGlobalPeriod } from "@/hooks/use-global-period";
import { useMetaAnalytics } from "@/hooks/use-meta-analytics";
import { useMetaOverview } from "@/hooks/use-meta-overview";
import { useSalesAnalytics } from "@/hooks/use-sales-analytics";
import DecisionEngineSection from "@/components/decisions/decision-engine-section";

const SPEND_BARS = [40, 55, 48, 70, 60, 75, 90];
const ROAS_POINTS_CAB = "0,80 30,60 60,65 90,45 120,55 150,35 180,40";
const ROAS_POINTS_REAL = "0,90 30,75 60,80 90,60 120,70 150,55 180,58";

const TOP_N = 5;

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  PAUSED: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  CAMPAIGN_PAUSED: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  ADSET_PAUSED: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  IN_PROCESS: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  WITH_ISSUES: "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

function statusLabel(effective: string | null): string {
  if (!effective) return "—";
  return effective
    .toLowerCase()
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function fmt(currency: string, value: number): string {
  if (!value) return `${currency} 0`;
  return `${currency} ${value.toLocaleString()}`;
}
function fmtMoneyOrDash(currency: string, value: number | null): string {
  if (value === null) return "—";
  return fmt(currency, value);
}
function fmtInt(v: number): string {
  return Math.round(v).toLocaleString();
}
function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(2)}%`;
}
function fmtRoasOrDash(v: number | null): string {
  if (v === null || v === 0) return "—";
  return `×${v.toFixed(2)}`;
}

/**
 * Local CPA. Returns null for division-by-zero or non-finite results so
 * callers can render an em dash instead of `Infinity` / `NaN` /
 * `currency 0` (which would be misleading).
 */
function cpaSafe(spend: number, purchases: number): number | null {
  if (purchases <= 0) return null;
  const v = spend / purchases;
  if (!Number.isFinite(v)) return null;
  return v;
}

export default function DashboardPage() {
  const { project } = useActiveProject();
  const projectId = project?.id ?? null;
  const { range } = useGlobalPeriod();

  // Hooks are unconditional. All three gracefully accept null projectId
  // and park in `status: 'idle'` until a real project is picked.
  const overview = useMetaOverview(projectId);
  const analytics = useMetaAnalytics(projectId, {
    since: range.since,
    until: range.until,
  });
  // Sales pulls REAL revenue from `orders` (Stage 19 ingest + Stage 21
  // attribution). Revenue + ROAS cards source from here per the Stage 23
  // hybrid philosophy: spend stays Meta, revenue moves to orders.
  const sales = useSalesAnalytics(projectId, {
    since: range.since,
    until: range.until,
  });

  // Top-5 by Spend desc. Spread before sort so we don't mutate the
  // analytics hook's internal array. Slice runs after sort so empty
  // periods just produce an empty list — cheap.
  const topCampaigns = useMemo(
    () =>
      [...analytics.campaigns]
        .sort((a, b) => b.spend - a.spend)
        .slice(0, TOP_N),
    [analytics.campaigns]
  );

  // Currency preference order:
  //   orders dominant → analytics AA → project default → USD fallback.
  // Orders dominant wins so the Revenue card uses the currency the user
  // actually types into their sheet on cold paint, before analytics
  // resolves.
  const currency =
    sales.summary.currency ??
    analytics.adAccounts[0]?.currency ??
    project?.currency ??
    "USD";

  // --- Full-page replacement: no active project selected ---
  if (!project) {
    return (
      <div className="border border-[#1B2238] rounded-2xl p-12 bg-[#0B1020]">
        <p className="text-sm text-zinc-400 text-center">
          Select a project to see dashboard data.
        </p>
      </div>
    );
  }

  const targetRevenue = project.monthly_revenue_goal ?? 0;
  const targetBudget = project.monthly_ad_budget ?? 0;
  const targetRoas = project.target_roas ?? 0;
  const targetCpa = project.target_cpa ?? 0;

  const spend = analytics.summary.spend ?? 0;
  const purchases = analytics.summary.purchases ?? 0;
  const cpaVal = cpaSafe(spend, purchases);

  // REVENUE + ROAS now come from `orders` (Stage 19 ingest). Real ROAS is
  // the hybrid orders-revenue / Meta-spend ratio. The card honestly shows
  // "—" when there are no orders yet; we deliberately do NOT fall back to
  // Meta's analytics.summary.revenue / roas — the whole point of these
  // cards is "Real", so a Meta fallback would mislead the user.
  const salesLoading = sales.status === "loading" || sales.status === "idle";
  const realRevenue = sales.summary.total_revenue;
  const realOrders = sales.summary.total_orders;
  const realRoasVal: number | null =
    realRevenue > 0 && spend > 0 ? realRevenue / spend : null;

  const noOrdersNote = "No sales data yet. Connect Google Sheets.";

  const KPIS = [
    {
      label: "Spend",
      value: fmt(currency, Math.round(spend)),
      note: `Budget ${fmt(currency, targetBudget)}`,
    },
    {
      label: "Revenue",
      value: salesLoading
        ? "…"
        : fmt(currency, Math.round(realRevenue)),
      note:
        realOrders === 0 && !salesLoading
          ? noOrdersNote
          : `Goal ${fmt(currency, targetRevenue)}`,
    },
    {
      label: "Purchases",
      value: fmtInt(purchases),
      note: "0 today",
    },
    {
      label: "CPA",
      value: cpaVal !== null ? fmt(currency, Math.round(cpaVal)) : "—",
      note: `Target ${fmt(currency, targetCpa)}`,
    },
    {
      label: "Real ROAS",
      value: salesLoading ? "…" : fmtRoasOrDash(realRoasVal),
      note:
        realOrders === 0 && !salesLoading
          ? "Connect Google Sheets for Real ROAS"
          : realRevenue > 0 && spend === 0
          ? "No Meta spend in this period"
          : `Target ${targetRoas ? targetRoas.toFixed(1) : "0.0"}x`,
    },
  ];

  // --- Table empty-state FSM ---
  // Order matters and mirrors /meta:
  //   1. loading   — overview OR analytics still settling
  //   2. error     — analytics fetch failed (rare; surface message)
  //   3. no_connection — overview settled, no BM has any bound AA.
  //                      Same heuristic /meta uses for `needs_setup`.
  //   4. no_data   — bindings exist but campaigns array is empty for
  //                  the active window
  //   5. ok        — render rows
  const overviewSettled =
    overview.status === "ready" || overview.status === "error";
  const analyticsSettled =
    analytics.status === "ready" || analytics.status === "error";
  const isLoading = !overviewSettled || !analyticsSettled;
  const hasAnyBinding = overview.business_managers.some(
    (b) => b.ad_accounts.length > 0
  );
  const totalCampaigns = analytics.campaigns.length;

  type TableMode = "loading" | "error" | "no_connection" | "no_data" | "ok";
  const tableMode: TableMode = isLoading
    ? "loading"
    : analytics.error
    ? "error"
    : !hasAnyBinding
    ? "no_connection"
    : totalCampaigns === 0
    ? "no_data"
    : "ok";

  return (
    <div className="space-y-6">

      <DecisionEngineSection projectId={projectId} />

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPIS.map((k) => (
          <div
            key={k.label}
            className="border border-[#1B2238] rounded-2xl p-5 bg-[#0B1020]"
          >
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {k.label}
            </p>
            <p className="text-2xl font-bold mt-2">{k.value}</p>
            <p className="text-xs text-zinc-500 mt-2">{k.note}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">
              Spend / Revenue / Revenue real
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">7d</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Bars placeholder — chart layer comes later.
          </p>
          <div className="flex items-end justify-between gap-2 h-40">
            {SPEND_BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-[#6D5EF8] to-[#a99cff] rounded-sm"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        <div className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">ROAS — cab vs real</h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">7d</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">Trend placeholder.</p>
          <svg viewBox="0 0 180 100" className="w-full h-40">
            <polyline
              points={ROAS_POINTS_CAB}
              stroke="#a99cff"
              fill="none"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <polyline
              points={ROAS_POINTS_REAL}
              stroke="#6D5EF8"
              fill="none"
              strokeWidth="2"
            />
          </svg>
          <div className="flex items-center gap-4 text-xs text-zinc-500 mt-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px bg-[#6D5EF8]" /> Real
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t border-dashed border-[#a99cff]" /> Cab
            </span>
          </div>
        </div>

      </section>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Top campaigns by spend</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-500">
              {tableMode === "ok"
                ? `Showing top ${topCampaigns.length} of ${totalCampaigns} campaign${totalCampaigns === 1 ? "" : "s"}`
                : "0 campaigns"}
            </span>
            <Link
              href="/meta"
              className="text-[#a99cff] hover:text-white transition"
            >
              View all →
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Campaign</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-right px-3 py-3 font-medium">Spend</th>
                <th className="text-right px-3 py-3 font-medium">Purchases</th>
                <th className="text-right px-3 py-3 font-medium">Meta ROAS</th>
                <th className="text-right px-3 py-3 font-medium">Real ROAS</th>
                <th className="text-right px-3 py-3 font-medium">CPA</th>
                <th className="text-right px-3 py-3 font-medium">CTR</th>
                <th className="text-right px-3 py-3 font-medium">CPC</th>
              </tr>
            </thead>
            <tbody>
              {tableMode === "ok" &&
                topCampaigns.map((c) => {
                  const badge =
                    (c.effective_status && STATUS_BADGE[c.effective_status]) ||
                    "bg-zinc-500/10 border-zinc-500/30 text-zinc-300";
                  const cpaCampaign = cpaSafe(c.spend, c.purchases);
                  const realAgg = sales.perCampaign[c.id] ?? null;
                  const realRoasCampaign =
                    realAgg && c.spend > 0 ? realAgg.revenue / c.spend : null;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[#1B2238] hover:bg-white/[0.02] transition"
                    >
                      <td className="px-6 py-3 text-left">
                        <div className="text-white truncate max-w-[280px]">
                          {c.campaign_name ?? "—"}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {c.meta_campaign_id}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-left">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${badge}`}
                        >
                          {statusLabel(c.effective_status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-white font-medium">
                        {fmt(currency, Math.round(c.spend))}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtInt(c.purchases)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtRoasOrDash(c.roas)}
                      </td>
                      <td className="px-3 py-3 text-right text-white font-medium">
                        {fmtRoasOrDash(realRoasCampaign)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoneyOrDash(
                          currency,
                          cpaCampaign !== null ? Math.round(cpaCampaign) : null
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtPct(c.ctr)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoneyOrDash(currency, c.cpc)}
                      </td>
                    </tr>
                  );
                })}

              {tableMode !== "ok" && (
                <tr>
                  <td colSpan={9} className="px-6 py-12">
                    {tableMode === "loading" && (
                      <p className="text-center text-zinc-500 text-sm">
                        Loading campaigns…
                      </p>
                    )}
                    {tableMode === "error" && (
                      <p className="text-center text-rose-400 text-sm">
                        {analytics.error}
                      </p>
                    )}
                    {tableMode === "no_connection" && (
                      <div className="flex flex-col items-center text-center gap-3">
                        <p className="text-sm text-zinc-400">
                          Connect Meta Ads to see your campaigns.
                        </p>
                        <Link
                          href="/data-sources?focus=meta"
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-xs font-medium transition"
                        >
                          Open Data Sources →
                        </Link>
                      </div>
                    )}
                    {tableMode === "no_data" && (
                      <p className="text-center text-zinc-500 text-sm">
                        No campaigns with delivery in the selected period.
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
