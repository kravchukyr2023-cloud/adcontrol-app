import { AddonCounts, Plan } from "@/config/plans";

export type EffectiveLimits = {
  projects: number;
  businessManagersTotal: number;
  adAccountsTotal: number;
  businessManagersPerProject: number;
  adAccountsPerBusinessManager: number;
};

export function mergeLimits(
  plan: Plan,
  addons: AddonCounts
): EffectiveLimits {
  return {
    projects:
      plan.maxProjects + addons.extraProjectPackage,

    businessManagersTotal:
      plan.maxBusinessManagersTotal +
      addons.extraProjectPackage +
      addons.extraProjectBusinessManager +
      addons.existingProjectBusinessManager,

    adAccountsTotal:
      plan.maxAdAccountsTotal +
      addons.extraProjectPackage +
      addons.extraProjectBusinessManager +
      addons.extraProjectAdAccount +
      addons.existingProjectBusinessManager +
      addons.existingProjectAdAccount,

    businessManagersPerProject: plan.maxBusinessManagersPerProject,
    adAccountsPerBusinessManager: plan.maxAdAccountsPerBusinessManager,
  };
}
