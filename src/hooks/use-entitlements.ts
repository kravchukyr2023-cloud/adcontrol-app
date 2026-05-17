"use client";

import { useEffect, useState } from "react";
import {
  AddonCounts,
  EMPTY_ADDON_COUNTS,
  Plan,
  PLANS,
  SubscriptionStatus,
  isActiveStatus,
} from "@/config/plans";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import {
  getProjectUsage,
  ProjectUsage,
} from "@/lib/billing/get-project-usage";
import {
  EffectiveLimits,
  mergeLimits,
} from "@/lib/billing/merge-custom-limits";
import { getPaidAddons } from "@/lib/billing/get-paid-addons";
import { getBillingSummary } from "@/lib/billing/get-billing-summary";
import { BILLING_UPDATED_EVENT } from "@/lib/billing/events";
import { ACTIVE_PROJECT_CHANGED } from "@/hooks/use-active-project";

export type Entitlements = {
  plan: Plan;
  subscribedPlan: Plan;
  addons: AddonCounts;
  subscribedAddons: AddonCounts;
  usage: ProjectUsage;
  limits: EffectiveLimits;
  subscriptionStatus: SubscriptionStatus;
  paymentPaused: boolean;
  loading: boolean;
};

const INITIAL: Entitlements = {
  plan: PLANS.starter,
  subscribedPlan: PLANS.starter,
  addons: EMPTY_ADDON_COUNTS,
  subscribedAddons: EMPTY_ADDON_COUNTS,
  usage: { projects: 0, businessManagers: 0, adAccounts: 0 },
  limits: mergeLimits(PLANS.starter, EMPTY_ADDON_COUNTS),
  subscriptionStatus: "active",
  paymentPaused: false,
  loading: true,
};

export function useEntitlements(): Entitlements {
  const [state, setState] = useState<Entitlements>(INITIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    function bump() {
      setVersion((v) => v + 1);
    }
    window.addEventListener(ACTIVE_PROJECT_CHANGED, bump);
    window.addEventListener(BILLING_UPDATED_EVENT, bump);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGED, bump);
      window.removeEventListener(BILLING_UPDATED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const [subscribedPlan, usage, summary, paidAddons] =
        await Promise.all([
          getCurrentPlan(),
          getProjectUsage(),
          getBillingSummary(),
          getPaidAddons(),
        ]);

      if (cancelled) return;

      const subscriptionStatus = summary.subscription_status;
      const active = isActiveStatus(subscriptionStatus);
      const paymentPaused =
        !active && subscribedPlan.id !== "starter";

      const effectivePlan = paymentPaused
        ? PLANS.starter
        : subscribedPlan;
      const effectiveAddons = paymentPaused
        ? EMPTY_ADDON_COUNTS
        : paidAddons;

      setState({
        plan: effectivePlan,
        subscribedPlan,
        addons: effectiveAddons,
        subscribedAddons: paidAddons,
        usage,
        limits: mergeLimits(effectivePlan, effectiveAddons),
        subscriptionStatus,
        paymentPaused,
        loading: false,
      });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [version]);

  return state;
}
