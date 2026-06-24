"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/use-entitlements";
import { canAccess } from "@/lib/billing/feature-access";
import LockedPagePlaceholder from "@/components/billing/locked-page-placeholder";
import { useActiveProject } from "@/hooks/use-active-project";
import { useGlobalPeriod } from "@/hooks/use-global-period";
import { useMetaOverview } from "@/hooks/use-meta-overview";
import { useMetaAnalytics } from "@/hooks/use-meta-analytics";
import { useSalesAnalytics } from "@/hooks/use-sales-analytics";
import { META_SYNC_COMPLETED } from "@/lib/meta/events";
import SalesAdsetSection from "@/components/sales/sales-adset-section";
import RecentOrdersSection from "@/components/sales/recent-orders-section";
import SalesDecisionPanel from "@/components/decisions/sales-decision-panel";

const KPIS_MANUAL = [
  { label: "Revenue", value: "$0", note: "Manual orders" },
  { label: "Orders", value: "0", note: "0 today" },
  { label: "AOV", value: "$0", note: "Across manual entries" },
];

const ORDER_COLS_MANUAL = [
  "Order ID",
  "Date",
  "Customer",
  "Product",
  "Revenue",
  "Notes",
];

export default function SalesPage() {
  const { plan, loading } = useEntitlements();

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading…</div>;
  }

  const hasManual = canAccess("sales_manual", plan);
  const hasFull = canAccess("sales_full_attribution", plan);

  if (!hasManual && !hasFull) {
    return <LockedPagePlaceholder feature="sales_full_attribution" />;
  }

  if (hasFull) {
    return <SalesFull />;
  }

  return <SalesRestricted />;
}

function SalesRestricted() {
  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Sales & Attribution
          </h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
            Manual sales tracking. Connect Shopify or Google Sheets on higher plans to unlock full attribution.
          </p>
        </div>

        <button className="shrink-0 h-10 px-4 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition">
          + Add Order
        </button>
      </div>

      <div className="border border-[#6D5EF8]/40 bg-[#6D5EF8]/10 rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            You are using Sales in restricted (manual) mode
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Full attribution, Shopify sync and Real-vs-Meta ROAS comparison are available on Operator or higher.
          </p>
        </div>
        <button
          disabled
          className="h-9 px-4 rounded-lg bg-[#6D5EF8]/20 text-zinc-400 text-xs font-medium cursor-not-allowed shrink-0"
        >
          Upgrade Plan
        </button>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {KPIS_MANUAL.map((k) => (
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

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-8 px-3 rounded-lg text-xs border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white flex items-center">
              Manual
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              Revenue: <span className="text-white">$0</span>
            </span>
            <span className="text-zinc-700">·</span>
            <span>
              Orders: <span className="text-white">0</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {ORDER_COLS_MANUAL.map((c, i) => (
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
              <tr>
                <td
                  colSpan={ORDER_COLS_MANUAL.length}
                  className="text-center px-6 py-12 text-zinc-500 text-sm"
                >
                  No manual orders yet. Use “+ Add Order” to start tracking.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function fmtMoneySales(currency: string, v: number | null): string {
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
function fmtIntSales(v: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}
function fmtRoasSales(v: number | null): string {
  if (v === null) return "—";
  return `×${v.toFixed(2)}`;
}
function cpaSales(spend: number, purchases: number): number | null {
  if (purchases <= 0) return null;
  const v = spend / purchases;
  return Number.isFinite(v) ? v : null;
}

function fmtDiff(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
function diffColor(pct: number | null): string {
  // Neutral within ±5% — typical noise on small-window ROAS ratios. Outside
  // that the user wants the lift/regression to jump out visually.
  if (pct === null || !Number.isFinite(pct)) return "text-zinc-500";
  if (Math.abs(pct) < 5) return "text-zinc-300";
  return pct > 0 ? "text-emerald-300" : "text-rose-300";
}

// Comparison-table columns. Chevron is rendered as a separate leading
// cell (not in this list) so `colSpan={COMPARE_LEN}` on the drill-down
// row matches the data columns exactly.
const COMPARE_HEADS = [
  { key: "name", label: "Campaign", align: "left" as const },
  { key: "spend", label: "Spend", align: "right" as const },
  { key: "meta_rev", label: "Meta rev", align: "right" as const },
  { key: "real_rev", label: "Real rev", align: "right" as const },
  { key: "meta_sales", label: "Meta sales", align: "right" as const },
  { key: "real_sales", label: "Real sales", align: "right" as const },
  { key: "meta_cpa", label: "Meta CPA", align: "right" as const },
  { key: "real_cpa", label: "Real CPA", align: "right" as const },
  { key: "meta_roas", label: "Meta ROAS", align: "right" as const },
  { key: "real_roas", label: "Real ROAS", align: "right" as const },
  { key: "diff", label: "Diff", align: "right" as const },
];

function SalesFull() {
  const { project } = useActiveProject();
  const projectId = project?.id ?? null;
  const { range } = useGlobalPeriod();

  const overview = useMetaOverview(projectId);
  const analytics = useMetaAnalytics(projectId, {
    since: range.since,
    until: range.until,
  });
  const sales = useSalesAnalytics(projectId, {
    since: range.since,
    until: range.until,
  });

  // Drill-down expand state. Same cascading-unmount strategy as /meta
  // (Stage 13): collapse-on-period-change + collapse-on-sync.
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    new Set()
  );
  const periodFp = `${range.since}|${range.until}`;
  const [lastSeenPeriodFp, setLastSeenPeriodFp] = useState(periodFp);
  if (lastSeenPeriodFp !== periodFp) {
    setLastSeenPeriodFp(periodFp);
    setExpandedCampaigns(new Set());
  }
  useEffect(() => {
    function onSyncDone() {
      setExpandedCampaigns(new Set());
    }
    window.addEventListener(META_SYNC_COMPLETED, onSyncDone);
    return () => window.removeEventListener(META_SYNC_COMPLETED, onSyncDone);
  }, []);
  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Full-page replacement when no project ---
  if (!project) {
    return (
      <div className="border border-[#1B2238] rounded-2xl p-12 bg-[#0B1020]">
        <p className="text-sm text-zinc-400 text-center">
          Select a project to see attribution data.
        </p>
      </div>
    );
  }

  const currency =
    sales.summary.currency ??
    analytics.adAccounts[0]?.currency ??
    project.currency ??
    "USD";

  // KPI cards. SPEND is sourced from Meta; REVENUE/ORDERS/AOV from the
  // orders table; Real ROAS is the hybrid revenue/spend ratio per the
  // platform philosophy doc (Stage 22 brief).
  const salesLoading = sales.status === "loading" || sales.status === "idle";
  const totalRevenue = sales.summary.total_revenue;
  const totalOrders = sales.summary.total_orders;
  const aov = sales.summary.aov;
  const metaSpend = analytics.summary.spend;
  const realRoas =
    metaSpend > 0 && totalRevenue > 0 ? totalRevenue / metaSpend : null;
  const metaRoas = analytics.summary.roas;

  const noOrdersNote = "No sales data yet. Connect Google Sheets.";

  const KPIS: Array<{ label: string; value: string; note: string }> = [
    {
      label: "Revenue",
      value: salesLoading ? "…" : fmtMoneySales(currency, totalRevenue),
      note:
        totalOrders === 0 && !salesLoading
          ? noOrdersNote
          : `${fmtIntSales(totalOrders)} orders`,
    },
    {
      label: "Orders",
      value: salesLoading ? "…" : fmtIntSales(totalOrders),
      note:
        totalOrders === 0 && !salesLoading
          ? noOrdersNote
          : `${fmtIntSales(sales.summary.matched_orders)} matched · ${fmtIntSales(
              sales.summary.unmatched_orders
            )} unmatched`,
    },
    {
      label: "AOV",
      value: salesLoading ? "…" : fmtMoneySales(currency, aov),
      note:
        totalOrders === 0 && !salesLoading
          ? noOrdersNote
          : "Across all orders in the period",
    },
    {
      label: "Real ROAS",
      value: salesLoading ? "…" : fmtRoasSales(realRoas),
      note:
        totalRevenue > 0 && metaSpend === 0
          ? "No Meta spend in this period"
          : `vs Meta ${fmtRoasSales(metaRoas)}`,
    },
    {
      label: "Budget",
      value: fmtMoneySales(currency, metaSpend),
      note: "Total spend for the period",
    },
  ];

  // FSM mirrors /meta. We don't surface a separate "error" copy here —
  // the analytics error message stays in the table body so it doesn't
  // shadow the Budget card.
  const overviewSettled =
    overview.status === "ready" || overview.status === "error";
  const analyticsSettled =
    analytics.status === "ready" || analytics.status === "error";
  const isLoading = !overviewSettled || !analyticsSettled;
  const hasAnyBinding = overview.business_managers.some(
    (b) => b.ad_accounts.length > 0
  );
  const campaigns = analytics.campaigns;

  type TableMode = "loading" | "error" | "no_connection" | "no_data" | "ok";
  const tableMode: TableMode = isLoading
    ? "loading"
    : analytics.error
    ? "error"
    : !hasAnyBinding
    ? "no_connection"
    : campaigns.length === 0
    ? "no_data"
    : "ok";

  return (
    <div className="space-y-6">

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Sales & Attribution
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Real revenue, attribution and Meta-vs-real performance comparison.
          </p>
        </div>

        <button className="shrink-0 h-10 px-4 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition">
          + Add Order
        </button>
      </div>

      <SalesDecisionPanel projectId={projectId} />

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

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Meta vs Real ROAS</h3>
          <span className="text-xs text-zinc-500">
            {tableMode === "ok"
              ? `${campaigns.length} row${campaigns.length === 1 ? "" : "s"}`
              : "0 rows"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                <th className="w-6"></th>
                {COMPARE_HEADS.map((h) => (
                  <th
                    key={h.key}
                    className={
                      h.align === "right"
                        ? "text-right px-3 py-3 font-medium"
                        : "text-left px-6 py-3 font-medium"
                    }
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableMode === "ok" &&
                campaigns.map((c) => {
                  const isOpen = expandedCampaigns.has(c.id);
                  const cpaVal = cpaSales(c.spend, c.purchases);
                  const realAgg = sales.perCampaign[c.id] ?? null;
                  const realRev = realAgg?.revenue ?? null;
                  const realOrders = realAgg?.orders ?? null;
                  const realCpa =
                    realAgg && realAgg.orders > 0
                      ? c.spend / realAgg.orders
                      : null;
                  const realRoasC =
                    realAgg && c.spend > 0 ? realAgg.revenue / c.spend : null;
                  const diffPct =
                    realRoasC !== null && c.roas !== null && c.roas > 0
                      ? ((realRoasC - c.roas) / c.roas) * 100
                      : null;
                  return (
                    <SalesRowGroup key={c.id}>
                      <tr className="border-t border-[#1B2238] hover:bg-white/[0.02] transition">
                        <td className="px-1 py-3 text-center align-top">
                          <button
                            type="button"
                            onClick={() => toggleCampaign(c.id)}
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen ? "Collapse ad sets" : "Expand ad sets"
                            }
                            className="text-[#a99cff] hover:text-white transition"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                transform: isOpen
                                  ? "rotate(90deg)"
                                  : "rotate(0)",
                                transition: "transform 120ms ease",
                              }}
                            >
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-6 py-3 text-left">
                          <div className="text-white truncate max-w-[280px]">
                            {c.campaign_name ?? "—"}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {c.meta_campaign_id}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {fmtMoneySales(currency, c.spend)}
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-200">
                          {fmtMoneySales(currency, c.revenue)}
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {fmtMoneySales(currency, realRev)}
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-200">
                          {fmtIntSales(c.purchases)}
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {realOrders === null
                            ? "—"
                            : fmtIntSales(realOrders)}
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-200">
                          {fmtMoneySales(currency, cpaVal)}
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {fmtMoneySales(currency, realCpa)}
                        </td>
                        <td className="px-3 py-3 text-right text-zinc-200">
                          {fmtRoasSales(c.roas)}
                        </td>
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {fmtRoasSales(realRoasC)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-medium ${diffColor(
                            diffPct
                          )}`}
                        >
                          {fmtDiff(diffPct)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td></td>
                          <td
                            colSpan={COMPARE_HEADS.length}
                            className="px-3 pb-4"
                          >
                            <div className="pl-4 border-l border-[#1B2238]">
                              <SalesAdsetSection
                                campaignId={c.id}
                                since={range.since}
                                until={range.until}
                                currency={currency}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </SalesRowGroup>
                  );
                })}

              {tableMode !== "ok" && (
                <tr>
                  <td
                    colSpan={COMPARE_HEADS.length + 1}
                    className="px-6 py-12"
                  >
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
                          Connect Meta Ads to see attribution data.
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

      <RecentOrdersSection
        projectId={projectId}
        loading={sales.status === "loading" || sales.status === "idle"}
        error={sales.error}
        orders={sales.recentOrders}
        matchedCount={sales.summary.matched_orders}
        unmatchedCount={sales.summary.unmatched_orders}
        manualCount={sales.summary.manual_orders}
        onRematched={sales.refresh}
      />

    </div>
  );
}

// Adjacent <tr>s per campaign (main + drill-down) sharing one key.
function SalesRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
