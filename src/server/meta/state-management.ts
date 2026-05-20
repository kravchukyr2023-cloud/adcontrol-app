import "server-only";
import { getAdminSupabase } from "./admin-supabase";

/**
 * Low-level state primitives for meta_sync_states.
 *
 * Layer rules:
 *   - Pure DB writes on a single row identified by
 *     (user_id, resource_type, resource_id).
 *   - One responsibility per function (mark X status / update heartbeat).
 *   - Sets updated_at = now() explicitly (no triggers — Phase 2 rule 7).
 *   - Idempotent: re-calling with the same arguments is safe.
 *
 * No business logic. No concurrency control. No stale-lock detection.
 * Those live in lock-management.ts, which composes these primitives.
 */

export type SyncStateKey = {
  userId: string;
  resourceType: string;
  resourceId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Mark a sync state as 'pending' (queue arrival; not yet syncing).
 * Single-round-trip UPSERT — creates row if missing, otherwise updates
 * status + sync_requested_at without clobbering other columns.
 */
export async function markPending(key: SyncStateKey): Promise<void> {
  const sb = getAdminSupabase();
  const now = nowIso();
  await sb.from("meta_sync_states").upsert(
    {
      user_id: key.userId,
      resource_type: key.resourceType,
      resource_id: key.resourceId,
      sync_status: "pending",
      sync_requested_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,resource_type,resource_id" }
  );
}

/**
 * Mark a sync state as 'syncing' (lock taken) + seed heartbeat.
 * Used by lock-management.acquireLock after the read+decide step.
 */
export async function markSyncing(key: SyncStateKey): Promise<void> {
  const sb = getAdminSupabase();
  const now = nowIso();
  await sb.from("meta_sync_states").upsert(
    {
      user_id: key.userId,
      resource_type: key.resourceType,
      resource_id: key.resourceId,
      sync_status: "syncing",
      heartbeat_at: now,
      last_sync_at: now,
      sync_requested_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,resource_type,resource_id" }
  );
}

/**
 * Refresh heartbeat_at on a row that is currently syncing.
 *
 * Guard: only updates if sync_status='syncing'. Prevents accidentally
 * extending a lock that was released (e.g., by stale-lock recovery).
 */
export async function updateHeartbeat(key: SyncStateKey): Promise<void> {
  const sb = getAdminSupabase();
  const now = nowIso();
  await sb
    .from("meta_sync_states")
    .update({ heartbeat_at: now, updated_at: now })
    .eq("user_id", key.userId)
    .eq("resource_type", key.resourceType)
    .eq("resource_id", key.resourceId)
    .eq("sync_status", "syncing");
}

/**
 * Terminal: sync completed but some scopes truncated / aborted gracefully.
 * Clears heartbeat, bumps sync_version, clears prior error fields.
 */
export async function markPartial(key: SyncStateKey): Promise<void> {
  await terminalUpdate(key, {
    sync_status: "partial",
    clearError: true,
  });
}

/**
 * Terminal: sync failed with an error message.
 * Clears heartbeat, bumps sync_version, sets last_error + last_error_at.
 */
export async function markError(
  key: SyncStateKey,
  errorMessage: string
): Promise<void> {
  await terminalUpdate(key, {
    sync_status: "error",
    errorMessage,
  });
}

/**
 * Terminal: sync completed successfully.
 * Clears heartbeat, bumps sync_version, sets last_successful_sync_at
 * (and last_manual_sync_at if opts.isManual).
 */
export async function markSuccess(
  key: SyncStateKey,
  opts: { isManual?: boolean } = {}
): Promise<void> {
  await terminalUpdate(key, {
    sync_status: "idle",
    clearError: true,
    setLastSuccessful: true,
    setLastManual: opts.isManual === true,
  });
}

type TerminalOpts = {
  sync_status: "idle" | "partial" | "error";
  clearError?: boolean;
  errorMessage?: string;
  setLastSuccessful?: boolean;
  setLastManual?: boolean;
};

async function terminalUpdate(
  key: SyncStateKey,
  opts: TerminalOpts
): Promise<void> {
  const sb = getAdminSupabase();
  const now = nowIso();

  // Bump sync_version: read current then UPDATE+1. V1 simplification —
  // race-tolerant only because terminal updates happen after the lock
  // was held by this process, so no concurrent writer.
  const { data: cur } = await sb
    .from("meta_sync_states")
    .select("sync_version")
    .eq("user_id", key.userId)
    .eq("resource_type", key.resourceType)
    .eq("resource_id", key.resourceId)
    .maybeSingle();

  const nextVersion =
    ((cur as { sync_version: number } | null)?.sync_version ?? 0) + 1;

  type Patch = Record<string, string | number | null>;
  const patch: Patch = {
    sync_status: opts.sync_status,
    heartbeat_at: null,
    last_sync_at: now,
    sync_version: nextVersion,
    updated_at: now,
  };
  if (opts.clearError) {
    patch.last_error = null;
    patch.last_error_at = null;
  }
  if (opts.errorMessage !== undefined) {
    patch.last_error = opts.errorMessage;
    patch.last_error_at = now;
  }
  if (opts.setLastSuccessful) patch.last_successful_sync_at = now;
  if (opts.setLastManual) patch.last_manual_sync_at = now;

  await sb
    .from("meta_sync_states")
    .update(patch)
    .eq("user_id", key.userId)
    .eq("resource_type", key.resourceType)
    .eq("resource_id", key.resourceId);
}
