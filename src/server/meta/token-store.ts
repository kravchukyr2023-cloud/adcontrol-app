import "server-only";
import { getAdminSupabase } from "./admin-supabase";

/**
 * Sole access layer for Meta OAuth access tokens.
 *
 * Tokens live in the meta_connection_tokens table which has RLS enabled
 * with NO policies — meaning only the service-role key (used by this file)
 * can read or write tokens. No other code path in the codebase should
 * touch meta_connection_tokens.
 *
 * V1: plaintext column. Future: pgsodium-encrypted column or move to
 * external secret storage. Token-store API stays the same.
 *
 * Note on schema migration (Sprint 2.5 → Step 1.5):
 *   - Primary status column is now `status` (unified text enum).
 *   - Legacy `connection_status` is dual-written for backward compat.
 *   - Reads prefer `status`.
 */

export type MetaStatus =
  | "active"
  | "inactive"
  | "pending"
  | "syncing"
  | "expired"
  | "disconnected"
  | "paused"
  | "locked"
  | "deleted";

export type ConnectionSummary = {
  id: string;
  user_id: string;
  meta_user_id: string;
  meta_user_name: string | null;
  scope: string;
  status: MetaStatus;
  token_expires_at: string | null;
  last_connected_at: string;
  last_disconnected_at: string | null;
};

export type ActiveTokenResult = {
  connectionId: string;
  token: string;
  expiresAt: Date | null;
};

const SELECT_COLS =
  "id, user_id, meta_user_id, meta_user_name, scope, status, token_expires_at, last_connected_at, last_disconnected_at";

export async function getActiveConnection(
  userId: string
): Promise<ConnectionSummary | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("meta_connections")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("last_connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConnectionSummary;
}

export async function getConnectionByMetaUser(
  userId: string,
  metaUserId: string
): Promise<ConnectionSummary | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("meta_connections")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .eq("meta_user_id", metaUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConnectionSummary;
}

export async function listConnections(
  userId: string
): Promise<ConnectionSummary[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("meta_connections")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .order("last_connected_at", { ascending: false });

  if (error || !data) return [];
  return data as ConnectionSummary[];
}

export async function getActiveAccessToken(
  userId: string
): Promise<ActiveTokenResult | null> {
  const conn = await getActiveConnection(userId);
  if (!conn) return null;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("meta_connection_tokens")
    .select("access_token")
    .eq("connection_id", conn.id)
    .maybeSingle();

  if (error || !data) return null;

  const tokenRow = data as { access_token: string };
  return {
    connectionId: conn.id,
    token: tokenRow.access_token,
    expiresAt: conn.token_expires_at
      ? new Date(conn.token_expires_at)
      : null,
  };
}

export type SaveConnectionResult = {
  connectionId: string;
  isReconnect: boolean;
};

export async function saveConnection(params: {
  userId: string;
  metaUserId: string;
  metaUserName: string | null;
  accessToken: string;
  expiresAt: Date | null;
  scope: string;
}): Promise<SaveConnectionResult> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const existing = await getConnectionByMetaUser(
    params.userId,
    params.metaUserId
  );
  const isReconnect = existing !== null;

  const { data: conn, error: connErr } = await supabase
    .from("meta_connections")
    .upsert(
      {
        user_id: params.userId,
        meta_user_id: params.metaUserId,
        meta_user_name: params.metaUserName,
        scope: params.scope,
        status: "active",
        connection_status: "connected",
        token_expires_at: params.expiresAt?.toISOString() ?? null,
        last_connected_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,meta_user_id" }
    )
    .select("id")
    .single();

  if (connErr || !conn) {
    throw new Error(
      `Failed to upsert meta_connections: ${connErr?.message}`
    );
  }

  const connectionId = (conn as { id: string }).id;

  const { error: tokenErr } = await supabase
    .from("meta_connection_tokens")
    .upsert(
      {
        connection_id: connectionId,
        user_id: params.userId,
        access_token: params.accessToken,
        updated_at: now,
      },
      { onConflict: "connection_id" }
    );

  if (tokenErr) {
    throw new Error(
      `Failed to upsert meta_connection_tokens: ${tokenErr.message}`
    );
  }

  return { connectionId, isReconnect };
}

export async function invalidateConnection(
  userId: string,
  connectionId: string
): Promise<void> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  await supabase
    .from("meta_connection_tokens")
    .delete()
    .eq("connection_id", connectionId)
    .eq("user_id", userId);

  await supabase
    .from("meta_connections")
    .update({
      status: "disconnected",
      connection_status: "disconnected",
      last_disconnected_at: now,
      updated_at: now,
    })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

export async function markConnectionExpired(
  connectionId: string
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("meta_connections")
    .update({
      status: "expired",
      connection_status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}
