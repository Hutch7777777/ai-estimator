import { createClient } from "@/lib/supabase/client";
import { computeItemTotalCents, prepareEstimateContent } from "@/lib/estimates/pricing";
import type { PreparedEstimateContent } from "@/lib/estimates/pricing";
import type {
  EstimateContentInput,
  EstimateDetail,
  EstimateSnapshot,
  EstimateStatus,
  EstimateSummary,
} from "@/lib/estimates/types";

/**
 * Query module for the proposals domain (the `estimates` tables + RPCs that
 * already exist in the production database).
 *
 * Every WRITE is a single transactional SECURITY INVOKER RPC: RLS applies to
 * the signed-in user, the SQL re-verifies all totals against the line items
 * and pricing, checks project↔organization ownership, and enforces the
 * status workflow — so calling directly from the browser (this app's data
 * convention) is safe. Reads return RLS-filtered jsonb documents.
 */

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcFn = (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = createClient();
  // The handwritten Database type has no Functions map; contain the cast
  // here (same precedent as the rest of the codebase) with a real signature
  // instead of `any`.
  const call = supabase.rpc.bind(supabase) as unknown as RpcFn;
  const { data, error } = await call(name, args);
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}

/** Serializes prepared content into the payload shape the RPCs validate. */
function contentPayload(prepared: PreparedEstimateContent): Record<string, unknown> {
  const { content, totals } = prepared;
  return {
    title: content.title,
    projectId: content.projectId ?? null,
    assumptions: content.assumptions,
    exclusions: content.exclusions,
    pricing: { ...content.pricing },
    totals: { ...totals },
    sections: content.sections.map((section, sectionIndex) => ({
      position: sectionIndex,
      title: section.title,
      description: section.description ?? null,
      items: section.items.map((item, itemIndex) => ({
        position: itemIndex,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitCostCents: item.unitCostCents,
        totalCents: computeItemTotalCents(item),
        costType: item.costType,
        kind: item.kind,
        taxable: item.taxable,
        notes: item.notes ?? null,
      })),
    })),
  };
}

export async function createEstimate(
  organizationId: string,
  content: EstimateContentInput,
  sourceDraftId: string | null = null
): Promise<EstimateDetail> {
  return rpc<EstimateDetail>("create_estimate", {
    p_organization_id: organizationId,
    p_payload: contentPayload(prepareEstimateContent(content)),
    p_source_draft_id: sourceDraftId,
  });
}

/** Latest version per numbered group, newest first. */
export async function listEstimates(
  organizationId: string,
  projectId?: string | null
): Promise<EstimateSummary[]> {
  return rpc<EstimateSummary[]>("list_estimates", {
    p_organization_id: organizationId,
    p_project_id: projectId ?? null,
  });
}

export async function getEstimateDetail(
  estimateId: string
): Promise<EstimateDetail | null> {
  return rpc<EstimateDetail | null>("get_estimate_detail", {
    p_estimate_id: estimateId,
  });
}

/** Draft status only — the RPC rejects edits to in_review/approved/sent. */
export async function updateEstimateContent(
  estimateId: string,
  content: EstimateContentInput
): Promise<EstimateDetail> {
  return rpc<EstimateDetail>("update_estimate_content", {
    p_estimate_id: estimateId,
    p_payload: contentPayload(prepareEstimateContent(content)),
  });
}

export async function setEstimateStatus(
  estimateId: string,
  status: EstimateStatus
): Promise<EstimateDetail> {
  return rpc<EstimateDetail>("set_estimate_status", {
    p_estimate_id: estimateId,
    p_status: status,
  });
}

/** Approved/sent + latest version only; returns the new draft version. */
export async function reviseEstimate(estimateId: string): Promise<EstimateDetail> {
  return rpc<EstimateDetail>("revise_estimate", { p_estimate_id: estimateId });
}

/** Captures an immutable proposal document for the current content. */
export async function snapshotEstimate(
  estimateId: string
): Promise<EstimateSnapshot> {
  return rpc<EstimateSnapshot>("snapshot_estimate", { p_estimate_id: estimateId });
}

export async function getEstimateSnapshot(
  snapshotId: string
): Promise<EstimateSnapshot | null> {
  return rpc<EstimateSnapshot | null>("get_estimate_snapshot", {
    p_snapshot_id: snapshotId,
  });
}
