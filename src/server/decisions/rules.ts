import "server-only";
import type {
  AttributionHealth,
  DecisionIssue,
  EntityPerformance,
  IssueFact,
  MonthlySnapshot,
} from "@/server/decisions/types";

/**
 * Stage 30 — deterministic rules engine.
 *
 * Every rule takes the MonthlySnapshot (Stage 29) plus an AttributionHealth
 * read-out and returns 0..N DecisionIssue rows. Rules are pure: no IO, no
 * fetches, no time-of-day side effects beyond what's in the snapshot.
 *
 * Thresholds are derived from PlanContext where possible — absolute hardcoded
 * dollar values would alias across users with different budgets. The few
 * remaining constants (significance fractions, "good enough" multipliers)
 * are surfaced as TUNING below so future re-tuning happens in one spot.
 */

// ===========================================================================
// Tuning knobs — single source of truth for "what counts as significant".
// ===========================================================================
const TUNING = {
  /** Attribution coverage below this triggers M0 + downgrades downstream rules. */
  attributionWarningCoverage: 0.3,
  /** Coverage above this is "reliable" — confidence stays high. */
  attributionReliableCoverage: 0.5,

  /** M1: pro-rated revenue ratio below this fires a warning. */
  revenueUndershootWarning: 0.8,
  /** M1: ratio below this escalates to critical. */
  revenueUndershootCritical: 0.5,

  /** M2: real ROAS below targetRoas × this is critical. */
  roasCriticalMultiplier: 0.5,

  /** C1/C2: campaign spend share of total spend that counts as "significant". */
  campaignSpendSignificance: 0.1,
  /** C1: above this share of total spend → escalate to critical. */
  campaignSpendCriticalShare: 0.2,
  /** C2: real ROAS below targetRoas × this counts as "Meta overstated". */
  metaOverstateRoasFloor: 0.3,
  /** C2: spend share to consider the divergence material. */
  metaOverstateSpendShare: 0.05,

  /** A1: adset spend share to trip the weak-link rule. */
  adsetSpendShare: 0.05,
  /** A1: worst-adset ROAS must be < group average × this to fire. */
  adsetWeakRatio: 0.5,

  /** AD1: best ad ROAS must beat targetRoas × this to be "scale-worthy". */
  adOpportunityRoasMultiplier: 1.5,
} as const;

// ===========================================================================
// Public entry point — runs every rule and returns the raw issue list. The
// evaluator (evaluate.ts) takes care of dedup, sorting, and the confidence
// downgrade based on attribution health.
// ===========================================================================
export function runAllRules(
  snapshot: MonthlySnapshot,
  attribution: AttributionHealth
): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  pushAll(issues, ruleAttributionHealth(snapshot, attribution));
  pushAll(issues, ruleMonthlyRevenueUndershoot(snapshot));
  pushAll(issues, ruleMonthlyRoasFloor(snapshot));
  pushAll(issues, ruleCampaignBurnedBudget(snapshot));
  pushAll(issues, ruleMetaOverstates(snapshot));
  pushAll(issues, ruleAdsetWeakLink(snapshot));
  pushAll(issues, ruleAdOpportunity(snapshot));
  return issues;
}

/**
 * Computes attribution coverage as `totals.realOrders / totals.purchases` —
 * the share of Meta-reported purchases that we have a confirmed real order
 * for. This is the only honest signal: comparing matched revenue against
 * total real revenue is tautological (in a low-volume month where every
 * order happens to match a campaign, coverage looks "perfect" even when
 * Meta is reporting 250 purchases and we have 4 orders).
 *
 * Edge cases:
 *   - Meta purchases = 0 → coverage = 1.0, reliable = true. There's nothing
 *     to track yet; downstream rules should not be downgraded for an empty
 *     funnel.
 *   - More real orders than Meta purchases → coverage clamped to 1.0. Meta
 *     occasionally under-reports purchases; we don't want spurious >100%.
 */
export function deriveAttributionHealth(
  snapshot: MonthlySnapshot
): AttributionHealth {
  const metaPurchases = snapshot.totals.purchases;
  const realOrders = snapshot.totals.realOrders;

  if (metaPurchases <= 0) {
    return {
      coverage: 1,
      reliable: true,
      note: "Meta is not reporting purchases this month yet — attribution health will be computed once Meta records sales.",
    };
  }

  const coverage = Math.min(realOrders / metaPurchases, 1);
  const reliable = coverage >= TUNING.attributionReliableCoverage;
  let note: string;
  if (coverage >= 0.9) {
    note = `${pct(coverage)} of Meta purchases confirmed by real orders — strong UTM coverage.`;
  } else if (coverage >= TUNING.attributionReliableCoverage) {
    note = `${pct(coverage)} of Meta purchases confirmed by real orders — sufficient for real-based analysis.`;
  } else if (coverage >= TUNING.attributionWarningCoverage) {
    note = `Only ${pct(coverage)} of Meta purchases (${realOrders} of ${metaPurchases}) are confirmed by real orders — campaign-level conclusions should be treated as orientation.`;
  } else {
    note = `Only ${pct(coverage)} of Meta purchases (${realOrders} of ${metaPurchases}) are confirmed by real orders — UTM tracking is incomplete. Real-based analysis is directional until tracking is fixed.`;
  }
  return { coverage, reliable, note };
}

// ===========================================================================
// M0 — Attribution Health issue.
// Fires when Meta purchases > 0 AND `realOrders / purchases` drops below the
// warning threshold — i.e. Meta sees sales we can't confirm from orders.
// This issue is always pinned to the top by the evaluator so the user reads
// it before the real-based ones (which read low under the same conditions).
// ===========================================================================
function ruleAttributionHealth(
  snapshot: MonthlySnapshot,
  attribution: AttributionHealth
): DecisionIssue[] {
  const metaPurchases = snapshot.totals.purchases;
  if (metaPurchases <= 0) return [];
  if (attribution.coverage >= TUNING.attributionWarningCoverage) return [];
  const realOrders = snapshot.totals.realOrders;
  const missing = Math.max(metaPurchases - realOrders, 0);
  return [
    {
      id: "M0:month",
      ruleId: "M0_attribution_health",
      severity: "warning",
      level: "month",
      title: "UTM tracking coverage is low",
      facts: [
        { label: "Confirmed share of Meta purchases", value: round2(attribution.coverage) },
        { label: "Real orders MTD", value: realOrders },
        { label: "Meta-reported purchases MTD", value: metaPurchases },
        { label: "Unconfirmed Meta purchases", value: missing },
      ],
      recommendedAction:
        "Налаштуй UTM-розмітку на оголошеннях (utm_source = Campaign, utm_medium = Adset, utm_campaign = Ad), щоб real-аналіз був точним.",
      // Impact ≈ purchases the tracker is missing — scale of the data
      // we can't trust.
      impact: missing,
      confidence: "high",
    },
  ];
}

// ===========================================================================
// M1 — Monthly revenue undershoot.
// ===========================================================================
function ruleMonthlyRevenueUndershoot(
  snapshot: MonthlySnapshot
): DecisionIssue[] {
  const plan = snapshot.plan;
  if (plan.proRatedTargetRevenue <= 0) return [];
  const actual = snapshot.totals.realRevenue;
  const ratio = actual / plan.proRatedTargetRevenue;
  if (ratio >= TUNING.revenueUndershootWarning) return [];

  const severity =
    ratio < TUNING.revenueUndershootCritical ? "critical" : "warning";
  const daysLeft = Math.max(plan.daysInMonth - plan.dayOfMonth, 0);
  const gap = Math.max(plan.targetRevenue - actual, 0);
  const neededPerDay = daysLeft > 0 ? gap / daysLeft : null;

  return [
    {
      id: "M1:month",
      ruleId: "M1_revenue_undershoot",
      severity,
      level: "month",
      title:
        severity === "critical"
          ? "Real revenue is far behind plan"
          : "Real revenue is behind plan",
      facts: [
        { label: "Real revenue MTD", value: round2(actual) },
        { label: "Pro-rated target MTD", value: round2(plan.proRatedTargetRevenue) },
        { label: "Monthly target", value: round2(plan.targetRevenue) },
        // Integer percentage so the "%" in the label matches the value
        // verbatim — otherwise the AI dutifully renders "0.45%" instead
        // of "45%". The progress bar in the UI does its own ×100 from
        // the raw ratio, so this fix is local to the AI fact stream.
        { label: "% of pro-rated target", value: Math.round(ratio * 100) },
        { label: "Days left in month", value: daysLeft },
        {
          label: "Daily revenue needed to hit plan",
          value: neededPerDay !== null ? round2(neededPerDay) : null,
        },
      ],
      recommendedAction:
        neededPerDay !== null && neededPerDay > 0
          ? `To hit plan, real revenue needs to average ${round2(
              neededPerDay
            )} / day over the remaining ${daysLeft} day(s).`
          : "Plan window closing — reassess monthly target or pull forward higher-ROAS spend.",
      impact: gap,
      confidence: "high",
    },
  ];
}

// ===========================================================================
// M2 — Real ROAS below half target (monthly).
// ===========================================================================
function ruleMonthlyRoasFloor(snapshot: MonthlySnapshot): DecisionIssue[] {
  const { plan, totals } = snapshot;
  if (plan.targetRoas <= 0) return [];
  if (totals.realRoas === null) return [];
  if (totals.realRoas >= plan.targetRoas * TUNING.roasCriticalMultiplier) return [];

  const metaRoas = totals.spend > 0 ? totals.metaRevenue / totals.spend : null;
  return [
    {
      id: "M2:month",
      ruleId: "M2_roas_below_floor",
      severity: "critical",
      level: "month",
      title: "Real ROAS is far below target",
      facts: [
        { label: "Real ROAS", value: round2(totals.realRoas) },
        { label: "Target ROAS", value: round2(plan.targetRoas) },
        { label: "Meta ROAS", value: metaRoas !== null ? round2(metaRoas) : null },
        { label: "Spend MTD", value: round2(totals.spend) },
        { label: "Real revenue MTD", value: round2(totals.realRevenue) },
      ],
      recommendedAction:
        "Шукай дві-три кампанії що з'їдають бюджет без real-продажів і паузь або переналаштовуй.",
      impact: totals.spend,
      confidence: "high",
    },
  ];
}

// ===========================================================================
// C1 — Burned campaign budget (significant spend, zero real orders).
// ===========================================================================
function ruleCampaignBurnedBudget(
  snapshot: MonthlySnapshot
): DecisionIssue[] {
  const totalSpend = snapshot.totals.spend;
  if (totalSpend <= 0) return [];
  const minShare = TUNING.campaignSpendSignificance;
  const issues: DecisionIssue[] = [];

  for (const c of snapshot.campaigns) {
    if (c.realOrders > 0) continue;
    const share = c.spend / totalSpend;
    if (share < minShare) continue;

    const severity =
      share >= TUNING.campaignSpendCriticalShare ? "critical" : "warning";
    issues.push({
      id: `C1:${c.id}`,
      ruleId: "C1_campaign_burned_budget",
      severity,
      level: "campaign",
      entityId: c.id,
      entityName: c.name,
      title: `Campaign spent ${round2(c.spend)} with no real orders`,
      facts: [
        { label: "Spend MTD", value: round2(c.spend) },
        { label: "Share of total spend", value: round2(share) },
        { label: "Real orders", value: c.realOrders },
        { label: "Meta-reported revenue", value: round2(c.metaRevenue) },
        { label: "Impressions", value: c.impressions },
        { label: "Effective status", value: c.effectiveStatus },
      ],
      recommendedAction:
        "Перевір UTM-розмітку оголошень кампанії; якщо трекінг цілий — постав на паузу або зміни таргет.",
      impact: c.spend,
      confidence: "high",
    });
  }
  return issues;
}

// ===========================================================================
// C2 — Meta overstates ROAS vs. real (the most valuable signal).
// ===========================================================================
function ruleMetaOverstates(snapshot: MonthlySnapshot): DecisionIssue[] {
  const { plan, totals } = snapshot;
  if (plan.targetRoas <= 0 || totals.spend <= 0) return [];
  const issues: DecisionIssue[] = [];

  for (const c of snapshot.campaigns) {
    if (c.realRoas === null || c.metaRoas === null) continue;
    if (c.metaRoas < plan.targetRoas) continue;
    if (c.realRoas >= plan.targetRoas * TUNING.metaOverstateRoasFloor) continue;
    const share = c.spend / totals.spend;
    if (share < TUNING.metaOverstateSpendShare) continue;

    issues.push({
      id: `C2:${c.id}`,
      ruleId: "C2_meta_overstates",
      severity: "warning",
      level: "campaign",
      entityId: c.id,
      entityName: c.name,
      title: "Meta reports profitable but real ROAS is far lower",
      facts: [
        { label: "Meta ROAS", value: round2(c.metaRoas) },
        { label: "Real ROAS", value: round2(c.realRoas) },
        { label: "Target ROAS", value: round2(plan.targetRoas) },
        { label: "Spend MTD", value: round2(c.spend) },
        { label: "Real revenue", value: round2(c.realRevenue) },
        { label: "Meta revenue", value: round2(c.metaRevenue) },
      ],
      recommendedAction:
        "Звір real-продажі за UTM з Meta — якщо розрив підтверджується, перенаправ бюджет на real-прибуткові кампанії.",
      impact: c.spend,
      confidence: "high",
    });
  }
  return issues;
}

// ===========================================================================
// A1 — Adset weak link within a campaign.
// Fires per campaign group: needs ≥ 2 adsets with realRoas defined, and the
// worst must have real ROAS < group average × adsetWeakRatio while carrying
// significant spend.
// ===========================================================================
function ruleAdsetWeakLink(snapshot: MonthlySnapshot): DecisionIssue[] {
  const totalSpend = snapshot.totals.spend;
  if (totalSpend <= 0) return [];

  const byCampaign = new Map<string, EntityPerformance[]>();
  for (const a of snapshot.adsets) {
    if (!a.parentCampaignId) continue;
    const arr = byCampaign.get(a.parentCampaignId) ?? [];
    arr.push(a);
    byCampaign.set(a.parentCampaignId, arr);
  }

  const campaignNameById = new Map<string, string>();
  for (const c of snapshot.campaigns) campaignNameById.set(c.id, c.name);

  const issues: DecisionIssue[] = [];
  for (const [campaignId, adsets] of byCampaign) {
    const scored = adsets.filter(
      (a): a is EntityPerformance & { realRoas: number } => a.realRoas !== null
    );
    if (scored.length < 2) continue;

    const avgRoas =
      scored.reduce((s, a) => s + a.realRoas, 0) / scored.length;
    if (avgRoas <= 0) continue;

    const worst = scored.reduce(
      (acc, a) => (a.realRoas < acc.realRoas ? a : acc),
      scored[0]
    );
    if (worst.spend / totalSpend < TUNING.adsetSpendShare) continue;
    if (worst.realRoas >= avgRoas * TUNING.adsetWeakRatio) continue;

    issues.push({
      id: `A1:${worst.id}`,
      ruleId: "A1_adset_weak_link",
      severity: "warning",
      level: "adset",
      entityId: worst.id,
      entityName: worst.name,
      title: "Adset underperforms peers in the same campaign",
      facts: [
        { label: "Adset real ROAS", value: round2(worst.realRoas) },
        { label: "Campaign average real ROAS", value: round2(avgRoas) },
        { label: "Spend MTD", value: round2(worst.spend) },
        { label: "Real orders", value: worst.realOrders },
        { label: "Adsets compared", value: scored.length },
      ],
      recommendedAction:
        "Порівняй креативи/таргет з кращими адсетами кампанії — або перерозподіли бюджет.",
      impact: worst.spend,
      confidence: "high",
      parentContext: campaignNameById.get(campaignId) ?? undefined,
    });
  }
  return issues;
}

// ===========================================================================
// AD1 — Best ad opportunity (the one positive signal we surface).
// At most one issue: the top ad by real ROAS, only if it beats target × 1.5.
// ===========================================================================
function ruleAdOpportunity(snapshot: MonthlySnapshot): DecisionIssue[] {
  const targetRoas = snapshot.plan.targetRoas;
  if (targetRoas <= 0) return [];

  const candidates = snapshot.ads.filter(
    (a): a is EntityPerformance & { realRoas: number } =>
      a.realRoas !== null && a.realRoas > 0 && a.realRevenue > 0
  );
  if (candidates.length === 0) return [];

  const best = candidates.reduce(
    (acc, a) => (a.realRoas > acc.realRoas ? a : acc),
    candidates[0]
  );
  if (best.realRoas < targetRoas * TUNING.adOpportunityRoasMultiplier) return [];

  const adsetNameById = new Map<string, string>();
  for (const a of snapshot.adsets) adsetNameById.set(a.id, a.name);
  const campaignNameById = new Map<string, string>();
  for (const c of snapshot.campaigns) campaignNameById.set(c.id, c.name);

  const parentLabel =
    best.parentAdsetId && adsetNameById.has(best.parentAdsetId)
      ? `${campaignNameById.get(best.parentCampaignId ?? "") ?? "?"} → ${adsetNameById.get(best.parentAdsetId)}`
      : campaignNameById.get(best.parentCampaignId ?? "") ?? undefined;

  return [
    {
      id: `AD1:${best.id}`,
      ruleId: "AD1_ad_opportunity",
      severity: "opportunity",
      level: "ad",
      entityId: best.id,
      entityName: best.name,
      title: "Top-performing ad worth scaling",
      facts: [
        { label: "Real ROAS", value: round2(best.realRoas) },
        { label: "Target ROAS", value: round2(targetRoas) },
        { label: "Real revenue", value: round2(best.realRevenue) },
        { label: "Real orders", value: best.realOrders },
        { label: "Spend", value: round2(best.spend) },
      ],
      recommendedAction:
        "Розглянь масштабування — підняти денний бюджет адсета або задублювати найкращий креатив.",
      impact: best.realRevenue,
      confidence: "high",
      parentContext: parentLabel,
    },
  ];
}

// ===========================================================================
// Helpers.
// ===========================================================================
function pushAll<T>(target: T[], items: T[]): void {
  for (const i of items) target.push(i);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Exposed for evaluate.ts — keep TUNING immutable elsewhere. */
export const RULES_TUNING = TUNING;

/** Re-exported so the IssueFact import in consumers is centralized. */
export type { IssueFact };
