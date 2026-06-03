import "server-only";

/**
 * Normalize Meta insights `actions[]` and `action_values[]` arrays
 * into product-level counters (purchases, leads).
 *
 * Priority-OR semantics:
 *   For each metric we walk an ordered priority chain of Meta action_type
 *   strings and take the FIRST present action whose integer value > 0.
 *   We do NOT sum across types — Meta typically reports the same physical
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

export function normalizeActions(params: {
  actions?: MetaAction[] | null;
  actionValues?: MetaActionValue[] | null;
}): NormalizedActions {
  const actions = params.actions ?? [];
  const actionValues = params.actionValues ?? [];

  return {
    purchases: pickFirstByPriority(actions, PURCHASE_PRIORITY),
    leads: pickFirstByPriority(actions, LEAD_PRIORITY),
    rawActions: {
      actions,
      action_values: actionValues,
    },
  };
}
