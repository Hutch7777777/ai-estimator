-- ============================================
-- Check RLS Status Script
-- ============================================

-- Check RLS status for all tables
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check existing policies
SELECT
  tablename,
  policyname,
  cmd as operation,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
