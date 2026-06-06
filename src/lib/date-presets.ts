/**
 * Date-range presets shared by the global topbar selector and any page
 * that needs to translate a preset into a concrete `{since, until}` pair.
 *
 * Kept dependency-free (no React, no client/server split) so it can be
 * imported from both the topbar UI and per-page hooks without dragging
 * runtime context with it.
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "last_30_days";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
];

function toIsoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function presetToRange(preset: DatePreset): {
  since: string;
  until: string;
} {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  switch (preset) {
    case "today":
      return { since: toIsoUtcDate(today), until: toIsoUtcDate(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      return { since: toIsoUtcDate(y), until: toIsoUtcDate(y) };
    }
    case "last_7_days": {
      // Rolling 7-day window inclusive of today.
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 6);
      return { since: toIsoUtcDate(s), until: toIsoUtcDate(today) };
    }
    case "this_month": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { since: toIsoUtcDate(s), until: toIsoUtcDate(today) };
    }
    case "last_month": {
      const s = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      );
      // Day 0 of current month = last day of previous month.
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { since: toIsoUtcDate(s), until: toIsoUtcDate(e) };
    }
    case "last_30_days": {
      // Rolling 30-day window inclusive of today.
      const s = new Date(today);
      s.setUTCDate(s.getUTCDate() - 29);
      return { since: toIsoUtcDate(s), until: toIsoUtcDate(today) };
    }
  }
}

export function isDatePreset(v: unknown): v is DatePreset {
  return (
    v === "today" ||
    v === "yesterday" ||
    v === "last_7_days" ||
    v === "this_month" ||
    v === "last_month" ||
    v === "last_30_days"
  );
}
