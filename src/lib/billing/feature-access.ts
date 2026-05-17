import { FeatureId, Plan, PLANS, PlanId } from "@/config/plans";

export function canAccess(feature: FeatureId, plan: Plan): boolean {
  return plan.features.includes(feature);
}

const PLAN_ORDER: PlanId[] = ["starter", "operator", "team", "scale"];

export function requiredPlanFor(feature: FeatureId): Plan | null {
  for (const id of PLAN_ORDER) {
    if (PLANS[id].features.includes(feature)) return PLANS[id];
  }
  return null;
}
