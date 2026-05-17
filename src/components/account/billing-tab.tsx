"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type BillingData = {
  planName: string;
  planPrice: string;
  projectsUsed: number;
  projectsLimit: number | null;
};

const AVAILABLE = [
  "Dashboard",
  "Meta Ads",
  "Sales & Attribution",
  "UTM Generator",
  "Manual Orders",
  "Decision Engine",
];

const LOCKED = [
  "Google Sheets",
  "Shopify",
  "Auto-sync",
  "Priority Support",
];

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function pickNumber(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
  }
  return null;
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export default function BillingTab() {
  const [data, setData] = useState<BillingData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { count: projectsCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true });

      let planName = "Starter";
      let planPrice = "Free";
      let projectsLimit: number | null = 1;

      try {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("plan_id")
          .limit(1);

        const planId =
          subs && subs.length > 0
            ? (subs[0] as { plan_id?: string }).plan_id
            : null;

        if (planId) {
          const { data: plan } = await supabase
            .from("plans")
            .select("*")
            .eq("id", planId)
            .maybeSingle();

          if (plan) {
            const p = plan as Record<string, unknown>;
            const rawName = pickString(p, "name", "slug");
            if (rawName) {
              planName =
                rawName.charAt(0).toUpperCase() + rawName.slice(1);
            }

            const priceVal = pickNumber(
              p,
              "price_monthly",
              "price",
              "monthly_price"
            );
            if (priceVal !== null) {
              planPrice = priceVal === 0 ? "Free" : `$${priceVal}/mo`;
            }

            const limitVal = pickNumber(
              p,
              "max_projects",
              "projects_limit",
              "projects_max"
            );
            if (limitVal !== null) {
              projectsLimit = limitVal;
            }
          }
        }
      } catch {
        // Defaults already set; ignore plan-fetch issues.
      }

      if (cancelled) return;

      setData({
        planName,
        planPrice,
        projectsUsed: projectsCount ?? 0,
        projectsLimit,
      });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="text-sm text-zinc-500">
        Loading billing info…
      </div>
    );
  }

  const projectsPct =
    data.projectsLimit && data.projectsLimit > 0
      ? Math.min(
          100,
          Math.round((data.projectsUsed / data.projectsLimit) * 100)
        )
      : 0;

  return (
    <div className="space-y-6">

      <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-xs text-amber-300">
        Payments are not active in this demo.
      </div>

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Current plan
            </p>
            <div className="flex items-center gap-3 mt-1">
              <h3 className="text-2xl font-bold">{data.planName}</h3>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              {data.planPrice}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled
              title="Coming in Sprint 3"
              className="text-sm bg-[#6D5EF8]/20 text-zinc-400 font-medium rounded-lg px-4 py-2 cursor-not-allowed"
            >
              Upgrade Plan
            </button>
          </div>
        </div>
      </div>

      <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
        <h3 className="text-sm font-semibold mb-5">Usage</h3>
        <div className="space-y-5">
          <UsageRow
            label="Projects"
            used={data.projectsUsed}
            limit={data.projectsLimit}
            pct={projectsPct}
          />
          <UsageRow
            label="Business Managers"
            placeholder="Coming in Sprint 3"
          />
          <UsageRow
            label="Meta Ad Accounts"
            placeholder="Coming in Sprint 3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">
            Available features
          </h3>
          <ul className="space-y-2.5">
            {AVAILABLE.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-[11px] shrink-0">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">
          <h3 className="text-sm font-semibold mb-4">
            Locked features
          </h3>
          <ul className="space-y-2.5">
            {LOCKED.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2 text-sm text-zinc-400"
              >
                <span className="w-5 h-5 rounded-full bg-zinc-700/30 border border-zinc-600/40 flex items-center justify-center text-zinc-400 shrink-0">
                  <LockIcon />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

      </div>

    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  pct,
  placeholder,
}: {
  label: string;
  used?: number;
  limit?: number | null;
  pct?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-zinc-300">{label}</span>
        {placeholder ? (
          <span className="text-zinc-500">{placeholder}</span>
        ) : (
          <span className="text-zinc-500">
            {used ?? 0} / {limit ?? "∞"}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-[#2A2D3A] rounded-full overflow-hidden">
        <div
          className={
            placeholder
              ? "h-full bg-zinc-700 rounded-full"
              : "h-full bg-[#6D5EF8] rounded-full"
          }
          style={{ width: placeholder ? "0%" : `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
