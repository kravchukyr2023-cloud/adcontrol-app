import { supabase } from "@/lib/supabase/client";
import { ADDONS, AddonId } from "@/config/plans";
import { toDbAddonType } from "./addon-type-mapping";

export async function setPaidAddon(
  id: AddonId,
  quantity: number
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const addon = ADDONS[id];
  const q = Math.max(0, quantity);

  await supabase
    .from("user_paid_addons")
    .upsert(
      {
        user_id: session.user.id,
        addon_type: toDbAddonType(id),
        quantity: q,
        unit_price: addon.priceMonthly,
        monthly_total: addon.priceMonthly * q,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,addon_type" }
    );
}
