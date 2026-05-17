"use client";

import { useState } from "react";
import { ADDONS, AddonCounts, AddonId } from "@/config/plans";
import { calculateAddonPrice } from "@/lib/billing/calculate-addon-price";
import { cancelAddon } from "@/lib/billing/cancel-addon";

const DISPLAY_ORDER: AddonId[] = [
  "extraProjectPackage",
  "extraProjectBusinessManager",
  "extraProjectAdAccount",
  "existingProjectBusinessManager",
  "existingProjectAdAccount",
];

const DISPLAY_LABELS: Record<AddonId, string> = {
  extraProjectPackage: "Extra Project Package",
  extraProjectBusinessManager: "Extra BM (bundled)",
  extraProjectAdAccount: "Extra Ad Account (bundled)",
  existingProjectBusinessManager: "Extra Business Manager Package",
  existingProjectAdAccount: "Extra Ad Account",
};

type Props = {
  paidAddons: AddonCounts;
  paused?: boolean;
};

export default function ActiveAddonsSection({
  paidAddons,
  paused,
}: Props) {
  const [busy, setBusy] = useState<AddonId | null>(null);

  const activeIds = DISPLAY_ORDER.filter((id) => paidAddons[id] > 0);
  const total = calculateAddonPrice(paidAddons);

  async function handleCancel(id: AddonId) {
    if (paused) return;
    setBusy(id);
    try {
      await cancelAddon(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-[#2A2D3A] rounded-2xl p-6 bg-[#0B0D14]">

      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">Active Paid Add-ons</h3>
        {paused && (
          <span className="text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded-full">
            Paused
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        Currently paid extra limits. Each counts toward your project / BM / Ad Account quotas.
      </p>

      {activeIds.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active paid add-ons. Add extra limits below.
        </p>
      ) : (
        <div className="space-y-2.5">
          {activeIds.map((id) => {
            const addon = ADDONS[id];
            const qty = paidAddons[id];
            const lineTotal = qty * addon.priceMonthly;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border border-[#1B2238] bg-[#050816] rounded-xl px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-200 truncate">
                      {DISPLAY_LABELS[id]}
                    </p>
                    {!paused && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {qty} × ${addon.priceMonthly}/mo
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-sm font-semibold text-white min-w-[60px] text-right">
                    ${lineTotal}/mo
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCancel(id)}
                    disabled={paused || busy === id}
                    aria-label={`Remove 1 ${DISPLAY_LABELS[id]}`}
                    className="text-xs text-rose-300 hover:text-white border border-[#1B2238] hover:border-rose-500/60 rounded-md px-2.5 py-1 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === id ? "…" : "Remove 1"}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pt-4 mt-2 border-t border-[#2A2D3A] flex items-center justify-between">
            <span className="text-sm text-zinc-400">Active total</span>
            <span className="text-base font-semibold text-white">
              ${paused ? 0 : total}/mo
            </span>
          </div>
        </div>
      )}

      {paused && activeIds.length > 0 && (
        <p className="text-[11px] text-rose-300 mt-3">
          Add-ons are paused — effective monthly billing is $0 until payment is restored.
        </p>
      )}
    </div>
  );
}
