import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import { initResourceSyncStates } from "./sync-states";

/**
 * Many-to-many project ↔ Meta wiring helpers.
 *
 * Replaces the prior 1:1:1 `wireProject()` with four independent operations:
 *  - addProjectBm        — attach a BM to a project (creates BM membership)
 *  - removeProjectBm     — soft-detach (status='inactive') + cascade AA selections
 *  - selectProjectAa     — select an AA under a BM membership
 *  - deselectProjectAa   — soft-deselect (status='inactive')
 *
 * Caller must verify project ownership against auth.uid() and call
 * enforceAddBmLimit / enforceAddAaLimit before these helpers.
 *
 * Resource-centric sync_states (one row per (user_id, resource_type,
 * resource_id)) are seeded on AA selection — never deleted on deselection,
 * because the same Meta resource may still be active in another project.
 */

type AddProjectBmInput = {
  userId: string;
  projectId: string;
  metaConnectionId: string;
  metaBmRowId: string;
};

export async function addProjectBm(
  params: AddProjectBmInput
): Promise<{ projectMetaBusinessManagerId: string }> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  // Reactivate if there's already a (project, BM) row, regardless of status.
  const { data: existing } = await sb
    .from("project_meta_business_managers")
    .select("id, status")
    .eq("project_id", params.projectId)
    .eq("meta_business_manager_id", params.metaBmRowId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status !== "active") {
      const { error } = await sb
        .from("project_meta_business_managers")
        .update({
          status: "active",
          meta_connection_id: params.metaConnectionId,
          added_at: now,
          removed_at: null,
          updated_at: now,
        })
        .eq("id", row.id);
      if (error) {
        throw new Error(`Failed to reactivate BM membership: ${error.message}`);
      }
    }
    return { projectMetaBusinessManagerId: row.id };
  }

  const { data: inserted, error: insErr } = await sb
    .from("project_meta_business_managers")
    .insert({
      user_id: params.userId,
      project_id: params.projectId,
      meta_connection_id: params.metaConnectionId,
      meta_business_manager_id: params.metaBmRowId,
      status: "active",
      added_at: now,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    throw new Error(
      `Failed to add BM membership: ${insErr?.message ?? "unknown"}`
    );
  }
  return {
    projectMetaBusinessManagerId: (inserted as { id: string }).id,
  };
}

export async function removeProjectBm(params: {
  userId: string;
  projectMetaBusinessManagerId: string;
}): Promise<void> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  // Soft-deselect all AA selections under this BM membership first.
  await sb
    .from("project_meta_ad_accounts")
    .update({ status: "inactive", deselected_at: now, updated_at: now })
    .eq("project_meta_business_manager_id", params.projectMetaBusinessManagerId)
    .eq("user_id", params.userId)
    .eq("status", "active");

  // Soft-deactivate the BM membership.
  const { error } = await sb
    .from("project_meta_business_managers")
    .update({ status: "inactive", removed_at: now, updated_at: now })
    .eq("id", params.projectMetaBusinessManagerId)
    .eq("user_id", params.userId);

  if (error) {
    throw new Error(`Failed to remove BM membership: ${error.message}`);
  }
}

type SelectProjectAaInput = {
  userId: string;
  projectId: string;
  projectMetaBusinessManagerId: string;
  metaAaRowId: string;
  metaUserId: string;
  metaBmId: string;
  metaAdAccountId: string;
};

export async function selectProjectAa(
  params: SelectProjectAaInput
): Promise<{ projectMetaAdAccountId: string }> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  // Reactivate existing (BM membership, AA) row if present.
  const { data: existing } = await sb
    .from("project_meta_ad_accounts")
    .select("id, status")
    .eq("project_meta_business_manager_id", params.projectMetaBusinessManagerId)
    .eq("meta_ad_account_id", params.metaAaRowId)
    .limit(1)
    .maybeSingle();

  let aaSelectionId: string;

  if (existing) {
    const row = existing as { id: string; status: string };
    aaSelectionId = row.id;
    if (row.status !== "active") {
      const { error } = await sb
        .from("project_meta_ad_accounts")
        .update({
          status: "active",
          selected_at: now,
          deselected_at: null,
          updated_at: now,
        })
        .eq("id", row.id);
      if (error) {
        throw new Error(`Failed to reactivate AA selection: ${error.message}`);
      }
    }
  } else {
    const { data: inserted, error: insErr } = await sb
      .from("project_meta_ad_accounts")
      .insert({
        user_id: params.userId,
        project_id: params.projectId,
        project_meta_business_manager_id:
          params.projectMetaBusinessManagerId,
        meta_ad_account_id: params.metaAaRowId,
        status: "active",
        selected_at: now,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      throw new Error(
        `Failed to select AA: ${insErr?.message ?? "unknown"}`
      );
    }
    aaSelectionId = (inserted as { id: string }).id;
  }

  // Seed/refresh sync_states for the underlying Meta resources.
  // Resource-centric: same AA in multiple projects shares a single sync_state row.
  await initResourceSyncStates({
    userId: params.userId,
    metaUserId: params.metaUserId,
    metaBmId: params.metaBmId,
    metaAdAccountId: params.metaAdAccountId,
  });

  return { projectMetaAdAccountId: aaSelectionId };
}

export async function deselectProjectAa(params: {
  userId: string;
  projectMetaAdAccountId: string;
}): Promise<void> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  const { error } = await sb
    .from("project_meta_ad_accounts")
    .update({ status: "inactive", deselected_at: now, updated_at: now })
    .eq("id", params.projectMetaAdAccountId)
    .eq("user_id", params.userId);

  if (error) {
    throw new Error(`Failed to deselect AA: ${error.message}`);
  }

  // Intentionally NOT deleting sync_states — the same Meta resource may still
  // be active in another project. Sync state cleanup is out of scope for V1.
}

/**
 * Cascade project Meta wiring when an OAuth connection is disconnected.
 * Sets all BM memberships tied to this connection to status='disconnected'
 * and same for their AA selections. Sync states remain — disconnection is
 * connection-scoped, not resource-scoped (resource may be reachable via
 * a different connection after reconnect).
 */
export async function cascadeBindingsOnConnectionDisconnect(params: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const sb = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: bmRows } = await sb
    .from("project_meta_business_managers")
    .select("id")
    .eq("user_id", params.userId)
    .eq("meta_connection_id", params.connectionId)
    .eq("status", "active");

  const bmIds = ((bmRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (bmIds.length === 0) return;

  await sb
    .from("project_meta_ad_accounts")
    .update({
      status: "disconnected",
      deselected_at: now,
      updated_at: now,
    })
    .in("project_meta_business_manager_id", bmIds)
    .eq("status", "active");

  await sb
    .from("project_meta_business_managers")
    .update({
      status: "disconnected",
      removed_at: now,
      updated_at: now,
    })
    .in("id", bmIds);
}
