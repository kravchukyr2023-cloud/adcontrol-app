"use client";

import { useEffect, useState } from "react";
import {
  FeatureId,
  PLANS,
  PLAN_IDS,
  PlanId,
  SubscriptionStatus,
} from "@/config/plans";
import { useEntitlements } from "@/hooks/use-entitlements";
import {
  purchasePlan,
  setPaymentStatus,
} from "@/lib/billing/purchase-plan";
import {
  getBillingEvents,
  BillingEvent,
} from "@/lib/billing/get-billing-events";
import { BILLING_UPDATED_EVENT } from "@/lib/billing/events";
import ActiveAddonsSection from "@/components/billing/active-addons-section";
import ExtraLimitsSection from "@/components/billing/extra-limits-section";
import UpgradePlanModal from "@/components/billing/upgrade-plan-modal";

const FEATURE_LABELS: Record<FeatureId, string> = {
  dashboard: "Dashboard",
  meta_ads_overview: "Meta Ads Overview",
  meta_ads_diagnosis: "Meta Ads Diagnosis",
  utm_generator: "UTM Generator",
  sales_manual: "Sales (Manual)",
  sales_full_attribution: "Sales & Attribution",
  data_sources_full: "Full Data Sources",
  shopify: "Shopify",
  google_sheets: "Google Sheets",
  manual_orders: "Manual Orders",
  auto_sync: "Auto-sync",
  priority_sync: "Priority Sync",
  decision_engine_basic: "Decision Engine",
  decision_engine_full: "Full Decision Engine",
  revenue_operations: "Revenue Operations",
  multi_project_operations: "Multi-project Operations",
  priority_support: "Priority Support",
};

const EVENT_LABEL: Record<string, string> = {
  plan_purchase: "Plan purchase",
  plan_renewal: "Plan renewal",
  addon_purchase: "Add-on purchase",
  addon_renewal: "Add-on renewal",
  addon_cancellation: "Add-on canceled",
  payment_failed: "Payment failed",
  payment_restored: "Payment restored",
  subscription_canceled: "Subscription canceled",
};

const ADDON_LABEL: Record<string, string> = {
  extra_project_package: "Extra Project Package",
  extra_project_business_manager: "Extra BM (bundled)",
  extra_project_ad_account: "Extra Ad Account (bundled)",
  existing_project_business_manager: "Extra BM Package",
  existing_project_ad_account: "Extra Ad Account",
};

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function useBillingEvents() {
  const [events, setEvents] = useState<BillingEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const data = await getBillingEvents(20);
      if (cancelled) return;
      setEvents(data);
    };

    load();

    function onUpdate() {
      load();
    }
    window.addEventListener(BILLING_UPDATED_EVENT, onUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(BILLING_UPDATED_EVENT, onUpdate);
    };
  }, []);

  return events;
}

export default function BillingTab() {
  const {
    plan,
    subscribedPlan,
    subscribedAddons,
    usage,
    limits,
    subscriptionStatus,
    paymentPaused,
    loading,
  } = useEntitlements();

  const events = useBillingEvents();

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [pickingPlan, setPickingPlan] = useState<PlanId | null>(null);
  const [pickingStatus, setPickingStatus] =
    useState<SubscriptionStatus | null>(null);

  if (loading) {
    return (
      <div className="text-sm text-zinc-500">Loading billing info…</div>
    );
  }

  const projectsPct =
    limits.projectsTotal > 0
      ? Math.min(
          100,
          Math.round((usage.projects / limits.projectsTotal) * 100)
        )
      : 0;

  const planPrice =
    subscribedPlan.monthlyPrice === 0
      ? "Free"
      : `$${subscribedPlan.monthlyPrice}/mo`;

  async function handlePickPlan(id: PlanId) {
    setPickingPlan(id);
    try {
      await purchasePlan(id);
    } finally {
      setPickingPlan(null);
    }
  }

  async function handlePickStatus(status: SubscriptionStatus) {
    setPickingStatus(status);
    try {
      await setPaymentStatus(status);
    } finally {
      setPickingStatus(null);
    }
  }

  return (
    <div className="space-y-6">

      {paymentPaused && (
        <div className="border border-rose-500/40 bg-rose-500/10 rounded-xl px-4 py-3 text-xs text-rose-300">
          Payment required. Paid plan and add-ons are paused. Account is temporarily limited to Starter access.
        </div>
      )}

      <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-xs text-amber-300">
        Payments are not active in this demo.
      </div>

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
          <div className="space-y-3 flex-1">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Subscribed plan
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold">{subscribedPlan.name}</h3>
                <span className="text-sm text-zinc-400">{planPrice}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Status
              </p>
              <span
                className={
                  paymentPaused
                    ? "text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded-full"
                    : "text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full"
                }
              >
                {subscriptionStatus}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Effective access
              </p>
              <span
                className={
                  paymentPaused
                    ? "text-sm font-semibold text-rose-300"
                    : "text-sm font-semibold text-white"
                }
              >
                {plan.name}
              </span>
              {paymentPaused && (
                <span className="text-[10px] text-zinc-500">
                  (paid plan paused)
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="shrink-0 text-sm bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium rounded-lg px-4 py-2 transition"
          >
            Upgrade Plan
          </button>
        </div>
      </div>

      <MonthlyCostCard
        planAmount={paymentPaused ? 0 : subscribedPlan.monthlyPrice}
        addonsCount={subscribedAddons}
        paused={paymentPaused}
      />

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <h3 className="text-sm font-semibold mb-5">Usage</h3>
        <div className="space-y-5">
          <UsageRow
            label="Projects"
            used={usage.projects}
            limit={limits.projectsTotal}
            pct={projectsPct}
          />
        </div>
        <div className="mt-6 pt-5 border-t border-[#2A2D3A] space-y-2 text-xs text-zinc-400">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Per-project quotas
          </p>
          <p>
            Up to{" "}
            <span className="text-white">
              {limits.businessManagersPerProject}
            </span>{" "}
            Business Manager
            {limits.businessManagersPerProject === 1 ? "" : "s"} per project
          </p>
          <p>
            Up to{" "}
            <span className="text-white">{limits.adAccountsPerProject}</span>{" "}
            Ad Account{limits.adAccountsPerProject === 1 ? "" : "s"} per project
          </p>
        </div>
      </div>

      <ActiveAddonsSection
        paidAddons={subscribedAddons}
        paused={paymentPaused}
      />

      <ExtraLimitsSection paused={paymentPaused} />

      <PaymentHistoryCard events={events} />

      <div className="border border-[#6D5EF8]/40 bg-[#6D5EF8]/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Demo controls</h3>
          <span className="text-[10px] uppercase tracking-wider text-violet-300 border border-[#6D5EF8]/40 bg-[#6D5EF8]/15 px-2 py-0.5 rounded-full">
            Demo only
          </span>
        </div>
        <p className="text-xs text-zinc-500 mb-5">
          Test plans and payment states. Each action writes a billing event.
        </p>

        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
            Demo plan
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PLAN_IDS.map((id) => {
              const isActive = subscribedPlan.id === id;
              const isBusy = pickingPlan === id;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => handlePickPlan(id)}
                  disabled={pickingPlan !== null}
                  className={
                    isActive
                      ? "h-9 rounded-lg border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white text-xs font-medium transition disabled:opacity-60"
                      : "h-9 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-xs transition disabled:opacity-60"
                  }
                >
                  {isBusy ? "…" : `Set ${PLANS[id].name}`}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
            Demo payment status
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <button
              type="button"
              onClick={() => handlePickStatus("active")}
              disabled={pickingStatus !== null}
              className={
                subscriptionStatus === "active"
                  ? "h-9 rounded-lg border border-emerald-500/60 bg-emerald-500/10 text-emerald-300 text-xs font-medium transition disabled:opacity-60"
                  : "h-9 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-xs transition disabled:opacity-60"
              }
            >
              {pickingStatus === "active" ? "…" : "Active"}
            </button>
            <button
              type="button"
              onClick={() => handlePickStatus("past_due")}
              disabled={pickingStatus !== null}
              className={
                subscriptionStatus === "past_due"
                  ? "h-9 rounded-lg border border-rose-500/60 bg-rose-500/10 text-rose-300 text-xs font-medium transition disabled:opacity-60"
                  : "h-9 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-xs transition disabled:opacity-60"
              }
            >
              {pickingStatus === "past_due" ? "…" : "Past due"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 mt-4">
          Add-ons are managed in the sections above.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">Available features</h3>
          {plan.features.length === 0 ? (
            <p className="text-xs text-zinc-500">None.</p>
          ) : (
            <ul className="space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-[11px] shrink-0">
                    ✓
                  </span>
                  {FEATURE_LABELS[f]}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">Locked features</h3>
          {plan.lockedFeatures.length === 0 ? (
            <p className="text-xs text-zinc-500">
              You have access to every feature.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {plan.lockedFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className="w-5 h-5 rounded-full bg-zinc-700/30 border border-zinc-600/40 flex items-center justify-center text-zinc-400 shrink-0">
                    <LockIcon />
                  </span>
                  {FEATURE_LABELS[f]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <UpgradePlanModal
        open={upgradeOpen}
        currentPlanId={subscribedPlan.id}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  );
}

const ADDON_PRICE: Record<string, number> = {
  extraProjectPackage: 15,
  extraProjectBusinessManager: 7,
  extraProjectAdAccount: 3,
  existingProjectBusinessManager: 10,
  existingProjectAdAccount: 5,
};

function MonthlyCostCard({
  planAmount,
  addonsCount,
  paused,
}: {
  planAmount: number;
  addonsCount: Record<string, number>;
  paused: boolean;
}) {
  let addonsAmount = 0;
  for (const [key, qty] of Object.entries(addonsCount)) {
    addonsAmount += (ADDON_PRICE[key] ?? 0) * (qty as number);
  }

  const effectivePlan = paused ? 0 : planAmount;
  const effectiveAddons = paused ? 0 : addonsAmount;
  const total = effectivePlan + effectiveAddons;

  return (
    <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
      <h3 className="text-sm font-semibold mb-5">
        Current Monthly Cost
      </h3>
      <div className="space-y-3">
        <Row label="Plan" value={`$${effectivePlan}/mo`} />
        <Row label="Add-ons" value={`$${effectiveAddons}/mo`} />
        <div className="pt-3 border-t border-[#2A2D3A] flex items-center justify-between">
          <span className="text-sm text-zinc-300">Total monthly</span>
          <span className="text-base font-semibold text-white">
            ${total}/mo
          </span>
        </div>
      </div>
      {paused && (
        <p className="text-[11px] text-rose-300 mt-3">
          Subscription paused — effective monthly billing is $0.
        </p>
      )}
    </div>
  );
}

function PaymentHistoryCard({ events }: { events: BillingEvent[] }) {
  return (
    <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
      <h3 className="text-sm font-semibold mb-5">Payment History</h3>
      {events.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No billing events yet. Purchase a plan or add-on to see history here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-left py-2 font-medium">Event</th>
                <th className="text-left py-2 font-medium">Detail</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">Amount</th>
                <th className="text-left py-2 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {events.map((e) => {
                const dt = new Date(e.created_at);
                const label = EVENT_LABEL[e.event_type] ?? e.event_type;
                const detail = e.plan_id
                  ? PLANS[e.plan_id as PlanId]?.name ?? e.plan_id
                  : e.addon_type
                  ? ADDON_LABEL[e.addon_type] ?? e.addon_type
                  : "—";
                return (
                  <tr key={e.id} className="border-t border-[#1B2238]">
                    <td className="py-2.5 text-xs text-zinc-400">
                      {dt.toLocaleDateString()}{" "}
                      <span className="text-zinc-600">
                        {dt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="py-2.5">{label}</td>
                    <td className="py-2.5 text-zinc-400">{detail}</td>
                    <td className="py-2.5 text-right text-zinc-400">
                      {e.quantity > 0 ? e.quantity : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {e.amount > 0 ? `$${e.amount}` : "—"}
                    </td>
                    <td className="py-2.5 pl-3">
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
        paid
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded-full">
        failed
      </span>
    );
  }
  if (status === "restored") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-amber-300 border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 rounded-full">
        restored
      </span>
    );
  }
  if (status === "canceled") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-zinc-600/40 bg-zinc-700/30 px-2 py-0.5 rounded-full">
        canceled
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-[#1B2238] bg-black/30 px-2 py-0.5 rounded-full">
      {status}
    </span>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  pct,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  pct?: number;
  note?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500">
          {used} / {limit}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
      <div className="h-1.5 bg-[#2A2D3A] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#6D5EF8] rounded-full"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
