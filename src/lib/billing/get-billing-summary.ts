import { supabase } from "@/lib/supabase/client";
import {
  PlanId,
  PLAN_IDS,
  SubscriptionStatus,
} from "@/config/plans";

export type BillingSummary = {
  active_plan: PlanId;
  subscription_status: SubscriptionStatus;
  total_paid: number;
  total_payments: number;
  total_addon_payments: number;
  current_monthly_plan_amount: number;
  current_monthly_addons_amount: number;
  current_total_monthly_amount: number;
};

export const DEFAULT_BILLING_SUMMARY: BillingSummary = {
  active_plan: "starter",
  subscription_status: "active",
  total_paid: 0,
  total_payments: 0,
  total_addon_payments: 0,
  current_monthly_plan_amount: 0,
  current_monthly_addons_amount: 0,
  current_total_monthly_amount: 0,
};

const STATUSES: SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
];

function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as string[]).includes(v);
}

function isStatus(v: unknown): v is SubscriptionStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

export async function getBillingSummary(): Promise<BillingSummary> {
  try {
    const { data } = await supabase
      .from("user_billing_summary")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!data) return DEFAULT_BILLING_SUMMARY;

    const r = data as Record<string, unknown>;

    return {
      active_plan: isPlanId(r.active_plan) ? r.active_plan : "starter",
      subscription_status: isStatus(r.subscription_status)
        ? r.subscription_status
        : "active",
      total_paid: Number(r.total_paid) || 0,
      total_payments: Number(r.total_payments) || 0,
      total_addon_payments: Number(r.total_addon_payments) || 0,
      current_monthly_plan_amount:
        Number(r.current_monthly_plan_amount) || 0,
      current_monthly_addons_amount:
        Number(r.current_monthly_addons_amount) || 0,
      current_total_monthly_amount:
        Number(r.current_total_monthly_amount) || 0,
    };
  } catch {
    return DEFAULT_BILLING_SUMMARY;
  }
}
