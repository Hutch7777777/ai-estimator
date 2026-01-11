// Using direct fetch instead of Supabase client due to client issues
// (Supabase JS client queries build but never execute HTTP requests)

export interface BluebeamProject {
  id: string;
  project_name: string;
  project_code: string | null;
  client_name: string | null;
  source_pdf_path: string | null;
  total_pages: number | null;
  pixels_per_foot: number | null;
  cad_extraction_id: string | null;
  status: string;
  trade: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all projects for the project selector - filtered by organization
 */
export async function fetchProjects(organizationId?: string): Promise<{
  data: BluebeamProject[] | null;
  error?: string;
}> {
  // Don't fetch if no organization is provided
  if (!organizationId) {
    return { data: [], error: undefined };
  }

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bluebeam_projects?select=*&organization_id=eq.${organizationId}&order=updated_at.desc`;
    console.log('[fetchProjects] Fetching with URL:', url);

    const response = await fetch(
      url,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[fetchProjects] Supabase error:', response.status, errorBody);
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return { data: data as BluebeamProject[] };
  } catch (error) {
    console.error('fetchProjects: Exception caught:', error);
    return { data: null, error: String(error) };
  }
}

/**
 * Create a new project - requires organization ID
 */
export async function createProject(
  organizationId: string,
  projectName: string,
  clientName?: string,
  pdfPath?: string,
  totalPages?: number
): Promise<{ data: BluebeamProject | null; error?: string }> {
  if (!organizationId) {
    return { data: null, error: "Organization ID is required" };
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bluebeam_projects`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          organization_id: organizationId,
          project_name: projectName,
          client_name: clientName || null,
          source_pdf_path: pdfPath || null,
          bax_file_path: pdfPath || "manual-upload",
          total_pages: totalPages || null,
          status: "pending",
          trade: "siding",
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // PostgREST returns an array, get the first item
    return { data: (Array.isArray(data) ? data[0] : data) as BluebeamProject };
  } catch (error) {
    return { data: null, error: String(error) };
  }
}

/**
 * Update project metadata
 */
export async function updateProject(
  projectId: string,
  updates: Partial<
    Pick<BluebeamProject, "project_name" | "client_name" | "total_pages" | "status" | "notes" | "source_pdf_path" | "pixels_per_foot">
  >
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bluebeam_projects?id=eq.${projectId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(
  projectId: string
): Promise<{ data: BluebeamProject | null; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bluebeam_projects?id=eq.${projectId}&select=*`,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Accept': 'application/vnd.pgrst.object+json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data: data as BluebeamProject };
  } catch (error) {
    return { data: null, error: String(error) };
  }
}

/**
 * Delete a project by ID
 */
export async function deleteProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bluebeam_projects?id=eq.${projectId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
