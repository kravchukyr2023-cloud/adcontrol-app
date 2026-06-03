"use client";

import { useCallback, useState } from "react";

/**
 * Manual Meta sync trigger.
 *
 *   POST /api/meta/sync  with { project_id }
 *
 * Aggregates per-AA results into one of 5 high-level states:
 *   - idle      : nothing happened yet
 *   - syncing   : request in flight
 *   - success   : every AA returned finalStatus='idle'
 *   - partial   : at least one AA returned finalStatus='partial'
 *   - error     : at least one AA failed (acquired=false or finalStatus='error'),
 *                 OR the request itself errored.
 *
 * Returns the final state from `trigger()` so callers can decide whether
 * to follow up (e.g. refetch analytics) without re-reading state.
 */

export type MetaSyncState =
  | "idle"
  | "syncing"
  | "success"
  | "partial"
  | "error";

export type MetaSyncSummary = {
  totalAccounts: number;
  successCount: number;
  partialCount: number;
  errorCount: number;
};

type TriggerResult = {
  state: MetaSyncState;
  message: string | null;
  summary: MetaSyncSummary | null;
};

type ApiResponse = {
  ok?: boolean;
  total_accounts?: number;
  error?: string;
  message?: string;
  elapsed_ms?: number;
  results?: Array<{
    meta_ad_account_id: string;
    ad_account_name: string | null;
    result: {
      acquired: boolean;
      finalStatus?: "idle" | "partial" | "error";
      lockReason?: string;
      errorMessage?: string;
      durationMs?: number;
    };
  }>;
};

export type UseMetaSync = {
  state: MetaSyncState;
  message: string | null;
  lastSummary: MetaSyncSummary | null;
  trigger: () => Promise<TriggerResult>;
  reset: () => void;
};

export function useMetaSync(
  projectId: string | null | undefined
): UseMetaSync {
  const [state, setState] = useState<MetaSyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<MetaSyncSummary | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setMessage(null);
  }, []);

  const trigger = useCallback(async (): Promise<TriggerResult> => {
    if (!projectId) {
      const r: TriggerResult = {
        state: "error",
        message: "No active project",
        summary: null,
      };
      setState(r.state);
      setMessage(r.message);
      return r;
    }

    setState("syncing");
    setMessage(null);

    try {
      const resp = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      let data: ApiResponse;
      try {
        data = (await resp.json()) as ApiResponse;
      } catch {
        const r: TriggerResult = {
          state: "error",
          message: `HTTP ${resp.status} — invalid JSON response`,
          summary: null,
        };
        setState(r.state);
        setMessage(r.message);
        return r;
      }

      if (!resp.ok || data.error) {
        const r: TriggerResult = {
          state: "error",
          message:
            data.message ||
            data.error ||
            `HTTP ${resp.status} — sync failed`,
          summary: null,
        };
        setState(r.state);
        setMessage(r.message);
        return r;
      }

      let success = 0;
      let partial = 0;
      let errorAas = 0;
      const results = data.results ?? [];
      for (const r of results) {
        const acquired = r.result?.acquired;
        const fs = r.result?.finalStatus;
        if (acquired === false) {
          errorAas++;
          continue;
        }
        if (fs === "idle") success++;
        else if (fs === "partial") partial++;
        else if (fs === "error") errorAas++;
      }

      const summary: MetaSyncSummary = {
        totalAccounts: data.total_accounts ?? results.length,
        successCount: success,
        partialCount: partial,
        errorCount: errorAas,
      };
      setLastSummary(summary);

      let finalState: MetaSyncState;
      let finalMessage: string;
      if (errorAas > 0 && success === 0 && partial === 0) {
        finalState = "error";
        finalMessage = `Sync failed for ${errorAas} of ${summary.totalAccounts} ad account${
          summary.totalAccounts === 1 ? "" : "s"
        }`;
      } else if (partial > 0 || errorAas > 0) {
        finalState = "partial";
        finalMessage = `Partial sync — ${success} ok, ${partial} partial, ${errorAas} failed`;
      } else {
        finalState = "success";
        finalMessage = `Synced ${success} ad account${success === 1 ? "" : "s"}`;
      }

      setState(finalState);
      setMessage(finalMessage);
      return { state: finalState, message: finalMessage, summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setState("error");
      setMessage(msg);
      return { state: "error", message: msg, summary: null };
    }
  }, [projectId]);

  return { state, message, lastSummary, trigger, reset };
}
