import { NextRequest, NextResponse } from 'next/server';
import { requireExtractionJobAccess } from '@/lib/api/access';

const EXTRACTION_API_BASE =
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'
    ? process.env.NEXT_PUBLIC_LOCAL_EXTRACTION_API_URL || 'http://localhost:5050'
    : process.env.NEXT_PUBLIC_EXTRACTION_API_URL ||
      'https://extraction-api-production.up.railway.app';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { job_id, mode = 'auto', page_ids } = body;

    if (!job_id) {
      return NextResponse.json(
        { success: false, error: 'job_id is required' },
        { status: 400 }
      );
    }

    const jobAccess = await requireExtractionJobAccess(job_id);
    if (!jobAccess.ok) {
      return jobAccess.response;
    }

    const response = await fetch(`${EXTRACTION_API_BASE}/refine-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id,
        mode,
        page_ids,
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
    console.error('[refine-job] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refine job detections' },
      { status: 500 }
    );
  }
}
