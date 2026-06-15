import { NextRequest, NextResponse } from 'next/server';
import {
  requireExtractionJobAccess,
  requireExtractionPageAccess,
  requireExtractionPagesForJobAccess,
  requireProjectAccess,
  requireTakeoffAccess,
} from '@/lib/api/access';

// Strip any trailing path from the URL (e.g. /webhook/multi-trade-coordinator)
// We only want the base origin like https://n8n-production-293e.up.railway.app
function getN8nBaseUrl(): string {
  const raw =
    process.env.N8N_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
    'https://n8n-production-293e.up.railway.app';
  try {
    const url = new URL(raw);
    return url.origin; // Returns just https://hostname — strips any path
  } catch {
    return raw;
  }
}

const N8N_BASE_URL = getN8nBaseUrl();

const TIMEOUT_MS = 120_000; // 2 min — Excel generation can be slow

const ALLOWED_WEBHOOK_PATHS = new Set([
  'multi-trade-coordinator',
  'generate-proposal',
  'detection-edit-sync',
  'validate-detections',
  'approve-detection-editor',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function authorizeWebhookRequest(webhookPath: string, body: Record<string, unknown>) {
  if (!ALLOWED_WEBHOOK_PATHS.has(webhookPath)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  switch (webhookPath) {
    case 'multi-trade-coordinator': {
      const access = await requireProjectAccess(body.project_id);
      return access.ok ? null : access.response;
    }

    case 'generate-proposal': {
      const access = await requireTakeoffAccess(body.takeoff_id);
      return access.ok ? null : access.response;
    }

    case 'approve-detection-editor': {
      const access = await requireExtractionJobAccess(body.job_id, {
        claimedProjectId: body.project_id,
      });
      return access.ok ? null : access.response;
    }

    case 'detection-edit-sync': {
      const access = await requireExtractionPageAccess(body.page_id, {
        claimedJobId: body.job_id,
      });
      return access.ok ? null : access.response;
    }

    case 'validate-detections': {
      const detections = Array.isArray(body.detections) ? body.detections : [];
      const pageIds = detections
        .map((d) => (isRecord(d) ? d.page_id : null))
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      const access = await requireExtractionPagesForJobAccess(body.job_id, pageIds);
      return access.ok ? null : access.response;
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const webhookPath = path.join('/');

  console.log(`[n8n-proxy] POST /webhook/${webhookPath}`);

  try {
    const parsedBody = await request.json();
    if (!isRecord(parsedBody)) {
      return NextResponse.json(
        { success: false, error: 'JSON object body is required' },
        { status: 400 }
      );
    }

    const authFailure = await authorizeWebhookRequest(webhookPath, parsedBody);
    if (authFailure) {
      return authFailure;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = n8nResponse.headers.get('content-type') || '';

    // Handle binary responses (Excel files from Multi-Trade Coordinator)
    if (
      contentType.includes('spreadsheet') ||
      contentType.includes('octet-stream') ||
      contentType.includes('excel')
    ) {
      const buffer = await n8nResponse.arrayBuffer();
      return new NextResponse(buffer, {
        status: n8nResponse.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition':
            n8nResponse.headers.get('content-disposition') || 'attachment; filename="takeoff.xlsx"',
        },
      });
    }

    // Read response as text first, then try to parse as JSON
    const responseText = await n8nResponse.text();

    console.log(`[n8n-proxy] Response status: ${n8nResponse.status}, content-type: ${contentType}, body length: ${responseText.length}`);

    if (!responseText || responseText.length === 0) {
      // Empty response — n8n webhook may not be active or returned nothing
      if (n8nResponse.ok) {
        return NextResponse.json({ success: true, message: 'Webhook executed (empty response)' });
      }
      return NextResponse.json(
        { error: 'n8n returned empty response', status: n8nResponse.status },
        { status: n8nResponse.status || 502 }
      );
    }

    // Try JSON parse
    try {
      const data = JSON.parse(responseText);

      console.log('[n8n-proxy] Path:', webhookPath);
      console.log('[n8n-proxy] Response status:', n8nResponse.status);

      // Specific logging for approve-detection-editor endpoint
      if (webhookPath.includes('approve') && isRecord(data)) {
        console.log('[n8n-proxy] Approve response summary:', {
          success: data.success,
          takeoff_id: data.takeoff_id,
          line_items_created: data.line_items_created,
          line_items_count: Array.isArray(data.line_items) ? data.line_items.length : undefined,
          material_items_count: Array.isArray(data.material_items) ? data.material_items.length : undefined,
        });
      }

      return NextResponse.json(data, { status: n8nResponse.status });
    } catch {
      // Not JSON — return as text (could be HTML error page)
      console.error(`[n8n-proxy] Non-JSON response: ${responseText.substring(0, 500)}`);

      // If it's an HTML error page from n8n, extract the message
      if (contentType.includes('html')) {
        return NextResponse.json(
          { error: 'n8n returned HTML instead of JSON', hint: 'The webhook may not be active or the path may be incorrect', rawPreview: responseText.substring(0, 200) },
          { status: n8nResponse.status || 502 }
        );
      }

      return new NextResponse(responseText, {
        status: n8nResponse.status,
        headers: { 'Content-Type': contentType || 'text/plain' },
      });
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[n8n-proxy] Error proxying /webhook/${webhookPath}:`, err);

    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'n8n webhook timed out' }, { status: 504 });
    }

    return NextResponse.json(
      { error: 'Failed to proxy request to n8n', details: err.message },
      { status: 502 }
    );
  }
}
