"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type DatePreset,
  isDatePreset,
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
 */

export const GLOBAL_PERIOD_KEY = "adcontrol_global_period";
export const GLOBAL_PERIOD_CHANGED = "global-period-changed";

const DEFAULT_PRESET: DatePreset = "this_month";

function readStoredPreset(): DatePreset {
  if (typeof window === "undefined") return DEFAULT_PRESET;
  const raw = localStorage.getItem(GLOBAL_PERIOD_KEY);
  return isDatePreset(raw) ? raw : DEFAULT_PRESET;
}

export function useGlobalPeriod() {
  const [preset, setPresetState] = useState<DatePreset>(() => readStoredPreset());

  useEffect(() => {
    function onChange(e: Event) {
      const ce = e as CustomEvent<{ preset: DatePreset }>;
      if (ce.detail?.preset && isDatePreset(ce.detail.preset)) {
        setPresetState(ce.detail.preset);
      }
    }
    function onStorage(e: StorageEvent) {
      if (e.key === GLOBAL_PERIOD_KEY && isDatePreset(e.newValue)) {
        setPresetState(e.newValue);
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
    localStorage.setItem(GLOBAL_PERIOD_KEY, next);
    setPresetState(next);
    window.dispatchEvent(
      new CustomEvent(GLOBAL_PERIOD_CHANGED, { detail: { preset: next } })
    );
  };

  const range = useMemo(() => presetToRange(preset), [preset]);

  return { preset, setPreset, range };
}
