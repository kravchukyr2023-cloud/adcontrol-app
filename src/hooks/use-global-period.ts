"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type DatePreset,
  type DateRange,
  isDatePreset,
  isDateRange,
  presetToRange,
} from "@/lib/date-presets";

/**
 * Global, app-wide date preset bound to the topbar selector.
 *
 * Persistence + cross-component sync follow the same convention as
 * `useActiveProject`: a single string in localStorage plus a custom
 * window event that notifies every mounted hook instance when the
 * value changes. We deliberately avoid introducing zustand/Context —
 * the codebase has no global-state lib and the localStorage/event
 * pair already handles project-level state.
 *
 * Stage 8 (B2) adds a "custom" branch:
 *   - `preset === "custom"` means the active window is whatever the
 *     user picked in the calendar; the actual dates live in a
 *     separate localStorage key (`GLOBAL_CUSTOM_RANGE_KEY`).
 *   - Any malformed/missing custom data falls back to the default
 *     preset (`this_month`) — never silently to an empty window.
 */

export const GLOBAL_PERIOD_KEY = "adcontrol_global_period";
export const GLOBAL_CUSTOM_RANGE_KEY = "adcontrol_global_custom_range";
export const GLOBAL_PERIOD_CHANGED = "global-period-changed";

const DEFAULT_PRESET: DatePreset = "this_month";

/** Default custom range when the user picks "custom" with nothing stored. */
function defaultCustomRange(): DateRange {
  // Rolling 7-day window inclusive of today — matches the "last_7_days"
  // preset so the first thing the picker shows is sensible.
  return presetToRange("last_7_days");
}

function readStoredPreset(): DatePreset {
  if (typeof window === "undefined") return DEFAULT_PRESET;
  const raw = localStorage.getItem(GLOBAL_PERIOD_KEY);
  return isDatePreset(raw) ? raw : DEFAULT_PRESET;
}

function readStoredCustomRange(): DateRange | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(GLOBAL_CUSTOM_RANGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isDateRange(parsed) ? parsed : null;
  } catch {
    // Corrupted JSON — treat as absent. Caller fallback (this_month)
    // is the intended UX per task spec.
    return null;
  }
}

type GlobalPeriodEventDetail = {
  preset: DatePreset;
  customRange?: DateRange | null;
};

export function useGlobalPeriod() {
  const [preset, setPresetState] = useState<DatePreset>(() => readStoredPreset());
  const [customRange, setCustomRangeState] = useState<DateRange | null>(() =>
    readStoredCustomRange()
  );

  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<GlobalPeriodEventDetail>;
      const next = ce.detail?.preset;
      if (next && isDatePreset(next)) {
        setPresetState(next);
      }
      // `customRange` is present in the detail only when it changed.
      // `null` is a valid value (user cleared it); `undefined` means
      // "no change to customRange" — leave the existing state alone.
      if ("customRange" in (ce.detail ?? {})) {
        const cr = ce.detail?.customRange;
        if (cr === null || (cr && isDateRange(cr))) {
          setCustomRangeState(cr);
        }
      }
    }
    function onStorage(e: StorageEvent) {
      if (e.key === GLOBAL_PERIOD_KEY && isDatePreset(e.newValue)) {
        setPresetState(e.newValue);
      }
      if (e.key === GLOBAL_CUSTOM_RANGE_KEY) {
        if (e.newValue === null) {
          setCustomRangeState(null);
        } else {
          try {
            const parsed = JSON.parse(e.newValue);
            if (isDateRange(parsed)) setCustomRangeState(parsed);
          } catch {
            /* corrupted — ignore */
          }
        }
      }
    }

    window.addEventListener(GLOBAL_PERIOD_CHANGED, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GLOBAL_PERIOD_CHANGED, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreset = (next: DatePreset) => {
    if (typeof window === "undefined") return;

    // Seeding rule: when the user picks "custom" for the first time
    // (nothing previously saved), inject a default 7-day window so
    // the picker has something to render and downstream consumers
    // don't have to handle a null `range`. We keep this side-effect
    // here (not in the picker UI) so any caller that flips preset
    // programmatically also gets the seed.
    let seededRange: DateRange | null = null;
    if (next === "custom" && !customRange) {
      seededRange = defaultCustomRange();
      localStorage.setItem(
        GLOBAL_CUSTOM_RANGE_KEY,
        JSON.stringify(seededRange)
      );
      setCustomRangeState(seededRange);
    }

    localStorage.setItem(GLOBAL_PERIOD_KEY, next);
    setPresetState(next);

    const detail: GlobalPeriodEventDetail = { preset: next };
    if (seededRange) detail.customRange = seededRange;
    window.dispatchEvent(
      new CustomEvent(GLOBAL_PERIOD_CHANGED, { detail })
    );
  };

  const setCustomRange = (next: DateRange) => {
    if (typeof window === "undefined") return;
    if (!isDateRange(next)) return;
    localStorage.setItem(GLOBAL_CUSTOM_RANGE_KEY, JSON.stringify(next));
    setCustomRangeState(next);
    // Setting a custom range implies the active preset is "custom".
    // Persist that too so a refresh lands on the same window.
    localStorage.setItem(GLOBAL_PERIOD_KEY, "custom");
    setPresetState("custom");
    window.dispatchEvent(
      new CustomEvent(GLOBAL_PERIOD_CHANGED, {
        detail: { preset: "custom", customRange: next },
      })
    );
  };

  // `range` is the resolved {since,until} pair consumers actually use.
  // For "custom" without a valid stored range we fall back to the default
  // preset — the spec calls this out as the safe behaviour for corrupted
  // localStorage. We never want to expose `null` here because every
  // analytics fetch needs concrete dates.
  const range = useMemo<DateRange>(() => {
    if (preset === "custom") {
      if (customRange && isDateRange(customRange)) return customRange;
      return presetToRange(DEFAULT_PRESET);
    }
    return presetToRange(preset);
  }, [preset, customRange]);

  return { preset, setPreset, customRange, setCustomRange, range };
}
