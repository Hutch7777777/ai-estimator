-- ============================================
-- RLS Policies for Multi-Tenant Data Isolation
-- ============================================
-- This migration enables Row Level Security (RLS) on all tenant-scoped tables
-- and creates policies to ensure users can only access data in their organizations.
--
-- Run this migration AFTER the frontend multi-tenant fixes have been deployed.
-- ============================================

-- ============================================
-- HELPER FUNCTION
-- ============================================
-- This function returns all organization IDs the current user belongs to.
-- Used by RLS policies to check data access permissions.

CREATE OR REPLACE FUNCTION auth.user_organization_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- PROJECTS TABLE
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view projects in their organizations
CREATE POLICY "Users can view own org projects"
  ON projects FOR SELECT
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- INSERT: Users can create projects in their organizations
CREATE POLICY "Users can create projects in own org"
  ON projects FOR INSERT
  WITH CHECK (organization_id IN (SELECT auth.user_organization_ids()));

-- UPDATE: Users can update projects in their organizations
CREATE POLICY "Users can update own org projects"
  ON projects FOR UPDATE
  USING (organization_id IN (SELECT auth.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT auth.user_organization_ids()));

-- DELETE: Users can delete projects in their organizations
CREATE POLICY "Users can delete own org projects"
  ON projects FOR DELETE
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- ============================================
-- TAKEOFFS TABLE
-- ============================================
-- Takeoffs are accessed via project relationship (project_id -> projects.organization_id)

ALTER TABLE takeoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view takeoffs for own org projects"
  ON takeoffs FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id IN (SELECT auth.user_organization_ids())
    )
  );

CREATE POLICY "Users can create takeoffs for own org projects"
  ON takeoffs FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id IN (SELECT auth.user_organization_ids())
    )
  );

CREATE POLICY "Users can update takeoffs for own org projects"
  ON takeoffs FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id IN (SELECT auth.user_organization_ids())
    )
  );

CREATE POLICY "Users can delete takeoffs for own org projects"
  ON takeoffs FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id IN (SELECT auth.user_organization_ids())
    )
  );

-- ============================================
-- TAKEOFF_SECTIONS TABLE (if exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'takeoff_sections') THEN
    ALTER TABLE takeoff_sections ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Users can manage own org takeoff sections"
      ON takeoff_sections FOR ALL
      USING (
        takeoff_id IN (
          SELECT t.id FROM takeoffs t
          JOIN projects p ON t.project_id = p.id
          WHERE p.organization_id IN (SELECT auth.user_organization_ids())
        )
      )';
  END IF;
END $$;

-- ============================================
-- TAKEOFF_LINE_ITEMS TABLE (if exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'takeoff_line_items') THEN
    ALTER TABLE takeoff_line_items ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Users can manage own org line items"
      ON takeoff_line_items FOR ALL
      USING (
        takeoff_id IN (
          SELECT t.id FROM takeoffs t
          JOIN projects p ON t.project_id = p.id
          WHERE p.organization_id IN (SELECT auth.user_organization_ids())
        )
      )';
  END IF;
END $$;

-- ============================================
-- PROJECT_CONFIGURATIONS TABLE (if exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_configurations') THEN
    ALTER TABLE project_configurations ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Users can manage own org project configurations"
      ON project_configurations FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects
          WHERE organization_id IN (SELECT auth.user_organization_ids())
        )
      )';
  END IF;
END $$;

-- ============================================
-- BLUEBEAM_PROJECTS TABLE (if exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bluebeam_projects') THEN
    ALTER TABLE bluebeam_projects ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Users can manage own org bluebeam projects"
      ON bluebeam_projects FOR ALL
      USING (organization_id IN (SELECT auth.user_organization_ids()))
      WITH CHECK (organization_id IN (SELECT auth.user_organization_ids()))';
  END IF;
END $$;

-- ============================================
-- HOVER_MEASUREMENTS TABLE (if exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'hover_measurements') THEN
    ALTER TABLE hover_measurements ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Users can manage own org hover measurements"
      ON hover_measurements FOR ALL
      USING (
        project_id IN (
          SELECT id FROM projects
          WHERE organization_id IN (SELECT auth.user_organization_ids())
        )
      )';
  END IF;
END $$;

-- ============================================
-- ORGANIZATION_MEMBERSHIPS TABLE
-- ============================================
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- Users can see their own membership records
CREATE POLICY "Users can view own memberships"
  ON organization_memberships FOR SELECT
  USING (user_id = auth.uid());

-- Users can see other members in orgs they belong to
CREATE POLICY "Users can view memberships in their orgs"
  ON organization_memberships FOR SELECT
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- For INSERT/UPDATE/DELETE - only org owners/admins should manage
-- This is a simplified policy - you may want to add role checks
CREATE POLICY "Org members can manage memberships"
  ON organization_memberships FOR ALL
  USING (organization_id IN (SELECT auth.user_organization_ids()));

-- ============================================
-- ORGANIZATIONS TABLE
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users can view organizations they belong to
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT auth.user_organization_ids()));

-- Users can update organizations they belong to
-- In production, add role check (owner/admin only)
CREATE POLICY "Users can update their organizations"
  ON organizations FOR UPDATE
  USING (id IN (SELECT auth.user_organization_ids()));

-- Users can create new organizations (needed for onboarding)
CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- SHARED/GLOBAL TABLES (Read-only for authenticated users)
-- ============================================

-- Trade configurations - shared config, read-only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trade_configurations') THEN
    ALTER TABLE trade_configurations ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Authenticated users can read trade configs"
      ON trade_configurations FOR SELECT
      USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;

-- Product catalog - shared catalog, read-only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_catalog') THEN
    ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;

    EXECUTE 'CREATE POLICY "Authenticated users can read product catalog"
      ON product_catalog FOR SELECT
      USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;

-- Product alternatives - shared catalog, read-only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_alternatives') THEN
    -- Note: product_alternatives may already have RLS enabled
    -- Check and skip if already enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'product_alternatives' AND rowsecurity = true
    ) THEN
      ALTER TABLE product_alternatives ENABLE ROW LEVEL SECURITY;
    END IF;

    -- Only create policy if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'product_alternatives'
    ) THEN
      EXECUTE 'CREATE POLICY "Authenticated users can read product alternatives"
        ON product_alternatives FOR SELECT
        USING (auth.uid() IS NOT NULL)';
    END IF;
  END IF;
END $$;

-- ============================================
-- NOTES
-- ============================================
-- 1. Service role key automatically bypasses RLS (used by n8n workflows)
-- 2. All policies use auth.uid() which is set by Supabase Auth
-- 3. The helper function auth.user_organization_ids() is cached per request
-- 4. For production, consider adding role-based checks for UPDATE/DELETE operations
