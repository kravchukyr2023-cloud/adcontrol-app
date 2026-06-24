"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActiveProject } from "@/hooks/use-active-project";
import { useMetaOverview } from "@/hooks/use-meta-overview";
import {
  useMetaAnalytics,
  type AnalyticsCampaign,
} from "@/hooks/use-meta-analytics";
import { useGlobalPeriod } from "@/hooks/use-global-period";
import { META_SYNC_COMPLETED } from "@/lib/meta/events";
import AdsetSection from "@/components/meta/adset-section";
import {
  DiagnosisDrawerProvider,
  DiagnosisTriggerButton,
} from "@/components/decisions/diagnosis-drawer-context";

type StatusFilter = "All" | "Active" | "Paused";

const FILTERS: StatusFilter[] = ["All", "Active", "Paused"];

// Meta surfaces three distinct codes for "stopped delivery" depending on
// where the pause lives (campaign-level, ad-set-level, generic paused).
// We collapse them under the single Paused tab — the user doesn't care
// which level pressed the brake.
const PAUSED_EFFECTIVE_STATUSES = [
  "PAUSED",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
] as const;

const COLS = [
  { key: "name", label: "Campaign", align: "left" as const },
  { key: "status", label: "Status", align: "left" as const },
  { key: "objective", label: "Objective", align: "left" as const },
  { key: "spend", label: "Spend", align: "right" as const },
  { key: "purchases", label: "Purchases", align: "right" as const },
  { key: "cpa", label: "CPA", align: "right" as const },
  { key: "impressions", label: "Impressions", align: "right" as const },
  { key: "cpm", label: "CPM", align: "right" as const },
  { key: "clicks", label: "Clicks", align: "right" as const },
  { key: "cpc", label: "CPC", align: "right" as const },
  { key: "ctr", label: "CTR", align: "right" as const },
  { key: "revenue", label: "Revenue", align: "right" as const },
  { key: "roas", label: "ROAS", align: "right" as const },
  { key: "actions", label: "", align: "right" as const },
];

const ALL = "__all__";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:
    "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  PAUSED:
    "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  CAMPAIGN_PAUSED:
    "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  ADSET_PAUSED:
    "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
  IN_PROCESS:
    "bg-amber-500/10 border-amber-500/30 text-amber-300",
  WITH_ISSUES:
    "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

function statusLabel(effective: string | null): string {
  if (!effective) return "—";
  return effective
    .toLowerCase()
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function fmtMoney(v: number | null, currency: string): string {
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

function cpa(spend: number, purchases: number): number | null {
  return purchases > 0 ? spend / purchases : null;
}

export default function MetaAdsPage() {
  const { project } = useActiveProject();
  // Single source of truth for projectId on this page. All downstream
  // hooks receive this same value — no duplicate useActiveProject
  // instance racing the page-level one.
  const projectId = project?.id ?? null;
  const overview = useMetaOverview(projectId);

  const [selectedBmId, setSelectedBmId] = useState<string>(ALL);
  const [selectedAaId, setSelectedAaId] = useState<string>(ALL);
  // Default to "Active" — when the user opens /meta the first thing
  // they want to see is what's currently delivering, not the historical
  // pile that includes everything ever paused.
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("Active");
  // Date range is now driven by the global topbar selector. Local
  // preset state was removed in Stage 7 — single source of truth lives
  // in `useGlobalPeriod` / localStorage.
  const { range: dateRange } = useGlobalPeriod();

  // Drill-down expand state at the campaign level. The deeper levels
  // (adsets-section → ads-section) own their own expand state via
  // sub-component-local Sets, so all per-row state below this Set
  // automatically resets when a campaign collapses.
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    new Set()
  );

  // Period-change reset. Done via render-time derive (not useEffect)
  // per the React 19 "you might not need an Effect" guidance — keeps
  // the reset synchronous so the next render already sees the empty
  // Set, avoiding a flicker of stale drill-downs.
  const periodFp = `${dateRange.since}|${dateRange.until}`;
  const [lastSeenPeriodFp, setLastSeenPeriodFp] = useState(periodFp);
  if (lastSeenPeriodFp !== periodFp) {
    setLastSeenPeriodFp(periodFp);
    setExpandedCampaigns(new Set());
  }

  // Sync-completed reset stays in useEffect: this is true external-
  // subscription territory (window event), not derived state.
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

  const bmOptions = overview.business_managers;

  const aaOptions = useMemo(() => {
    if (selectedBmId === ALL) {
      return bmOptions.flatMap((bm) => bm.ad_accounts);
    }
    const bm = bmOptions.find((b) => b.id === selectedBmId);
    return bm?.ad_accounts ?? [];
  }, [bmOptions, selectedBmId]);

  // Translate the UI's UUID select values into the Meta text ids the
  // analytics API expects. `null` ⇒ no filter (server returns all selected
  // project AAs / BMs).
  const bmFilterText = useMemo(() => {
    if (selectedBmId === ALL) return null;
    return (
      bmOptions.find((b) => b.id === selectedBmId)?.meta_bm_id ?? null
    );
  }, [bmOptions, selectedBmId]);

  const aaFilterText = useMemo(() => {
    if (selectedAaId === ALL) return null;
    return (
      aaOptions.find((a) => a.id === selectedAaId)?.meta_ad_account_id ?? null
    );
  }, [aaOptions, selectedAaId]);

  const analytics = useMetaAnalytics(projectId, {
    bmId: bmFilterText,
    adAccountId: aaFilterText,
    since: dateRange.since,
    until: dateRange.until,
  });

  // Sync trigger + local "Last synced" badge moved to the global topbar
  // in Stage 7. `useMetaAnalytics` now refetches automatically when the
  // topbar Sync emits META_SYNC_COMPLETED.

  const headerBmLabel =
    selectedBmId === ALL
      ? bmOptions.length === 0
        ? "No business manager"
        : `${bmOptions.length} business manager${bmOptions.length === 1 ? "" : "s"}`
      : bmOptions.find((b) => b.id === selectedBmId)?.name ?? "—";

  const headerAaLabel =
    selectedAaId === ALL
      ? aaOptions.length === 0
        ? "No ad accounts"
        : `${aaOptions.length} ad account${aaOptions.length === 1 ? "" : "s"}`
      : aaOptions.find((a) => a.id === selectedAaId)?.name ?? "—";

  const hasAnyBinding = bmOptions.some((b) => b.ad_accounts.length > 0);

  // Display currency: take the first selected AA's currency. Multi-currency
  // portfolios are rare in V1; mixed cases fall back to "USD" rendering.
  const displayCurrency = analytics.adAccounts[0]?.currency ?? "USD";

  const campaigns: AnalyticsCampaign[] = analytics.campaigns;

  // Client-side status filter. Server returns every campaign that had
  // delivery in the window; we narrow by `effective_status` here so
  // tab switches feel instant and don't refetch.
  const filteredCampaigns = useMemo(() => {
    if (activeFilter === "All") return campaigns;
    if (activeFilter === "Active") {
      return campaigns.filter((c) => c.effective_status === "ACTIVE");
    }
    return campaigns.filter(
      (c) =>
        c.effective_status !== null &&
        (PAUSED_EFFECTIVE_STATUSES as readonly string[]).includes(
          c.effective_status
        )
    );
  }, [campaigns, activeFilter]);

  // True iff raw analytics had campaigns but the active filter cleared
  // them all. Distinct from `no_data` (raw is empty) — different copy.
  const noFilteredMatch =
    campaigns.length > 0 && filteredCampaigns.length === 0;

  type ViewMode =
    | "no_project"
    | "needs_setup"
    | "loading"
    | "error"
    | "no_data"
    | "ok";

  // FSM order matters:
  //   1. no_project — no active project at all
  //   2. loading    — anything still in flight or not yet started
  //                   (status idle OR loading on either hook)
  //   3. error      — explicit fetch failure
  //   4. needs_setup— ONLY when overview is fully `ready` AND has no BMs.
  //                   This prevents the flash where overview was still
  //                   `idle` (because internal useActiveProject was racing)
  //                   and an empty `business_managers` array got
  //                   misinterpreted as "user has nothing".
  //   5. no_data    — analytics ready but no campaigns in the window
  //   6. ok         — render rows
  const overviewSettled =
    overview.status === "ready" || overview.status === "error";
  const analyticsSettled =
    analytics.status === "ready" || analytics.status === "error";

  const viewMode: ViewMode = !project
    ? "no_project"
    : !overviewSettled || !analyticsSettled
    ? "loading"
    : analytics.error
    ? "error"
    : overview.status === "ready" && !hasAnyBinding
    ? "needs_setup"
    : campaigns.length === 0
    ? "no_data"
    : "ok";

  return (
    <DiagnosisDrawerProvider projectId={projectId}>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Meta Ads
        </h1>
        <p className="text-sm text-zinc-400 mt-2">
          Campaigns, ad sets and creatives across your Meta business managers.
          {analytics.dateRange && (
            <span className="ml-2 text-zinc-500">
              · {analytics.dateRange.since} → {analytics.dateRange.until}
            </span>
          )}
        </p>
      </div>

      {/* Summary cards — bound to /api/meta/analytics summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard
          label="Spend"
          value={fmtMoney(analytics.summary.spend, displayCurrency)}
        />
        <MetricCard
          label="Impressions"
          value={fmtInt(analytics.summary.impressions)}
        />
        <MetricCard
          label="Clicks"
          value={fmtInt(analytics.summary.clicks)}
        />
        <MetricCard
          label="Purchases"
          value={fmtInt(analytics.summary.purchases)}
        />
        <MetricCard label="CTR" value={fmtPct(analytics.summary.ctr)} />
        <MetricCard
          label="CPC"
          value={fmtMoney(analytics.summary.cpc, displayCurrency)}
        />
        <MetricCard
          label="CPM"
          value={fmtMoney(analytics.summary.cpm, displayCurrency)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search campaigns…"
              className="w-full h-10 pl-10 pr-3.5 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-500"
            />
          </div>

          <select
            value={selectedBmId}
            onChange={(e) => {
              setSelectedBmId(e.target.value);
              setSelectedAaId(ALL);
            }}
            className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]"
          >
            <option value={ALL}>All Business Managers</option>
            {bmOptions.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name ?? bm.meta_bm_id ?? "—"}
              </option>
            ))}
          </select>

          <select
            value={selectedAaId}
            onChange={(e) => setSelectedAaId(e.target.value)}
            className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]"
          >
            <option value={ALL}>All Ad Accounts</option>
            {aaOptions.map((aa) => (
              <option key={aa.id} value={aa.id}>
                {aa.name ?? aa.meta_ad_account_id ?? "—"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const isActive = activeFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "h-8 px-3 rounded-lg text-xs border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white transition"
                    : "h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition"
                }
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] bg-[#181A24] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              BM
            </span>
            <p className="text-sm font-semibold">{headerBmLabel}</p>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-500">{headerAaLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {analytics.loading && project && (
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6D5EF8] animate-pulse" />
                Loading…
              </span>
            )}
            <span className="text-xs text-zinc-500">
              {viewMode === "ok"
                ? `${filteredCampaigns.length} campaign${filteredCampaigns.length === 1 ? "" : "s"}`
                : "0 campaigns"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {/* Leading column for the drill-down chevron. Empty
                    header keeps the visual hierarchy clean. */}
                <th className="w-6"></th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={
                      c.align === "right"
                        ? "text-right px-3 py-3 font-medium"
                        : "text-left px-3 py-3 font-medium"
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viewMode === "ok" && noFilteredMatch && (
                <tr>
                  <td colSpan={COLS.length + 1} className="px-6 py-12">
                    <p className="text-center text-zinc-500 text-sm">
                      {activeFilter === "Paused"
                        ? "No paused campaigns in the selected period."
                        : "No active campaigns in the selected period."}
                    </p>
                  </td>
                </tr>
              )}

              {viewMode === "ok" &&
                !noFilteredMatch &&
                filteredCampaigns.map((c) => {
                  const cpaVal = cpa(c.spend, c.purchases);
                  const badge =
                    (c.effective_status && STATUS_BADGE[c.effective_status]) ||
                    "bg-zinc-500/10 border-zinc-500/30 text-zinc-300";
                  const isOpen = expandedCampaigns.has(c.id);
                  return (
                    <CampaignRowGroup key={c.id}>
                    <tr
                      className="border-t border-[#1B2238] hover:bg-white/[0.02] transition"
                    >
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
                      <td className="px-3 py-3 text-left">
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
                      <td className="px-3 py-3 text-left text-zinc-300">
                        {c.objective ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-white font-medium">
                        {fmtMoney(c.spend, displayCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtInt(c.purchases)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoney(cpaVal, displayCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtInt(c.impressions)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoney(c.cpm, displayCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtInt(c.clicks)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoney(c.cpc, displayCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtPct(c.ctr)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtMoney(c.revenue, displayCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-200">
                        {fmtRoas(c.roas)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DiagnosisTriggerButton
                          entity={{
                            id: c.id,
                            name: c.campaign_name ?? "—",
                            level: "campaign",
                            spend: c.spend,
                            roas: c.roas,
                            cpa: cpaVal,
                            ctr: c.ctr,
                          }}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td></td>
                        <td colSpan={COLS.length} className="px-3 pb-4">
                          <div className="pl-4 border-l border-[#1B2238]">
                            <AdsetSection
                              campaignId={c.id}
                              since={dateRange.since}
                              until={dateRange.until}
                              currency={displayCurrency}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    </CampaignRowGroup>
                  );
                })}

              {viewMode !== "ok" && (
                <tr>
                  <td colSpan={COLS.length + 1} className="px-6 py-12">
                    {viewMode === "no_project" && (
                      <p className="text-center text-zinc-500 text-sm">
                        Select a project to load Meta Ads.
                      </p>
                    )}

                    {viewMode === "loading" && (
                      <p className="text-center text-zinc-500 text-sm">
                        Loading campaigns…
                      </p>
                    )}

                    {viewMode === "error" && (
                      <p className="text-center text-rose-400 text-sm">
                        {analytics.error}
                      </p>
                    )}

                    {viewMode === "no_data" && (
                      <p className="text-center text-zinc-500 text-sm">
                        No active campaigns with delivery in the selected window.
                      </p>
                    )}

                    {viewMode === "needs_setup" && (
                      <div className="flex flex-col items-center text-center max-w-md mx-auto gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#1877F2]/15 border border-[#1877F2]/30 text-blue-300 flex items-center justify-center font-bold text-lg">
                          f
                        </div>
                        <h3 className="text-base font-semibold text-white">
                          No Meta Ads data for this project yet
                        </h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          {project?.name ? (
                            <>
                              <span className="text-white">{project.name}</span>{" "}
                              has no Meta connection or no Ad Accounts selected.
                            </>
                          ) : (
                            "This project has no Meta connection or no Ad Accounts selected."
                          )}{" "}
                          Open Data Sources to connect Meta and pick the Ad
                          Accounts you want to track here.
                        </p>
                        <Link
                          href="/data-sources?focus=meta"
                          className="mt-1 h-10 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition inline-flex items-center justify-center"
                        >
                          Open Data Sources →
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    </DiagnosisDrawerProvider>
  );
}

// Adjacent <tr>s for a single campaign (main row + drill-down row)
// need a shared key. React doesn't allow keying a Fragment shorthand
// inside .map, so this trivial wrapper lets us key once at the
// outer call site.
function CampaignRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#0B1020] border border-[#1B2238] rounded-xl px-4 py-3">
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5">
        {label}
      </div>
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}
