"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { META_CONNECTION_CHANGED } from "@/lib/meta/events";

export type ProjectMetaConnectionState = {
  /**
   * Project-scoped Meta connection state.
   *
   *   loading         — fetch in flight
   *   no_oauth        — user has NO active Meta OAuth anywhere
   *   no_binding_yet  — user has an active global Meta connection but this
   *                     project has no project_meta_business_managers row.
   *                     UI must offer "pick a BM for this project", NOT
   *                     "Connect with Facebook".
   *   connected       — active binding + active connection + token valid
   *   disconnected    — has binding, but underlying connection is disconnected
   *   expired         — has binding, but underlying connection token expired
   *
   * The split between `no_oauth` and `no_binding_yet` removes the previous
   * `none` catch-all that hid the post-OAuth "needs binding" state behind
   * the same UI as "user never connected".
   */
  status:
    | "loading"
    | "no_oauth"
    | "no_binding_yet"
    | "connected"
    | "disconnected"
    | "expired";
  connectionId: string | null;
  metaUserName: string | null;
  metaUserId: string | null;
  tokenExpiresAt: string | null;
  lastConnectedAt: string | null;
};

const INITIAL: ProjectMetaConnectionState = {
  status: "loading",
  connectionId: null,
  metaUserName: null,
  metaUserId: null,
  tokenExpiresAt: null,
  lastConnectedAt: null,
};

/**
 * Project-scoped Meta connection status.
 *
 * Resolves the connection that THIS project is bound to via its active
 * project_meta_business_managers rows. Returns 'none' if the project has
 * no bindings yet — even if the user has a connection elsewhere.
 *
 * For the initial pre-binding UX (user has Alice connected globally, lands
 * on a fresh project), the parent component should fall back to a generic
 * "Connect with Facebook" prompt rather than reading this hook.
 *
 * Pass `projectId = null` and the hook returns status='none' immediately
 * (e.g. when no active project is selected).
 */
export function useProjectMetaConnection(
  projectId: string | null
): ProjectMetaConnectionState {
  const [state, setState] = useState<ProjectMetaConnectionState>(INITIAL);
  const [version, setVersion] = useState(0);

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
        // No active project — collapse to "no_oauth". Parent UI handles the
        // "select a project" prompt above this hook's branches anyway.
        if (!cancelled) setState({ ...INITIAL, status: "no_oauth" });
        return;
      }
      // 1. Resolve the connection_id this project is bound to via any
      //    active project_meta_business_managers row. RLS scopes to user.
      const bindingRes = await supabase
        .from("project_meta_business_managers")
        .select("meta_connection_id")
        .eq("project_id", projectId)
        .eq("status", "active")
        .not("meta_connection_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const connectionId =
        (bindingRes.data as { meta_connection_id: string | null } | null)
          ?.meta_connection_id ?? null;

      if (!connectionId) {
        // No binding to this project. Distinguish "user never OAuth'd"
        // from "user has a global connection, just not bound here".
        // Single small SELECT — RLS auto-scopes to current user, returns
        // at most one row with one column. Cold-path only.
        const globalRes = await supabase
          .from("meta_connections")
          .select("id")
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        const hasGlobalConnection = !!(globalRes.data as { id: string } | null);
        setState({
          ...INITIAL,
          status: hasGlobalConnection ? "no_binding_yet" : "no_oauth",
        });
        return;
      }

      // 2. Load the connection row itself (status + meta_user_name + expiry).
      const { data, error } = await supabase
        .from("meta_connections")
        .select(
          "id, meta_user_id, meta_user_name, status, token_expires_at, last_connected_at"
        )
        .eq("id", connectionId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setState({ ...INITIAL, status: "disconnected" });
        return;
      }

      const row = data as {
        id: string;
        meta_user_id: string;
        meta_user_name: string | null;
        status: string;
        token_expires_at: string | null;
        last_connected_at: string;
      };

      let status: ProjectMetaConnectionState["status"] = "disconnected";
      if (row.status === "active") {
        const expired =
          row.token_expires_at &&
          new Date(row.token_expires_at).getTime() < Date.now();
        status = expired ? "expired" : "connected";
      } else if (row.status === "expired") {
        status = "expired";
      } else if (row.status === "disconnected") {
        status = "disconnected";
      } else {
        status = "disconnected";
      }

      setState({
        status,
        connectionId: row.id,
        metaUserName: row.meta_user_name,
        metaUserId: row.meta_user_id,
        tokenExpiresAt: row.token_expires_at,
        lastConnectedAt: row.last_connected_at,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, version]);

  return state;
}
