-- Backfill: replace SUM-based purchases/leads with priority-OR values
-- recomputed from each insight row's preserved `raw_actions` jsonb.
--
-- Why this migration exists:
--   The previous `src/server/meta/actions-normalizer.ts` summed values
--   across 4 action_type strings per metric. For typical Pixel+CAPI
--   setups Meta reports the same physical conversion under all 4 strings
--   simultaneously, producing 2-4× over-counts (verified on production
--   Ahimsa data: 168 stored vs 42 real on 2026-05-27).
--
--   This migration recomputes `purchases` and `leads` for every row in
--   all 4 insight tables using the new priority-OR semantics. No Meta
--   API calls are made — the source of truth is `raw_actions.actions`,
--   which was preserved verbatim on every row.
--
-- Priority chains (must match `actions-normalizer.ts`):
--   PURCHASES: omni_purchase
--            → offsite_conversion.fb_pixel_purchase
--            → onsite_web_purchase
--            → purchase
--   LEADS:    onsite_conversion.lead_grouped
--            → lead
--            → offsite_conversion.fb_pixel_lead
--            → onsite_web_lead
--
-- Semantics: pick the FIRST action_type in the chain whose value > 0.
-- If none match, result is 0.
--
-- IMPORTANT: only `purchases` and `leads` columns are mutated. The
-- `raw_actions` column is the historical source of truth and is NEVER
-- modified — future re-mappings will recompute from it again.
--
-- DEPLOYMENT ORDER:
--   1. Deploy the updated actions-normalizer.ts FIRST.
--      Otherwise the next sync after this migration would overwrite
--      backfilled values with fresh-from-Meta SUM values, undoing the
--      fix.
--   2. Then run this migration.
--
-- All work happens inside a single transaction. The audit temp table
-- captures pre-update state for the post-update sanity check at the end.


BEGIN;


-- 1. Snapshot pre-update state for sanity check.
CREATE TEMP TABLE backfill_audit_priority_or ON COMMIT DROP AS
  SELECT 'meta_ad_account_insights'::text AS table_name, id, purchases AS old_purchases, leads AS old_leads
    FROM meta_ad_account_insights
  UNION ALL
  SELECT 'meta_campaign_insights'::text, id, purchases, leads
    FROM meta_campaign_insights
  UNION ALL
  SELECT 'meta_adset_insights'::text, id, purchases, leads
    FROM meta_adset_insights
  UNION ALL
  SELECT 'meta_ad_insights'::text, id, purchases, leads
    FROM meta_ad_insights;


-- 2. PURCHASES backfill — same priority chain across all 4 tables.

UPDATE meta_ad_account_insights AS t SET purchases = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'omni_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_campaign_insights AS t SET purchases = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'omni_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_adset_insights AS t SET purchases = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'omni_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_ad_insights AS t SET purchases = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'omni_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'purchase'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);


-- 3. LEADS backfill — same priority chain across all 4 tables.

UPDATE meta_ad_account_insights AS t SET leads = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_conversion.lead_grouped'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_campaign_insights AS t SET leads = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_conversion.lead_grouped'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_adset_insights AS t SET leads = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_conversion.lead_grouped'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);

UPDATE meta_ad_insights AS t SET leads = COALESCE(
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_conversion.lead_grouped'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'offsite_conversion.fb_pixel_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  (SELECT trunc((a->>'value')::numeric)::bigint
     FROM jsonb_array_elements(COALESCE(t.raw_actions->'actions', '[]'::jsonb)) a
     WHERE a->>'action_type' = 'onsite_web_lead'
       AND trunc((a->>'value')::numeric)::bigint > 0
     LIMIT 1),
  0
);


-- 4. Sanity check — compare row counts of purchases=0 and leads=0
--    before and after.
--
--   Expectation:
--     - "after" purchases=0 count must be >= "before" count
--       (rows that had purchases>0 may collapse to 0 if no priority
--       action_type matched; rows that were 0 before stay 0).
--     - Same logic for leads.
--     - Total row counts must match exactly.
--     - If after_zero - before_zero is large for a table, investigate:
--       it means many rows had purchases via action_types NOT in the
--       priority chain (e.g. lead-only types that were being mis-summed
--       into purchases — unlikely, but worth verifying).
--
--   Output rows are emitted via SELECT so psql logs them at deploy time.

SELECT
  audit.table_name,
  count(*) FILTER (WHERE audit.old_purchases = 0)        AS purchases_zero_before,
  count(*) FILTER (WHERE
    CASE audit.table_name
      WHEN 'meta_ad_account_insights' THEN (SELECT purchases FROM meta_ad_account_insights WHERE id = audit.id)
      WHEN 'meta_campaign_insights'   THEN (SELECT purchases FROM meta_campaign_insights   WHERE id = audit.id)
      WHEN 'meta_adset_insights'      THEN (SELECT purchases FROM meta_adset_insights      WHERE id = audit.id)
      WHEN 'meta_ad_insights'         THEN (SELECT purchases FROM meta_ad_insights         WHERE id = audit.id)
    END = 0
  )                                                       AS purchases_zero_after,
  count(*) FILTER (WHERE audit.old_leads = 0)             AS leads_zero_before,
  count(*) FILTER (WHERE
    CASE audit.table_name
      WHEN 'meta_ad_account_insights' THEN (SELECT leads FROM meta_ad_account_insights WHERE id = audit.id)
      WHEN 'meta_campaign_insights'   THEN (SELECT leads FROM meta_campaign_insights   WHERE id = audit.id)
      WHEN 'meta_adset_insights'      THEN (SELECT leads FROM meta_adset_insights      WHERE id = audit.id)
      WHEN 'meta_ad_insights'         THEN (SELECT leads FROM meta_ad_insights         WHERE id = audit.id)
    END = 0
  )                                                       AS leads_zero_after,
  count(*)                                                AS total_rows
FROM backfill_audit_priority_or AS audit
GROUP BY audit.table_name
ORDER BY audit.table_name;


COMMIT;
