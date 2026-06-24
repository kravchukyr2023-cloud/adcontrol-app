import "server-only";

/**
 * Sprint 6 "Decision Engine" data contract.
 *
 * The MonthlySnapshot is the single, frozen view of a project's current month
 * that every Sprint 6 stage consumes — rules (Stage 30), AI analyst (Stage 31),
 * cache + cron (Stage 32), UI (Stage 33). Stages 30+ never re-aggregate; they
 * read this struct.
 *
 * Period is ALWAYS the current calendar month (UTC), 1st → today inclusive.
 * The global topbar period is irrelevant here — the "monthly brain" is by
 * definition monthly.
 *
 * Numbers are always JS `number` (PostgREST returns `numeric` columns as
 * strings; the builder coerces). Ratios (ROAS, CPA) are null whenever their
 * denominator is zero so consumers never have to guard for NaN/Infinity.
 */

export type EntityLevel = "campaign" | "adset" | "ad";

export type PlanContext = {
  /** Monthly revenue target from projects.monthly_revenue_goal. */
  targetRevenue: number;
  /** Project-wide ROAS target from projects.target_roas. */
  targetRoas: number;
  /** Project-wide CPA target from projects.target_cpa. */
  targetCpa: number;
  /** Monthly ad-budget target from projects.monthly_ad_budget. */
  targetSpend: number;
  /** Total days in the current month (UTC). */
  daysInMonth: number;
  /** Today's day-of-month (UTC), 1..daysInMonth. */
  dayOfMonth: number;
  /** Linear pro-ration: targetRevenue × (dayOfMonth / daysInMonth). 0 when targetRevenue ≤ 0. */
  proRatedTargetRevenue: number;
  /** Same pro-ration applied to ad budget. */
  proRatedTargetSpend: number;
  /** YYYY-MM-DD inclusive bounds of the snapshot window. */
  monthStart: string;
  monthEnd: string;
};

export type AttributionAggregate = {
  matched: number;
  partial: number;
  unmatched: number;
  manual: number;
};

export type EntityPerformance = {
  id: string;
  name: string;
  level: EntityLevel;

  /** UUID of the meta_ad_account this entity ultimately belongs to. */
  adAccountId: string;
  adAccountName: string;

  /** Source-of-truth liveness from Meta's effective_status. */
  isActive: boolean;
  effectiveStatus: string | null;

  // --- Meta side ---
  spend: number;
  impressions: number;
  clicks: number;
  /** Meta-reported purchase count for the month. */
  purchases: number;
  /** Meta-reported revenue for the month (NOT real orders revenue). */
  metaRevenue: number;
  /** metaRevenue / spend — null when spend = 0. */
  metaRoas: number | null;

  // --- Real (orders) side ---
  /** Sum of orders.revenue whose matched_meta_<level>_id = this entity. */
  realRevenue: number;
  /** Count of orders matched to this entity. */
  realOrders: number;
  /** realRevenue / spend — null when spend = 0. */
  realRoas: number | null;
  /** spend / realOrders — null when realOrders = 0. */
  realCpa: number | null;

  /** Breakdown of attribution_status across this entity's orders. */
  attribution: AttributionAggregate;

  /** Parent IDs for drill-down. Null for campaigns; campaign/adset for ads. */
  parentCampaignId: string | null;
  parentAdsetId: string | null;
};

export type AdAccountRollup = {
  id: string;
  name: string;
  spend: number;
  realRevenue: number;
  metaRevenue: number;
  realRoas: number | null;
};

export type SnapshotTotals = {
  spend: number;
  realRevenue: number;
  realOrders: number;
  /** realRevenue / spend — null when spend = 0. */
  realRoas: number | null;
  metaRevenue: number;
  /** Meta-reported purchase count, summed across AAs. */
  purchases: number;
};

export type DataCompleteness = {
  /** ads_with_insights / total_ads in the project's ad list. 1.0 when no ads. */
  adInsightsCoverage: number;
  /** Count of ad-level rows present in meta_ads for this project. */
  totalAds: number;
  /** Count of ads that have ≥ 1 insight row in the month. */
  adsWithInsights: number;
  /** Human-readable note for the UI banner / AI prompt. */
  note: string;
};

export type MonthlySnapshot = {
  projectId: string;
  projectName: string;
  currency: string;
  plan: PlanContext;
  totals: SnapshotTotals;
  adAccounts: AdAccountRollup[];
  campaigns: EntityPerformance[];
  adsets: EntityPerformance[];
  ads: EntityPerformance[];
  dataCompleteness: DataCompleteness;
  /** ISO timestamp the snapshot was assembled at — distinct from cache TTL. */
  computedAt: string;
};

// ===========================================================================
// Stage 30 — Rules Engine output.
// ===========================================================================

export type IssueSeverity = "critical" | "warning" | "opportunity" | "info";
export type IssueLevel = "month" | "campaign" | "adset" | "ad";
export type IssueConfidence = "high" | "low";

/** Structured number-with-label pair surfaced inside an issue. */
export type IssueFact = {
  label: string;
  /** Stored as a primitive so the AI layer (Stage 31) can quote verbatim. */
  value: number | string | null;
};

export type DecisionIssue = {
  /** Unique within a single DecisionResult. Composed as `${ruleId}:${scope}`. */
  id: string;
  ruleId: string;
  severity: IssueSeverity;
  level: IssueLevel;
  /** Present for level !== 'month'. */
  entityId?: string;
  entityName?: string;
  /** Short headline, ≤ 80 chars. */
  title: string;
  facts: IssueFact[];
  /** Imperative one-liner. */
  recommendedAction: string;
  /** Sort key for "what matters most by $". Higher = more important. */
  impact?: number;
  /** "low" when attribution coverage is poor and the rule reads orders. */
  confidence: IssueConfidence;
  /** e.g. parent campaign name for an adset issue. */
  parentContext?: string;
};

export type AttributionHealth = {
  /** attributedRevenue / totals.realRevenue. 1.0 when there's no revenue yet. */
  coverage: number;
  /** False → real-based rules downgrade to confidence='low'. */
  reliable: boolean;
  /** Human-readable explanation (UI banner + AI prompt). */
  note: string;
};

export type DecisionResult = {
  issues: DecisionIssue[];
  summary: {
    totalIssues: number;
    critical: number;
    warning: number;
    opportunity: number;
    info: number;
  };
  attributionHealth: AttributionHealth;
  computedAt: string;
};

// ===========================================================================
// Stage 31 — AI layer.
// ===========================================================================

/**
 * Human-readable explanation layer over a DecisionResult.
 *
 * Invariant: the AI never invents numbers. `monthlyPlan` and the per-issue
 * texts may only quote facts already present in the snapshot/decisions
 * input. When `llmUsed` is false we fell back to a deterministic template
 * (no API key / quota exhausted / network error / malformed JSON) — the
 * Decision Engine still works, just with terser language.
 */
export type DecisionExplanation = {
  /** 2–4 sentences summarising the month, written in Ukrainian. */
  monthlyPlan: string;
  /** Per-issue 1–2 sentence explanations, keyed by DecisionIssue.id. */
  issueExplanations: Record<string, string>;
  /** ISO timestamp. */
  generatedAt: string;
  /** False when the AI was unavailable and we returned a template. */
  llmUsed: boolean;
};
