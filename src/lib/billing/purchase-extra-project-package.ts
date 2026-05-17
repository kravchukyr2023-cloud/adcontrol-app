import { supabase } from "@/lib/supabase/client";
import { insertBM } from "@/lib/resources/insert-bm";
import { insertAdAccount } from "@/lib/resources/insert-ad-account";
import { ACTIVE_PROJECT_KEY } from "@/hooks/use-active-project";
import { purchaseAddons } from "./purchase-addons";

type Opts = {
  packages: number;
  nestedBMs: number;
  nestedAAs: number;
};

async function getDefaults(): Promise<{
  currency: string;
  timezone: string;
}> {
  if (typeof window === "undefined") {
    return { currency: "USD", timezone: "UTC" };
  }
  const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  if (!activeId) return { currency: "USD", timezone: "UTC" };

  try {
    const { data } = await supabase
      .from("projects")
      .select("currency, timezone")
      .eq("id", activeId)
      .maybeSingle();
    if (!data) return { currency: "USD", timezone: "UTC" };
    const r = data as { currency?: string; timezone?: string };
    return {
      currency: r.currency || "USD",
      timezone: r.timezone || "UTC",
    };
  } catch {
    return { currency: "USD", timezone: "UTC" };
  }
}

async function nextExtraProjectName(): Promise<string> {
  try {
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true });
    return `New Extra Project ${(count ?? 0) + 1}`;
  } catch {
    return "New Extra Project";
  }
}

export async function purchaseExtraProjectPackage(
  opts: Opts
): Promise<void> {
  if (opts.packages <= 0 && opts.nestedBMs <= 0 && opts.nestedAAs <= 0) {
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const userId = session.user.id;
  const defaults = await getDefaults();
  const newProjectIds: string[] = [];

  for (let i = 0; i < opts.packages; i++) {
    const name = await nextExtraProjectName();

    let createdProjectId: string | null = null;
    try {
      const { data: project } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name,
          description: "",
          currency: defaults.currency,
          timezone: defaults.timezone,
          monthly_revenue_goal: 0,
          monthly_ad_budget: 0,
          target_roas: 0,
          target_cpa: 0,
        })
        .select("id, name")
        .single();

      if (project) {
        createdProjectId = (project as { id: string }).id;
        const projectName = (project as { name: string }).name;

        try {
          await supabase
            .from("project_settings")
            .insert({ project_id: createdProjectId });
        } catch {
          // ignore
        }

        try {
          const bm = await insertBM({
            project_id: createdProjectId,
            user_id: userId,
            bm_name: `${projectName} BM`,
            source_type: "manual",
            is_base_resource: true,
            is_extra_paid: true,
            addon_source_type: "extra_project_package",
          });

          if (bm) {
            await insertAdAccount({
              bm_id: bm.id,
              project_id: createdProjectId,
              user_id: userId,
              ad_account_name: `${projectName} Ad Account`,
              source_type: "manual",
              is_base_resource: true,
              is_extra_paid: true,
              addon_source_type: "extra_project_package",
            });
          }
        } catch {
          // resources optional
        }

        newProjectIds.push(createdProjectId);
      }
    } catch {
      // skip this iteration
    }
  }

  const targetProjectId =
    newProjectIds[newProjectIds.length - 1] ??
    (typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_PROJECT_KEY)
      : null);

  if (targetProjectId) {
    for (let i = 0; i < opts.nestedBMs; i++) {
      try {
        const bm = await insertBM({
          project_id: targetProjectId,
          user_id: userId,
          bm_name: `Extra BM ${i + 1}`,
          source_type: "manual",
          is_base_resource: false,
          is_extra_paid: true,
          addon_source_type: "extra_business_manager_package",
        });

        if (bm) {
          await insertAdAccount({
            bm_id: bm.id,
            project_id: targetProjectId,
            user_id: userId,
            ad_account_name: `Extra BM ${i + 1} Ad Account`,
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
          for (let i = 0; i < opts.nestedAAs; i++) {
            await insertAdAccount({
              bm_id: bmId,
              project_id: targetProjectId,
              user_id: userId,
              ad_account_name: `Extra Ad Account ${i + 1}`,
              source_type: "manual",
              is_base_resource: false,
              is_extra_paid: true,
              addon_source_type: "nested_extra_ad_account",
            });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  await purchaseAddons({
    extraProjectPackage: opts.packages,
    extraProjectBusinessManager: opts.nestedBMs,
    extraProjectAdAccount: opts.nestedAAs,
  });
}
