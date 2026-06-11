"use client";

import { useCallback, useEffect, useState } from "react";
import { META_SYNC_COMPLETED } from "@/lib/meta/events";

/**
 * Client hook for GET /api/sales/analytics.
 *
 * Mirrors the shape and FSM of `useMetaAnalytics`. Re-fetches on:
 *   - project / window change
 *   - external `refresh()` call
 *   - global Meta sync completion (when ads/campaigns get new entities,
 *     the attribution rollups can change even without re-syncing the sheet).
 */

export type SalesSummary = {
  total_revenue: number;
  total_orders: number;
  aov: number | null;
  matched_orders: number;
  manual_orders: number;
  unmatched_orders: number;
  currency: string | null;
  truncated: boolean;
};

export type SalesPerCampaign = Record<
  string,
  { revenue: number; orders: number }
>;

export type SalesRecentOrder = {
  id: string;
  order_date: string;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  revenue: number;
  currency: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  attribution_status: "matched" | "partial" | "unmatched" | "manual" | string;
  matched_campaign_name: string | null;
  matched_adset_name: string | null;
  matched_ad_name: string | null;
};

export type SalesAnalyticsStatus = "idle" | "loading" | "ready" | "error";

export type SalesAnalytics = {
  status: SalesAnalyticsStatus;
  loading: boolean;
  error: string | null;
  dateRange: { since: string; until: string } | null;
  summary: SalesSummary;
  perCampaign: SalesPerCampaign;
  recentOrders: SalesRecentOrder[];
  refresh: () => void;
};

const EMPTY_SUMMARY: SalesSummary = {
  total_revenue: 0,
  total_orders: 0,
  aov: null,
  matched_orders: 0,
  manual_orders: 0,
  unmatched_orders: 0,
  currency: null,
  truncated: false,
};

const INITIAL: Omit<SalesAnalytics, "refresh"> = {
  status: "idle",
  loading: false,
  error: null,
  dateRange: null,
  summary: EMPTY_SUMMARY,
  perCampaign: {},
  recentOrders: [],
};

export function useSalesAnalytics(
  projectId: string | null | undefined,
  filters: { since?: string | null; until?: string | null }
): SalesAnalytics {
  const [state, setState] = useState<Omit<SalesAnalytics, "refresh">>(INITIAL);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // A Meta sync can create/rename campaigns, which changes downstream
  // attribution. Treat META_SYNC_COMPLETED as a refresh trigger so the
  // table updates without a hard reload.
  useEffect(() => {
    function onSyncDone() {
      setVersion((v) => v + 1);
    }
    window.addEventListener(META_SYNC_COMPLETED, onSyncDone);
    return () => window.removeEventListener(META_SYNC_COMPLETED, onSyncDone);
  }, []);

  const since = filters.since ?? null;
  const until = filters.until ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        if (!cancelled) {
          Promise.resolve().then(() => {
            if (!cancelled) setState({ ...INITIAL, status: "idle" });
          });
        }
        return;
      }

      Promise.resolve().then(() => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: "loading",
          loading: true,
          error: null,
        }));
      });

      const params = new URLSearchParams({ project_id: projectId });
      if (since) params.set("since", since);
      if (until) params.set("until", until);

      try {
        const resp = await fetch(
          `/api/sales/analytics?${params.toString()}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setState((s) => ({
            ...s,
            status: "error",
            loading: false,
            error: data.error || "Failed to load sales analytics",
          }));
          return;
        }
        setState({
          status: "ready",
          loading: false,
          error: null,
          dateRange: data.dateRange ?? null,
          summary: (data.summary ?? EMPTY_SUMMARY) as SalesSummary,
          perCampaign: (data.perCampaign ?? {}) as SalesPerCampaign,
          recentOrders: (data.recentOrders ?? []) as SalesRecentOrder[],
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load sales analytics";
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
  }, [projectId, since, until, version]);

  return { ...state, refresh };
}
