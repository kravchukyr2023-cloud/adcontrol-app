"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useActiveProject } from "@/hooks/use-active-project";
import { useMetaOverview } from "@/hooks/use-meta-overview";

const FILTERS = ["All", "Active", "Paused", "Learning", "Limited"];

const COLS = [
  { key: "name", label: "Campaign", align: "left" as const },
  { key: "status", label: "Status", align: "left" as const },
  { key: "objective", label: "Objective", align: "left" as const },
  { key: "spend", label: "Spend", align: "right" as const },
  { key: "purchases", label: "Purchases", align: "right" as const },
  { key: "cpa", label: "CPA", align: "right" as const },
  { key: "impressions", label: "Impressions", align: "right" as const },
  { key: "cpm", label: "CPM", align: "right" as const },
  { key: "clicks", label: "Clicks", align: "right" as const },
  { key: "cpc", label: "CPC", align: "right" as const },
  { key: "ctr", label: "CTR", align: "right" as const },
  { key: "revenue", label: "Revenue", align: "right" as const },
  { key: "roas", label: "ROAS", align: "right" as const },
  { key: "actions", label: "", align: "right" as const },
];

const ALL = "__all__";

export default function MetaAdsPage() {
  const { project } = useActiveProject();
  const overview = useMetaOverview();

  const [selectedBmId, setSelectedBmId] = useState<string>(ALL);
  const [selectedAaId, setSelectedAaId] = useState<string>(ALL);

  const bmOptions = overview.business_managers;

  // Cascade: when BM filter selected, narrow AA options to that BM only.
  const aaOptions = useMemo(() => {
    if (selectedBmId === ALL) {
      return bmOptions.flatMap((bm) => bm.ad_accounts);
    }
    const bm = bmOptions.find((b) => b.id === selectedBmId);
    return bm?.ad_accounts ?? [];
  }, [bmOptions, selectedBmId]);

  // Header strip text — reflect filter selection
  const headerBmLabel =
    selectedBmId === ALL
      ? bmOptions.length === 0
        ? "No business manager"
        : `${bmOptions.length} business manager${bmOptions.length === 1 ? "" : "s"}`
      : bmOptions.find((b) => b.id === selectedBmId)?.name ?? "—";

  const headerAaLabel =
    selectedAaId === ALL
      ? aaOptions.length === 0
        ? "No ad accounts"
        : `${aaOptions.length} ad account${aaOptions.length === 1 ? "" : "s"}`
      : aaOptions.find((a) => a.id === selectedAaId)?.name ?? "—";

  const hasAnyBinding = bmOptions.some((b) => b.ad_accounts.length > 0);
  // Empty-state mode:
  //  - "no_project"  → no active project selected
  //  - "needs_setup" → project has no Meta connection or no Ad Accounts selected → show CTA
  //  - "no_sync"     → project is wired but Phase 2 sync hasn't shipped yet
  const emptyMode: "no_project" | "needs_setup" | "no_sync" = !project
    ? "no_project"
    : !hasAnyBinding
    ? "needs_setup"
    : "no_sync";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Meta Ads
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Campaigns, ad sets and creatives across your Meta business managers.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search campaigns…"
              className="w-full h-10 pl-10 pr-3.5 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-500"
            />
          </div>

          <select
            value={selectedBmId}
            onChange={(e) => {
              setSelectedBmId(e.target.value);
              setSelectedAaId(ALL);
            }}
            className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]"
          >
            <option value={ALL}>All Business Managers</option>
            {bmOptions.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name ?? bm.meta_bm_id ?? "—"}
              </option>
            ))}
          </select>

          <select
            value={selectedAaId}
            onChange={(e) => setSelectedAaId(e.target.value)}
            className="h-10 px-3 bg-[#0B1020] border border-[#1B2238] rounded-xl outline-none text-sm text-zinc-200 focus:border-[#6D5EF8]"
          >
            <option value={ALL}>All Ad Accounts</option>
            {aaOptions.map((aa) => (
              <option key={aa.id} value={aa.id}>
                {aa.name ?? aa.meta_ad_account_id ?? "—"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              className={
                i === 0
                  ? "h-8 px-3 rounded-lg text-xs border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white transition"
                  : "h-8 px-3 rounded-lg text-xs border border-[#1B2238] hover:border-zinc-700 text-zinc-300 transition"
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <section className="border border-[#1B2238] rounded-2xl bg-[#0B1020] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1B2238] bg-[#181A24] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              BM
            </span>
            <p className="text-sm font-semibold">{headerBmLabel}</p>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-500">{headerAaLabel}</span>
          </div>
          <span className="text-xs text-zinc-500">0 campaigns</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-black/30">
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={
                      c.align === "right"
                        ? "text-right px-3 py-3 font-medium"
                        : "text-left px-3 py-3 font-medium"
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={COLS.length}
                  className="px-6 py-12"
                >
                  {emptyMode === "no_project" && (
                    <p className="text-center text-zinc-500 text-sm">
                      Select a project to load Meta Ads.
                    </p>
                  )}

                  {emptyMode === "no_sync" && (
                    <p className="text-center text-zinc-500 text-sm">
                      No campaigns synced yet. Sync is shipped in the next
                      phase.
                    </p>
                  )}

                  {emptyMode === "needs_setup" && (
                    <div className="flex flex-col items-center text-center max-w-md mx-auto gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#1877F2]/15 border border-[#1877F2]/30 text-blue-300 flex items-center justify-center font-bold text-lg">
                        f
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        No Meta Ads data for this project yet
                      </h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {project?.name ? (
                          <>
                            <span className="text-white">{project.name}</span>{" "}
                            has no Meta connection or no Ad Accounts selected.
                          </>
                        ) : (
                          "This project has no Meta connection or no Ad Accounts selected."
                        )}{" "}
                        Open Data Sources to connect Meta and pick the Ad
                        Accounts you want to track here.
                      </p>
                      <Link
                        href="/data-sources?focus=meta"
                        className="mt-1 h-10 px-5 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium transition inline-flex items-center justify-center"
                      >
                        Open Data Sources →
                      </Link>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
