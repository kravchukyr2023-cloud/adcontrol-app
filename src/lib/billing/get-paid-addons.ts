import { supabase } from "@/lib/supabase/client";
import { AddonCounts, EMPTY_ADDON_COUNTS } from "@/config/plans";
import { toAddonId } from "./addon-type-mapping";

export async function getPaidAddons(): Promise<AddonCounts> {
  try {
    const { data } = await supabase
      .from("user_paid_addons")
      .select("addon_type, quantity, status");

    if (!data) return EMPTY_ADDON_COUNTS;

    const result: AddonCounts = { ...EMPTY_ADDON_COUNTS };

    for (const row of data) {
      const r = row as {
        addon_type: string;
        quantity: number;
        status: string;
      };
      if (r.status !== "active") continue;
      const id = toAddonId(r.addon_type);
      if (!id) continue;
      result[id] = Math.max(0, Number(r.quantity) || 0);
    }

    return result;
  } catch {
    return EMPTY_ADDON_COUNTS;
  }
}
