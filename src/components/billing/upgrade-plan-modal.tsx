"use client";

import { useEffect, useState } from "react";
import { PLANS, PLAN_IDS, PlanId } from "@/config/plans";
import { purchasePlan } from "@/lib/billing/purchase-plan";

type Props = {
  open: boolean;
  currentPlanId: PlanId;
  onClose: () => void;
};

export default function UpgradePlanModal({
  open,
  currentPlanId,
  onClose,
}: Props) {
  const [busy, setBusy] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function choose(id: PlanId) {
    setBusy(id);
    try {
      await purchasePlan(id);
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-[#0B1020] border border-[#1B2238] rounded-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="px-7 pt-7 pb-5 border-b border-[#1B2238]">
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
            Choose plan
          </p>
          <h2 className="text-xl font-semibold">Upgrade your plan</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Demo billing mode — real payment processing will be connected later.
          </p>
        </div>

        <div className="px-7 py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const isCurrent = id === currentPlanId;
            const isBusy = busy === id;
            return (
              <div
                key={id}
                className={
                  isCurrent
                    ? "border border-[#6D5EF8]/60 bg-gradient-to-b from-[#6D5EF8]/10 to-[#0B1020] rounded-2xl p-5 flex flex-col"
                    : "border border-[#1B2238] bg-[#050816] rounded-2xl p-5 flex flex-col"
                }
              >
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider text-violet-300 border border-[#6D5EF8]/40 bg-[#6D5EF8]/15 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">
                      {plan.monthlyPrice === 0
                        ? "Free"
                        : `$${plan.monthlyPrice}`}
                    </span>
                    {plan.monthlyPrice > 0 && (
                      <span className="text-xs text-zinc-500">
                        / month
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-5 text-xs text-zinc-400">
                  <Row label="Projects" value={plan.maxProjectsTotal} />
                  <Row
                    label="BMs per project"
                    value={plan.maxBusinessManagersPerProject}
                  />
                  <Row
                    label="Ad Accounts per project"
                    value={plan.maxAdAccountsPerProject}
                  />
                  <Row label="Sync" value={plan.syncMode} />
                  <Row
                    label="Decision engine"
                    value={plan.decisionEngineLevel}
                  />
                  <Row label="Support" value={plan.supportLevel} />
                </div>

                <div className="text-[11px] text-zinc-500 mb-4 flex-1">
                  <p className="mb-1">
                    {plan.features.length} included features
                  </p>
                  <p>{plan.lockedFeatures.length} locked features</p>
                </div>

                <button
                  type="button"
                  onClick={() => choose(id)}
                  disabled={isCurrent || busy !== null}
                  className={
                    isCurrent
                      ? "h-10 rounded-xl bg-[#6D5EF8]/15 text-zinc-400 text-sm font-medium cursor-not-allowed"
                      : "h-10 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition disabled:opacity-50"
                  }
                >
                  {isCurrent
                    ? "Current plan"
                    : isBusy
                    ? "Processing…"
                    : "Choose Plan"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-7 pb-6 text-[11px] text-zinc-500 text-center">
          Demo billing mode. Real payment processing will be connected later.
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="text-zinc-200 capitalize">{value}</span>
    </div>
  );
}
