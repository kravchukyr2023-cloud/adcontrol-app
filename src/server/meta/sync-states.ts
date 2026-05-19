import "server-only";
import { getAdminSupabase } from "./admin-supabase";

export type SyncResourceType =
  | "connection"
  | "business_manager"
  | "ad_account"
  | "campaigns"
  | "adsets"
  | "ads"
  | "insights";

export type SyncStatus =
  | "idle"
  | "pending"
  | "syncing"
  | "success"
  | "error"
  | "expired"
  | "paused";

/**
 * Resource-centric sync_states: one row per (user_id, resource_type, resource_id).
 * Projects only consume insights via JOIN; they do NOT own sync state.
 *
 * Shared resources (same AA in multiple projects) → single sync_state row.
 * No duplicate fetches per project.
 */
async function upsertResourceState(p: {
  userId: string;
  resourceType: SyncResourceType;
  resourceId: string;
  syncStatus?: SyncStatus;
}): Promise<void> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // ignoreDuplicates: existing sync state (with progress, last_sync_at, errors)
  // must NOT be reset back to idle by a downstream selection event.
  await supabase.from("meta_sync_states").upsert(
    {
      user_id: p.userId,
      resource_type: p.resourceType,
      resource_id: p.resourceId,
      sync_status: p.syncStatus ?? "idle",
      updated_at: now,
    },
    {
      onConflict: "user_id,resource_type,resource_id",
      ignoreDuplicates: true,
    }
  );
}

/**
 * Seed sync_state rows for the Meta resources behind a project AA selection.
 * Idempotent — existing rows preserved (their progress not overwritten).
 *
 * Called from selectProjectAa() after a new AA selection is persisted.
 */
export async function initResourceSyncStates(params: {
  userId: string;
  metaUserId: string;
  metaBmId: string;
  metaAdAccountId: string;
}): Promise<void> {
  await upsertResourceState({
    userId: params.userId,
    resourceType: "connection",
    resourceId: params.metaUserId,
  });
  await upsertResourceState({
    userId: params.userId,
    resourceType: "business_manager",
    resourceId: params.metaBmId,
  });
  await upsertResourceState({
    userId: params.userId,
    resourceType: "ad_account",
    resourceId: params.metaAdAccountId,
  });
}

/**
 * Pause sync states for ALL resources of a user (e.g. billing paused or global disconnect).
 * Note: per resolved architecture rule, sync ownership is (user + resource).
 * Project-level pause is not a thing here — projects are consumers, not owners.
 */
export async function pauseAllUserSyncStates(userId: string): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("meta_sync_states")
    .update({
      sync_status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .neq("sync_status", "paused");
}
