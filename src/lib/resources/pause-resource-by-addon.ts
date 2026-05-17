import { supabase } from "@/lib/supabase/client";

export async function pauseResourceByAddonType(
  dbAddonType: string
): Promise<void> {
  try {
    const ts = new Date().toISOString();

    const { data: bms } = await supabase
      .from("project_business_managers")
      .select("id")
      .eq("addon_source_type", dbAddonType)
      .eq("is_paused", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (bms && bms.length > 0) {
      await supabase
        .from("project_business_managers")
        .update({
          is_locked: true,
          is_paused: true,
          locked_reason: "manually_disabled",
          updated_at: ts,
        })
        .eq("id", (bms[0] as { id: string }).id);
      return;
    }

    const { data: ads } = await supabase
      .from("business_manager_ad_accounts")
      .select("id")
      .eq("addon_source_type", dbAddonType)
      .eq("is_paused", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (ads && ads.length > 0) {
      await supabase
        .from("business_manager_ad_accounts")
        .update({
          is_locked: true,
          is_paused: true,
          locked_reason: "manually_disabled",
          updated_at: ts,
        })
        .eq("id", (ads[0] as { id: string }).id);
    }
  } catch {
    // Defensive.
  }
}
