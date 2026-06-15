/**
 * POST /api/estimating/calculate-siding
 *
 * Verification-only parallel surface to `/api/n8n/approve-detection-editor`.
 * Runs the FULL siding takeoff locally using `@estimatepros/estimating-engine`,
 * with no n8n hop and no Multi-Trade Coordinator round-trip.
 *
 *   1. Accept the same body the Detection Editor POSTs to the n8n approval
 *      webhook.
 *   2. Auth-gate via cookie-scoped Supabase + RLS-enforced job lookup.
 *   3. Normalize via the V9.2 mirror (`normalizeDetectionEditorApprovalPayload`).
 *   4. Build refData (10 fields) via `lib/estimating/refData.ts` —
 *      cookie-scoped reads for everything except the
 *      `organizations.settings.overhead_config` row, which uses the service
 *      role per source.
 *   5. Apply org pricing overrides via the engine's pure overlay helpers.
 *   6. Call `calculateSidingTakeoff(...)` and return the raw V2 result.
 *
 * This route is NOT wired into the frontend. It does NOT replace the
 * production approval flow. Treat as a comparison/verification surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireExtractionJobAccess } from '@/lib/api/access';
import { buildSidingRefData } from '@/lib/estimating/refData';
import { normalizeDetectionEditorApprovalPayload } from '@/packages/estimating-engine/src/index';
import { calculateSidingTakeoff } from '@/packages/estimating-engine/src/orchestrators/sidingOrchestratorV2';

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

  const supabase = access.ctx.supabase;
  const projectId = access.data.project_id;

  // -------------------------------------------------------------------------
  // 6. Normalize the payload via the n8n V9.2 mirror
  //    (Moved ahead of organization_id resolution so `normalized.organization_id`
  //    is in scope for the priority resolver below.)
  // -------------------------------------------------------------------------
  let normalized: ReturnType<typeof normalizeDetectionEditorApprovalPayload>;
  try {
    normalized = normalizeDetectionEditorApprovalPayload(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Normalization failed', details: message },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 7. Resolve organization_id from the trusted project row.
  //    Request payload organization ids are treated as claims only. They may be
  //    passed through by the n8n mirror, but they must never decide which org's
  //    pricing overrides or overhead config are used.
  // -------------------------------------------------------------------------
  const trustedOrganizationId =
    typeof access.data.project?.organization_id === 'string'
      ? access.data.project.organization_id.trim()
      : '';
  const normalizedOrgId =
    typeof normalized.organization_id === 'string' ? normalized.organization_id.trim() : '';
  const bodyOrgId =
    typeof body.organization_id === 'string' ? (body.organization_id as string).trim() : '';

  const claimedOrgIds = Array.from(new Set([normalizedOrgId, bodyOrgId].filter(Boolean)));
  const mismatchedOrgId = claimedOrgIds.find((id) => trustedOrganizationId && id !== trustedOrganizationId);
  if (mismatchedOrgId) {
    return NextResponse.json(
      { success: false, error: 'organization_id does not match project' },
      { status: 400 }
    );
  }

  const organizationId = trustedOrganizationId || undefined;

  // The normalized output preserves the original shape; pricing IDs come from
  // material_assignments[*].pricing_item_id (or the legacy `assigned_material_id` /
  // `material_id` aliases the frontend may emit).
  const materialAssignments = Array.isArray(normalized.material_assignments)
    ? normalized.material_assignments
    : [];

  const pricingItemIds = materialAssignments
    .map(
      (a: Record<string, unknown>) =>
        (typeof a.pricing_item_id === 'string' && a.pricing_item_id) ||
        (typeof a.assigned_material_id === 'string' && a.assigned_material_id) ||
        (typeof a.material_id === 'string' && a.material_id) ||
        ''
    )
    .filter((id: string) => id.length > 0);

  // -------------------------------------------------------------------------
  // 8. Build refData (10 fields, parallel batched)
  // -------------------------------------------------------------------------
  let refData;
  try {
    refData = await buildSidingRefData(supabase, {
      projectId,
      organizationId,
      // The n8n V9.2 Approve workflow writes to
      //   cad_hover_measurements (extraction_id) DO UPDATE
      // BEFORE invoking Multi-Trade Coordinator. Pass the trusted job_id so
      // the engine's `buildMeasurementContext` finds the row and stops
      // reporting "FACADE_SOURCE using: 0".
      extractionId: jobId,
      pricingItemIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to build refData', details: message },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 9. Run the engine (sync — no await)
  // -------------------------------------------------------------------------
  try {
    // The normalized output's measurements block is the WebhookMeasurements
    // payload. material_assignments / detection_counts / unmatched / etc are
    // also present on the normalized object — pass them through.
    const result = calculateSidingTakeoff({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      materialAssignments: materialAssignments as any,
      extractionId: typeof normalized.job_id === 'string' ? normalized.job_id : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webhookMeasurements: normalized.measurements as any,
      organizationId,
      markupRate:
        typeof normalized.markup_percent === 'number'
          ? normalized.markup_percent / 100
          : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      detectionCounts: normalized.detection_counts as any,
      perMaterialMeasurements: undefined,
      spatialContainment: undefined,
      // The orchestrator reads `config?.estimate_settings?.overhead` (and
      // sibling sub-keys) at sidingOrchestratorV2.ts:1114. Wrap the
      // normalizer's flat estimate_settings object so that path resolves —
      // without this, every Phase-2B override is silently skipped.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { estimate_settings: normalized.estimate_settings as any } as any,
      projectId,
      refData,
    });

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'calculateSidingTakeoff failed', details: message },
      { status: 500 }
    );
  }
}
