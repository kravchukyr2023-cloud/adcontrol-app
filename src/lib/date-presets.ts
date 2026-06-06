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
  | "last_30_days"
  | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

export type DateRange = { since: string; until: string };

function toIsoUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a preset into a concrete `{since, until}` window.
 *
 * For all built-in presets the second argument is ignored. For
 * `preset === "custom"` the caller MUST supply `customRange` — there's
 * no synthetic default at this layer so a missing custom range is
 * surfaced as a programmer error rather than silently producing the
 * wrong window. UI/hook layers are responsible for seeding a default
 * before they ever call presetToRange("custom").
 */
export function presetToRange(
  preset: DatePreset,
  customRange?: DateRange
): DateRange {
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
    case "custom": {
      if (!customRange) {
        throw new Error(
          'presetToRange("custom") called without a customRange — caller must seed one before resolving the window'
        );
      }
      return customRange;
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
    v === "last_30_days" ||
    v === "custom"
  );
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate that a value is a structurally well-formed DateRange.
 * Does NOT check business rules (since ≤ until, dates not in future,
 * range ≤ 90d). Those belong to the UI layer.
 */
export function isDateRange(v: unknown): v is DateRange {
  if (typeof v !== "object" || v === null) return false;
  const r = v as { since?: unknown; until?: unknown };
  return (
    typeof r.since === "string" &&
    typeof r.until === "string" &&
    ISO_DATE_RE.test(r.since) &&
    ISO_DATE_RE.test(r.until)
  );
}

/** UTC-safe inclusive day delta. Returns +Infinity for malformed input. */
export function daysBetween(since: string, until: string): number {
  const s = new Date(`${since}T00:00:00Z`).getTime();
  const u = new Date(`${until}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(u)) return Number.POSITIVE_INFINITY;
  return Math.floor((u - s) / (24 * 60 * 60 * 1000)) + 1;
}
