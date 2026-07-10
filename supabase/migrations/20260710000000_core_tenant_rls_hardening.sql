-- Core tenant and catalog hardening
--
-- Removes legacy public-role policies that allowed organization_id IS NULL,
-- locks transactional data to authenticated organization members, and makes
-- shared pricing/configuration catalogs authenticated read-only.

BEGIN;

UPDATE public.takeoffs AS takeoff
SET organization_id = project.organization_id
FROM public.projects AS project
WHERE takeoff.project_id = project.id
  AND takeoff.organization_id IS NULL;

CREATE OR REPLACE FUNCTION private.enforce_takeoff_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_organization_id uuid;
BEGIN
  SELECT project.organization_id
  INTO project_organization_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  IF project_organization_id IS NULL THEN
    RAISE EXCEPTION 'takeoff project must belong to an organization';
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := project_organization_id;
  END IF;

  IF NEW.organization_id <> project_organization_id THEN
    RAISE EXCEPTION 'takeoff organization must match its project organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_takeoff_organization ON public.takeoffs;
CREATE TRIGGER enforce_takeoff_organization
  BEFORE INSERT OR UPDATE OF project_id, organization_id
  ON public.takeoffs
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_takeoff_organization();

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_organization_required;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_organization_required
  CHECK (organization_id IS NOT NULL) NOT VALID;
ALTER TABLE public.projects
  VALIDATE CONSTRAINT projects_organization_required;

ALTER TABLE public.takeoffs
  DROP CONSTRAINT IF EXISTS takeoffs_organization_required;
ALTER TABLE public.takeoffs
  ADD CONSTRAINT takeoffs_organization_required
  CHECK (organization_id IS NOT NULL) NOT VALID;
ALTER TABLE public.takeoffs
  VALIDATE CONSTRAINT takeoffs_organization_required;

CREATE OR REPLACE FUNCTION private.user_can_access_takeoff(target_takeoff_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_takeoff_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.takeoffs AS takeoff
    JOIN public.projects AS project ON project.id = takeoff.project_id
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE takeoff.id = target_takeoff_id
      AND takeoff.organization_id = project.organization_id
      AND membership.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION private.user_can_access_takeoff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_access_takeoff(uuid) TO authenticated;

-- Permissive policies are ORed, so replace every legacy policy on the core
-- transactional tables instead of layering stricter policies beside them.
DO $$
DECLARE
  target_table text;
  existing_policy record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'projects',
    'project_configurations',
    'takeoffs',
    'takeoff_sections',
    'takeoff_line_items'
  ] LOOP
    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, target_table);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
  END LOOP;
END $$;

CREATE POLICY projects_select_member
  ON public.projects FOR SELECT TO authenticated
  USING (private.user_is_org_member(organization_id));

CREATE POLICY projects_insert_member
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (private.user_is_org_member(organization_id));

CREATE POLICY projects_update_member
  ON public.projects FOR UPDATE TO authenticated
  USING (private.user_is_org_member(organization_id))
  WITH CHECK (private.user_is_org_member(organization_id));

CREATE POLICY projects_delete_admin
  ON public.projects FOR DELETE TO authenticated
  USING (private.user_is_org_admin(organization_id));

CREATE POLICY project_configurations_member_access
  ON public.project_configurations FOR ALL TO authenticated
  USING (private.user_can_access_project(project_id::text))
  WITH CHECK (private.user_can_access_project(project_id::text));

CREATE POLICY takeoffs_member_access
  ON public.takeoffs FOR ALL TO authenticated
  USING (
    private.user_is_org_member(organization_id)
    AND private.user_can_access_project(project_id::text)
  )
  WITH CHECK (
    private.user_is_org_member(organization_id)
    AND private.user_can_access_project(project_id::text)
  );

CREATE POLICY takeoff_sections_member_access
  ON public.takeoff_sections FOR ALL TO authenticated
  USING (private.user_can_access_takeoff(takeoff_id))
  WITH CHECK (private.user_can_access_takeoff(takeoff_id));

CREATE POLICY takeoff_line_items_member_access
  ON public.takeoff_line_items FOR ALL TO authenticated
  USING (private.user_can_access_takeoff(takeoff_id))
  WITH CHECK (private.user_can_access_takeoff(takeoff_id));

REVOKE ALL ON TABLE
  public.projects,
  public.project_configurations,
  public.takeoffs,
  public.takeoff_sections,
  public.takeoff_line_items
FROM anon;

REVOKE ALL ON TABLE
  public.projects,
  public.project_configurations,
  public.takeoffs,
  public.takeoff_sections,
  public.takeoff_line_items
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.projects,
  public.project_configurations,
  public.takeoffs,
  public.takeoff_sections,
  public.takeoff_line_items
TO authenticated;

-- These are shared application catalogs, not tenant-owned records. Clients
-- need to read them, but all writes must go through trusted service-role jobs.
DO $$
DECLARE
  target_table text;
  existing_policy record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'pricing_items',
    'product_catalog',
    'trade_configurations',
    'cad_layer_mappings'
  ] LOOP
    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, target_table);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format(
      'CREATE POLICY authenticated_read_only ON public.%I FOR SELECT TO authenticated USING (true)',
      target_table
    );
  END LOOP;
END $$;

REVOKE ALL ON TABLE
  public.pricing_items,
  public.product_catalog,
  public.trade_configurations,
  public.cad_layer_mappings
FROM anon;

REVOKE ALL ON TABLE
  public.pricing_items,
  public.product_catalog,
  public.trade_configurations,
  public.cad_layer_mappings
FROM authenticated;

GRANT SELECT ON TABLE
  public.pricing_items,
  public.product_catalog,
  public.trade_configurations,
  public.cad_layer_mappings
TO authenticated;

-- RLS already denies anonymous extraction/CAD access. Remove the underlying
-- table grants as defense in depth so PostgREST rejects anonymous requests
-- before they reach policy evaluation.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'organizations',
    'organization_memberships',
    'support_requests',
    'user_profiles',
    'extraction_jobs',
    'extraction_pages',
    'extraction_detections',
    'extraction_detections_draft',
    'extraction_detections_validated',
    'extraction_elevation_calcs',
    'extraction_job_totals',
    'extraction_detection_details',
    'plan_annotations',
    'cad_extractions',
    'cad_hover_measurements',
    'cad_material_callouts',
    'bluebeam_projects',
    'cad_manual_markups'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', target_table);
    END IF;
  END LOOP;
END $$;

COMMIT;
