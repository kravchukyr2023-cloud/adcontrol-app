/**
 * Stage 33c — shared, client-safe rule-id constants.
 *
 * Lives outside `src/server/decisions/rules.ts` (which is "server-only")
 * specifically so the Sales-side client panel can import the surface
 * filter without pulling the whole rules engine into the browser bundle.
 *
 * Single source of truth for "which Decision Engine issues belong on the
 * Sales & Attribution page". The Dashboard surface still shows everything;
 * Sales narrows to attribution-relevant rules so the panel stays focused.
 */

export const ATTRIBUTION_RULE_IDS = [
  "M0_attribution_health",
  "C2_meta_overstates",
  "M2_roas_below_floor",
  "M1_revenue_undershoot",
] as const;

export type AttributionRuleId = (typeof ATTRIBUTION_RULE_IDS)[number];
