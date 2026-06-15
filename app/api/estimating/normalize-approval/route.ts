/**
 * POST /api/estimating/normalize-approval
 *
 * Server-only entry point for `normalizeDetectionEditorApprovalPayload`. This
 * is a parallel surface to the production approval flow (which still goes
 * through `/api/n8n/approve-detection-editor` → n8n) so the host app can
 * exercise the local engine adapter end-to-end without any frontend, n8n, or
 * adapter changes.
 *
 * Accepts the same body the Detection Editor already sends to the n8n
 * approve webhook. Returns:
 *   - 200 { success: true, normalized }
 *   - 4xx/5xx { success: false, error, details? }
 *
 * Security model:
 *   - Cookie-scoped Supabase client (`@/lib/supabase/server`) — no service-role key.
 *   - `auth.getUser()` gate (skipped only under the existing dev bypass flag).
 *   - Job-ownership enforced by RLS: a user who isn't a member of the job's
 *     project's org sees zero rows from the lookup.
 *   - `organization_id` from the request body is passed through to the adapter
 *     output (mirroring n8n behavior) but is NEVER used for authorization.
 *   - `project_id` from the body is cross-checked against the job's project_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireExtractionJobAccess } from '@/lib/api/access';
import { normalizeDetectionEditorApprovalPayload } from '@/packages/estimating-engine/src/index';

export async function POST(request: NextRequest) {
  // -------------------------------------------------------------------------
  // 1. Body parse
  // -------------------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. Required field
  // -------------------------------------------------------------------------
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId) {
    return NextResponse.json(
      { success: false, error: 'job_id is required' },
      { status: 400 }
    );
  }

  const claimedProjectId =
    typeof body.project_id === 'string' && body.project_id.trim().length > 0
      ? body.project_id.trim()
      : null;

  // -------------------------------------------------------------------------
  // 3. Auth + job/project ownership
  // -------------------------------------------------------------------------
  const access = await requireExtractionJobAccess(jobId, { claimedProjectId });
  if (!access.ok) {
    return access.response;
  }

  // -------------------------------------------------------------------------
  // 4. Normalize. body.organization_id is intentionally NOT consulted for
  // authorization — the adapter passes it through to its output unchanged
  // (matching n8n behavior), but downstream code must not trust it.
  // -------------------------------------------------------------------------
  try {
    const normalized = normalizeDetectionEditorApprovalPayload(body);
    return NextResponse.json({ success: true, normalized }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Normalization failed',
        details: message,
      },
      { status: 500 }
    );
  }
}
