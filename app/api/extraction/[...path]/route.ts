import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createExtractionServiceHeaders,
  resolveRequestId,
} from '@/lib/server/extractionRequestAuth';
import {
  getAuthorizedJobOrganization,
  getAuthorizedPageOrganization,
  getAuthorizedProjectOrganization,
  userBelongsToOrganization,
} from '@/lib/server/extractionAuthorization';
import {
  isAllowedExtractionRoute,
  parseExtractionBodyFields,
} from '@/lib/server/extractionProxyPolicy';

export const runtime = 'nodejs';

const EXTRACTION_API_BASE = (
  process.env.EXTRACTION_API_URL ||
  process.env.NEXT_PUBLIC_EXTRACTION_API_URL ||
  'https://extraction-api-production.up.railway.app'
).replace(/\/$/, '');

const MAX_BODY_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  if (!isAllowedExtractionRoute(request.method, targetPath)) {
    return NextResponse.json({ success: false, error: 'Unknown extraction operation' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Request body is too large' }, { status: 413 });
  }

  try {
    const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Request body is too large' }, { status: 413 });
    }

    const contentType = request.headers.get('content-type');
    const fields = await parseExtractionBodyFields(body, contentType);
    const queryJobId = request.nextUrl.searchParams.get('job_id');
    const routeJobId = targetPath.match(/^reenrich-materials\/([0-9a-f-]{36})$/i)?.[1];
    const routePageId = targetPath.match(/^api\/pages\/([0-9a-f-]{36})\/classify$/i)?.[1];
    const jobId = queryJobId || routeJobId || fields.job_id;
    const pageId = routePageId || fields.page_id;
    let organizationId = fields.organization_id || null;

    let authorized = false;
    if (targetPath === 'start-job') {
      const projectId = fields.project_id;
      if (!organizationId || !projectId) {
        return NextResponse.json(
          { success: false, error: 'organization_id and project_id are required' },
          { status: 400 }
        );
      }
      const projectOrganizationId = await getAuthorizedProjectOrganization(
        supabase,
        projectId
      );
      authorized = projectOrganizationId === organizationId;
    } else if (
      targetPath === 'import-bluebeam-fresh'
      || targetPath === 'import-bluebeam-fresh/preview'
    ) {
      if (!organizationId) {
        return NextResponse.json({ success: false, error: 'organization_id is required' }, { status: 400 });
      }
      authorized = await userBelongsToOrganization(
        supabase,
        user.id,
        organizationId
      );
    } else if (jobId) {
      organizationId = await getAuthorizedJobOrganization(supabase, jobId);
      authorized = Boolean(organizationId);
    } else if (pageId) {
      organizationId = await getAuthorizedPageOrganization(supabase, pageId);
      authorized = Boolean(organizationId);
    } else {
      return NextResponse.json({ success: false, error: 'A job or page identifier is required' }, { status: 400 });
    }

    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Extraction resource not found' }, { status: 404 });
    }

    const targetUrl = new URL(`${EXTRACTION_API_BASE}/${targetPath}`);
    targetUrl.search = request.nextUrl.search;

    const requestId = resolveRequestId(request.headers.get('x-request-id'));
    const headers = createExtractionServiceHeaders({
      method: request.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      body,
      userId: user.id,
      organizationId: organizationId!,
      requestId,
    });
    if (contentType) headers.set('Content-Type', contentType);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      const responseHeaders = new Headers({
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      });
      for (const name of ['content-type', 'content-disposition']) {
        const value = response.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }

      return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Extraction service timed out' }, { status: 504 });
    }
    console.error('[extraction-proxy] Request failed:', error);
    return NextResponse.json({ success: false, error: 'Extraction service unavailable' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
