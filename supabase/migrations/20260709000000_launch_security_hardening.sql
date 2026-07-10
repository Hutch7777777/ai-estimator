-- Launch security hardening
--
-- Goals:
--   1. Close anonymous access to extraction/CAD data.
--   2. Scope every extraction record through organization_id or project_id.
--   3. Restrict membership and organization administration by role.
--   4. Make client PDF buckets private and authorize objects by folder owner.
--
-- Coordinate this migration with the matching frontend and extraction API
-- organization_id support inside the same maintenance window.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.extraction_jobs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_requests_organization_created
  ON public.support_requests(organization_id, created_at DESC);

UPDATE public.extraction_jobs AS job
SET organization_id = project.organization_id
FROM public.projects AS project
WHERE job.organization_id IS NULL
  -- extraction_jobs.project_id is a legacy text column in production while
  -- projects.id is uuid. Compare as text so malformed legacy values remain
  -- quarantined instead of aborting the migration with an invalid cast.
  AND job.project_id = project.id::text;

CREATE OR REPLACE FUNCTION private.enforce_extraction_job_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_organization_id uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT project.organization_id
    INTO project_organization_id
    FROM public.projects AS project
    WHERE project.id::text = NEW.project_id;
  END IF;

  IF NEW.organization_id IS NULL AND project_organization_id IS NOT NULL THEN
    NEW.organization_id := project_organization_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for extraction jobs';
  END IF;

  IF project_organization_id IS NOT NULL
     AND project_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'extraction job organization must match its project organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_extraction_job_organization
  ON public.extraction_jobs;
CREATE TRIGGER enforce_extraction_job_organization
  BEFORE INSERT OR UPDATE OF organization_id, project_id
  ON public.extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_extraction_job_organization();

-- Existing legacy rows may still be unowned. NOT VALID keeps those rows
-- quarantined while enforcing ownership for every new or changed row.
ALTER TABLE public.extraction_jobs
  DROP CONSTRAINT IF EXISTS extraction_jobs_organization_required;
ALTER TABLE public.extraction_jobs
  ADD CONSTRAINT extraction_jobs_organization_required
  CHECK (organization_id IS NOT NULL) NOT VALID;

ALTER TABLE public.extraction_jobs
  DROP CONSTRAINT IF EXISTS extraction_jobs_status_check;
ALTER TABLE public.extraction_jobs
  ADD CONSTRAINT extraction_jobs_status_check
  CHECK (status IN (
    'pending',
    'importing',
    'converting',
    'analyzing',
    'classifying',
    'classified',
    'processing',
    'refining',
    'complete',
    'approved',
    'failed'
  )) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_organization_id
  ON public.extraction_jobs(organization_id);

CREATE OR REPLACE FUNCTION private.user_is_org_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_organization_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.user_is_org_admin(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_organization_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = auth.uid()
      AND membership.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.user_is_org_owner(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_organization_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = auth.uid()
      AND membership.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION private.user_created_org(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_organization_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.id = target_organization_id
      AND organization.created_by = auth.uid()
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_memberships AS membership
        WHERE membership.organization_id = organization.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_project(target_project_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_project_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.projects AS project
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE project.id::text = target_project_id
      AND membership.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_job(target_job_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_job_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.extraction_jobs AS job
    LEFT JOIN public.projects AS project ON project.id::text = job.project_id
    JOIN public.organization_memberships AS membership
      ON membership.user_id = auth.uid()
     AND membership.organization_id = COALESCE(job.organization_id, project.organization_id)
    WHERE job.id = target_job_id
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_cad_extraction(target_extraction_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_extraction_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cad_extractions AS extraction
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = extraction.organization_id
    WHERE extraction.id = target_extraction_id
      AND membership.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_bluebeam_project(target_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT target_project_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bluebeam_projects AS project
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE project.id = target_project_id
      AND membership.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_storage_object(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, storage
AS $$
  WITH object_folder AS (
    SELECT (storage.foldername(object_name))[1] AS owner_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM object_folder
    JOIN public.organization_memberships AS membership
      ON membership.organization_id::text = object_folder.owner_id
    WHERE membership.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM object_folder
    JOIN public.projects AS project ON project.id::text = object_folder.owner_id
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE membership.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM object_folder
    JOIN public.bluebeam_projects AS project ON project.id::text = object_folder.owner_id
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE membership.user_id = auth.uid()
  ) OR EXISTS (
    -- Legacy uploads were stored at the bucket root. Authorize those objects
    -- through the project URL until they can be moved into org/project folders.
    SELECT 1
    FROM public.projects AS project
    JOIN public.organization_memberships AS membership
      ON membership.organization_id = project.organization_id
    WHERE membership.user_id = auth.uid()
      AND project.hover_pdf_url IS NOT NULL
      AND (
        regexp_replace(split_part(project.hover_pdf_url, '/hover-pdfs/', 2), '\?.*$', '') = object_name
        OR regexp_replace(split_part(project.hover_pdf_url, '/project-pdfs/', 2), '\?.*$', '') = object_name
      )
  ) OR EXISTS (
    -- Some extraction uploads use an import-generated folder rather than an
    -- organization or project id. Preserve access only while the exact object
    -- remains referenced by a tenant-owned extraction job.
    SELECT 1
    FROM public.extraction_jobs AS job
    LEFT JOIN public.projects AS project ON project.id::text = job.project_id
    JOIN public.organization_memberships AS membership
      ON membership.user_id = auth.uid()
     AND membership.organization_id = COALESCE(job.organization_id, project.organization_id)
    WHERE job.source_pdf_url IS NOT NULL
      AND (
        regexp_replace(split_part(job.source_pdf_url, '/hover-pdfs/', 2), '\?.*$', '') = object_name
        OR regexp_replace(split_part(job.source_pdf_url, '/project-pdfs/', 2), '\?.*$', '') = object_name
      )
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

-- Drop legacy policies on the tables replaced below. Permissive PostgreSQL
-- policies are ORed, so leaving a single "allow all" policy defeats isolation.
DO $$
DECLARE
  target_table text;
  existing_policy record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'organizations',
    'organization_memberships',
    'extraction_jobs',
    'extraction_pages',
    'extraction_detections',
    'extraction_detections_draft',
    'extraction_detections_validated',
    'extraction_elevation_calcs',
    'extraction_job_totals',
    'plan_annotations',
    'cad_extractions',
    'cad_hover_measurements',
    'cad_material_callouts',
    'bluebeam_projects',
    'cad_manual_markups',
    'support_requests'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = target_table
        AND relation.relkind IN ('r', 'p')
    ) THEN
      FOR existing_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, target_table);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    END IF;
  END LOOP;
END $$;

-- Organizations and memberships.
CREATE POLICY organizations_select_member
  ON public.organizations FOR SELECT TO authenticated
  USING (private.user_is_org_member(id) OR created_by = auth.uid());

CREATE POLICY organizations_insert_creator
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY organizations_update_admin
  ON public.organizations FOR UPDATE TO authenticated
  USING (private.user_is_org_admin(id))
  WITH CHECK (private.user_is_org_admin(id));

CREATE POLICY organizations_delete_owner
  ON public.organizations FOR DELETE TO authenticated
  USING (private.user_is_org_owner(id));

CREATE POLICY memberships_select_member
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.user_is_org_member(organization_id));

CREATE POLICY memberships_insert_authorized
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND role = 'owner' AND private.user_created_org(organization_id))
    OR (
      private.user_is_org_admin(organization_id)
      AND (role <> 'owner' OR private.user_is_org_owner(organization_id))
    )
  );

CREATE POLICY memberships_update_authorized
  ON public.organization_memberships FOR UPDATE TO authenticated
  USING (
    private.user_is_org_admin(organization_id)
    AND (role <> 'owner' OR private.user_is_org_owner(organization_id))
  )
  WITH CHECK (
    private.user_is_org_admin(organization_id)
    AND (role <> 'owner' OR private.user_is_org_owner(organization_id))
  );

CREATE POLICY memberships_delete_authorized
  ON public.organization_memberships FOR DELETE TO authenticated
  USING (
    private.user_is_org_admin(organization_id)
    AND (role <> 'owner' OR private.user_is_org_owner(organization_id))
  );

CREATE POLICY support_requests_select_authorized
  ON public.support_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.user_is_org_admin(organization_id));

CREATE POLICY support_requests_insert_own
  ON public.support_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.user_is_org_member(organization_id)
  );

CREATE POLICY support_requests_update_admin
  ON public.support_requests FOR UPDATE TO authenticated
  USING (private.user_is_org_admin(organization_id))
  WITH CHECK (private.user_is_org_admin(organization_id));

-- Extraction jobs can be scoped directly or through their project.
CREATE POLICY extraction_jobs_tenant_access
  ON public.extraction_jobs FOR ALL TO authenticated
  USING (
    private.user_is_org_member(organization_id)
    OR private.user_can_access_project(project_id)
  )
  WITH CHECK (
    private.user_is_org_member(organization_id)
    OR private.user_can_access_project(project_id)
  );

-- Tables with a direct job_id relationship.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'extraction_pages',
    'extraction_detections',
    'extraction_detections_draft',
    'extraction_detections_validated',
    'extraction_elevation_calcs',
    'extraction_job_totals'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = target_table
        AND relation.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_job_access ON public.%I FOR ALL TO authenticated USING (private.user_can_access_job(job_id)) WITH CHECK (private.user_can_access_job(job_id))',
        target_table
      );
    END IF;
  END LOOP;
END $$;

-- Plan annotations can use their explicit org or their job relationship.
DO $$
BEGIN
  IF to_regclass('public.plan_annotations') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY tenant_annotation_access ON public.plan_annotations FOR ALL TO authenticated USING (private.user_is_org_member(organization_id) OR private.user_can_access_job(job_id)) WITH CHECK (private.user_is_org_member(organization_id) OR private.user_can_access_job(job_id))';
  END IF;
END $$;

-- CAD/Bluebeam roots and child tables.
CREATE POLICY cad_extractions_tenant_access
  ON public.cad_extractions FOR ALL TO authenticated
  USING (private.user_is_org_member(organization_id))
  WITH CHECK (private.user_is_org_member(organization_id));

CREATE POLICY bluebeam_projects_tenant_access
  ON public.bluebeam_projects FOR ALL TO authenticated
  USING (private.user_is_org_member(organization_id))
  WITH CHECK (private.user_is_org_member(organization_id));

DO $$
BEGIN
  IF to_regclass('public.cad_hover_measurements') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY cad_hover_tenant_access ON public.cad_hover_measurements FOR ALL TO authenticated USING (private.user_can_access_cad_extraction(extraction_id)) WITH CHECK (private.user_can_access_cad_extraction(extraction_id))';
  END IF;
  IF to_regclass('public.cad_material_callouts') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY cad_callouts_tenant_access ON public.cad_material_callouts FOR ALL TO authenticated USING (private.user_can_access_cad_extraction(extraction_id)) WITH CHECK (private.user_can_access_cad_extraction(extraction_id))';
  END IF;
  IF to_regclass('public.cad_manual_markups') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY cad_markups_tenant_access ON public.cad_manual_markups FOR ALL TO authenticated USING (private.user_can_access_bluebeam_project(project_id)) WITH CHECK (private.user_can_access_bluebeam_project(project_id))';
  END IF;
END $$;

-- Ensure views honor the caller's RLS policies on their base tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.extraction_detection_details') AND relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.extraction_detection_details SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.extraction_detections_validated') AND relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.extraction_detections_validated SET (security_invoker = true)';
  END IF;
END $$;

-- Private construction documents. Service-role workers continue to bypass RLS.
UPDATE storage.buckets
SET public = false
WHERE id IN ('hover-pdfs', 'project-pdfs');

-- Restrictive policies are ANDed with every existing permissive policy. This
-- closes legacy public access to client PDFs without deleting policies that
-- may be required by unrelated storage buckets.
CREATE POLICY client_pdfs_anon_boundary
  ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id NOT IN ('hover-pdfs', 'project-pdfs'))
  WITH CHECK (bucket_id NOT IN ('hover-pdfs', 'project-pdfs'));

CREATE POLICY client_pdfs_authenticated_boundary
  ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id NOT IN ('hover-pdfs', 'project-pdfs')
    OR private.user_can_access_storage_object(name)
  )
  WITH CHECK (
    bucket_id NOT IN ('hover-pdfs', 'project-pdfs')
    OR private.user_can_access_storage_object(name)
  );

CREATE POLICY client_pdfs_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('hover-pdfs', 'project-pdfs')
    AND private.user_can_access_storage_object(name)
  );

CREATE POLICY client_pdfs_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('hover-pdfs', 'project-pdfs')
    AND private.user_can_access_storage_object(name)
  );

CREATE POLICY client_pdfs_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('hover-pdfs', 'project-pdfs')
    AND private.user_can_access_storage_object(name)
  )
  WITH CHECK (
    bucket_id IN ('hover-pdfs', 'project-pdfs')
    AND private.user_can_access_storage_object(name)
  );

CREATE POLICY client_pdfs_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('hover-pdfs', 'project-pdfs')
    AND private.user_can_access_storage_object(name)
  );

COMMIT;
