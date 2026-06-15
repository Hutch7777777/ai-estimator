/**
 * GET /api/extraction-pages/[pageId]
 *
 * Fetch a single extraction page by ID, including ocr_data.
 * Used by the fast-path takeoff generation to get Azure schedule data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireExtractionPageAccess } from '@/lib/api/access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;

    if (!pageId) {
      return NextResponse.json(
        { error: 'pageId is required' },
        { status: 400 }
      );
    }

    const pageAccess = await requireExtractionPageAccess(pageId);
    if (!pageAccess.ok) {
      return pageAccess.response;
    }

    const supabase = pageAccess.ctx.supabase;

    // Fetch page with ocr_data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('extraction_pages')
      .select('id, page_number, page_type, ocr_data, ocr_status, ocr_processed_at')
      .eq('id', pageId)
      .single();

    if (error) {
      console.error('[API extraction-pages/pageId] Query error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[API extraction-pages/pageId] Exception:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
