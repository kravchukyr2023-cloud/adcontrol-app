import { supabase } from "@/lib/supabase/client";

export type AdAccountInsertPayload = {
  bm_id: string;
  project_id: string;
  user_id: string;
  ad_account_name: string;
  source_type?: "manual" | "meta_sync";
  is_base_resource?: boolean;
  is_extra_paid?: boolean;
  addon_source_type?: string | null;
};

export type AdAccountRow = {
  id: string;
  bm_id: string;
  project_id: string;
  user_id: string;
  ad_account_name: string;
  status: string;
  is_locked: boolean;
  is_paused: boolean;
};

export async function insertAdAccount(
  payload: AdAccountInsertPayload
): Promise<AdAccountRow | null> {
  const { data, error } = await supabase
    .from("business_manager_ad_accounts")
    .insert({
      bm_id: payload.bm_id,
      project_id: payload.project_id,
      user_id: payload.user_id,
      ad_account_name: payload.ad_account_name,
      source_type: payload.source_type ?? "manual",
      is_base_resource: payload.is_base_resource ?? false,
      is_extra_paid: payload.is_extra_paid ?? false,
      addon_source_type: payload.addon_source_type ?? null,
      status: "active",
      is_locked: false,
      is_paused: false,
    })
    .select(
      "id, bm_id, project_id, user_id, ad_account_name, status, is_locked, is_paused"
    )
    .single();

  if (error || !data) return null;
  return data as AdAccountRow;
}
