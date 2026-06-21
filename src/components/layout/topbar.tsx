"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { openAccountCenter } from "@/lib/account-center/open";
import { useActiveProject } from "@/hooks/use-active-project";
import { useGlobalPeriod } from "@/hooks/use-global-period";
import { useMetaSync } from "@/hooks/use-meta-sync";
import { DATE_PRESETS, type DatePreset } from "@/lib/date-presets";
import { emitMetaSyncCompleted } from "@/lib/meta/events";
import CustomRangePopover from "./custom-range-popover";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/meta": "Meta Ads",
  "/sales": "Sales & Attribution",
  "/utm": "UTM Generator",
  "/data-sources": "Data Sources",
  "/settings": "Business Control Center",
};

export default function Topbar() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "Workspace";
  const [email, setEmail] = useState("");

  const { project } = useActiveProject();
  const projectId = project?.id ?? null;
  const { preset, setPreset, customRange, setCustomRange } = useGlobalPeriod();
  const sync = useMetaSync(projectId);
  // Track the post-Meta sales syncs. Combined with sync.state to drive
  // the button's spinner so the user sees one continuous loading state
  // across all three passes (Meta → Google → Shopify).
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [shopifySyncing, setShopifySyncing] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  // Remembers the preset the user was on before opening the picker —
  // so a Cancel from a first-time "custom" pick can revert. Cleared
  // on Apply or after a successful revert.
  const revertPresetRef = useRef<DatePreset | null>(null);
  // True iff customRange already existed when the picker opened — used
  // to decide whether a Cancel should revert the preset or just close.
  const hadCustomRangeOnOpenRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setEmail(data.session?.user.email ?? "");
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const initials = email ? email.slice(0, 2).toUpperCase() : "AC";

  // TODO(stage9): tooltip with `Last synced: …` from a dedicated
  // /api/meta/last-sync endpoint. Skipped earlier to keep the
  // surface minimal until the data source is finalised.
  const handleSync = async () => {
    if (
      !projectId ||
      sync.state === "syncing" ||
      googleSyncing ||
      shopifySyncing
    ) {
      return;
    }
    const r = await sync.trigger();

    // Best-effort sales-source syncs after Meta. Each endpoint returns:
    //   - 404 if the project has no source of that kind (silent skip)
    //   - 4xx/5xx on token/access errors (the card already surfaces them)
    // We never block the Meta-sync result on these — partial-meta + ok-
    // sales still emits SYNC_COMPLETED so analytics refetch.
    if (r.state === "success" || r.state === "partial") {
      setGoogleSyncing(true);
      try {
        await fetch("/api/google/sheets/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId }),
        }).catch(() => null);
      } finally {
        setGoogleSyncing(false);
      }

      setShopifySyncing(true);
      try {
        await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId }),
        }).catch(() => null);
      } finally {
        setShopifySyncing(false);
      }

      // Single completion event covers Meta + Google + Shopify. /sales
      // and /dashboard listen for this to refetch their analytics hooks.
      emitMetaSyncCompleted();
    }
  };

  const syncing = sync.state === "syncing" || googleSyncing || shopifySyncing;
  const syncDisabled = !projectId || syncing;

  const openPickerFromSelect = (fromPreset: DatePreset) => {
    revertPresetRef.current = fromPreset !== "custom" ? fromPreset : null;
    hadCustomRangeOnOpenRef.current = customRange !== null;
    // setPreset("custom") seeds a default customRange if none exists —
    // this is how the picker gets something sensible to render. Hook
    // also re-broadcasts via GLOBAL_PERIOD_CHANGED so analytics refetch.
    setPreset("custom");
    setPickerOpen(true);
  };

  const handleSelectChange = (next: DatePreset) => {
    if (next === "custom") {
      openPickerFromSelect(preset);
    } else {
      setPreset(next);
    }
  };

  const handlePickerApply = (range: { since: string; until: string }) => {
    setCustomRange(range);
    setPickerOpen(false);
    revertPresetRef.current = null;
    hadCustomRangeOnOpenRef.current = false;
  };

  const handlePickerCancel = () => {
    setPickerOpen(false);
    // Revert to the preset the user came from ONLY if this was their
    // first custom selection (no real customRange existed before).
    // Otherwise leave the existing custom window in place.
    if (!hadCustomRangeOnOpenRef.current && revertPresetRef.current) {
      setPreset(revertPresetRef.current);
    }
    revertPresetRef.current = null;
    hadCustomRangeOnOpenRef.current = false;
  };

  const handleEditCustom = () => {
    revertPresetRef.current = null;
    hadCustomRangeOnOpenRef.current = customRange !== null;
    setPickerOpen(true);
  };

  // Label shown for the "Custom range" <option>. When a saved custom
  // window exists, display its dates so the closed select reflects
  // the active range without a separate label element.
  const customOptionLabel = customRange
    ? `${customRange.since} → ${customRange.until}`
    : "Custom range";

  return (
    <header className="h-16 bg-[#0c0e18] border-b border-[#1B2238] flex items-center justify-between gap-4 px-4 lg:px-6 sticky top-0 z-30">

      <div className="flex items-center gap-3 min-w-0">
        <button
          aria-label="Open menu"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#1B2238] text-zinc-400"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <Link
          href="/projects"
          className="hidden md:flex items-center gap-2 text-xs text-zinc-400 hover:text-white border border-[#1B2238] hover:border-zinc-700 rounded-md px-3 py-1.5 transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to Projects
        </Link>

        <h1 className="text-base font-semibold text-white truncate ml-1">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">

        <div className="hidden lg:flex relative items-center">
          <div className="flex items-center gap-1.5 text-xs text-zinc-300 border border-[#1B2238] hover:border-zinc-700 rounded-md px-2.5 py-1 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <select
              aria-label="Date range"
              value={preset}
              onChange={(e) => handleSelectChange(e.target.value as DatePreset)}
              className="bg-transparent outline-none text-xs text-zinc-200 cursor-pointer pr-1 max-w-[180px]"
            >
              {DATE_PRESETS.map((p) => (
                <option
                  key={p.value}
                  value={p.value}
                  className="bg-[#0c0e18] text-zinc-200"
                >
                  {p.value === "custom" ? customOptionLabel : p.label}
                </option>
              ))}
            </select>
            {preset === "custom" && (
              <button
                type="button"
                onClick={handleEditCustom}
                aria-label="Edit custom date range"
                className="ml-0.5 text-zinc-400 hover:text-white transition"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            )}
          </div>

          {pickerOpen && (
            <CustomRangePopover
              initial={customRange}
              onApply={handlePickerApply}
              onCancel={handlePickerCancel}
            />
          )}
        </div>

        <div className="hidden md:flex items-center border border-[#1B2238] rounded-md text-xs overflow-hidden">
          <button className="px-2 py-1 text-white bg-[#1B2238]">EN</button>
          <button className="px-2 py-1 text-zinc-500 hover:text-zinc-300 transition">UK</button>
        </div>

        <button
          aria-label="Toggle theme"
          className="hidden md:flex w-8 h-8 items-center justify-center text-zinc-400 hover:text-white border border-[#1B2238] rounded-md transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleSync}
          disabled={syncDisabled}
          aria-label="Sync Meta data for the active project"
          className="flex items-center gap-1.5 text-xs bg-[#6D5EF8] hover:bg-[#7d6ef9] disabled:bg-[#2a2347] disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-medium rounded-md px-3 py-1.5 transition"
        >
          {syncing ? (
            <svg
              className="animate-spin"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          )}
          {syncing ? "Syncing…" : "Sync"}
        </button>

        <button
          type="button"
          onClick={() => openAccountCenter("profile")}
          aria-label="Open Account Center"
          className="flex items-center gap-2 border border-[#1B2238] hover:border-[#6D5EF8]/60 hover:bg-[#1B2238]/60 rounded-md pl-1 pr-2 py-1 transition group"
        >
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-[10px] font-semibold">
            {initials}
          </span>
          <span className="hidden lg:inline text-xs text-zinc-300 group-hover:text-white max-w-[140px] truncate transition">
            {email || "Account"}
          </span>
        </button>

      </div>

    </header>
  );
}
