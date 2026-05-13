"use server";

import { supabase } from "@/lib/supabase/client";

type CreateProjectData = {
  userId: string;

  name: string;
  description: string;

  currency: string;
  timezone: string;

  monthlyRevenueGoal: number;
  monthlyAdBudget: number;

  targetRoas: number;
  targetCpa: number;
};

export async function createProject(
  data: CreateProjectData
) {

  const { data: project, error } =
    await supabase
      .from("projects")
      .insert({
        user_id: data.userId,

        name: data.name,
        description: data.description,

        currency: data.currency,
        timezone: data.timezone,

        monthly_revenue_goal:
          data.monthlyRevenueGoal,

        monthly_ad_budget:
          data.monthlyAdBudget,

        target_roas: data.targetRoas,
        target_cpa: data.targetCpa,
      })

      .select()
      .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("project_settings")
    .insert({
      project_id: project.id,
    });

  return project;
}
