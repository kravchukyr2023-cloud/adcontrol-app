import "server-only";

/**
 * Normalize Meta insights `actions[]` and `action_values[]` arrays
 * into product-level counters (purchases, leads) and the revenue
 * monetary value.
 *
 * Priority-OR semantics:
 *   For each metric we walk an ordered priority chain of Meta action_type
 *   strings and take the FIRST present action whose value > 0. We do NOT
 *   sum across types — Meta typically reports the same physical
 *   conversion under multiple action_type strings (Pixel + CAPI + on-site +
 *   omni). Summing them inflates the counter by 2-4×; the historical
 *   PURCHASE_TYPES Set on this same code path was over-counting Ahimsa
 *   data ×4 (168 stored vs 42 real on 2026-05-27).
 *
 * PURCHASES — priority chain:
 *   omni_purchase
 *     → Meta-side cross-channel deduplicated total. This is the number
 *       shown in Meta Ads Manager UI. Verified present in 100% of
 *       production rows with purchases > 0.
 *   offsite_conversion.fb_pixel_purchase
 *     → CAPI/offsite fallback. Used when omni is absent (rare).
 *   onsite_web_purchase
 *     → On-platform checkout (Shop on Meta).
 *   purchase
 *     → Classic Pixel Standard Event. Last fallback for legacy setups.
 *
 * REVENUE — same priority chain as PURCHASES.
 *   Meta mirrors every purchase action_type in `action_values[]` with
 *   the same `action_type` string and a monetary `value`. The same
 *   over-count risk exists (omni_purchase + offsite_conversion.fb_pixel_purchase
 *   + purchase all carry the same money). Picking the first non-zero
 *   along the chain dedups the same way `purchases` does.
 *
 *   Returns `null` (not 0) when no chain entry yields a positive value —
 *   distinguishes "no monetary signal at all" from "zero euros billed"
 *   so downstream UI can render an em-dash where appropriate.
 *
 * LEADS — priority chain:
 *   onsite_conversion.lead_grouped
 *     → Meta's preferred on-platform Lead Ads metric (dedup-aware within
 *       a session). Recommended primary by Meta documentation for any
 *       Lead Ads campaign. NOTE: not yet verified against real lead
 *       campaign data — the sample user runs only e-commerce, so the
 *       chain currently falls through to `lead`. For Meta-side Lead Ads
 *       this should still be correct per Meta docs.
 *   lead
 *     → Pixel Standard Event (web form submit).
 *   offsite_conversion.fb_pixel_lead
 *     → CAPI fallback.
 *   onsite_web_lead
 *     → On-site web lead form (Shop on Meta).
 *
 * What's deliberately NOT in either chain:
 *   - `*_add_meta_leads` family (`offsite_content_view_add_meta_leads`,
 *     `offsite_search_add_meta_leads`, etc.) — these are upper-funnel
 *     actions (views, searches, registrations) that resulted in clicks
 *     on a Lead Ad. They are NOT lead conversions.
 *   - `*_add_20_s_calls` family — phone-call events, not form leads.
 *   - `onsite_web_app_purchase`, `web_in_store_purchase`,
 *     `web_app_in_store_purchase` — these report the same conversion as
 *     `omni_purchase` under platform-specific zooms; omni already
 *     deduplicates across them.
 *
 * The full raw_actions / action_values payload is preserved on every
 * insight row's `raw_actions jsonb` column. Re-mapping (e.g. adding new
 * action_types to a chain) requires NO re-sync from Meta — a single
 * UPDATE recomputes from the stored payload.
 */

/**
 * Ordered priority chain for purchase counter.
 * Position 0 = highest priority (taken if present and value > 0).
 */
const PURCHASE_PRIORITY: readonly string[] = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "purchase",
] as const;

/**
 * Ordered priority chain for revenue monetary value.
 * Intentionally identical to PURCHASE_PRIORITY — Meta uses the same
 * action_type strings in `action_values[]` for the money side of each
 * purchase event. Kept as a separate constant so the count side and
 * the money side can diverge later (e.g., promoting a chain entry for
 * revenue only) without one change accidentally moving the other.
 */
const REVENUE_PRIORITY: readonly string[] = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "purchase",
] as const;

/**
 * Ordered priority chain for lead counter.
 * See docstring above for unverified caveat on `onsite_conversion.lead_grouped`.
 */
const LEAD_PRIORITY: readonly string[] = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
] as const;

export type MetaAction = {
  action_type: string;
  value: string | number;
};

export type MetaActionValue = {
  action_type: string;
  value: string | number;
};

export type NormalizedActions = {
  purchases: number;
  leads: number;
  /**
   * Monetary value picked along REVENUE_PRIORITY. `null` ⇒ no chain
   * entry had a positive value (caller should NOT coerce to 0;
   * downstream UI distinguishes the two).
   */
  revenue: number | null;
  /**
   * Verbatim Meta payload — written to `raw_actions jsonb` on every
   * insight row. Preserved so future re-mapping (e.g., reordering the
   * chain or adding new action_types) doesn't require re-syncing from
   * Meta.
   */
  rawActions: {
    actions: MetaAction[];
    action_values: MetaActionValue[];
  };
};

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

/**
 * Float-preserving variant of `toInt`. Returns `null` for unparseable
 * input — revenue uses this so we can distinguish "0.00 reported" from
 * "couldn't parse the value".
 */
function toFloatOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Pick the value of the first action_type in `priority` that is present
 * in `actions` AND has a positive integer value. Returns 0 if no chain
 * entry matches.
 *
 * Why "value > 0" rather than "any present":
 *   Meta sometimes returns an action_type with value=0 (the event is
 *   registered for the account but had zero occurrences that day). In
 *   priority-OR semantics, a 0-valued top-priority signal should NOT
 *   shadow a positive lower-priority signal — we want the best AVAILABLE
 *   measurement, not the strictest one. A 0 from omni_purchase next to
 *   purchase=10 means "omni reported zero, classic reported ten"; we
 *   take the ten. If every chain entry is missing or 0, the answer is
 *   genuinely 0.
 */
function pickFirstByPriority(
  actions: MetaAction[],
  priority: readonly string[]
): number {
  // Build action_type → value map once for O(1) lookups across the chain.
  const map = new Map<string, number>();
  for (const a of actions) {
    if (!a || typeof a.action_type !== "string") continue;
    const v = toInt(a.value);
    if (v > 0 && !map.has(a.action_type)) {
      map.set(a.action_type, v);
    }
  }
  for (const t of priority) {
    const v = map.get(t);
    if (v !== undefined) return v;
  }
  return 0;
}

/**
 * Float variant of `pickFirstByPriority` used for monetary values.
 * Returns `null` when no chain entry has a positive value — see the
 * NormalizedActions.revenue docstring for why null vs 0 matters.
 */
function pickFirstFloatByPriority(
  actionValues: MetaActionValue[],
  priority: readonly string[]
): number | null {
  const map = new Map<string, number>();
  for (const a of actionValues) {
    if (!a || typeof a.action_type !== "string") continue;
    const v = toFloatOrNull(a.value);
    if (v !== null && v > 0 && !map.has(a.action_type)) {
      map.set(a.action_type, v);
    }
  }
  for (const t of priority) {
    const v = map.get(t);
    if (v !== undefined) return v;
  }
  return null;
}

/**
 * Exposed for the backfill module — re-applies the REVENUE_PRIORITY
 * chain to a stored `action_values[]` payload without going through
 * the full normalizeActions() path. Used by `backfill-revenue.ts`
 * to recompute revenue on historical rows from the preserved
 * `raw_actions` JSONB.
 */
export function pickRevenueFromActionValues(
  actionValues: MetaActionValue[]
): number | null {
  return pickFirstFloatByPriority(actionValues, REVENUE_PRIORITY);
}

export function normalizeActions(params: {
  actions?: MetaAction[] | null;
  actionValues?: MetaActionValue[] | null;
}): NormalizedActions {
  const actions = params.actions ?? [];
  const actionValues = params.actionValues ?? [];

  return {
    purchases: pickFirstByPriority(actions, PURCHASE_PRIORITY),
    leads: pickFirstByPriority(actions, LEAD_PRIORITY),
    revenue: pickFirstFloatByPriority(actionValues, REVENUE_PRIORITY),
    rawActions: {
      actions,
      action_values: actionValues,
    },
  };
}
