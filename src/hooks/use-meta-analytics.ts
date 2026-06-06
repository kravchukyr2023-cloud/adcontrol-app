"use client";

import { useCallback, useEffect, useState } from "react";
import { META_SYNC_COMPLETED } from "@/lib/meta/events";

/**
 * Client hook for GET /api/meta/analytics.
 *
 * Loads project-scoped synced Meta data (selected AAs, summary aggregate,
 * campaign rows) for the given project id, optionally narrowed by
 * BM / AA / date filters. Re-fetches whenever projectId or any filter
 * changes; expose `refresh()` for manual reloads (e.g. after a sync).
 *
 * Filter precedence on the server: ad_account_id overrides bm_id.
 */

export type AnalyticsFilters = {
  /** Meta BM text id (e.g. "2149130375348387"). null/undefined = no filter. */
  bmId?: string | null;
  /** Meta AA text id (e.g. "act_869118064714884"). Overrides bmId server-side. */
  adAccountId?: string | null;
  /** YYYY-MM-DD; defaults server-side to month-to-date. */
  since?: string | null;
  /** YYYY-MM-DD; defaults server-side to today. */
  until?: string | null;
};

export type AnalyticsAdAccount = {
  id: string;
  meta_ad_account_id: string;
  ad_account_name: string | null;
  currency: string | null;
  status: string;
  account_status_code: number | null;
};

export type AnalyticsSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
};

export type AnalyticsCampaign = {
  id: string;
  meta_campaign_id: string;
  campaign_name: string | null;
  effective_status: string | null;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
};

/**
 * Lifecycle status.
 *
 *   idle    — projectId is null, fetch has NOT been attempted.
 *             Distinct from "ready with empty data".
 *   loading — fetch in flight.
 *   ready   — fetch completed; campaigns/summary reflect truth.
 *   error   — fetch failed.
 */
export type MetaAnalyticsStatus = "idle" | "loading" | "ready" | "error";

export type MetaAnalytics = {
  status: MetaAnalyticsStatus;
  loading: boolean;
  error: string | null;
  dateRange: { since: string; until: string } | null;
  /** ISO timestamp of the latest successful sync across the scoped AAs. */
  lastSyncedAt: string | null;
  adAccounts: AnalyticsAdAccount[];
  summary: AnalyticsSummary;
  campaigns: AnalyticsCampaign[];
  refresh: () => void;
};

const EMPTY_SUMMARY: AnalyticsSummary = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  revenue: null,
  ctr: null,
  cpc: null,
  cpm: null,
  roas: null,
};

const INITIAL: Omit<MetaAnalytics, "refresh"> = {
  status: "idle",
  loading: false,
  error: null,
  dateRange: null,
  lastSyncedAt: null,
  adAccounts: [],
  summary: EMPTY_SUMMARY,
  campaigns: [],
};

export function useMetaAnalytics(
  projectId: string | null | undefined,
  filters?: AnalyticsFilters
): MetaAnalytics {
  const [state, setState] = useState<Omit<MetaAnalytics, "refresh">>(INITIAL);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Re-fetch whenever the global Sync button reports a finished run.
  // This is how /meta (and any other analytics consumer) reflects newly
  // synced rows after the topbar-driven sync — no hard reload, no
  // explicit refresh() call from the page.
  useEffect(() => {
    function onSyncDone() {
      setVersion((v) => v + 1);
    }
    window.addEventListener(META_SYNC_COMPLETED, onSyncDone);
    return () => window.removeEventListener(META_SYNC_COMPLETED, onSyncDone);
  }, []);

  // Normalise filter values for the dependency array (avoids re-fetch loops
  // when callers pass fresh `filters` objects on every render).
  const bmId = filters?.bmId ?? null;
  const adAccountId = filters?.adAccountId ?? null;
  const since = filters?.since ?? null;
  const until = filters?.until ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        // No project → idle. Do NOT pretend an empty-result fetch happened.
        if (!cancelled) setState({ ...INITIAL, status: "idle" });
        return;
      }

      if (!cancelled)
        setState((s) => ({ ...s, status: "loading", loading: true, error: null }));

      const params = new URLSearchParams({ project_id: projectId });
      if (bmId) params.set("bm_id", bmId);
      if (adAccountId) params.set("ad_account_id", adAccountId);
      if (since) params.set("since", since);
      if (until) params.set("until", until);

      try {
        const resp = await fetch(
          `/api/meta/analytics?${params.toString()}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setState((s) => ({
            ...s,
            status: "error",
            loading: false,
            error: data.error || "Failed to load analytics",
          }));
          return;
        }
        setState({
          status: "ready",
          loading: false,
          error: null,
          dateRange: data.dateRange ?? null,
          lastSyncedAt:
            typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
          adAccounts: (data.adAccounts ?? []) as AnalyticsAdAccount[],
          summary: (data.summary ?? EMPTY_SUMMARY) as AnalyticsSummary,
          campaigns: (data.campaigns ?? []) as AnalyticsCampaign[],
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load analytics";
        setState((s) => ({
          ...s,
          status: "error",
          loading: false,
          error: msg,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, bmId, adAccountId, since, until, version]);

  return { ...state, refresh };
}
