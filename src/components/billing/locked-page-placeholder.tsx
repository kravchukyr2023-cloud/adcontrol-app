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
    "Reconcile real orders against ad spend with full Meta-vs-real attribution across projects.",
  utm_generator:
    "Build structured, validated UTM-tagged URLs and keep attribution clean across campaigns.",
  data_sources_full:
    "Full Data Sources access — Shopify, Google Sheets and Meta as operational sources.",
  decision_engine_full:
    "Get campaign-level diagnostics — not just dashboard overview alerts.",
};

type Props = {
  feature: FeatureId;
};

export default function LockedPagePlaceholder({ feature }: Props) {
  const label = FEATURE_LABELS[feature] ?? "This feature";
  const description =
    FEATURE_DESCRIPTIONS[feature] ??
    "Available on a higher plan. Upgrade to unlock the full feature.";
  const required = requiredPlanFor(feature);
  const requiredName = required ? required.name : "an upgraded plan";

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          {label}
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          {description}
        </p>
      </div>

      <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-10 lg:p-14 max-w-2xl">

        <div className="w-14 h-14 rounded-2xl bg-[#6D5EF8]/10 border border-[#6D5EF8]/40 flex items-center justify-center text-[#a99cff] mb-6">
          <svg
            width="22"
            height="22"
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

        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
          {requiredName} feature
        </p>

        <h2 className="text-xl lg:text-2xl font-semibold mb-3">
          {label} is locked on your plan
        </h2>

        <p className="text-sm text-zinc-400 leading-relaxed mb-6 max-w-md">
          Requires{" "}
          <span className="text-white">{requiredName}</span>
          {required && required.id !== "scale" ? " or higher" : ""}{" "}
          to unlock {label.toLowerCase()}.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <button
            disabled
            className="flex-1 h-11 rounded-xl bg-[#6D5EF8]/20 text-zinc-400 font-medium text-sm cursor-not-allowed"
          >
            Upgrade Plan
          </button>
          <button
            disabled
            className="flex-1 h-11 rounded-xl border border-[#1B2238] text-zinc-400 text-sm cursor-not-allowed"
          >
            Contact Support
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-5">
          Payments coming in Sprint 3.
        </p>
      </div>
    </div>
  );
}
