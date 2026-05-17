import { supabase } from "@/lib/supabase/client";
import { insertBM } from "@/lib/resources/insert-bm";
import { insertAdAccount } from "@/lib/resources/insert-ad-account";
import { ACTIVE_PROJECT_KEY } from "@/hooks/use-active-project";
import { purchaseAddons } from "./purchase-addons";

type Opts = {
  packages: number;
  nestedAAs: number;
};

export async function purchaseExtraBmPackage(opts: Opts): Promise<void> {
  if (opts.packages <= 0 && opts.nestedAAs <= 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const userId = session.user.id;

  const targetProjectId =
    typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_PROJECT_KEY)
      : null;

  const newBmIds: string[] = [];

  if (targetProjectId) {
    for (let i = 0; i < opts.packages; i++) {
      try {
        const bm = await insertBM({
          project_id: targetProjectId,
          user_id: userId,
          bm_name: `Extra BM ${Date.now()}-${i}`,
          source_type: "manual",
          is_base_resource: false,
          is_extra_paid: true,
          addon_source_type: "extra_business_manager_package",
        });

        if (bm) {
          newBmIds.push(bm.id);
          await insertAdAccount({
            bm_id: bm.id,
            project_id: targetProjectId,
            user_id: userId,
            ad_account_name: `Extra BM Ad Account`,
            source_type: "manual",
            is_base_resource: false,
            is_extra_paid: true,
            addon_source_type: "extra_business_manager_package",
          });
        }
      } catch {
        // ignore
      }
    }

    if (opts.nestedAAs > 0) {
      const targetBmId =
        newBmIds[newBmIds.length - 1] ??
        (await firstBmIdForProject(targetProjectId));

      if (targetBmId) {
        for (let i = 0; i < opts.nestedAAs; i++) {
          try {
            await insertAdAccount({
              bm_id: targetBmId,
              project_id: targetProjectId,
              user_id: userId,
              ad_account_name: `Extra Ad Account ${i + 1}`,
              source_type: "manual",
              is_base_resource: false,
              is_extra_paid: true,
              addon_source_type: "nested_extra_ad_account",
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }

  await purchaseAddons({
    existingProjectBusinessManager: opts.packages,
    extraProjectAdAccount: opts.nestedAAs,
  });
}

async function firstBmIdForProject(
  projectId: string
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("project_business_managers")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}
