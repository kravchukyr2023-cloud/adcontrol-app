import { supabase } from "@/lib/supabase/client";

export type ProjectUsage = {
  projects: number;
};

/**
 * Global user-level usage. Only `projects` count is meaningful at this scope
 * — BM/AA quotas are PER PROJECT (see Plan.maxBusinessManagersPerProject and
 * Plan.maxAdAccountsPerProject), so they are queried per-project at the point
 * of enforcement, not globally here.
 *
 * RLS limits the count to projects owned by auth.uid().
 */
export async function getProjectUsage(): Promise<ProjectUsage> {
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true });

  return { projects: Math.max(0, count ?? 0) };
}
