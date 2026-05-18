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

type UpsertParams = {
  userId: string;
  projectId: string;
  bindingId: string | null;
  resourceType: SyncResourceType;
  resourceId: string | null;
  syncStatus?: SyncStatus;
};

async function upsertSyncState(p: UpsertParams): Promise<void> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  await supabase.from("meta_sync_states").upsert(
    {
      user_id: p.userId,
      project_id: p.projectId,
      binding_id: p.bindingId,
      resource_type: p.resourceType,
      resource_id: p.resourceId,
      sync_status: p.syncStatus ?? "idle",
      updated_at: now,
    },
    { onConflict: "project_id,resource_type,resource_id" }
  );
}

/**
 * Initialise 3 base sync_state rows for a fresh project↔Meta binding.
 * All set to sync_status='idle' — actual sync jobs come in Sprint 3 Step 2.
 */
export async function initBindingSyncStates(params: {
  userId: string;
  projectId: string;
  bindingId: string;
  metaUserId: string;
  metaBmId: string;
  metaAdAccountId: string;
}): Promise<void> {
  await upsertSyncState({
    userId: params.userId,
    projectId: params.projectId,
    bindingId: params.bindingId,
    resourceType: "connection",
    resourceId: params.metaUserId,
    syncStatus: "idle",
  });

  await upsertSyncState({
    userId: params.userId,
    projectId: params.projectId,
    bindingId: params.bindingId,
    resourceType: "business_manager",
    resourceId: params.metaBmId,
    syncStatus: "idle",
  });

  await upsertSyncState({
    userId: params.userId,
    projectId: params.projectId,
    bindingId: params.bindingId,
    resourceType: "ad_account",
    resourceId: params.metaAdAccountId,
    syncStatus: "idle",
  });
}

/**
 * Pause all sync states for a project (Meta disconnected or billing paused).
 */
export async function pauseProjectSyncStates(params: {
  userId: string;
  projectId: string;
}): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("meta_sync_states")
    .update({
      sync_status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", params.userId)
    .eq("project_id", params.projectId)
    .neq("sync_status", "paused");
}

/**
 * Pause sync states for ALL projects of a given user (e.g. global Meta disconnect).
 */
export async function pauseAllUserSyncStates(
  userId: string
): Promise<void> {
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

/**
 * Delete sync states attached to a binding (used when re-wiring overwrites the prior binding's resources).
 */
export async function deleteBindingSyncStates(
  bindingId: string
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("meta_sync_states")
    .delete()
    .eq("binding_id", bindingId);
}
