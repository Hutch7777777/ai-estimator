import { NextRequest, NextResponse } from 'next/server';
import { requireExtractionPageAccess } from '@/lib/api/access';

const EXTRACTION_API_BASE =
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'
    ? process.env.NEXT_PUBLIC_LOCAL_EXTRACTION_API_URL || 'http://localhost:5050'
    : process.env.NEXT_PUBLIC_EXTRACTION_API_URL ||
      'https://extraction-api-production.up.railway.app';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { page_id, apply = false, classes, detection_ids, actions } = body;

    if (!page_id) {
      return NextResponse.json(
        { success: false, error: 'page_id is required' },
        { status: 400 }
      );
    }

    const pageAccess = await requireExtractionPageAccess(page_id);
    if (!pageAccess.ok) {
      return pageAccess.response;
    }

    const response = await fetch(`${EXTRACTION_API_BASE}/refine-detections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id,
        apply,
        classes,
        detection_ids,
        actions,
      }),
    });

    const text = await response.text();
    let result: unknown;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { success: false, error: text || 'Invalid extraction API response' };
    }

    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error('[refine-detections] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refine detections' },
      { status: 500 }
    );
  }
}
