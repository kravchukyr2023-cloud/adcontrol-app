"use client";

import { useEffect, useState } from "react";

/**
 * Loads /api/projects/summaries once per mount.
 *
 * Lightweight on purpose: the Choose-a-project page is a leaf hub —
 * no need for SWR/react-query. Pulling the project list and the
 * summaries are two cheap parallel fetches; the parent page already
 * owns the project list, this hook owns the per-project totals.
 */

export type ProjectSummary = {
  projectId: string;
  actualSpend: number;
  actualPurchases: number;
  actualRevenue: number;
  actualRoas: number;
  hasActiveMetaConnection: boolean;
};

export type UseProjectSummaries = {
  summaries: ProjectSummary[] | null;
  loading: boolean;
  error: string | null;
};

export function useProjectSummaries(): UseProjectSummaries {
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch("/api/projects/summaries", {
          cache: "no-store",
        });
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setError(
            typeof data?.error === "string"
              ? data.error
              : "Failed to load summaries"
          );
          setLoading(false);
          return;
        }
        setSummaries((data.summaries ?? []) as ProjectSummary[]);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load summaries";
        setError(msg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { summaries, loading, error };
}
