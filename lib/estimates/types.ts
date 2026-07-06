/**
 * Structured proposals domain (backed by the `estimates` tables in
 * Supabase): versioned, sectioned, priced estimates with an approval
 * workflow and immutable proposal-document snapshots.
 *
 * Vocabulary note: the takeoff editor in this app is labeled "Estimate
 * Editor" in the UI, so this domain is surfaced to users as "Proposals".
 */

export type EstimateStatus = "draft" | "in_review" | "approved" | "sent";

export type CostType =
  | "labor"
  | "material"
  | "equipment"
  | "subcontractor"
  | "other";

/**
 * base — normal scope, priced into the total.
 * allowance — priced into the total but flagged as an owner allowance.
 * alternate — priced and presented, but NOT included in the total.
 */
export type ItemKind = "base" | "allowance" | "alternate";

export interface EstimateItemInput {
  description: string;
  quantity: number;
  unit: string;
  unitCostCents: number;
  costType: CostType;
  kind: ItemKind;
  taxable: boolean;
  notes?: string | null;
}

export interface EstimateSectionInput {
  title: string;
  description?: string | null;
  items: EstimateItemInput[];
}

/** Percentages are basis points (100 bps = 1%) for deterministic math. */
export interface EstimatePricingInput {
  markupBps: number;
  overheadBps: number;
  contingencyBps: number;
  taxBps: number;
}

export interface EstimateContentInput {
  title: string;
  projectId?: string | null;
  sections: EstimateSectionInput[];
  pricing: EstimatePricingInput;
  assumptions: string[];
  exclusions: string[];
}

export interface EstimateTotals {
  subtotalCents: number;
  markupCents: number;
  overheadCents: number;
  contingencyCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  allowanceCents: number;
  alternateCents: number;
}

export interface EstimateItem extends EstimateItemInput {
  id: string;
  position: number;
  totalCents: number;
}

export interface EstimateSection {
  id: string;
  position: number;
  title: string;
  description: string | null;
  items: EstimateItem[];
  subtotalCents: number;
}

export interface Estimate {
  id: string;
  organizationId: string;
  projectId: string | null;
  groupId: string;
  number: number;
  version: number;
  title: string;
  status: EstimateStatus;
  sourceDraftId: string | null;
  sections: EstimateSection[];
  pricing: EstimatePricingInput;
  totals: EstimateTotals;
  assumptions: string[];
  exclusions: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateSummary {
  id: string;
  projectId: string | null;
  groupId: string;
  number: number;
  version: number;
  title: string;
  status: EstimateStatus;
  totalCents: number;
  updatedAt: string;
}

export interface EstimateVersionMeta {
  id: string;
  version: number;
  status: EstimateStatus;
  totalCents: number;
  createdAt: string;
}

export interface EstimateSnapshotMeta {
  id: string;
  kind: string;
  totalCents: number;
  createdAt: string;
}

export interface EstimateSnapshotContent {
  number: number;
  version: number;
  title: string;
  projectId: string | null;
  projectName: string | null;
  organizationName: string;
  sections: EstimateSection[];
  pricing: EstimatePricingInput;
  totals: EstimateTotals;
  assumptions: string[];
  exclusions: string[];
  generatedAt: string;
}

/** Immutable rendering source captured when a proposal document is generated. */
export interface EstimateSnapshot extends EstimateSnapshotMeta {
  estimateId: string;
  organizationId: string;
  content: EstimateSnapshotContent;
}

export interface EstimateDetail {
  estimate: Estimate;
  versions: EstimateVersionMeta[];
  snapshots: EstimateSnapshotMeta[];
}
