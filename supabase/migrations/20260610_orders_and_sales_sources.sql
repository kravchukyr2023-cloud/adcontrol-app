-- =============================================================
-- Sprint 4 Stage 16: orders + sales_sources tables
-- =============================================================
-- Date: 2026-06-10
-- Purpose: Enable real revenue ingestion from external sources
--   (Google Sheets in Sprint 4, Shopify in Sprint 5, manual
--   orders in Sprint 4 also).
--
-- After this migration, the platform can:
--   - Store OAuth tokens for sales source connections
--   - Store individual orders with UTM data
--   - Match orders to Meta campaigns/adsets/ads (Stage 21)
--   - Calculate Real ROAS = SUM(orders.revenue) / SUM(meta spend)
-- =============================================================

-- Sales sources: stores OAuth tokens, sheet config per project
CREATE TABLE sales_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('google_sheets', 'shopify', 'manual')),
  source_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'paused', 'disconnected')),
  last_sync_at timestamp with time zone,
  last_successful_sync_at timestamp with time zone,
  last_error text,
  last_error_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- One source per type per project (one Google Sheets per project, one Shopify, тощо)
CREATE UNIQUE INDEX sales_sources_unique_per_project_type
  ON sales_sources(project_id, source_type)
  WHERE source_type != 'manual';

-- Index for cron job lookup (active sources to sync)
CREATE INDEX sales_sources_active_sync_lookup
  ON sales_sources(status, last_sync_at)
  WHERE status = 'active';

-- Orders: actual sales data with UTM for attribution
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sales_source_id uuid REFERENCES sales_sources(id) ON DELETE CASCADE,

  -- Order data (mandatory)
  order_date date NOT NULL,
  order_external_id text NOT NULL,
  revenue numeric(14,2) NOT NULL CHECK (revenue >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),

  -- Order data (optional)
  customer_name text,
  customer_email text,
  product_name text,

  -- UTM data for attribution
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  -- Attribution to Meta entities (filled in Stage 21)
  matched_meta_campaign_id uuid REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  matched_meta_adset_id uuid REFERENCES meta_adsets(id) ON DELETE SET NULL,
  matched_meta_ad_id uuid REFERENCES meta_ads(id) ON DELETE SET NULL,
  attribution_status text NOT NULL DEFAULT 'unmatched'
    CHECK (attribution_status IN ('matched', 'unmatched', 'manual', 'partial')),
  attribution_matched_at timestamp with time zone,

  -- Tracking
  source_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one external order per source (prevents duplicates on re-sync)
CREATE UNIQUE INDEX orders_unique_external
  ON orders(user_id, sales_source_id, order_external_id)
  WHERE sales_source_id IS NOT NULL;

-- Main lookup index: orders for project for date range (Sales/Dashboard queries)
CREATE INDEX orders_user_project_date
  ON orders(user_id, project_id, order_date DESC);

-- Attribution lookup: find orders by matched campaign
CREATE INDEX orders_attribution_campaign
  ON orders(matched_meta_campaign_id, order_date DESC)
  WHERE matched_meta_campaign_id IS NOT NULL;

-- Attribution status filter (Decision Engine: find unmatched orders)
CREATE INDEX orders_attribution_status
  ON orders(user_id, attribution_status)
  WHERE attribution_status IN ('unmatched', 'partial');

-- RLS
ALTER TABLE sales_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policies: standard CRUD for user's own data (4 policies each, consistent with meta_* tables)

CREATE POLICY "Users can select their sales sources"
  ON sales_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their sales sources"
  ON sales_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their sales sources"
  ON sales_sources FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their sales sources"
  ON sales_sources FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can select their orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their orders"
  ON orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their orders"
  ON orders FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sales_sources_updated_at
  BEFORE UPDATE ON sales_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
