/**
 * Pure helpers shared by the project-card progress bars.
 *
 * Stateless, no React, no Supabase — so /lib is the right home.
 * Pro-rating is done in UTC to match the analytics window the
 * `/api/projects/summaries` endpoint uses.
 */

export type ProgressColor = string;
export type MetricType = "revenue" | "spend" | "roas" | "purchases";

/**
 * Pro-rate a monthly target to "what it should be by end-of-today".
 * Linear schedule: target × (dayOfMonth / daysInMonth).
 *
 *   monthlyTarget ≤ 0 returns 0 — caller renders the no-target form.
 *   `Date.UTC(year, month + 1, 0)` yields the last day of `month` (UTC),
 *   so `getUTCDate()` on it returns the day count for that month.
 */
export function computeProRatedTarget(monthlyTarget: number): number {
  if (monthlyTarget <= 0) return 0;
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return monthlyTarget * (dayOfMonth / daysInMonth);
}

/** Returns 0 if target is 0/negative — caller decides whether to render. */
export function computeProgressPercent(
  actual: number,
  proRatedTarget: number
): number {
  if (proRatedTarget <= 0) return 0;
  return (actual / proRatedTarget) * 100;
}

/**
 * Bar color tied to the metric semantics.
 *
 *   spend  — inverse: under target = good (green), at target = neutral,
 *            over = bad (red). Treating spend like revenue would mark
 *            a runaway budget green.
 *   others — direct: more = better, up to a saturated "over-perform"
 *            ceiling at 110 %.
 */
export function progressColor(
  percent: number,
  metric: MetricType
): ProgressColor {
  if (metric === "spend") {
    if (percent <= 90) return "bg-emerald-500/60";
    if (percent <= 100) return "bg-blue-500/60";
    return "bg-rose-500/60";
  }
  if (percent < 70) return "bg-amber-500/60";
  if (percent < 95) return "bg-blue-500/60";
  if (percent < 110) return "bg-emerald-500/60";
  return "bg-purple-500/60";
}
