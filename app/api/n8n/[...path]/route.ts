import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRequestId } from '@/lib/server/extractionRequestAuth';
import {
  getAuthorizedJobOrganization,
  getAuthorizedPageOrganization,
  getAuthorizedProjectOrganization,
  getAuthorizedTakeoffOrganization,
} from '@/lib/server/extractionAuthorization';

export const runtime = 'nodejs';

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
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

const TIMEOUT_MS = 120_000; // 2 min — Excel generation can be slow
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_WEBHOOKS = new Set([
  'approve-detection-editor',
  'detection-edit-sync',
  'generate-proposal',
  'multi-trade-coordinator',
  'validate-detections',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const webhookPath = path.join('/');

  if (!ALLOWED_WEBHOOKS.has(webhookPath)) {
    return NextResponse.json(
      { success: false, error: 'Unknown workflow' },
      { status: 404 }
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Request body is too large' },
      { status: 413 }
    );
  }

  try {
    // Defense in depth: the proxy middleware already rejects anonymous API
    // requests, but paid workflow routes also verify the user here.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    const requestId = resolveRequestId(request.headers.get('x-request-id'));
    const responseHeaders = {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    };

    if (!N8N_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
      console.error(`[n8n-proxy] ${requestId} missing N8N_WEBHOOK_SECRET`);
      return NextResponse.json(
        { success: false, error: 'Workflow service is not configured' },
        { status: 503, headers: responseHeaders }
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request body is too large' },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const resourceOrganizations: Array<PromiseLike<string | null>> = [];
    if (typeof body.job_id === 'string' && body.job_id) {
      resourceOrganizations.push(getAuthorizedJobOrganization(supabase, body.job_id));
    }
    if (typeof body.page_id === 'string' && body.page_id) {
      resourceOrganizations.push(getAuthorizedPageOrganization(supabase, body.page_id));
    }
    if (typeof body.project_id === 'string' && body.project_id) {
      resourceOrganizations.push(getAuthorizedProjectOrganization(supabase, body.project_id));
    }
    if (typeof body.takeoff_id === 'string' && body.takeoff_id) {
      resourceOrganizations.push(getAuthorizedTakeoffOrganization(supabase, body.takeoff_id));
    }

    if (resourceOrganizations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'A project, job, page, or takeoff identifier is required' },
        { status: 400 }
      );
    }

    const authorizationResults = await Promise.all(resourceOrganizations);
    if (authorizationResults.some((organizationId) => !organizationId)) {
      return NextResponse.json(
        { success: false, error: 'Workflow resource not found' },
        { status: 404 }
      );
    }

    const organizationIds = new Set(authorizationResults as string[]);
    if (organizationIds.size !== 1) {
      return NextResponse.json(
        { success: false, error: 'Workflow resources must belong to one organization' },
        { status: 400 }
      );
    }

    const organizationId = authorizationResults[0]!;
    body.user_id = user.id;
    body.organization_id = organizationId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let n8nResponse: Response;
    try {
      n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Estimate-User-Id': user.id,
          'X-Estimate-Organization-Id': organizationId,
          'X-Estimate-Request-Id': requestId,
          ...(N8N_WEBHOOK_SECRET ? { 'X-Webhook-Secret': N8N_WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = n8nResponse.headers.get('content-type') || '';

    if (!n8nResponse.ok) {
      console.error(`[n8n-proxy] ${requestId} workflow failed with status=${n8nResponse.status}`);
      return NextResponse.json(
        { success: false, error: 'Workflow request failed' },
        { status: n8nResponse.status, headers: responseHeaders }
      );
    }

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
          ...responseHeaders,
        },
      });
    }

    // Read response as text first, then try to parse as JSON
    const responseText = await n8nResponse.text();

    console.log(`[n8n-proxy] ${requestId} status=${n8nResponse.status} content-type=${contentType} bytes=${responseText.length}`);

    if (!responseText || responseText.length === 0) {
      // Empty response — n8n webhook may not be active or returned nothing
      return NextResponse.json(
        { success: true, message: 'Webhook executed (empty response)' },
        { headers: responseHeaders }
      );
    }

    // Try JSON parse
    try {
      const data = JSON.parse(responseText);

      return NextResponse.json(data, {
        status: n8nResponse.status,
        headers: responseHeaders,
      });
    } catch {
      // Not JSON — return as text (could be HTML error page)
      console.error(`[n8n-proxy] ${requestId} returned a non-JSON response`);

      // If it's an HTML error page from n8n, extract the message
      if (contentType.includes('html')) {
        return NextResponse.json(
          { error: 'n8n returned HTML instead of JSON', hint: 'The webhook may not be active or the path may be incorrect' },
          { status: n8nResponse.status || 502, headers: responseHeaders }
        );
      }

      return new NextResponse(responseText, {
        status: n8nResponse.status,
        headers: {
          'Content-Type': contentType || 'text/plain',
          ...responseHeaders,
        },
      });
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[n8n-proxy] Error proxying /webhook/${webhookPath}:`, err);

    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'n8n webhook timed out' }, { status: 504 });
    }

    return NextResponse.json(
      { error: 'Failed to proxy request to n8n' },
      { status: 502 }
    );
  }
}
