import "server-only";
import type {
  DecisionIssue,
  DecisionResult,
  IssueSeverity,
  MonthlySnapshot,
} from "@/server/decisions/types";
import { deriveAttributionHealth, runAllRules } from "@/server/decisions/rules";

/**
 * Stage 30 — orchestrates the rules engine.
 *
 *   1. Compute attribution health from the snapshot.
 *   2. Run every rule (each returns 0..N issues).
 *   3. Downgrade real-based rules to confidence='low' when attribution is
 *      unreliable — the user still needs to see the issues so the AI can
 *      reason about them, but the UI badge will mark them "orientation".
 *   4. Sort: severity first (critical → warning → opportunity → info), then
 *      by descending impact ($).
 *   5. Cap to a reasonable count to avoid drowning the user. Critical issues
 *      are NEVER dropped; the cap only trims the long tail of warnings +
 *      opportunities.
 *
 * The M0 attribution-health issue (when it fires) is forced to the very top
 * regardless of impact — the user must read "tracking is broken" before
 * "campaign X is wasting money", because the conclusion depends on it.
 */

/** Real-based rules that should be downgraded when attribution is unreliable. */
const REAL_BASED_RULE_IDS = new Set([
  "M1_revenue_undershoot",
  "M2_roas_below_floor",
  "C1_campaign_burned_budget",
  "C2_meta_overstates",
  "A1_adset_weak_link",
  "AD1_ad_opportunity",
]);

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
  info: 3,
};

/** Soft cap on issues returned. Critical issues always pass through. */
const MAX_ISSUES = 15;

export function evaluateSnapshot(snapshot: MonthlySnapshot): DecisionResult {
  const attributionHealth = deriveAttributionHealth(snapshot);
  const raw = runAllRules(snapshot, attributionHealth);

  const downgraded = raw.map((issue) => {
    if (!attributionHealth.reliable && REAL_BASED_RULE_IDS.has(issue.ruleId)) {
      return { ...issue, confidence: "low" as const };
    }
    return issue;
  });

  // Dedupe by `id` (rule + scope). Pure safety belt — rules are written to
  // emit at most one issue per scope, but a future rule refactor shouldn't
  // be able to crash the UI with duplicate keys.
  const seen = new Set<string>();
  const deduped: DecisionIssue[] = [];
  for (const i of downgraded) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    deduped.push(i);
  }

  // Sprint 6.5 Stage 3 — priority order:
  //   1) M0 (attribution_health) is the root blocker — always index 0.
  //      Until tracking is trusted, every real-based number is orientative.
  //   2) severity: critical > warning > opportunity > info.
  //   3) impact ($) descending inside the same severity — money decides
  //      within a tier, never across tiers.
  // Stable across runs so the AI prompt sees a deterministic order.
  deduped.sort((a, b) => {
    const aIsM0 = a.ruleId === "M0_attribution_health";
    const bIsM0 = b.ruleId === "M0_attribution_health";
    if (aIsM0 && !bIsM0) return -1;
    if (bIsM0 && !aIsM0) return 1;
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return (b.impact ?? 0) - (a.impact ?? 0);
  });

  // Capping: pin M0 to the very top (it's a warning, so without this the
  // critical-first split below would put criticals ahead of it). Then keep
  // every remaining critical, then fill the rest up to MAX_ISSUES.
  const m0 = deduped.find((i) => i.ruleId === "M0_attribution_health") ?? null;
  const rest = m0 ? deduped.filter((i) => i.ruleId !== "M0_attribution_health") : deduped;
  const criticals = rest.filter((i) => i.severity === "critical");
  const remainder = rest.filter((i) => i.severity !== "critical");
  const capExcludingM0 = Math.max(MAX_ISSUES - (m0 ? 1 : 0), 0);
  const room = Math.max(capExcludingM0 - criticals.length, 0);
  const trimmed = [
    ...(m0 ? [m0] : []),
    ...criticals,
    ...remainder.slice(0, room),
  ];

  const summary = {
    totalIssues: trimmed.length,
    critical: 0,
    warning: 0,
    opportunity: 0,
    info: 0,
  };
  for (const i of trimmed) summary[i.severity] += 1;

  return {
    issues: trimmed,
    summary,
    attributionHealth,
    computedAt: new Date().toISOString(),
  };
}
