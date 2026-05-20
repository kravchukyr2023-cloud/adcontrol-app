import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import { STALE_LOCK_TIMEOUT_MS } from "./sync-constants";
import {
  markError,
  markPartial,
  markSuccess,
  markSyncing,
  updateHeartbeat,
  type SyncStateKey,
} from "./state-management";

/**
 * Sync lock coordination on meta_sync_states.
 *
 * Composes state-management primitives into 3 lifecycle operations:
 *   - acquireLock    : take the lock, with stale-lock recovery
 *   - refreshHeartbeat: keep the lock alive during long syncs
 *   - releaseLock    : terminate the lock with a status outcome
 *
 * Lock semantics:
 *   - "Locked" = (sync_status='syncing' AND heartbeat_at recent).
 *   - "Stale lock" = sync_status='syncing' BUT heartbeat_at older than
 *     STALE_LOCK_TIMEOUT_MS (30s) — caller assumed dead, lock recoverable.
 *
 * V1 race tolerance:
 *   Uses SELECT-then-UPDATE rather than true atomic CAS. Two concurrent
 *   acquirers may briefly see the lock as acquirable; both will UPDATE
 *   to syncing (idempotent final state). The actual sync work is
 *   sequential per call, and all upsert layers are idempotent, so the
 *   worst case is one wasted sync attempt — no data corruption.
 *
 *   Phase 5 (background queue) will replace this with a Postgres
 *   advisory lock or row-level pg_try_advisory_xact_lock() for true CAS.
 */

export type AcquireResult =
  | {
      acquired: true;
      /** True when we overwrote a stale lock (process likely died). */
      recovered: boolean;
      previousVersion: number;
      lastSuccessfulSyncAt: string | null;
    }
  | {
      acquired: false;
      reason: "already_syncing" | "state_read_failed";
      errorMessage?: string;
    };

export type ReleaseStatus = "idle" | "partial" | "error";

/**
 * Try to acquire the sync lock for (user, resource_type, resource_id).
 *
 * - If row doesn't exist → creates it (via markSyncing UPSERT) and acquires.
 * - If row exists and not syncing → acquires.
 * - If row is 'syncing' AND heartbeat fresh → returns acquired=false.
 * - If row is 'syncing' AND heartbeat stale (>30s) → overrides ("recovered").
 */
export async function acquireLock(key: SyncStateKey): Promise<AcquireResult> {
  const sb = getAdminSupabase();
  const staleThresholdMs = Date.now() - STALE_LOCK_TIMEOUT_MS;

  const { data, error } = await sb
    .from("meta_sync_states")
    .select("sync_status, heartbeat_at, sync_version, last_successful_sync_at")
    .eq("user_id", key.userId)
    .eq("resource_type", key.resourceType)
    .eq("resource_id", key.resourceId)
    .maybeSingle();

  if (error) {
    return {
      acquired: false,
      reason: "state_read_failed",
      errorMessage: error.message,
    };
  }

  let isSyncing = false;
  let heartbeatMs = 0;
  let previousVersion = 0;
  let lastSuccessfulSyncAt: string | null = null;

  if (data) {
    const cur = data as {
      sync_status: string;
      heartbeat_at: string | null;
      sync_version: number;
      last_successful_sync_at: string | null;
    };
    isSyncing = cur.sync_status === "syncing";
    heartbeatMs = cur.heartbeat_at
      ? new Date(cur.heartbeat_at).getTime()
      : 0;
    previousVersion = cur.sync_version ?? 0;
    lastSuccessfulSyncAt = cur.last_successful_sync_at;
  }

  const isStale = isSyncing && heartbeatMs < staleThresholdMs;

  if (isSyncing && !isStale) {
    return { acquired: false, reason: "already_syncing" };
  }

  // Lock acquisition (also creates the row if missing).
  await markSyncing(key);

  return {
    acquired: true,
    recovered: isStale,
    previousVersion,
    lastSuccessfulSyncAt,
  };
}

/**
 * Refresh the heartbeat for an in-flight sync. Called by the engine
 * between scopes / pages. No-op if the lock was released (guarded by
 * sync_status='syncing' inside updateHeartbeat).
 */
export async function refreshHeartbeat(key: SyncStateKey): Promise<void> {
  await updateHeartbeat(key);
}

/**
 * Terminate the sync run and release the lock.
 *
 *   finalStatus='idle'    → markSuccess (sets last_successful_sync_at)
 *   finalStatus='partial' → markPartial (some scopes truncated/aborted)
 *   finalStatus='error'   → markError   (errorMessage required)
 *
 * All terminal paths: clear heartbeat_at, bump sync_version, set
 * last_sync_at.
 */
export async function releaseLock(params: {
  key: SyncStateKey;
  finalStatus: ReleaseStatus;
  errorMessage?: string;
  /** True when the sync was triggered manually (button click). */
  isManual?: boolean;
}): Promise<void> {
  if (params.finalStatus === "idle") {
    await markSuccess(params.key, { isManual: params.isManual });
    return;
  }
  if (params.finalStatus === "partial") {
    await markPartial(params.key);
    return;
  }
  await markError(params.key, params.errorMessage ?? "unknown error");
}
