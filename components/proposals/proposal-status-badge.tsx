import { StatusBadge } from "@/components/ui/status-badge";
import { STATUS_LABELS } from "@/lib/estimates/workflow";
import type { EstimateStatus } from "@/lib/estimates/types";

// Map the proposal lifecycle onto the app's existing StatusBadge variants.
const VARIANT: Record<EstimateStatus, "draft" | "pending" | "processing" | "complete"> = {
  draft: "draft",
  in_review: "pending",
  approved: "complete",
  sent: "processing",
};

export function ProposalStatusBadge({ status }: { status: EstimateStatus }) {
  return <StatusBadge status={VARIANT[status]}>{STATUS_LABELS[status]}</StatusBadge>;
}
