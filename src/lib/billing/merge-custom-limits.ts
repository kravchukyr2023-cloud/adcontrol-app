import { AddonCounts, Plan } from "@/config/plans";

/**
 * Effective SaaS limits after applying paid addons.
 *
 * Per-project semantics:
 *  - projectsTotal:              global project count limit
 *  - businessManagersPerProject: BMs allowed inside each project
 *  - adAccountsPerProject:       Ad Accounts allowed inside each project
 *
 * Resources in one project do not consume the per-project quota of another.
 */
export type EffectiveLimits = {
  projectsTotal: number;
  businessManagersPerProject: number;
  adAccountsPerProject: number;
};

/**
 * For now only `extraProjectPackage` increments a quota (extra project slot).
 * Other addons remain available for purchase but do not affect the per-project
 * limits expressed by this model. Per-project addon semantics is a product
 * decision deferred to a later sprint — when finalized, this is the single
 * place to wire it in.
 */
export function mergeLimits(
  plan: Plan,
  addons: AddonCounts
): EffectiveLimits {
  return {
    projectsTotal: plan.maxProjectsTotal + addons.extraProjectPackage,
    businessManagersPerProject: plan.maxBusinessManagersPerProject,
    adAccountsPerProject: plan.maxAdAccountsPerProject,
  };
}
