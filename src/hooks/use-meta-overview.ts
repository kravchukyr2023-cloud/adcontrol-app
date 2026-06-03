"use client";

import { useCallback, useEffect, useState } from "react";
import { META_CONNECTION_CHANGED } from "@/lib/meta/events";

export type MetaOverviewConnection = {
  status: "active" | "expired" | "disconnected" | "none";
  meta_user_name: string | null;
  token_expires_at: string | null;
  last_connected_at: string | null;
};

export type MetaOverviewAdAccount = {
  /** project_meta_ad_account_id — UUID of the selection row */
  id: string;
  meta_ad_account_id: string | null;
  name: string | null;
  currency: string | null;
  account_status_code: number | null;
  status: string;
  cache_status: string | null;
  selected_at: string;
};

export type MetaOverviewBusinessManager = {
  /** project_meta_business_manager_id — UUID of the membership row */
  id: string;
  meta_bm_id: string | null;
  name: string | null;
  status: string;
  cache_status: string | null;
  added_at: string;
  ad_accounts: MetaOverviewAdAccount[];
};

/**
 * Lifecycle status of the overview hook.
 *
 *   idle    — projectId is null, fetch has NOT been attempted.
 *             Consumers MUST NOT treat this as "no data" — it means
 *             "we don't know yet".
 *   loading — fetch in flight.
 *   ready   — fetch completed successfully; business_managers reflects truth.
 *   error   — fetch failed; error field carries the message.
 *
 * `loading: boolean` is preserved as `status === 'loading'` for callers
 * that don't need the distinction between idle and ready.
 */
export type MetaOverviewStatus = "idle" | "loading" | "ready" | "error";

export type MetaOverview = {
  status: MetaOverviewStatus;
  loading: boolean;
  error: string | null;
  project: { id: string; name: string } | null;
  connection: MetaOverviewConnection;
  business_managers: MetaOverviewBusinessManager[];
  timezone: string | null;
  refresh: () => void;
};

const INITIAL_CONN: MetaOverviewConnection = {
  status: "none",
  meta_user_name: null,
  token_expires_at: null,
  last_connected_at: null,
};

const INITIAL: Omit<MetaOverview, "refresh"> = {
  status: "idle",
  loading: false,
  error: null,
  project: null,
  connection: INITIAL_CONN,
  business_managers: [],
  timezone: null,
};

/**
 * Loads /api/meta/overview for the given project.
 *
 *   projectId === null  → stays in `status: 'idle'`. Consumers should
 *                         render their own "no project" placeholder.
 *
 * The caller is responsible for sourcing `projectId` from its single
 * `useActiveProject()` instance. This hook does NOT call `useActiveProject`
 * itself — that would create a second independent project-fetch race
 * with the page-level one.
 */
export function useMetaOverview(
  projectId: string | null
): MetaOverview {
  const [state, setState] = useState<Omit<MetaOverview, "refresh">>(INITIAL);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    function onChange() {
      setVersion((v) => v + 1);
    }
    window.addEventListener(META_CONNECTION_CHANGED, onChange);
    return () =>
      window.removeEventListener(META_CONNECTION_CHANGED, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectId) {
        // No project → stay idle. We have NOT attempted a fetch.
        // Treating this as `loading:false, business_managers:[]` would
        // be indistinguishable from a real "user has no BMs" result.
        if (!cancelled) setState({ ...INITIAL, status: "idle" });
        return;
      }

      if (!cancelled)
        setState((s) => ({ ...s, status: "loading", loading: true, error: null }));

      try {
        const resp = await fetch(
          `/api/meta/overview?project_id=${encodeURIComponent(projectId)}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setState((s) => ({
            ...s,
            status: "error",
            loading: false,
            error: data.error || "Failed to load overview",
          }));
          return;
        }
        setState({
          status: "ready",
          loading: false,
          error: null,
          project: data.project ?? null,
          connection: data.connection ?? INITIAL_CONN,
          business_managers: (data.business_managers ??
            []) as MetaOverviewBusinessManager[],
          timezone: data.timezone ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load overview";
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
  }, [projectId, version]);

  return { ...state, refresh };
}
