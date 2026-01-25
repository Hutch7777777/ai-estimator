import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Extraction Jobs API Route
// Fetch extraction jobs by project_id
// =============================================================================

interface ExtractionJobRecord {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: string;
  total_pages: number;
  elevation_count: number;
  created_at: string;
  completed_at: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[extraction-jobs] ========================================');
  console.log('[extraction-jobs] API called at:', new Date().toISOString());

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    console.log('[extraction-jobs] Project ID param:', projectId);

    if (!projectId) {
      console.log('[extraction-jobs] ERROR: No project_id provided');
      return NextResponse.json(
        { success: false, error: 'project_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    console.log('[extraction-jobs] Querying extraction_jobs for project_id:', projectId);

    const { data: jobs, error } = await supabase
      .from('extraction_jobs')
      .select('id, project_id, project_name, status, total_pages, elevation_count, created_at, completed_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    console.log('[extraction-jobs] Query result - jobs count:', jobs?.length || 0);
    console.log('[extraction-jobs] Query result - error:', error ? JSON.stringify(error) : 'none');

    if (jobs && jobs.length > 0) {
      console.log('[extraction-jobs] First job:', JSON.stringify(jobs[0]));
    }

    if (error) {
      console.error('[extraction-jobs] Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch extraction jobs' },
        { status: 500 }
      );
    }

    console.log('[extraction-jobs] Returning', jobs?.length || 0, 'jobs');
    return NextResponse.json({
      success: true,
      jobs: (jobs || []) as ExtractionJobRecord[],
    });

  } catch (error) {
    console.error('[extraction-jobs] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
