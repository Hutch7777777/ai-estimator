import { createClient } from "./client";

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
 * Fetch all projects for the project selector
 */
export async function fetchProjects(): Promise<{
  data: BluebeamProject[] | null;
  error?: string;
}> {
  console.log('fetchProjects: Starting...');
  const supabase = createClient();

  try {
    console.log('fetchProjects: Querying bluebeam_projects table...');
    // Note: bluebeam_projects table is not in the typed schema, using type assertion
    const { data, error } = await (supabase as any)
      .from("bluebeam_projects")
      .select("*")
      .order("updated_at", { ascending: false });

    console.log('fetchProjects: Query complete', { hasData: !!data, hasError: !!error, errorMessage: error?.message });

    if (error) {
      console.error('fetchProjects: Error from Supabase:', error);
      return { data: null, error: error.message };
    }

    console.log('fetchProjects: Success, returning', data?.length || 0, 'projects');
    return { data: data as BluebeamProject[] };
  } catch (error) {
    console.error('fetchProjects: Exception caught:', error);
    return { data: null, error: String(error) };
  }
}

/**
 * Create a new project
 */
export async function createProject(
  projectName: string,
  clientName?: string,
  pdfPath?: string,
  totalPages?: number
): Promise<{ data: BluebeamProject | null; error?: string }> {
  const supabase = createClient();

  try {
    // Note: bluebeam_projects table is not in the typed schema, using type assertion
    const { data, error } = await (supabase as any)
      .from("bluebeam_projects")
      .insert({
        project_name: projectName,
        client_name: clientName || null,
        source_pdf_path: pdfPath || null,
        bax_file_path: pdfPath || "manual-upload", // Required field
        total_pages: totalPages || null,
        status: "pending",
        trade: "siding",
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as BluebeamProject };
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
  const supabase = createClient();

  try {
    // Note: bluebeam_projects table is not in the typed schema, using type assertion
    const { error } = await (supabase as any)
      .from("bluebeam_projects")
      .update(updates)
      .eq("id", projectId);

    if (error) {
      return { success: false, error: error.message };
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
  const supabase = createClient();

  try {
    // Note: bluebeam_projects table is not in the typed schema, using type assertion
    const { data, error } = await (supabase as any)
      .from("bluebeam_projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

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
  const supabase = createClient();

  try {
    // Note: bluebeam_projects table is not in the typed schema, using type assertion
    const { error } = await (supabase as any)
      .from("bluebeam_projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
