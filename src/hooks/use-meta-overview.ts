"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveProject } from "./use-active-project";
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

export type MetaOverview = {
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
  loading: true,
  error: null,
  project: null,
  connection: INITIAL_CONN,
  business_managers: [],
  timezone: null,
};

export function useMetaOverview(): MetaOverview {
  const { project } = useActiveProject();
  const projectId = project?.id ?? null;

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
        if (!cancelled) setState({ ...INITIAL, loading: false });
        return;
      }

      if (!cancelled) setState((s) => ({ ...s, loading: true, error: null }));

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
            loading: false,
            error: data.error || "Failed to load overview",
          }));
          return;
        }
        setState({
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
        setState((s) => ({ ...s, loading: false, error: msg }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, version]);

  return { ...state, refresh };
}
