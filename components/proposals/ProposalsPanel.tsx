"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProposalStatusBadge } from "@/components/proposals/proposal-status-badge";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { blankEstimateContent } from "@/lib/estimates/convert";
import { formatCents } from "@/lib/estimates/money";
import { createEstimate, listEstimates } from "@/lib/supabase/estimates";
import type { EstimateSummary } from "@/lib/estimates/types";

/**
 * Proposals for one scope — an org-wide list, or (with projectId) the
 * proposals tab inside a project. Reuses the app's Button/EmptyState/
 * StatusBadge and sonner toasts.
 */
export function ProposalsPanel({
  projectId = null,
  projectName,
}: {
  projectId?: string | null;
  projectName?: string;
}) {
  const router = useRouter();
  const { organization, canEdit } = useOrganization();
  const [rows, setRows] = useState<EstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    void listEstimates(organization.id, projectId)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load proposals");
      });
    return () => {
      cancelled = true;
    };
  }, [organization, projectId, reloadKey]);

  async function createNew() {
    if (!organization || creating) return;
    setCreating(true);
    try {
      const detail = await createEstimate(
        organization.id,
        blankEstimateContent(
          projectId,
          projectName ? `${projectName} proposal` : "Untitled proposal"
        )
      );
      router.push(`/proposals/${detail.estimate.id}`);
    } catch (err) {
      toast.error("Could not create proposal", {
        description: err instanceof Error ? err.message : undefined,
      });
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-heading">Proposals</h2>
          <p className="text-sm text-muted-foreground">
            Structured, versioned estimates with approval workflow and
            client-ready proposal documents.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => void createNew()} disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New Proposal
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      ) : rows === null ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading proposals…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No proposals yet"
          description={
            canEdit
              ? "Create one here, or generate one from the AI Assistant and convert it."
              : "Proposals created for this scope will appear here."
          }
          className="border-dashed"
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/proposals/${row.id}`)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    EST-{String(row.number).padStart(4, "0")}
                    {row.version > 1 ? ` v${row.version}` : ""}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.title}</td>
                  <td className="px-3 py-2">
                    <ProposalStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatCents(row.totalCents)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {new Date(row.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
