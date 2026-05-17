import { supabase } from "@/lib/supabase/client";
import { PlanId, SubscriptionStatus } from "@/config/plans";
import { emitBillingUpdated } from "./events";

export type SummaryUpdate = {
  active_plan?: PlanId;
  subscription_status?: SubscriptionStatus;
  total_paid_delta?: number;
  total_payments_delta?: number;
  total_addon_payments_delta?: number;
  current_monthly_plan_amount?: number;
  current_monthly_addons_amount?: number;
};

export async function applySummaryUpdate(
  update: SummaryUpdate
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return;

  const userId = session.user.id;

  const { data: existing } = await supabase
    .from("user_billing_summary")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const current = (existing ?? {}) as Record<string, unknown>;

  const planAmount =
    update.current_monthly_plan_amount ??
    (Number(current.current_monthly_plan_amount) || 0);

  const addonsAmount =
    update.current_monthly_addons_amount ??
    (Number(current.current_monthly_addons_amount) || 0);

  const next = {
    user_id: userId,
    active_plan:
      update.active_plan ??
      (typeof current.active_plan === "string"
        ? current.active_plan
        : "starter"),
    subscription_status:
      update.subscription_status ??
      (typeof current.subscription_status === "string"
        ? current.subscription_status
        : "active"),
    total_paid:
      (Number(current.total_paid) || 0) +
      (update.total_paid_delta ?? 0),
    total_payments:
      (Number(current.total_payments) || 0) +
      (update.total_payments_delta ?? 0),
    total_addon_payments:
      (Number(current.total_addon_payments) || 0) +
      (update.total_addon_payments_delta ?? 0),
    current_monthly_plan_amount: planAmount,
    current_monthly_addons_amount: addonsAmount,
    current_total_monthly_amount: planAmount + addonsAmount,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("user_billing_summary")
    .upsert(next, { onConflict: "user_id" });

  emitBillingUpdated();
}
