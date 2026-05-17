"use client";

import { useEffect, useState } from "react";
import {
  BmWithAds,
  getProjectResources,
} from "@/lib/resources/get-resources";
import { BILLING_UPDATED_EVENT } from "@/lib/billing/events";

type Props = {
  projectId: string;
};

export default function ResourcesSections({ projectId }: Props) {
  const [bms, setBMs] = useState<BmWithAds[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const data = await getProjectResources(projectId);
      if (cancelled) return;
      setBMs(data);
      setLoading(false);
    };

    load();

    function onBillingUpdate() {
      load();
    }
    window.addEventListener(BILLING_UPDATED_EVENT, onBillingUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(BILLING_UPDATED_EVENT, onBillingUpdate);
    };
  }, [projectId]);

  const allAds = bms.flatMap((b) =>
    b.ad_accounts.map((a) => ({
      ...a,
      bm_name: b.bm_name,
    }))
  );

  return (
    <>
      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
        <div className="mb-6">
          <h2 className="text-base font-semibold">Business Managers</h2>
          <p className="text-xs text-zinc-500 mt-1">
            BMs allocated to this project. Real Meta connection comes in Sprint 3.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : bms.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No Business Managers yet. They appear here after project creation or paid add-on purchase.
          </p>
        ) : (
          <div className="space-y-2">
            {bms.map((bm) => (
              <ResourceRow
                key={bm.id}
                name={bm.bm_name}
                isBase={bm.is_base_resource}
                isExtra={bm.is_extra_paid}
                isLocked={bm.is_locked}
                isPaused={bm.is_paused}
                lockedReason={bm.locked_reason}
                addonSource={bm.addon_source_type}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
        <div className="mb-6">
          <h2 className="text-base font-semibold">Ad Accounts</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Ad Accounts under this project&apos;s Business Managers.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : allAds.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No Ad Accounts yet.
          </p>
        ) : (
          <div className="space-y-2">
            {allAds.map((ad) => (
              <ResourceRow
                key={ad.id}
                name={ad.ad_account_name}
                subtitle={`BM: ${ad.bm_name}`}
                isBase={ad.is_base_resource}
                isExtra={ad.is_extra_paid}
                isLocked={ad.is_locked}
                isPaused={ad.is_paused}
                lockedReason={ad.locked_reason}
                addonSource={ad.addon_source_type}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ResourceRow({
  name,
  subtitle,
  isBase,
  isExtra,
  isLocked,
  isPaused,
  lockedReason,
  addonSource,
}: {
  name: string;
  subtitle?: string;
  isBase: boolean;
  isExtra: boolean;
  isLocked: boolean;
  isPaused: boolean;
  lockedReason: string | null;
  addonSource: string | null;
}) {
  const muted = isLocked || isPaused;
  return (
    <div
      className={
        muted
          ? "flex items-center justify-between gap-3 border border-rose-500/30 bg-rose-500/5 rounded-xl px-3 py-2.5 opacity-80"
          : "flex items-center justify-between gap-3 border border-[#1B2238] bg-[#050816] rounded-xl px-3 py-2.5"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-200 truncate">{name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {subtitle && (
            <span className="text-[11px] text-zinc-500 truncate">
              {subtitle}
            </span>
          )}
          {isBase && (
            <span className="text-[10px] uppercase tracking-wider text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              Base
            </span>
          )}
          {isExtra && (
            <span className="text-[10px] uppercase tracking-wider text-violet-300 border border-[#6D5EF8]/40 bg-[#6D5EF8]/10 px-1.5 py-0.5 rounded-full">
              Paid add-on
            </span>
          )}
          {addonSource && (
            <span className="text-[10px] text-zinc-500">
              · {addonSource.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      {muted ? (
        <span className="text-[10px] uppercase tracking-wider text-rose-300 border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 rounded-full shrink-0">
          {lockedReason === "payment_paused"
            ? "Paused"
            : lockedReason === "manually_disabled"
            ? "Disabled"
            : "Locked"}
        </span>
      ) : (
        <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
          Active
        </span>
      )}
    </div>
  );
}
