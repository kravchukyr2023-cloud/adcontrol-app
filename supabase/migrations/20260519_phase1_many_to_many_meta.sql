-- =====================================================================
-- Phase 1 Architecture Correction — many-to-many Meta wiring
-- Date: 2026-05-19
--
-- Adds two junction tables that replace the 1:1:1 project_meta_bindings:
--   - project_meta_business_managers (BM membership per project)
--   - project_meta_ad_accounts       (AA selection per BM membership)
--
-- Adjusts meta_sync_states to be resource-centric (sync per user+resource,
-- not per binding) — projects only consume insights via JOIN at read time.
--
-- project_meta_bindings is DEPRECATED but NOT dropped — retained for
-- audit history. No further writes from application code.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. project_meta_business_managers (new)
-- =====================================================================

CREATE TABLE IF NOT EXISTS project_meta_business_managers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meta_connection_id          uuid REFERENCES meta_connections(id) ON DELETE SET NULL,
  meta_business_manager_id    uuid REFERENCES meta_business_managers(id) ON DELETE SET NULL,
  status                      text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive', 'disconnected')),
  added_at                    timestamptz NOT NULL DEFAULT now(),
  removed_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_meta_bms_active_unique
  ON project_meta_business_managers (project_id, meta_business_manager_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS project_meta_bms_user_status
  ON project_meta_business_managers (user_id, status);

CREATE INDEX IF NOT EXISTS project_meta_bms_project_status
  ON project_meta_business_managers (project_id, status);

CREATE INDEX IF NOT EXISTS project_meta_bms_connection
  ON project_meta_business_managers (meta_connection_id);

ALTER TABLE project_meta_business_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmbms_select ON project_meta_business_managers
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pmbms_insert ON project_meta_business_managers
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY pmbms_update ON project_meta_business_managers
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pmbms_delete ON project_meta_business_managers
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 2. project_meta_ad_accounts (new)
-- =====================================================================

CREATE TABLE IF NOT EXISTS project_meta_ad_accounts (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id                        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_meta_business_manager_id  uuid NOT NULL REFERENCES project_meta_business_managers(id) ON DELETE CASCADE,
  meta_ad_account_id                uuid REFERENCES meta_ad_accounts(id) ON DELETE SET NULL,
  status                            text NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'inactive', 'disconnected')),
  selected_at                       timestamptz NOT NULL DEFAULT now(),
  deselected_at                     timestamptz,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

-- (a) one active selection of same AA via same BM-membership at a time
CREATE UNIQUE INDEX IF NOT EXISTS project_meta_aas_active_unique
  ON project_meta_ad_accounts (project_meta_business_manager_id, meta_ad_account_id)
  WHERE status = 'active';

-- (b) extra: the same AA cannot be selected twice in the same project even
-- via overlapping BM memberships — prevents duplicate AA selections through
-- shared BMs (resolved decision #2)
CREATE UNIQUE INDEX IF NOT EXISTS project_meta_aas_user_project_aa_unique
  ON project_meta_ad_accounts (user_id, project_id, meta_ad_account_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS project_meta_aas_user_status
  ON project_meta_ad_accounts (user_id, status);

CREATE INDEX IF NOT EXISTS project_meta_aas_project_status
  ON project_meta_ad_accounts (project_id, status);

-- Phase 2 sync engine query target: distinct AAs to sync per user
CREATE INDEX IF NOT EXISTS project_meta_aas_sync_target
  ON project_meta_ad_accounts (meta_ad_account_id)
  WHERE status = 'active';

ALTER TABLE project_meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmaas_select ON project_meta_ad_accounts
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pmaas_insert ON project_meta_ad_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY pmaas_update ON project_meta_ad_accounts
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pmaas_delete ON project_meta_ad_accounts
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================================
-- 3. meta_sync_states: resource-centric sync ownership
--    (sync state per (user_id, resource_type, resource_id) — no project)
-- =====================================================================

ALTER TABLE meta_sync_states ALTER COLUMN binding_id DROP NOT NULL;
ALTER TABLE meta_sync_states ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE meta_sync_states
  ADD CONSTRAINT meta_sync_states_user_resource_unique
  UNIQUE (user_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS meta_sync_states_resource_lookup
  ON meta_sync_states (user_id, resource_type, resource_id);

-- =====================================================================
-- 4. Backfill from project_meta_bindings (data migration)
-- =====================================================================

-- 4.1 BM memberships from bindings
INSERT INTO project_meta_business_managers (
  user_id, project_id, meta_connection_id, meta_business_manager_id,
  status, added_at, created_at, updated_at
)
SELECT
  b.user_id,
  b.project_id,
  b.meta_connection_id,
  b.meta_business_manager_id,
  CASE
    WHEN b.status = 'active'       THEN 'active'
    WHEN b.status = 'disconnected' THEN 'disconnected'
    ELSE 'inactive'
  END,
  COALESCE(b.bound_at, b.created_at),
  b.created_at,
  b.updated_at
FROM project_meta_bindings b
ON CONFLICT DO NOTHING;

-- 4.2 AA selections from bindings
INSERT INTO project_meta_ad_accounts (
  user_id, project_id, project_meta_business_manager_id, meta_ad_account_id,
  status, selected_at, created_at, updated_at
)
SELECT
  b.user_id,
  b.project_id,
  pmb.id,
  b.meta_ad_account_id,
  CASE
    WHEN b.status = 'active'       THEN 'active'
    WHEN b.status = 'disconnected' THEN 'disconnected'
    ELSE 'inactive'
  END,
  COALESCE(b.bound_at, b.created_at),
  b.created_at,
  b.updated_at
FROM project_meta_bindings b
JOIN project_meta_business_managers pmb
  ON pmb.project_id = b.project_id
 AND pmb.meta_business_manager_id = b.meta_business_manager_id
 AND pmb.status = (
   CASE
     WHEN b.status = 'active'       THEN 'active'
     WHEN b.status = 'disconnected' THEN 'disconnected'
     ELSE 'inactive'
   END
 )
ON CONFLICT DO NOTHING;

-- 4.3 Assertions: backfill produced expected rows
DO $$
DECLARE
  bind_active int;
  pmb_active  int;
  pma_active  int;
BEGIN
  SELECT COUNT(*) INTO bind_active FROM project_meta_bindings WHERE status = 'active';
  SELECT COUNT(*) INTO pmb_active  FROM project_meta_business_managers WHERE status = 'active';
  SELECT COUNT(*) INTO pma_active  FROM project_meta_ad_accounts WHERE status = 'active';

  IF bind_active > 0 AND (pmb_active = 0 OR pma_active = 0) THEN
    RAISE EXCEPTION 'Backfill failed: bindings_active=%, pmbms_active=%, pmaas_active=%',
      bind_active, pmb_active, pma_active;
  END IF;

  RAISE NOTICE 'Backfill ok: bindings_active=%, pmbms_active=%, pmaas_active=%',
    bind_active, pmb_active, pma_active;
END $$;

COMMIT;
