import { supabase } from "@/lib/supabase/client";

export type ProjectUsage = {
  projects: number;
};

export async function getProjectUsage(): Promise<ProjectUsage> {
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true });

  return { projects: Math.max(0, count ?? 0) };
}
