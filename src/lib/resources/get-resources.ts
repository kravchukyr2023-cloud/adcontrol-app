import { supabase } from "@/lib/supabase/client";

export type BmWithAds = {
  id: string;
  bm_name: string;
  status: string;
  is_base_resource: boolean;
  is_extra_paid: boolean;
  addon_source_type: string | null;
  is_locked: boolean;
  is_paused: boolean;
  locked_reason: string | null;
  ad_accounts: AdAccountRow[];
};

export type AdAccountRow = {
  id: string;
  ad_account_name: string;
  status: string;
  is_base_resource: boolean;
  is_extra_paid: boolean;
  addon_source_type: string | null;
  is_locked: boolean;
  is_paused: boolean;
  locked_reason: string | null;
};

export async function getProjectResources(
  projectId: string
): Promise<BmWithAds[]> {
  try {
    const { data: bms } = await supabase
      .from("project_business_managers")
      .select(
        "id, bm_name, status, is_base_resource, is_extra_paid, addon_source_type, is_locked, is_paused, locked_reason"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!bms) return [];

    const { data: ads } = await supabase
      .from("business_manager_ad_accounts")
      .select(
        "id, bm_id, ad_account_name, status, is_base_resource, is_extra_paid, addon_source_type, is_locked, is_paused, locked_reason"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    const adByBm = new Map<string, AdAccountRow[]>();
    for (const ad of ads ?? []) {
      const a = ad as AdAccountRow & { bm_id: string };
      if (!adByBm.has(a.bm_id)) adByBm.set(a.bm_id, []);
      adByBm.get(a.bm_id)!.push(a);
    }

    return (bms as BmWithAds[]).map((bm) => ({
      ...bm,
      ad_accounts: adByBm.get(bm.id) ?? [],
    }));
  } catch {
    return [];
  }
}

export async function getFirstBmForProject(
  projectId: string
): Promise<{ id: string } | null> {
  try {
    const { data } = await supabase
      .from("project_business_managers")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return data as { id: string };
  } catch {
    return null;
  }
}
