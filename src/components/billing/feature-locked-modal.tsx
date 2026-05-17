"use client";

import { useEffect } from "react";
import { FeatureId } from "@/config/plans";
import { requiredPlanFor } from "@/lib/billing/feature-access";

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

const FEATURE_DESCRIPTIONS: Partial<Record<FeatureId, string>> = {
  sales_full_attribution:
    "Reconcile real orders against ad spend with full Meta-vs-real attribution.",
  utm_generator:
    "Build structured, validated UTM-tagged URLs for your campaigns.",
  data_sources_full:
    "Full connection to Shopify, Google Sheets and Meta as data sources.",
  shopify:
    "Pull real orders, revenue and AOV directly from your Shopify store.",
  google_sheets:
    "Pull orders or attribution from a Google Sheet.",
  auto_sync:
    "Pull Meta Ads data on a schedule instead of manually.",
  priority_sync:
    "Faster, prioritised data sync across all projects.",
  decision_engine_full:
    "Diagnoses on campaigns, ad sets and ads — not just dashboard overview.",
  revenue_operations:
    "Operational layer over real revenue and budget pacing.",
  multi_project_operations:
    "Cross-project operations and shared diagnostics.",
  priority_support: "Priority response with a dedicated channel.",
  meta_ads_diagnosis:
    "Campaign-level diagnostics, action prompts and root-cause hints.",
};

type Props = {
  open: boolean;
  feature: FeatureId | null;
  onClose: () => void;
};

export default function FeatureLockedModal({
  open,
  feature,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !feature) return null;

  const label = FEATURE_LABELS[feature] ?? "This feature";
  const description =
    FEATURE_DESCRIPTIONS[feature] ?? "This feature is included on a higher plan.";
  const required = requiredPlanFor(feature);
  const requiredName = required ? required.name : "an upgraded plan";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 lg:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0B1020] border border-[#1B2238] rounded-3xl p-7"
      >
        <div className="w-12 h-12 rounded-2xl bg-[#6D5EF8]/10 border border-[#6D5EF8]/40 flex items-center justify-center text-[#a99cff] mb-5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
          {requiredName} feature
        </p>
        <h2 className="text-xl font-semibold mb-3">
          {label} is locked on your plan
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          {description}
        </p>

        <p className="text-xs text-zinc-500 mb-6">
          Requires{" "}
          <span className="text-white">{requiredName}</span>{" "}
          {required && required.id !== "scale" ? "or higher" : ""}.
        </p>

        <div className="flex flex-col gap-2">
          <button
            disabled
            className="h-11 rounded-xl bg-[#6D5EF8]/20 text-zinc-400 font-medium text-sm cursor-not-allowed"
          >
            Upgrade Plan
          </button>
          <button
            disabled
            className="h-11 rounded-xl border border-[#1B2238] text-zinc-400 text-sm cursor-not-allowed"
          >
            Contact Support
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-5 text-center">
          Payments coming in Sprint 3.
        </p>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-9 h-9 rounded-full text-zinc-400 hover:text-white hover:bg-[#1B2238] flex items-center justify-center transition"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
