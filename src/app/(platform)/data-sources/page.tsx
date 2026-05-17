"use client";

import { FeatureId } from "@/config/plans";
import { useEntitlements } from "@/hooks/use-entitlements";
import { canAccess, requiredPlanFor } from "@/lib/billing/feature-access";

type SourceCard = {
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  feature?: FeatureId;
  note?: string;
};

const SOURCES: SourceCard[] = [
  {
    name: "Meta Ads",
    description:
      "Campaigns, ad sets, creatives and spend from your Business Manager.",
    icon: "f",
    iconBg: "bg-[#1877F2]/15 border-[#1877F2]/30 text-blue-300",
    note: "Coming in Sprint 3",
  },
  {
    name: "Manual Orders",
    description:
      "Add and reconcile orders manually inside AdControl.",
    icon: "M",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    feature: "manual_orders",
  },
  {
    name: "Google Sheets",
    description:
      "Pull orders or attribution from your operational sheet.",
    icon: "G",
    iconBg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
    feature: "google_sheets",
  },
  {
    name: "Shopify",
    description:
      "Sync real orders, revenue and AOV from your store as the source of truth.",
    icon: "S",
    iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    feature: "shopify",
  },
];

const statusStyles: Record<string, string> = {
  available:
    "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  placeholder:
    "text-zinc-400 border-[#1B2238] bg-black/30",
  locked:
    "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

export default function DataSourcesPage() {
  const { plan, loading } = useEntitlements();

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Data Sources
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Connect Meta Ads, Shopify, Google Sheets and manual orders as data sources for spend, revenue and attribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SOURCES.map((s) => {
          let status: "available" | "placeholder" | "locked" = "placeholder";
          let statusLabel = s.note ?? "Coming in Sprint 3";
          let actionLabel: string | null = null;

          if (s.feature) {
            const hasAccess = !loading && canAccess(s.feature, plan);
            if (hasAccess) {
              status = "available";
              statusLabel = "Available";
              actionLabel = "Connect";
            } else {
              const requires = requiredPlanFor(s.feature);
              status = "locked";
              statusLabel = `Requires ${requires?.name ?? "upgrade"}`;
              actionLabel = "Upgrade Plan";
            }
          }

          return (
            <div
              key={s.name}
              className="border border-[#1B2238] rounded-2xl p-6 bg-[#0B1020] flex flex-col"
            >
              <div className="flex items-start justify-between mb-5">
                <div
                  className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold ${s.iconBg}`}
                >
                  {s.icon}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider border px-2 py-1 rounded-full ${statusStyles[status]}`}
                >
                  {statusLabel}
                </span>
              </div>

              <h2 className="text-lg font-semibold text-white mb-2">
                {s.name}
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed flex-1 mb-5">
                {s.description}
              </p>

              {actionLabel && (
                <button
                  disabled
                  title={
                    status === "locked"
                      ? `Requires ${requiredPlanFor(s.feature!)?.name ?? "upgrade"}`
                      : "Coming in Sprint 3"
                  }
                  className="h-10 rounded-lg border border-[#1B2238] text-sm text-zinc-400 cursor-not-allowed"
                >
                  {actionLabel}
                </button>
              )}

              {!actionLabel && (
                <p className="text-xs text-zinc-500">
                  Managed automatically.
                </p>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
