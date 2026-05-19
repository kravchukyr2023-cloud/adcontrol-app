import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import {
  ActiveTokenResult,
  ConnectionSummary,
  getAccessTokenForConnection,
  getActiveAccessToken,
  getActiveConnection,
  getConnectionById,
} from "./token-store";

/**
 * Project-aware Meta connection resolver.
 *
 * Architecture rule (V1, multi-FB users supported):
 *   - Connections are USER-GLOBAL (one row per (user, Facebook user)).
 *   - BM/AA bindings are PROJECT-SCOPED and carry meta_connection_id.
 *   - When acting on a project's behalf, look up which connection serves
 *     that project via its bindings — DO NOT fall back to user-global
 *     "most recent" unless explicitly opted in via `allowGlobalFallback`.
 *
 * `allowGlobalFallback: true` is only correct when the project has no
 * bindings yet (fresh project, first-time Meta interaction). In that
 * case we use the user's most-recent active connection as a temporary
 * proxy until a binding is created.
 */

export type ConnectionResolution = {
  connection: ConnectionSummary;
  /** True when resolved via the project's own bindings (multi-FB safe). */
  viaBinding: boolean;
  /** True when resolved via user-global fallback (no project context yet). */
  viaGlobalFallback: boolean;
};

export async function getProjectActiveConnection(
  userId: string,
  projectId: string,
  options: { allowGlobalFallback?: boolean } = {}
): Promise<ConnectionResolution | null> {
  const sb = getAdminSupabase();

  const { data: bindingRow } = await sb
    .from("project_meta_business_managers")
    .select("meta_connection_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .not("meta_connection_id", "is", null)
    .limit(1)
    .maybeSingle();

  const bindingConnectionId =
    (bindingRow as { meta_connection_id: string | null } | null)
      ?.meta_connection_id ?? null;

  if (bindingConnectionId) {
    const conn = await getConnectionById(userId, bindingConnectionId);
    if (conn) {
      return { connection: conn, viaBinding: true, viaGlobalFallback: false };
    }
  }

  if (options.allowGlobalFallback) {
    const conn = await getActiveConnection(userId);
    if (conn) {
      return {
        connection: conn,
        viaBinding: false,
        viaGlobalFallback: true,
      };
    }
  }

  return null;
}

/**
 * Returns the access token to use for Meta API calls in the context of the
 * given project. Honors `allowGlobalFallback` per the rule above.
 */
export async function getProjectActiveAccessToken(
  userId: string,
  projectId: string,
  options: { allowGlobalFallback?: boolean } = {}
): Promise<ActiveTokenResult | null> {
  const resolution = await getProjectActiveConnection(userId, projectId, options);
  if (!resolution) return null;

  // If we resolved via global fallback, prefer the existing global helper
  // (handles same legacy path). Otherwise load token for the specific
  // connection bound to this project.
  if (resolution.viaGlobalFallback) {
    return getActiveAccessToken(userId);
  }
  return getAccessTokenForConnection(userId, resolution.connection.id);
}

/**
 * Returns true if any active binding in another project still uses this
 * Meta connection. Used by per-project Disconnect to decide whether to
 * also invalidate the global token (no other project depends on it).
 */
export async function isConnectionUsedByOtherProjects(params: {
  userId: string;
  connectionId: string;
  excludeProjectId: string;
}): Promise<boolean> {
  const sb = getAdminSupabase();
  const { count } = await sb
    .from("project_meta_business_managers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("meta_connection_id", params.connectionId)
    .eq("status", "active")
    .neq("project_id", params.excludeProjectId);

  return (count ?? 0) > 0;
}
