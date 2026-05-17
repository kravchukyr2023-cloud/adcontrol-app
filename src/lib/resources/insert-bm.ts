import { supabase } from "@/lib/supabase/client";

export type BmInsertPayload = {
  project_id: string;
  user_id: string;
  bm_name: string;
  source_type?: "manual" | "meta_sync";
  is_base_resource?: boolean;
  is_extra_paid?: boolean;
  addon_source_type?: string | null;
};

export type BmRow = {
  id: string;
  project_id: string;
  user_id: string;
  bm_name: string;
  status: string;
  is_locked: boolean;
  is_paused: boolean;
};

export async function insertBM(
  payload: BmInsertPayload
): Promise<BmRow | null> {
  const { data, error } = await supabase
    .from("project_business_managers")
    .insert({
      project_id: payload.project_id,
      user_id: payload.user_id,
      bm_name: payload.bm_name,
      source_type: payload.source_type ?? "manual",
      is_base_resource: payload.is_base_resource ?? false,
      is_extra_paid: payload.is_extra_paid ?? false,
      addon_source_type: payload.addon_source_type ?? null,
      status: "active",
      is_locked: false,
      is_paused: false,
    })
    .select("id, project_id, user_id, bm_name, status, is_locked, is_paused")
    .single();

  if (error || !data) return null;
  return data as BmRow;
}
