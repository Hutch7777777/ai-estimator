import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// =============================================================================
// Types
// =============================================================================

interface ExtractionPageRecord {
  id: string;
  job_id: string;
  page_number: number;
  image_url: string;
  thumbnail_url: string | null;
  page_type: string | null;
  elevation_name: string | null;
  original_image_url: string | null;
}

// =============================================================================
// GET Handler - Fetch extraction pages for a project
// =============================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'project_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // First, find the extraction job for this project
    const { data: jobData, error: jobError } = await supabase
      .from('extraction_jobs')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (jobError || !jobData) {
      console.error('[API] Extraction job fetch error:', jobError);
      return NextResponse.json(
        { success: false, error: 'No extraction job found for this project' },
        { status: 404 }
      );
    }

    const jobId = (jobData as { id: string }).id;

    // Fetch all elevation pages for this job
    const { data: pagesData, error: pagesError } = await supabase
      .from('extraction_pages')
      .select('id, job_id, page_number, image_url, thumbnail_url, page_type, elevation_name, original_image_url')
      .eq('job_id', jobId)
      .eq('page_type', 'elevation')
      .order('page_number', { ascending: true });

    if (pagesError) {
      console.error('[API] Extraction pages fetch error:', pagesError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch extraction pages' },
        { status: 500 }
      );
    }

    const pages = (pagesData || []) as ExtractionPageRecord[];

    return NextResponse.json({
      success: true,
      job_id: jobId,
      pages: pages.map(page => ({
        id: page.id,
        page_number: page.page_number,
        elevation_name: page.elevation_name,
        // Use image_url which should have the markup overlay
        // Fall back to original_image_url if needed
        image_url: page.image_url,
        thumbnail_url: page.thumbnail_url,
      })),
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
