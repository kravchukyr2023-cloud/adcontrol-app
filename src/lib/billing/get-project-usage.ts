import { supabase } from "@/lib/supabase/client";

export type ProjectUsage = {
  projects: number;
  businessManagers: number;
  adAccounts: number;
};

async function safeCount(table: string): Promise<number> {
  try {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    return Math.max(0, count ?? 0);
  } catch {
    return 0;
  }
}

export async function getProjectUsage(): Promise<ProjectUsage> {
  const [projects, bms, ads] = await Promise.all([
    safeCount("projects"),
    safeCount("project_business_managers"),
    safeCount("business_manager_ad_accounts"),
  ]);

  return {
    projects,
    businessManagers: bms,
    adAccounts: ads,
  };
}
