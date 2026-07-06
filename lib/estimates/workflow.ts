import type { EstimateStatus } from "@/lib/estimates/types";

/**
 * Proposal lifecycle, enforced here for the UI and mirrored inside the
 * database RPCs (set_estimate_status / update_estimate_content /
 * revise_estimate):
 *
 *   draft ⇄ in_review → approved → sent
 *
 * Content is editable only in draft. Approved/sent versions are immutable;
 * changes require a revision (new version in the same numbered group).
 */
const TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "approved"],
  approved: ["sent"],
  sent: [],
};

export function canTransition(
  from: EstimateStatus,
  to: EstimateStatus
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: EstimateStatus): boolean {
  return status === "draft";
}

export function isRevisable(status: EstimateStatus): boolean {
  return status === "approved" || status === "sent";
}

export const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  sent: "Sent",
};
