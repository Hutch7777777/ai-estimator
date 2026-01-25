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
  ocr_data?: Record<string, unknown> | null;
  ocr_status?: string | null;
  ocr_processed_at?: string | null;
}

interface DetectionRecord {
  id: string;
  page_id: string;
  class: string;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  polygon_points?: Array<{x: number, y: number}> | null;
  area_sf: number | null;
  perimeter_lf: number | null;
  status?: string;
  is_deleted?: boolean;
}

// =============================================================================
// GET Handler - Fetch extraction pages for a project
// =============================================================================

export async function GET(request: Request) {
  console.log('========================================');
  console.log('[API] extraction-pages called at:', new Date().toISOString());
  console.log('========================================');

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const jobIdParam = searchParams.get('job_id');
    const pageType = searchParams.get('page_type') || 'elevation'; // Default to elevation for backwards compatibility
    console.log('[API] Project ID:', projectId);
    console.log('[API] Job ID:', jobIdParam);
    console.log('[API] Page Type:', pageType);

    if (!projectId && !jobIdParam) {
      return NextResponse.json(
        { success: false, error: 'project_id or job_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    let jobId: string;

    // Get job ID either from parameter or by looking up from project
    if (jobIdParam) {
      jobId = jobIdParam;
    } else {
      // Find the extraction job for this project
      const { data: jobData, error: jobError } = await supabase
        .from('extraction_jobs')
        .select('id')
        .eq('project_id', projectId!)
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

      jobId = (jobData as { id: string }).id;
    }

    // Fetch pages for this job filtered by page_type
    console.log('[API] Querying extraction_pages with job_id:', jobId, 'page_type:', pageType);

    // First try query with OCR columns (they may not exist in older databases)
    let pagesData: ExtractionPageRecord[] | null = null;
    let pagesError: { message: string; code?: string } | null = null;

    // Try with OCR columns first (ocr_data, ocr_status, ocr_processed_at)
    const { data: pagesWithOCR, error: ocrError } = await supabase
      .from('extraction_pages')
      .select('id, job_id, page_number, image_url, thumbnail_url, page_type, elevation_name, original_image_url, ocr_data, ocr_status, ocr_processed_at')
      .eq('job_id', jobId)
      .eq('page_type', pageType)
      .order('page_number', { ascending: true });

    if (ocrError) {
      console.log('[API] Query with OCR columns failed, trying without OCR columns:', ocrError.message);
      // Fall back to query without OCR columns
      const { data: pagesWithoutOCR, error: basicError } = await supabase
        .from('extraction_pages')
        .select('id, job_id, page_number, image_url, thumbnail_url, page_type, elevation_name, original_image_url')
        .eq('job_id', jobId)
        .eq('page_type', pageType)
        .order('page_number', { ascending: true });

      if (basicError) {
        pagesError = basicError;
      } else {
        // Add null OCR fields to match the interface
        pagesData = (pagesWithoutOCR || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          job_id: p.job_id as string,
          page_number: p.page_number as number,
          image_url: p.image_url as string,
          thumbnail_url: p.thumbnail_url as string | null,
          page_type: p.page_type as string | null,
          elevation_name: p.elevation_name as string | null,
          original_image_url: p.original_image_url as string | null,
          ocr_data: null,
          ocr_status: null,
          ocr_processed_at: null,
        })) as ExtractionPageRecord[];
      }
    } else {
      pagesData = pagesWithOCR as ExtractionPageRecord[];
    }

    console.log('[API] Pages query result - count:', pagesData?.length || 0);
    console.log('[API] Pages query result - error:', pagesError ? JSON.stringify(pagesError) : 'none');

    if (pagesData && pagesData.length > 0) {
      console.log('[API] First page:', JSON.stringify({
        id: pagesData[0].id,
        page_number: pagesData[0].page_number,
        page_type: pagesData[0].page_type,
        image_url: pagesData[0].image_url?.substring(0, 50) + '...',
      }));
    } else {
      console.log('[API] ⚠️ NO PAGES FOUND for job_id:', jobId, 'page_type:', pageType);
    }

    if (pagesError) {
      console.error('[API] Extraction pages fetch error:', pagesError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch extraction pages' },
        { status: 500 }
      );
    }

    const pages = (pagesData || []) as ExtractionPageRecord[];
    const pageIds = pages.map(p => p.id);

    // Fetch detections with priority:
    // 1. extraction_detections_draft (user's actual edits from Detection Editor)
    // 2. extraction_detections_validated (fallback)
    // 3. extraction_detection_details (original AI detections as last resort)

    console.log('[API] Page IDs to fetch detections for:', pageIds);

    // Helper function to build response
    const buildResponse = (
      detectionsList: DetectionRecord[],
      source: string
    ) => {
      // Group detections by page_id
      const detectionsByPage = new Map<string, DetectionRecord[]>();
      for (const det of detectionsList) {
        if (!detectionsByPage.has(det.page_id)) {
          detectionsByPage.set(det.page_id, []);
        }
        detectionsByPage.get(det.page_id)!.push(det);
      }

      console.log('[API] ========================================');
      console.log(`[API] RETURNING: ${source} with ${detectionsList.length} total detections`);
      for (const [pageId, dets] of detectionsByPage) {
        const page = pages.find(p => p.id === pageId);
        console.log(`[API]   Page ${page?.page_number || pageId}: ${dets.length} detections`);
      }
      console.log('[API] ========================================');

      return NextResponse.json({
        success: true,
        job_id: jobId,
        detection_source: source,
        pages: pages.map(page => ({
          id: page.id,
          page_number: page.page_number,
          page_type: page.page_type,
          elevation_name: page.elevation_name,
          image_url: page.original_image_url || page.image_url,
          thumbnail_url: page.thumbnail_url,
          ocr_data: page.ocr_data,
          ocr_status: page.ocr_status,
          ocr_processed_at: page.ocr_processed_at,
          detections: (detectionsByPage.get(page.id) || []).map(d => ({
            id: d.id,
            class: d.class,
            pixel_x: d.pixel_x,
            pixel_y: d.pixel_y,
            pixel_width: d.pixel_width,
            pixel_height: d.pixel_height,
            polygon_points: d.polygon_points,
            area_sf: d.area_sf,
            perimeter_lf: d.perimeter_lf,
          })),
        })),
      });
    };

    if (pageIds.length > 0) {
      // =====================================================================
      // PRIORITY 1: DRAFT detections (user's actual edits in Detection Editor)
      // =====================================================================
      console.log('[API] ============ STEP 1: DRAFT QUERY ============');
      console.log('[API] Table: extraction_detections_draft');
      console.log('[API] Filter: page_id IN [...] AND is_deleted = false');
      console.log('[API] Page IDs being queried:', pageIds);

      // NOTE: extraction_detections_draft table does NOT have area_sf or perimeter_lf columns
      // but DOES have polygon_points for accurate shape rendering
      const { data: draftData, error: draftError } = await supabase
        .from('extraction_detections_draft')
        .select('id, page_id, class, pixel_x, pixel_y, pixel_width, pixel_height, polygon_points, is_deleted')
        .in('page_id', pageIds)
        .eq('is_deleted', false);

      // Log FULL result
      console.log('[API] Draft query complete:');
      console.log('[API]   - Data:', draftData === null ? 'NULL' : `Array with ${draftData.length} items`);
      console.log('[API]   - Error:', draftError ? JSON.stringify(draftError) : 'none');
      if (draftData && draftData.length > 0) {
        console.log('[API]   - First record:', JSON.stringify(draftData[0]));
      }

      // Check for errors first
      if (draftError) {
        console.log('[API] ⚠️ DRAFT QUERY FAILED:', draftError.message);
        console.log('[API] Error details:', JSON.stringify(draftError));
      } else if (draftData && draftData.length > 0) {
        // SUCCESS - Found drafts, return immediately!
        console.log(`[API] ✅ SUCCESS: Found ${draftData.length} DRAFT detections`);
        console.log('[API] Returning DRAFT data - NOT querying validated or AI');

        // Normalize draft data to match DetectionRecord (add null for missing columns)
        const normalizedDraftData = draftData.map((det: Record<string, unknown>) => ({
          ...det,
          area_sf: null,
          perimeter_lf: null,
        }));

        return buildResponse(normalizedDraftData as DetectionRecord[], 'draft (user edits)');
      }

      // =====================================================================
      // PRIORITY 2: VALIDATED detections (only reached if NO drafts)
      // =====================================================================
      console.log('[API] ============ STEP 2: VALIDATED QUERY ============');
      console.log('[API] (Only reached because draft returned 0 records)');

      const { data: validatedData, error: validatedError } = await supabase
        .from('extraction_detections_validated')
        .select('id, page_id, class, pixel_x, pixel_y, pixel_width, pixel_height, area_sf, perimeter_lf')
        .in('page_id', pageIds);

      console.log('[API] Validated query complete:');
      console.log('[API]   - Data:', validatedData === null ? 'NULL' : `Array with ${validatedData?.length || 0} items`);
      console.log('[API]   - Error:', validatedError ? JSON.stringify(validatedError) : 'none');

      if (validatedError) {
        console.log('[API] ⚠️ VALIDATED QUERY FAILED:', validatedError.message);
      } else if (validatedData && validatedData.length > 0) {
        console.log(`[API] ⚠️ Using VALIDATED detections: ${validatedData.length} (raw Roboflow)`);
        return buildResponse(validatedData as DetectionRecord[], 'validated (raw Roboflow)');
      }

      // =====================================================================
      // PRIORITY 3: Original AI detections (last resort)
      // =====================================================================
      console.log('[API] ============ STEP 3: AI ORIGINAL QUERY ============');
      console.log('[API] (Only reached because both draft AND validated returned 0)');

      const { data: aiData, error: aiError } = await supabase
        .from('extraction_detection_details')
        .select('id, page_id, class, pixel_x, pixel_y, pixel_width, pixel_height, area_sf, perimeter_lf, status')
        .in('page_id', pageIds)
        .neq('status', 'deleted');

      console.log('[API] AI query complete:');
      console.log('[API]   - Data:', aiData === null ? 'NULL' : `Array with ${aiData?.length || 0} items`);
      console.log('[API]   - Error:', aiError ? JSON.stringify(aiError) : 'none');

      if (aiError) {
        console.log('[API] ⚠️ AI QUERY FAILED:', aiError.message);
      } else if (aiData && aiData.length > 0) {
        console.log(`[API] ⚠️ Using AI ORIGINAL detections: ${aiData.length}`);
        return buildResponse(aiData as DetectionRecord[], 'ai_original');
      }
    }

    // No detections found at all
    console.log('[API] ⚠️ NO DETECTIONS FOUND from any source');
    return buildResponse([], 'none');
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
