import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Redetect Page API Route
// Triggers re-detection via the external extraction API
// =============================================================================

const EXTRACTION_API_BASE =
  process.env.NEXT_PUBLIC_EXTRACTION_API_URL ||
  'https://extraction-api-production.up.railway.app';

// Create untyped Supabase client for extraction_detections_draft operations
// (This table is not in the generated types)
const getUntypedSupabaseClient = () => createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ExtractionPageRecord {
  id: string;
  job_id: string;
  page_number: number;
  image_url: string;
  original_image_url: string | null;
  page_type: string | null;
  elevation_name: string | null;
}

interface DetectionResult {
  id: string;
  class: string;
  confidence: number;
  pixel_x: number;
  pixel_y: number;
  pixel_width: number;
  pixel_height: number;
  polygon_points?: Array<{ x: number; y: number }>;
  area_sf?: number;
  perimeter_lf?: number;
}

interface RedetectResponse {
  success: boolean;
  page_id: string;
  detections: DetectionResult[];
  detection_count: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[redetect-page] ========================================');
  console.log('[redetect-page] API called at:', new Date().toISOString());

  try {
    const body = await request.json();
    const { page_id, min_confidence } = body;

    console.log('[redetect-page] Page ID:', page_id);
    console.log('[redetect-page] Min Confidence:', min_confidence);

    if (!page_id) {
      return NextResponse.json(
        { success: false, error: 'page_id is required' },
        { status: 400 }
      );
    }

    // Get page details from database
    const supabase = await createClient();

    const { data: pageData, error: pageError } = await supabase
      .from('extraction_pages')
      .select('id, job_id, page_number, image_url, original_image_url, page_type, elevation_name')
      .eq('id', page_id)
      .single();

    if (pageError || !pageData) {
      console.error('[redetect-page] Page fetch error:', pageError);
      return NextResponse.json(
        { success: false, error: 'Page not found' },
        { status: 404 }
      );
    }

    const page = pageData as ExtractionPageRecord;
    const imageUrl = page.original_image_url || page.image_url;

    console.log('[redetect-page] Found page:', {
      id: page.id,
      job_id: page.job_id,
      page_number: page.page_number,
      image_url: imageUrl.substring(0, 50) + '...',
    });

    // Call the extraction API to re-run detection
    console.log('[redetect-page] Calling extraction API...');

    const redetectResponse = await fetch(`${EXTRACTION_API_BASE}/redetect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: page.id,
        job_id: page.job_id,
        image_url: imageUrl,
        min_confidence: min_confidence || 0.0,
      }),
    });

    if (!redetectResponse.ok) {
      const errorText = await redetectResponse.text();
      console.error('[redetect-page] Extraction API error:', redetectResponse.status, errorText);

      // If the endpoint doesn't exist yet, return a helpful message
      if (redetectResponse.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: 'Re-detection endpoint not available on extraction API. Feature pending backend implementation.',
          },
          { status: 501 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Failed to re-detect page' },
        { status: 500 }
      );
    }

    const result: RedetectResponse = await redetectResponse.json();
    console.log('[redetect-page] Extraction API response:', {
      success: result.success,
      detection_count: result.detection_count || result.detections?.length || 0,
    });

    // If we got new detections, save them to the draft table
    if (result.success && result.detections && result.detections.length > 0) {
      console.log('[redetect-page] Saving', result.detections.length, 'detections to draft table...');

      // Use untyped client for extraction_detections_draft operations
      const untypedSupabase = getUntypedSupabaseClient();

      // First, mark existing draft detections as deleted
      const { error: deleteError } = await untypedSupabase
        .from('extraction_detections_draft')
        .update({ is_deleted: true })
        .eq('page_id', page_id);

      if (deleteError) {
        console.error('[redetect-page] Error clearing old drafts:', deleteError);
      }

      // Insert new detections
      const detectionsToInsert = result.detections.map((det) => ({
        page_id: page_id,
        class: det.class,
        confidence: det.confidence,
        pixel_x: det.pixel_x,
        pixel_y: det.pixel_y,
        pixel_width: det.pixel_width,
        pixel_height: det.pixel_height,
        polygon_points: det.polygon_points || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data: insertedData, error: insertError } = await untypedSupabase
        .from('extraction_detections_draft')
        .insert(detectionsToInsert)
        .select();

      if (insertError) {
        console.error('[redetect-page] Error inserting new detections:', insertError);
        return NextResponse.json(
          { success: false, error: 'Failed to save new detections' },
          { status: 500 }
        );
      }

      console.log('[redetect-page] Successfully saved', insertedData?.length || 0, 'new detections');

      return NextResponse.json({
        success: true,
        page_id: page_id,
        detections: insertedData,
        detection_count: insertedData?.length || 0,
        message: `Re-detected ${insertedData?.length || 0} objects on page`,
      });
    }

    // Return the result from the extraction API
    return NextResponse.json({
      success: result.success,
      page_id: page_id,
      detections: result.detections || [],
      detection_count: result.detection_count || 0,
    });
  } catch (error) {
    console.error('[redetect-page] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
