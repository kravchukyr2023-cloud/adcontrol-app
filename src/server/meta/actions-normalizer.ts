import "server-only";

/**
 * Normalize Meta insights `actions[]` and `action_values[]` arrays
 * into product-level counters (purchases, leads).
 *
 * Why multiple action_types per metric:
 *   Meta returns purchase/lead events under multiple action_type
 *   strings depending on pixel configuration (offsite vs onsite vs
 *   omni). For V1 we SUM all known matching types so the counter is
 *   robust across diverse pixel setups.
 *
 *   Trade-off: if a single conversion fires under both `purchase` and
 *   `offsite_conversion.fb_pixel_purchase`, this OVER-counts by 2×.
 *   Deduplication is Phase 4 attribution work. The full `actions[]` /
 *   `action_values[]` payload is preserved on each insight row's
 *   `raw_actions jsonb` column so re-mapping can be done later
 *   without re-fetching from Meta.
 *
 *   To tune mappings later, edit PURCHASE_TYPES / LEAD_TYPES below
 *   and re-run a sync with `scopes=['*_insights']`.
 */

const PURCHASE_TYPES: ReadonlySet<string> = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "omni_purchase",
]);

const LEAD_TYPES: ReadonlySet<string> = new Set([
  "lead",
  "offsite_conversion.fb_pixel_lead",
]);

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
   * insight row. Preserved so future re-mapping (e.g., adding more
   * lead action_types) doesn't require re-syncing from Meta.
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

export function normalizeActions(params: {
  actions?: MetaAction[] | null;
  actionValues?: MetaActionValue[] | null;
}): NormalizedActions {
  const actions = params.actions ?? [];
  const actionValues = params.actionValues ?? [];

  let purchases = 0;
  let leads = 0;

  for (const a of actions) {
    if (!a || typeof a.action_type !== "string") continue;
    if (PURCHASE_TYPES.has(a.action_type)) {
      purchases += toInt(a.value);
    }
    if (LEAD_TYPES.has(a.action_type)) {
      leads += toInt(a.value);
    }
  }

  return {
    purchases,
    leads,
    rawActions: {
      actions,
      action_values: actionValues,
    },
  };
}
