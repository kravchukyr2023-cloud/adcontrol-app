import { supabase } from "@/lib/supabase/client";
import { insertAdAccount } from "@/lib/resources/insert-ad-account";
import { ACTIVE_PROJECT_KEY } from "@/hooks/use-active-project";
import { purchaseAddons } from "./purchase-addons";

export async function purchaseExtraAdAccount(
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const userId = session.user.id;

  const targetProjectId =
    typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_PROJECT_KEY)
      : null;

  if (targetProjectId) {
    try {
      const { data: firstBm } = await supabase
        .from("project_business_managers")
        .select("id")
        .eq("project_id", targetProjectId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstBm) {
        const bmId = (firstBm as { id: string }).id;
        for (let i = 0; i < quantity; i++) {
          await insertAdAccount({
            bm_id: bmId,
            project_id: targetProjectId,
            user_id: userId,
            ad_account_name: `Extra Ad Account ${i + 1}`,
            source_type: "manual",
            is_base_resource: false,
            is_extra_paid: true,
            addon_source_type: "extra_ad_account_package",
          });
        }
      }
    } catch {
      // ignore
    }
  }

  await purchaseAddons({
    existingProjectAdAccount: quantity,
  });
}
