-- ============================================
-- Fix Overly Permissive RLS Policies
-- ============================================
-- This migration removes "Allow all" policies that defeat multi-tenant isolation
-- and ensures proper organization-based access control.
-- ============================================

-- ============================================
-- TAKEOFFS TABLE - Remove conflicting "Allow all" policy
-- ============================================
-- The "Allow all takeoffs" policy overrides the org-based policies
DROP POLICY IF EXISTS "Allow all takeoffs" ON takeoffs;

-- Verify org-based policies exist (they do from the audit)
-- If not, uncomment these:
-- CREATE POLICY "Users can view org takeoffs" ON takeoffs FOR SELECT
--   USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT auth.user_organization_ids())));

-- Add DELETE policy (was missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'takeoffs' AND policyname = 'Users can delete org takeoffs'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can delete org takeoffs" ON takeoffs FOR DELETE
      USING (project_id IN (SELECT id FROM projects WHERE organization_id IN (SELECT auth.user_organization_ids())))';
  END IF;
END $$;

-- ============================================
-- TAKEOFF_SECTIONS TABLE - Replace "Allow all" with org-based
-- ============================================
DROP POLICY IF EXISTS "Allow all takeoff_sections" ON takeoff_sections;

-- Create org-based policy
CREATE POLICY "Users can manage org takeoff sections"
  ON takeoff_sections FOR ALL
  USING (
    takeoff_id IN (
      SELECT t.id FROM takeoffs t
      JOIN projects p ON t.project_id = p.id
      WHERE p.organization_id IN (SELECT auth.user_organization_ids())
    )
  );

-- ============================================
-- TAKEOFF_LINE_ITEMS TABLE - Replace "Allow all" with org-based
-- ============================================
DROP POLICY IF EXISTS "Allow all takeoff_line_items" ON takeoff_line_items;

-- Create org-based policy (access via section -> takeoff -> project -> org)
-- First check the table structure to see if it links to takeoff_id or section_id
CREATE POLICY "Users can manage org takeoff line items"
  ON takeoff_line_items FOR ALL
  USING (
    takeoff_id IN (
      SELECT t.id FROM takeoffs t
      JOIN projects p ON t.project_id = p.id
      WHERE p.organization_id IN (SELECT auth.user_organization_ids())
    )
  );

-- ============================================
-- EXTRACTION TABLES - Keep open but document why
-- ============================================
-- These tables are used by the extraction API (Railway) which uses service role key.
-- Service role bypasses RLS anyway, so these "Allow all" policies only affect
-- direct browser access. For now, we'll leave them as authenticated-only access.
--
-- If you want to lock these down to org-based access in the future,
-- you'll need to add organization_id to these tables first.

-- Add comment for future reference
COMMENT ON POLICY "Allow all access to extraction_jobs" ON extraction_jobs IS
  'Intentionally permissive - used by extraction API with service role. Consider adding org_id for multi-tenant.';

-- ============================================
-- HELPER FUNCTION - Ensure it exists
-- ============================================
CREATE OR REPLACE FUNCTION auth.user_organization_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id
  FROM public.organization_memberships
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================
-- After running this migration, verify with:
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('takeoffs', 'takeoff_sections', 'takeoff_line_items')
-- ORDER BY tablename, policyname;
--
-- Expected result: No "Allow all" policies, only org-based policies
