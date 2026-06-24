"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DecisionExplanation,
  DecisionResult,
  MonthlySnapshot,
} from "@/server/decisions/types";

/**
 * Stage 33b — `/api/decisions` consumer hook.
 *
 * Pattern mirrors use-sales-analytics: a single state record with `status`,
 * `loading`, `error`, plus the parsed payload. Re-fires on projectId change
 * and on explicit `refetch({ refresh })` calls (the "Оновити" button passes
 * `refresh: true` to bust the LLM cache).
 */

export type DecisionsResponse = {
  snapshot: MonthlySnapshot;
  decisions: DecisionResult;
  explanation: DecisionExplanation;
  meta: {
    explanationFromCache: boolean;
    explanationComputedAt: string;
    month: string;
  };
};

export type UseDecisionsState = {
  data: DecisionsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: (opts?: { refresh?: boolean }) => void;
  refreshing: boolean;
};

export function useDecisions(projectId: string | null): UseDecisionsState {
  const [data, setData] = useState<DecisionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True only when the user clicked Оновити — drives the spinner on the
  // refresh button without flipping the whole section back to its loading
  // skeleton.
  const [refreshing, setRefreshing] = useState(false);
  const [bump, setBump] = useState(0);
  const [forceRefresh, setForceRefresh] = useState(false);

  const refetch = useCallback((opts?: { refresh?: boolean }) => {
    setForceRefresh(opts?.refresh === true);
    setBump((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
    });

    (async () => {
      const params = new URLSearchParams({ project_id: projectId });
      if (forceRefresh) params.set("refresh", "true");
      try {
        const resp = await fetch(`/api/decisions?${params.toString()}`, {
          cache: "no-store",
        });
        const body = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setError(body.error ?? `Failed to load decisions (${resp.status})`);
          setLoading(false);
          setRefreshing(false);
          return;
        }
        setData(body as DecisionsResponse);
        setLoading(false);
        setRefreshing(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
        setLoading(false);
        setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, bump, forceRefresh]);

  return { data, loading, error, refetch, refreshing };
}
