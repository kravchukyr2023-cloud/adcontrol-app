-- Phase 2 — Raw Meta Sync Data Plane
-- Date: 2026-05-20
-- Branch: feature/meta-sync-phase2
--
-- ARCHITECTURE RULES LOCKED INTO THIS MIGRATION:
--
-- 1. Resource-scoped insights. Insights keyed by Meta entity, never
--    by project. Project views happen via JOIN with project_meta_ad_accounts.
--
-- 2. Daily granularity only. Future breakdowns (hourly, placement,
--    country, device, publisher_platform) will live in SEPARATE
--    breakdown tables (e.g. meta_ad_insights_by_placement).
--
-- 3. Timezone: `date` is Meta's date_start in the ad account's
--    timezone (NOT UTC). Fetcher MUST NOT convert.
--
-- 4. Insight FKs to entity tables use ON DELETE SET NULL — never
--    CASCADE. Historical insights survive entity deletion. `user_id`
--    keeps ON DELETE CASCADE (user account deletion wipes data).
--
-- 5. Idempotency UNIQUEs use STABLE TEXT META IDs (not nullable UUID
--    FKs). UUID FKs are kept for joins. The text id is NOT NULL and
--    immutable per row.
--
-- 6. Soft-delete only. Entity rows go to status='deleted' + deleted_at.
--    No DELETE except via CASCADE from auth.users / projects.
--
-- 7. updated_at policy. NO database triggers. The application layer
--    (upserters in src/server/meta/upsert-*.ts) MUST set
--    updated_at = now() explicitly during conflict UPDATE.
--
-- 8. Backward compatibility with Phase 1. Only ADDs — no Phase 1
--    column or constraint is dropped or made stricter.


BEGIN;


-- 1. meta_campaigns (entity cache)

CREATE TABLE IF NOT EXISTS meta_campaigns (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_ad_account_id          uuid REFERENCES meta_ad_accounts(id) ON DELETE SET NULL,
  meta_campaign_id            text NOT NULL,
  campaign_name               text,
  objective                   text,
  campaign_status             text,
  effective_status            text,
  daily_budget                numeric(14,4),
  lifetime_budget             numeric(14,4),
  budget_remaining            numeric(14,4),
  buying_type                 text,
  special_ad_categories       text[],
  created_time                timestamptz,
  updated_time                timestamptz,
  status                      text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','paused','archived','deleted','expired')),
  deleted_at                  timestamptz,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_campaigns_user_campaign_unique
  ON meta_campaigns (user_id, meta_campaign_id);

CREATE INDEX IF NOT EXISTS meta_campaigns_account_status
  ON meta_campaigns (user_id, meta_ad_account_id, status);

CREATE INDEX IF NOT EXISTS meta_campaigns_updated_recent
  ON meta_campaigns (meta_ad_account_id, updated_time DESC);

ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_campaigns_select ON meta_campaigns
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_campaigns_insert ON meta_campaigns
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_campaigns_update ON meta_campaigns
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_campaigns_delete ON meta_campaigns
  FOR DELETE USING (user_id = auth.uid());


-- 2. meta_adsets (entity cache)

CREATE TABLE IF NOT EXISTS meta_adsets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_campaign_id_fk         uuid REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  meta_adset_id               text NOT NULL,
  meta_campaign_id            text,
  adset_name                  text,
  adset_status                text,
  effective_status            text,
  daily_budget                numeric(14,4),
  lifetime_budget             numeric(14,4),
  bid_amount                  numeric(14,4),
  optimization_goal           text,
  billing_event               text,
  targeting                   jsonb,
  start_time                  timestamptz,
  end_time                    timestamptz,
  created_time                timestamptz,
  updated_time                timestamptz,
  status                      text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','paused','archived','deleted','expired')),
  deleted_at                  timestamptz,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_adsets_user_adset_unique
  ON meta_adsets (user_id, meta_adset_id);

CREATE INDEX IF NOT EXISTS meta_adsets_campaign_status
  ON meta_adsets (user_id, meta_campaign_id_fk, status);

CREATE INDEX IF NOT EXISTS meta_adsets_campaign_text
  ON meta_adsets (meta_campaign_id, status);

ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_adsets_select ON meta_adsets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_adsets_insert ON meta_adsets
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_adsets_update ON meta_adsets
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_adsets_delete ON meta_adsets
  FOR DELETE USING (user_id = auth.uid());


-- 3. meta_ads (entity cache)
-- Creative: id + name only in V1. image_url/thumbnail_url deferred
-- to Phase 4 via separate creative-fetch path.

CREATE TABLE IF NOT EXISTS meta_ads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_adset_id_fk            uuid REFERENCES meta_adsets(id) ON DELETE SET NULL,
  meta_ad_id                  text NOT NULL,
  meta_adset_id               text,
  meta_campaign_id            text,
  ad_name                     text,
  ad_status                   text,
  effective_status            text,
  creative_id                 text,
  creative_name               text,
  created_time                timestamptz,
  updated_time                timestamptz,
  status                      text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','paused','archived','deleted','expired')),
  deleted_at                  timestamptz,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ads_user_ad_unique
  ON meta_ads (user_id, meta_ad_id);

CREATE INDEX IF NOT EXISTS meta_ads_adset_status
  ON meta_ads (user_id, meta_adset_id_fk, status);

CREATE INDEX IF NOT EXISTS meta_ads_adset_text
  ON meta_ads (meta_adset_id, status);

ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_ads_select ON meta_ads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_ads_insert ON meta_ads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_ads_update ON meta_ads
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_ads_delete ON meta_ads
  FOR DELETE USING (user_id = auth.uid());


-- 4. meta_ad_account_insights (daily, level=account)
-- NOT derivable from SUM(campaign_insights) — Meta de-duplicates
-- reach/unique_clicks at the account level.
-- Idempotency: UNIQUE(user_id, meta_ad_account_id, date) using stable
-- text Meta ID. The UUID FK is kept for joins but never used as a key.

CREATE TABLE IF NOT EXISTS meta_ad_account_insights (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_ad_account_id_fk       uuid REFERENCES meta_ad_accounts(id) ON DELETE SET NULL,
  meta_ad_account_id          text NOT NULL,
  date                        date NOT NULL,
  spend                       numeric(14,4) NOT NULL DEFAULT 0,
  impressions                 bigint        NOT NULL DEFAULT 0,
  clicks                      bigint        NOT NULL DEFAULT 0,
  unique_clicks               bigint        NOT NULL DEFAULT 0,
  ctr                         numeric(7,4),
  cpc                         numeric(10,4),
  cpm                         numeric(10,4),
  reach                       bigint,
  frequency                   numeric(7,4),
  purchases                   integer,
  leads                       integer,
  revenue                     numeric(14,2),
  currency                    text,
  raw_actions                 jsonb,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_aa_insights_resource_date_unique
  ON meta_ad_account_insights (user_id, meta_ad_account_id, date);

CREATE INDEX IF NOT EXISTS meta_aa_insights_account_recent
  ON meta_ad_account_insights (meta_ad_account_id_fk, date DESC);

CREATE INDEX IF NOT EXISTS meta_aa_insights_user_recent
  ON meta_ad_account_insights (user_id, date DESC);

ALTER TABLE meta_ad_account_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_aa_ins_select ON meta_ad_account_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_aa_ins_insert ON meta_ad_account_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_aa_ins_update ON meta_ad_account_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_aa_ins_delete ON meta_ad_account_insights
  FOR DELETE USING (user_id = auth.uid());


-- 5. meta_campaign_insights (daily, level=campaign)

CREATE TABLE IF NOT EXISTS meta_campaign_insights (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_campaign_id_fk         uuid REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  meta_campaign_id            text NOT NULL,
  date                        date NOT NULL,
  spend                       numeric(14,4) NOT NULL DEFAULT 0,
  impressions                 bigint        NOT NULL DEFAULT 0,
  clicks                      bigint        NOT NULL DEFAULT 0,
  unique_clicks               bigint        NOT NULL DEFAULT 0,
  ctr                         numeric(7,4),
  cpc                         numeric(10,4),
  cpm                         numeric(10,4),
  reach                       bigint,
  frequency                   numeric(7,4),
  purchases                   integer,
  leads                       integer,
  revenue                     numeric(14,2),
  currency                    text,
  raw_actions                 jsonb,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_camp_insights_resource_date_unique
  ON meta_campaign_insights (user_id, meta_campaign_id, date);

CREATE INDEX IF NOT EXISTS meta_camp_insights_campaign_recent
  ON meta_campaign_insights (meta_campaign_id_fk, date DESC);

CREATE INDEX IF NOT EXISTS meta_camp_insights_user_recent
  ON meta_campaign_insights (user_id, date DESC);

ALTER TABLE meta_campaign_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_camp_ins_select ON meta_campaign_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_camp_ins_insert ON meta_campaign_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_camp_ins_update ON meta_campaign_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_camp_ins_delete ON meta_campaign_insights
  FOR DELETE USING (user_id = auth.uid());


-- 6. meta_adset_insights (daily, level=adset)

CREATE TABLE IF NOT EXISTS meta_adset_insights (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_adset_id_fk            uuid REFERENCES meta_adsets(id) ON DELETE SET NULL,
  meta_adset_id               text NOT NULL,
  date                        date NOT NULL,
  spend                       numeric(14,4) NOT NULL DEFAULT 0,
  impressions                 bigint        NOT NULL DEFAULT 0,
  clicks                      bigint        NOT NULL DEFAULT 0,
  unique_clicks               bigint        NOT NULL DEFAULT 0,
  ctr                         numeric(7,4),
  cpc                         numeric(10,4),
  cpm                         numeric(10,4),
  reach                       bigint,
  frequency                   numeric(7,4),
  purchases                   integer,
  leads                       integer,
  revenue                     numeric(14,2),
  currency                    text,
  raw_actions                 jsonb,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_adset_insights_resource_date_unique
  ON meta_adset_insights (user_id, meta_adset_id, date);

CREATE INDEX IF NOT EXISTS meta_adset_insights_adset_recent
  ON meta_adset_insights (meta_adset_id_fk, date DESC);

CREATE INDEX IF NOT EXISTS meta_adset_insights_user_recent
  ON meta_adset_insights (user_id, date DESC);

ALTER TABLE meta_adset_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_adset_ins_select ON meta_adset_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_adset_ins_insert ON meta_adset_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_adset_ins_update ON meta_adset_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_adset_ins_delete ON meta_adset_insights
  FOR DELETE USING (user_id = auth.uid());


-- 7. meta_ad_insights (daily, level=ad — highest volume)

CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_ad_id_fk               uuid REFERENCES meta_ads(id) ON DELETE SET NULL,
  meta_ad_id                  text NOT NULL,
  date                        date NOT NULL,
  spend                       numeric(14,4) NOT NULL DEFAULT 0,
  impressions                 bigint        NOT NULL DEFAULT 0,
  clicks                      bigint        NOT NULL DEFAULT 0,
  unique_clicks               bigint        NOT NULL DEFAULT 0,
  ctr                         numeric(7,4),
  cpc                         numeric(10,4),
  cpm                         numeric(10,4),
  reach                       bigint,
  frequency                   numeric(7,4),
  purchases                   integer,
  leads                       integer,
  revenue                     numeric(14,2),
  currency                    text,
  raw_actions                 jsonb,
  last_synced_at              timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_insights_resource_date_unique
  ON meta_ad_insights (user_id, meta_ad_id, date);

CREATE INDEX IF NOT EXISTS meta_ad_insights_ad_recent
  ON meta_ad_insights (meta_ad_id_fk, date DESC);

CREATE INDEX IF NOT EXISTS meta_ad_insights_user_recent
  ON meta_ad_insights (user_id, date DESC);

ALTER TABLE meta_ad_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_ad_ins_select ON meta_ad_insights
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meta_ad_ins_insert ON meta_ad_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_ad_ins_update ON meta_ad_insights
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY meta_ad_ins_delete ON meta_ad_insights
  FOR DELETE USING (user_id = auth.uid());


-- 8. meta_sync_states extensions
-- Adds heartbeat_at, sync_requested_at, last_manual_sync_at (nullable).
-- Extends sync_status CHECK enum with 'partial' (strict superset).

ALTER TABLE meta_sync_states
  ADD COLUMN IF NOT EXISTS heartbeat_at        timestamptz,
  ADD COLUMN IF NOT EXISTS sync_requested_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_manual_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS meta_sync_states_heartbeat
  ON meta_sync_states (sync_status, heartbeat_at)
  WHERE sync_status = 'syncing';

ALTER TABLE meta_sync_states
  DROP CONSTRAINT IF EXISTS meta_sync_states_sync_status_check;

ALTER TABLE meta_sync_states
  ADD CONSTRAINT meta_sync_states_sync_status_check
  CHECK (sync_status IN ('idle','pending','syncing','error','paused','partial'));


-- 9. meta_connection_events.event_type enum extension
-- Strict superset of prior enum; existing audit rows remain valid.

ALTER TABLE meta_connection_events
  DROP CONSTRAINT IF EXISTS meta_connection_events_event_type_check;

ALTER TABLE meta_connection_events
  ADD CONSTRAINT meta_connection_events_event_type_check
  CHECK (event_type IN (
    'connect','reconnect','disconnect','token_refresh','token_expired',
    'permission_revoked','scope_change','error',
    'sync_started','sync_completed','sync_failed','sync_rate_limited',
    'sync_truncated','sync_aborted','sync_stale_lock_recovered'
  ));


-- 10. Sanity assertions

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'meta_campaigns','meta_adsets','meta_ads',
    'meta_ad_account_insights','meta_campaign_insights',
    'meta_adset_insights','meta_ad_insights'
  ];
  missing_tables text[];
  unique_count int;
  bad_sync_states int;
BEGIN
  SELECT ARRAY_AGG(t) INTO missing_tables
  FROM UNNEST(expected_tables) t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=t
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 migration failed — missing tables: %', missing_tables;
  END IF;

  SELECT COUNT(*) INTO unique_count
  FROM pg_indexes
  WHERE schemaname='public'
    AND indexname IN (
      'meta_aa_insights_resource_date_unique',
      'meta_camp_insights_resource_date_unique',
      'meta_adset_insights_resource_date_unique',
      'meta_ad_insights_resource_date_unique'
    );

  IF unique_count != 4 THEN
    RAISE EXCEPTION 'Phase 2 migration failed — expected 4 insight UNIQUE indexes, got %', unique_count;
  END IF;

  SELECT COUNT(*) INTO bad_sync_states
  FROM meta_sync_states
  WHERE sync_status NOT IN ('idle','pending','syncing','error','paused','partial');

  IF bad_sync_states > 0 THEN
    RAISE EXCEPTION 'Phase 2 migration failed — % meta_sync_states rows have unexpected sync_status', bad_sync_states;
  END IF;

  RAISE NOTICE 'Phase 2 migration ok: 7 new tables, 4 idempotency UNIQUEs, sync_states extended, events enum extended, % existing sync_states rows preserved.', (SELECT COUNT(*) FROM meta_sync_states);
END $$;

COMMIT;
