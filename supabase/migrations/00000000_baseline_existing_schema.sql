-- =============================================================
-- BASELINE SCHEMA DOCUMENTATION
-- =============================================================
-- Date: 2026-06-09
-- Purpose: Document the existing state of public schema.
--
-- This file is INFORMATIONAL ONLY and should NOT be applied
-- to existing databases (CREATE TABLE without IF NOT EXISTS
-- will fail).
--
-- All 27 tables below already exist in production Supabase
-- (project: AdControl, created via Studio UI between May-Jun 2026).
--
-- Going forward: ALL schema changes (Sprint 4+) MUST be:
--   1. Written as new migration file in supabase/migrations/
--   2. Applied to DB via supabase db push OR manual SQL Editor
--   3. Committed to repo for source of truth
--
-- To regenerate this baseline:
--   Run SQL from C6 audit (Stage 15) in Supabase SQL Editor.
--
-- Excluded from this baseline (TODO if needed):
--   - Foreign key constraints (visible via Supabase Studio)
--   - Indexes (documented in Stage 15 audit notes)
--   - RLS policies (documented in Stage 15 audit notes)
--   - Triggers and functions
-- =============================================================


-- =============================================================
-- Tables in alphabetical order
-- =============================================================

CREATE TABLE billing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  plan_id text,
  addon_type text,
  quantity integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE business_manager_ad_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bm_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ad_account_name text,
  ad_account_external_id text,
  status text NOT NULL DEFAULT 'active'::text,
  source_type text NOT NULL DEFAULT 'manual'::text,
  is_base_resource boolean NOT NULL DEFAULT false,
  is_extra_paid boolean NOT NULL DEFAULT false,
  addon_source_type text,
  locked_reason text,
  is_locked boolean NOT NULL DEFAULT false,
  is_paused boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE custom_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  extra_projects integer DEFAULT 0,
  extra_business_managers integer DEFAULT 0,
  extra_ad_accounts integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE meta_ad_account_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_ad_account_id_fk uuid,
  meta_ad_account_id text NOT NULL,
  date date NOT NULL,
  spend numeric(14,4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  unique_clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(7,4),
  cpc numeric(10,4),
  cpm numeric(10,4),
  reach bigint,
  frequency numeric(7,4),
  purchases integer,
  leads integer,
  revenue numeric(14,2),
  currency text,
  raw_actions jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_ad_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_business_manager_id uuid NOT NULL,
  meta_ad_account_id text NOT NULL,
  ad_account_name text NOT NULL,
  account_status text,
  meta_account_status_code integer,
  currency text,
  status text NOT NULL DEFAULT 'active'::text,
  deleted_at timestamp with time zone,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_ad_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_ad_id_fk uuid,
  meta_ad_id text NOT NULL,
  date date NOT NULL,
  spend numeric(14,4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  unique_clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(7,4),
  cpc numeric(10,4),
  cpm numeric(10,4),
  reach bigint,
  frequency numeric(7,4),
  purchases integer,
  leads integer,
  revenue numeric(14,2),
  currency text,
  raw_actions jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_adset_id_fk uuid,
  meta_ad_id text NOT NULL,
  meta_adset_id text,
  meta_campaign_id text,
  ad_name text,
  ad_status text,
  effective_status text,
  creative_id text,
  creative_name text,
  created_time timestamp with time zone,
  updated_time timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  deleted_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_adset_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_adset_id_fk uuid,
  meta_adset_id text NOT NULL,
  date date NOT NULL,
  spend numeric(14,4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  unique_clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(7,4),
  cpc numeric(10,4),
  cpm numeric(10,4),
  reach bigint,
  frequency numeric(7,4),
  purchases integer,
  leads integer,
  revenue numeric(14,2),
  currency text,
  raw_actions jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_adsets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_campaign_id_fk uuid,
  meta_adset_id text NOT NULL,
  meta_campaign_id text,
  adset_name text,
  adset_status text,
  effective_status text,
  daily_budget numeric(14,4),
  lifetime_budget numeric(14,4),
  bid_amount numeric(14,4),
  optimization_goal text,
  billing_event text,
  targeting jsonb,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  created_time timestamp with time zone,
  updated_time timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  deleted_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_business_managers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  meta_bm_id text NOT NULL,
  bm_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  deleted_at timestamp with time zone,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_campaign_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_campaign_id_fk uuid,
  meta_campaign_id text NOT NULL,
  date date NOT NULL,
  spend numeric(14,4) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  unique_clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(7,4),
  cpc numeric(10,4),
  cpm numeric(10,4),
  reach bigint,
  frequency numeric(7,4),
  purchases integer,
  leads integer,
  revenue numeric(14,2),
  currency text,
  raw_actions jsonb,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_ad_account_id uuid,
  meta_campaign_id text NOT NULL,
  campaign_name text,
  objective text,
  campaign_status text,
  effective_status text,
  daily_budget numeric(14,4),
  lifetime_budget numeric(14,4),
  budget_remaining numeric(14,4),
  buying_type text,
  special_ad_categories text[],
  created_time timestamp with time zone,
  updated_time timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  deleted_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_connection_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'success'::text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_connection_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_user_id text NOT NULL,
  meta_user_name text,
  scope text NOT NULL DEFAULT ''::text,
  connection_status text NOT NULL DEFAULT 'connected'::text,
  status text NOT NULL DEFAULT 'active'::text,
  token_expires_at timestamp with time zone,
  last_connected_at timestamp with time zone NOT NULL DEFAULT now(),
  last_disconnected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE meta_sync_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  binding_id uuid,
  resource_type text NOT NULL,
  resource_id text,
  sync_status text NOT NULL DEFAULT 'idle'::text,
  sync_version integer NOT NULL DEFAULT 0,
  last_sync_at timestamp with time zone,
  last_successful_sync_at timestamp with time zone,
  last_error text,
  last_error_at timestamp with time zone,
  next_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  heartbeat_at timestamp with time zone,
  sync_requested_at timestamp with time zone,
  last_manual_sync_at timestamp with time zone
);

CREATE TABLE plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  price_monthly numeric DEFAULT 0,
  max_projects integer DEFAULT 1,
  max_business_managers integer DEFAULT 1,
  max_ad_accounts integer DEFAULT 1,
  has_shopify boolean DEFAULT false,
  has_google_sheets boolean DEFAULT false,
  has_sales_attribution boolean DEFAULT false,
  has_utm_generator boolean DEFAULT false,
  auto_sync boolean DEFAULT false,
  priority_support boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE project_business_managers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  bm_name text,
  bm_external_id text,
  status text NOT NULL DEFAULT 'active'::text,
  source_type text NOT NULL DEFAULT 'manual'::text,
  is_base_resource boolean NOT NULL DEFAULT false,
  is_extra_paid boolean NOT NULL DEFAULT false,
  addon_source_type text,
  locked_reason text,
  is_locked boolean NOT NULL DEFAULT false,
  is_paused boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE project_meta_ad_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  project_meta_business_manager_id uuid NOT NULL,
  meta_ad_account_id uuid,
  status text NOT NULL DEFAULT 'active'::text,
  selected_at timestamp with time zone NOT NULL DEFAULT now(),
  deselected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE project_meta_bindings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  meta_connection_id uuid,
  meta_business_manager_id uuid,
  meta_ad_account_id uuid,
  status text NOT NULL DEFAULT 'active'::text,
  bound_at timestamp with time zone NOT NULL DEFAULT now(),
  unbound_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE project_meta_business_managers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  meta_connection_id uuid,
  meta_business_manager_id uuid,
  status text NOT NULL DEFAULT 'active'::text,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  removed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE project_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  auto_update boolean DEFAULT false,
  update_interval text DEFAULT 'manual'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  currency text DEFAULT 'USD'::text,
  timezone text DEFAULT 'UTC'::text,
  monthly_revenue_goal numeric DEFAULT 0,
  monthly_ad_budget numeric DEFAULT 0,
  target_roas numeric DEFAULT 0,
  target_cpa numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  website_url text
);

CREATE TABLE subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  plan_id uuid,
  status text DEFAULT 'active'::text,
  started_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE user_billing_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  active_plan text NOT NULL DEFAULT 'starter'::text,
  subscription_status text NOT NULL DEFAULT 'active'::text,
  total_paid numeric NOT NULL DEFAULT 0,
  total_payments integer NOT NULL DEFAULT 0,
  total_addon_payments integer NOT NULL DEFAULT 0,
  current_monthly_plan_amount numeric NOT NULL DEFAULT 0,
  current_monthly_addons_amount numeric NOT NULL DEFAULT 0,
  current_total_monthly_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE user_paid_addons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  addon_type text NOT NULL,
  package_type text,
  base_package_type text,
  quantity integer NOT NULL DEFAULT 0,
  nested_extra_bm_count integer NOT NULL DEFAULT 0,
  nested_extra_ad_account_count integer NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  monthly_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  language text DEFAULT 'uk'::text,
  theme text DEFAULT 'dark'::text,
  created_at timestamp with time zone DEFAULT now()
);
