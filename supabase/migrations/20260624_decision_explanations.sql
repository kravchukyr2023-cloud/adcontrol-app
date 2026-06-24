-- =============================================================
-- Sprint 6 Stage 32: decision_explanations cache table
-- =============================================================
-- Date: 2026-06-24
-- Purpose: Cache the AI-generated DecisionExplanation per project
--   per calendar month so /api/decisions doesn't pay the OpenAI bill
--   on every page load.
--
-- Cache policy:
--   - One row per (project_id, month) — overwritten on refresh.
--   - month is 'YYYY-MM' (UTC), aligned with thisMonthRangeUtc() in
--     the snapshot builder.
--   - explanation JSONB is the full DecisionExplanation struct
--     returned by explainDecisions().
--   - The deterministic snapshot+rules layer is NOT cached — it's
--     cheap enough to recompute on every request and stays fresh
--     between cron runs. Only the LLM step (slow + paid) is cached.
-- =============================================================

CREATE TABLE decision_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 'YYYY-MM' (UTC) — matches snapshot.plan.monthStart's first 7 chars.
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  explanation jsonb NOT NULL,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- One cached explanation per project per month.
CREATE UNIQUE INDEX decision_explanations_unique_project_month
  ON decision_explanations(project_id, month);

-- Cron rotation lookup: oldest cache first.
CREATE INDEX decision_explanations_rotation
  ON decision_explanations(month, updated_at);

-- RLS — standard "users see only their own rows" pattern.
ALTER TABLE decision_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their decision explanations"
  ON decision_explanations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their decision explanations"
  ON decision_explanations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their decision explanations"
  ON decision_explanations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their decision explanations"
  ON decision_explanations FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at maintenance — reuses the shared trigger function added in
-- 20260610_orders_and_sales_sources.sql.
CREATE TRIGGER update_decision_explanations_updated_at
  BEFORE UPDATE ON decision_explanations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
