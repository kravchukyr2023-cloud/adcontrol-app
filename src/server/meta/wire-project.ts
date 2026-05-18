import "server-only";
import { getAdminSupabase } from "./admin-supabase";
import {
  deleteBindingSyncStates,
  initBindingSyncStates,
} from "./sync-states";

/**
 * Wires a Meta BM + Ad Account to an AdControl project via the canonical
 * project_meta_bindings table.
 *
 * Caller MUST verify project ownership against auth.uid() before calling.
 *
 * V1 invariant: at most one active binding per project (enforced by
 * partial UNIQUE INDEX on (project_id) WHERE status='active'). Any
 * existing active binding for the same project is updated in place.
 *
 * This function does NOT touch the legacy project_business_managers /
 * business_manager_ad_accounts hierarchy or the deprecated
 * bm_external_id / ad_account_external_id columns. Those remain for
 * Sprint 2.5 billing-counter tracking only.
 */
export async function wireProject(params: {
  userId: string;
  projectId: string;
  metaConnectionId: string;
  metaBmRowId: string;
  metaAdAccountRowId: string;
  metaUserId: string;
  metaBmId: string;
  metaAdAccountId: string;
}): Promise<{ bindingId: string }> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("project_meta_bindings")
    .select("id")
    .eq("project_id", params.projectId)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  let bindingId: string;

  if (existing) {
    bindingId = (existing as { id: string }).id;

    await deleteBindingSyncStates(bindingId);

    const { error: updErr } = await supabase
      .from("project_meta_bindings")
      .update({
        meta_connection_id: params.metaConnectionId,
        meta_business_manager_id: params.metaBmRowId,
        meta_ad_account_id: params.metaAdAccountRowId,
        status: "active",
        bound_at: now,
        unbound_at: null,
        updated_at: now,
      })
      .eq("id", bindingId);

    if (updErr) {
      throw new Error(`Failed to update binding: ${updErr.message}`);
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("project_meta_bindings")
      .insert({
        user_id: params.userId,
        project_id: params.projectId,
        meta_connection_id: params.metaConnectionId,
        meta_business_manager_id: params.metaBmRowId,
        meta_ad_account_id: params.metaAdAccountRowId,
        status: "active",
        bound_at: now,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      throw new Error(`Failed to insert binding: ${insErr?.message}`);
    }
    bindingId = (inserted as { id: string }).id;
  }

  await initBindingSyncStates({
    userId: params.userId,
    projectId: params.projectId,
    bindingId,
    metaUserId: params.metaUserId,
    metaBmId: params.metaBmId,
    metaAdAccountId: params.metaAdAccountId,
  });

  return { bindingId };
}

/**
 * Cascade binding status when the underlying Meta connection is disconnected.
 * Active bindings tied to this connection become 'disconnected', their
 * meta_sync_states pause.
 */
export async function cascadeBindingsOnConnectionDisconnect(params: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { data: bindings } = await supabase
    .from("project_meta_bindings")
    .select("id")
    .eq("user_id", params.userId)
    .eq("meta_connection_id", params.connectionId)
    .eq("status", "active");

  if (!bindings || bindings.length === 0) return;

  const bindingIds = (bindings as Array<{ id: string }>).map(
    (b) => b.id
  );

  await supabase
    .from("project_meta_bindings")
    .update({
      status: "disconnected",
      unbound_at: now,
      updated_at: now,
    })
    .in("id", bindingIds);

  await supabase
    .from("meta_sync_states")
    .update({
      sync_status: "paused",
      updated_at: now,
    })
    .in("binding_id", bindingIds)
    .neq("sync_status", "paused");
}
