import "server-only";
import { getAdminSupabase } from "@/server/meta/admin-supabase";
import {
  AddonCounts,
  EMPTY_ADDON_COUNTS,
  PLANS,
  PlanId,
  SubscriptionStatus,
  isActiveStatus,
} from "@/config/plans";
import { mergeLimits, EffectiveLimits } from "@/lib/billing/merge-custom-limits";
import { toAddonId } from "@/lib/billing/addon-type-mapping";

export type QuotaScope = "bm" | "aa";

export class QuotaExceededError extends Error {
  readonly name = "QuotaExceededError";
  readonly code: string;
  readonly scope: QuotaScope;
  readonly limit: number;
  readonly used: number;

  constructor(code: string, scope: QuotaScope, limit: number, used: number) {
    super(code);
    this.code = code;
    this.scope = scope;
    this.limit = limit;
    this.used = used;
  }
}

export function isQuotaExceededError(err: unknown): err is QuotaExceededError {
  return err instanceof QuotaExceededError;
}

async function resolveLimits(userId: string): Promise<EffectiveLimits> {
  const sb = getAdminSupabase();

  const { data: summary } = await sb
    .from("user_billing_summary")
    .select("active_plan, subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const summaryRow =
    (summary as {
      active_plan?: PlanId;
      subscription_status?: SubscriptionStatus;
    } | null) ?? null;

  const subscribedPlanId: PlanId = summaryRow?.active_plan ?? "starter";
  const subscriptionStatus: SubscriptionStatus =
    summaryRow?.subscription_status ?? "active";
  const subscribedPlan = PLANS[subscribedPlanId] ?? PLANS.starter;

  const paymentPaused =
    !isActiveStatus(subscriptionStatus) && subscribedPlan.id !== "starter";
  const effectivePlan = paymentPaused ? PLANS.starter : subscribedPlan;

  const addons: AddonCounts = { ...EMPTY_ADDON_COUNTS };
  if (!paymentPaused) {
    const { data: addonRows } = await sb
      .from("user_paid_addons")
      .select("addon_type, quantity, status")
      .eq("user_id", userId);

    for (const row of (addonRows ?? []) as Array<{
      addon_type: string;
      quantity: number;
      status: string;
    }>) {
      if (row.status !== "active") continue;
      const id = toAddonId(row.addon_type);
      if (!id) continue;
      addons[id] = Math.max(0, Number(row.quantity) || 0);
    }
  }

  return mergeLimits(effectivePlan, addons);
}

/**
 * Enforce BM quota before adding a Business Manager to a SPECIFIC project.
 *
 * Per-project semantics: counts distinct BMs active inside the given project.
 * BMs in other projects of the same user do not affect this check.
 * Re-adding the same BM to the same project is a no-op for quota purposes.
 */
export async function enforceAddBmLimit(params: {
  userId: string;
  projectId: string;
  metaBmRowId: string;
}): Promise<void> {
  const sb = getAdminSupabase();
  const limits = await resolveLimits(params.userId);

  const { data: existing, error } = await sb
    .from("project_meta_business_managers")
    .select("meta_business_manager_id")
    .eq("user_id", params.userId)
    .eq("project_id", params.projectId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to read BM memberships: ${error.message}`);
  }

  const usedBmsInProject = new Set(
    ((existing ?? []) as Array<{ meta_business_manager_id: string }>).map(
      (r) => r.meta_business_manager_id
    )
  );

  // Re-adding same BM to same project — no quota change.
  if (usedBmsInProject.has(params.metaBmRowId)) return;

  if (usedBmsInProject.size >= limits.businessManagersPerProject) {
    throw new QuotaExceededError(
      "bm_quota_exceeded",
      "bm",
      limits.businessManagersPerProject,
      usedBmsInProject.size
    );
  }
}

/**
 * Enforce AA quota before selecting an Ad Account inside a SPECIFIC project.
 *
 * Per-project semantics: counts distinct AAs active inside the given project.
 * AAs in other projects of the same user do not affect this check.
 * Re-selecting the same AA inside the same project is a no-op for quota.
 */
export async function enforceAddAaLimit(params: {
  userId: string;
  projectId: string;
  metaAdAccountRowId: string;
}): Promise<void> {
  const sb = getAdminSupabase();
  const limits = await resolveLimits(params.userId);

  const { data: existing, error } = await sb
    .from("project_meta_ad_accounts")
    .select("meta_ad_account_id")
    .eq("user_id", params.userId)
    .eq("project_id", params.projectId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to read AA selections: ${error.message}`);
  }

  const usedAasInProject = new Set(
    ((existing ?? []) as Array<{ meta_ad_account_id: string }>).map(
      (r) => r.meta_ad_account_id
    )
  );

  if (usedAasInProject.has(params.metaAdAccountRowId)) return;

  if (usedAasInProject.size >= limits.adAccountsPerProject) {
    throw new QuotaExceededError(
      "aa_quota_exceeded",
      "aa",
      limits.adAccountsPerProject,
      usedAasInProject.size
    );
  }
}
