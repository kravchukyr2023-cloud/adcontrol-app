"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange as RdpRange } from "react-day-picker";
import {
  type DateRange,
  daysBetween,
  isDateRange,
} from "@/lib/date-presets";

/**
 * Floating calendar popover for the global topbar's "Custom range" preset.
 *
 * Behaviour:
 *   - Renders a two-month react-day-picker in range mode.
 *   - Future dates are non-selectable (disabled prop).
 *   - When the user picks `from > to`, the dates are auto-swapped on Apply.
 *   - Ranges spanning > 90 days show an inline warning, but Apply is
 *     still enabled — per Stage 8 product decision the user keeps
 *     control, we just inform them Meta may not return that history.
 *
 * Click-outside-to-cancel: the picker dispatches `onCancel` when a
 * pointerdown lands outside its root. We use pointerdown (not click)
 * so the listener fires before the global select's blur, avoiding a
 * race where the select re-fires its onChange.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const WARNING_THRESHOLD_DAYS = 90;

function toIsoUtcDate(d: Date): string {
  // react-day-picker emits local-time Date objects; we serialise as
  // UTC date string by reading UTC components directly. Doing
  // `d.toISOString().slice(0,10)` on a local midnight Date can land
  // on the previous day in west-of-UTC timezones.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s: string | undefined | null): Date | undefined {
  if (!s || !ISO_RE.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type CustomRangePopoverProps = {
  /** Initial range when opening. `null` ⇒ no preselection. */
  initial: DateRange | null;
  onApply: (range: DateRange) => void;
  onCancel: () => void;
};

export default function CustomRangePopover({
  initial,
  onApply,
  onCancel,
}: CustomRangePopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const initialRdpRange = useMemo<RdpRange | undefined>(() => {
    if (!initial) return undefined;
    const from = parseIso(initial.since);
    const to = parseIso(initial.until);
    if (!from || !to) return undefined;
    return { from, to };
  }, [initial]);

  const [selected, setSelected] = useState<RdpRange | undefined>(
    initialRdpRange
  );

  // Click-outside dismiss.
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onCancel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Compute the candidate range that Apply would commit. Auto-swap
  // if user dragged in reverse (from > to). Single-day pick (no `to`)
  // collapses to a one-day range.
  const candidate: DateRange | null = useMemo(() => {
    if (!selected?.from) return null;
    const fromIso = toIsoUtcDate(selected.from);
    const toIso = selected.to ? toIsoUtcDate(selected.to) : fromIso;
    const range: DateRange = { since: fromIso, until: toIso };
    if (!isDateRange(range)) return null;
    if (range.since > range.until) {
      return { since: range.until, until: range.since };
    }
    return range;
  }, [selected]);

  const rangeDays =
    candidate !== null ? daysBetween(candidate.since, candidate.until) : 0;
  const showLongRangeWarning =
    candidate !== null && rangeDays > WARNING_THRESHOLD_DAYS;

  const applyDisabled = candidate === null;

  const handleApply = () => {
    if (!candidate) return;
    onApply(candidate);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Pick a custom date range"
      className="absolute right-0 top-full mt-2 z-50 rounded-xl bg-[#0c0e18] border border-[#1B2238] shadow-2xl p-3 w-[640px] max-w-[calc(100vw-2rem)]"
    >
      <DayPicker
        className="rdp-adcontrol"
        mode="range"
        numberOfMonths={2}
        selected={selected}
        onSelect={setSelected}
        disabled={{ after: today }}
        defaultMonth={initialRdpRange?.from ?? today}
        showOutsideDays
      />

      <div className="mt-2 px-1 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-400 min-h-[1.25rem]">
          {candidate ? (
            <>
              <span className="text-zinc-200 tabular-nums">
                {candidate.since}
              </span>
              <span className="mx-1.5 text-zinc-500">→</span>
              <span className="text-zinc-200 tabular-nums">
                {candidate.until}
              </span>
              <span className="ml-2 text-zinc-500">
                ({rangeDays} day{rangeDays === 1 ? "" : "s"})
              </span>
            </>
          ) : (
            <span className="text-zinc-500">Pick a start and end date</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-md text-xs text-zinc-300 hover:text-white border border-[#1B2238] hover:border-zinc-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
            className="h-8 px-3 rounded-md text-xs font-medium text-white bg-[#6D5EF8] hover:bg-[#7d6ef9] disabled:bg-[#2a2347] disabled:text-zinc-400 disabled:cursor-not-allowed transition"
          >
            Apply
          </button>
        </div>
      </div>

      {showLongRangeWarning && (
        <div className="mt-2 px-1 text-[11px] text-amber-300/90">
          Long range — Meta may not return historical data for windows
          over {WARNING_THRESHOLD_DAYS} days.
        </div>
      )}
    </div>
  );
}
