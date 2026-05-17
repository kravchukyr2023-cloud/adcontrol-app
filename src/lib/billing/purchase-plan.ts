import {
  PLANS,
  PlanId,
  SubscriptionStatus,
  isActiveStatus,
} from "@/config/plans";
import { applySummaryUpdate } from "./update-billing-summary";
import { recordBillingEvent } from "./record-billing-event";
import { getBillingSummary } from "./get-billing-summary";
import {
  lockExtraResources,
  unlockExtraResources,
} from "@/lib/resources/lock-extra-resources";

export async function purchasePlan(planId: PlanId): Promise<void> {
  const plan = PLANS[planId];
  const current = await getBillingSummary();

  if (current.active_plan === planId) return;

  const isPaid = plan.monthlyPrice > 0;

  await applySummaryUpdate({
    active_plan: planId,
    current_monthly_plan_amount: plan.monthlyPrice,
    total_paid_delta: isPaid ? plan.monthlyPrice : 0,
    total_payments_delta: isPaid ? 1 : 0,
  });

  await recordBillingEvent({
    event_type: "plan_purchase",
    plan_id: planId,
    amount: plan.monthlyPrice,
    status: isPaid ? "paid" : "free",
  });
}

export async function setPaymentStatus(
  status: SubscriptionStatus
): Promise<void> {
  const current = await getBillingSummary();
  if (current.subscription_status === status) return;

  const wasActive = isActiveStatus(current.subscription_status);
  const willBeActive = isActiveStatus(status);

  await applySummaryUpdate({
    subscription_status: status,
  });

  if (wasActive && !willBeActive) {
    await lockExtraResources();
    await recordBillingEvent({
      event_type: "payment_failed",
      status: "failed",
      metadata: { from: current.subscription_status, to: status },
    });
  } else if (!wasActive && willBeActive) {
    await unlockExtraResources();
    await recordBillingEvent({
      event_type: "payment_restored",
      status: "restored",
      metadata: { from: current.subscription_status, to: status },
    });
  }
}
