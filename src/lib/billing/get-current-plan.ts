import { Plan, PLANS } from "@/config/plans";
import { getBillingSummary } from "./get-billing-summary";

export async function getCurrentPlan(): Promise<Plan> {
  const summary = await getBillingSummary();
  return PLANS[summary.active_plan];
}
