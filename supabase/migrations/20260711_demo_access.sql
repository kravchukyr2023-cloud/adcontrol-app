-- =====================================================================
-- Sprint 7 stage 7.5b — read-only demo account gating
-- =====================================================================
-- Date: 2026-07-11
--
-- Adds `users.is_demo` flag plus RESTRICTIVE RLS policies that deny
-- INSERT / UPDATE / DELETE on projects, project_settings and
-- sales_sources when the calling user is flagged as demo. SELECT
-- stays open so the demo account can still browse everything.
--
-- Policy strategy: RESTRICTIVE (AND-combined with existing permissive
-- policies). A demo user must fail every RESTRICTIVE check, so the
-- deny wins even when the row would otherwise be their own.
--
-- Idempotent: safe to re-run (column, function, RLS enable, and
-- policy creations are all guarded).
-- =====================================================================

BEGIN;

-- 1. is_demo flag on public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_is_demo_idx
  ON public.users (is_demo)
  WHERE is_demo;

-- 2. Helper: current user's is_demo flag, defaulting to false when the
--    row is missing (e.g. service-role calls where auth.uid() is NULL).
--    SECURITY DEFINER so the lookup doesn't depend on a SELECT policy
--    existing on public.users.
CREATE OR REPLACE FUNCTION public.is_demo_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_demo FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_demo_user() FROM public;
GRANT EXECUTE ON FUNCTION public.is_demo_user() TO authenticated, anon, service_role;

-- 3. Ensure RLS is on for the three guarded tables. sales_sources
--    already enables RLS in 20260610; the other two may or may not
--    have been enabled in the live DB — this is a no-op if so.
ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_sources     ENABLE ROW LEVEL SECURITY;

-- 4. RESTRICTIVE deny-demo policies. Written idempotently via DO
--    blocks so a re-run doesn't error on "policy already exists".

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='projects'
                    AND policyname='projects_deny_demo_insert') THEN
    CREATE POLICY projects_deny_demo_insert ON public.projects
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='projects'
                    AND policyname='projects_deny_demo_update') THEN
    CREATE POLICY projects_deny_demo_update ON public.projects
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (NOT public.is_demo_user())
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='projects'
                    AND policyname='projects_deny_demo_delete') THEN
    CREATE POLICY projects_deny_demo_delete ON public.projects
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='project_settings'
                    AND policyname='project_settings_deny_demo_insert') THEN
    CREATE POLICY project_settings_deny_demo_insert ON public.project_settings
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='project_settings'
                    AND policyname='project_settings_deny_demo_update') THEN
    CREATE POLICY project_settings_deny_demo_update ON public.project_settings
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (NOT public.is_demo_user())
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='project_settings'
                    AND policyname='project_settings_deny_demo_delete') THEN
    CREATE POLICY project_settings_deny_demo_delete ON public.project_settings
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='sales_sources'
                    AND policyname='sales_sources_deny_demo_insert') THEN
    CREATE POLICY sales_sources_deny_demo_insert ON public.sales_sources
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='sales_sources'
                    AND policyname='sales_sources_deny_demo_update') THEN
    CREATE POLICY sales_sources_deny_demo_update ON public.sales_sources
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (NOT public.is_demo_user())
      WITH CHECK (NOT public.is_demo_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='sales_sources'
                    AND policyname='sales_sources_deny_demo_delete') THEN
    CREATE POLICY sales_sources_deny_demo_delete ON public.sales_sources
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (NOT public.is_demo_user());
  END IF;
END $$;

COMMIT;
