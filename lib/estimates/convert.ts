import type { AssistantProposal } from "@/lib/assistant/types";
import type { EstimateContentInput } from "@/lib/estimates/types";

/**
 * Converts an assistant proposal (from a grounded chat answer) into
 * structured proposal content: one "Scope of work" section, base items,
 * conservative defaults (cost type "other", taxable, zero pricing) so the
 * estimator prices it deliberately in the editor.
 */
export function assistantProposalToEstimateContent(input: {
  proposal: AssistantProposal;
  assumptions: string[];
  exclusions: string[];
  projectId: string | null;
}): EstimateContentInput {
  return {
    title: input.proposal.title,
    projectId: input.projectId,
    sections: [
      {
        title: "Scope of work",
        description: input.proposal.summary || null,
        items: input.proposal.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitCostCents: item.unitCostCents,
          costType: "other" as const,
          kind: "base" as const,
          taxable: true,
          notes: null,
        })),
      },
    ],
    pricing: { markupBps: 0, overheadBps: 0, contingencyBps: 0, taxBps: 0 },
    assumptions: input.assumptions,
    exclusions: input.exclusions,
  };
}

/** A minimal blank proposal for the "New proposal" action. */
export function blankEstimateContent(
  projectId: string | null,
  title = "Untitled proposal"
): EstimateContentInput {
  return {
    title,
    projectId,
    sections: [{ title: "Scope of work", description: null, items: [] }],
    pricing: { markupBps: 0, overheadBps: 0, contingencyBps: 0, taxBps: 0 },
    assumptions: [],
    exclusions: [],
  };
}
