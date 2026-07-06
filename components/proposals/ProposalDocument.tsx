"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEstimateSnapshot } from "@/lib/supabase/estimates";
import { formatCents } from "@/lib/estimates/money";
import { formatBps } from "@/lib/estimates/pricing";
import type { EstimateSnapshot } from "@/lib/estimates/types";

/** Immutable, print-ready client proposal document rendered from a snapshot. */
export function ProposalDocument({
  estimateId,
  snapshotId,
}: {
  estimateId: string;
  snapshotId: string;
}) {
  const [snapshot, setSnapshot] = useState<EstimateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEstimateSnapshot(snapshotId)
      .then((data) => {
        if (cancelled) return;
        if (data && data.estimateId === estimateId) setSnapshot(data);
        else setError("Proposal document not found.");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [estimateId, snapshotId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-[#64748b]">
        {error}{" "}
        <Link href={`/proposals/${estimateId}`} className="font-medium text-[#00cc6a] underline">
          Back to proposal
        </Link>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#94a3b8]" />
      </div>
    );
  }

  const doc = snapshot.content;
  const { totals } = doc;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="no-print mb-4 flex items-center gap-3">
          <Link href={`/proposals/${estimateId}`} className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#0f172a]">
            <ArrowLeft className="h-4 w-4" /> Back to proposal
          </Link>
          <div className="ml-auto">
            <Button size="sm" type="button" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
        </div>

        <article className="rounded-md border border-[#e2e8f0] bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <header className="border-b border-[#e2e8f0] pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#94a3b8]">Proposal</p>
            <h1 className="mt-1 text-xl font-bold text-[#0f172a] font-heading">{doc.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#64748b]">
              <span>{doc.organizationName}</span>
              {doc.projectName ? <span>Project: {doc.projectName}</span> : null}
              <span>EST-{String(doc.number).padStart(4, "0")} · Rev {doc.version}</span>
              <span>{new Date(doc.generatedAt).toLocaleDateString()}</span>
            </div>
          </header>

          {doc.sections.map((section) => (
            <section key={section.id} className="mt-6">
              <h2 className="text-sm font-semibold text-[#0f172a]">{section.title}</h2>
              {section.description ? <p className="mt-1 text-xs leading-5 text-[#64748b]">{section.description}</p> : null}
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0] text-[#94a3b8]">
                    <th className="py-1 pr-2 font-medium">Description</th>
                    <th className="w-16 py-1 pr-2 text-right font-medium">Qty</th>
                    <th className="w-14 py-1 pr-2 font-medium">Unit</th>
                    <th className="w-24 py-1 pr-2 text-right font-medium">Unit cost</th>
                    <th className="w-24 py-1 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.id} className="border-b border-[#f1f5f9]">
                      <td className="py-1.5 pr-2 text-[#334155]">
                        {item.description}
                        {item.kind === "allowance" ? <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">ALLOWANCE</span> : null}
                        {item.kind === "alternate" ? <span className="ml-1.5 rounded bg-[#f1f5f9] px-1 text-[10px] font-medium text-[#64748b]">ALTERNATE — not included</span> : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{item.quantity.toLocaleString()}</td>
                      <td className="py-1.5 pr-2 text-[#64748b]">{item.unit}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCents(item.unitCostCents)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCents(item.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <section className="mt-6 ml-auto max-w-xs">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-[#475569]"><dt>Subtotal</dt><dd className="tabular-nums">{formatCents(totals.subtotalCents)}</dd></div>
              {totals.markupCents > 0 ? <div className="flex justify-between text-[#475569]"><dt>Markup ({formatBps(doc.pricing.markupBps)})</dt><dd className="tabular-nums">{formatCents(totals.markupCents)}</dd></div> : null}
              {totals.overheadCents > 0 ? <div className="flex justify-between text-[#475569]"><dt>Overhead ({formatBps(doc.pricing.overheadBps)})</dt><dd className="tabular-nums">{formatCents(totals.overheadCents)}</dd></div> : null}
              {totals.contingencyCents > 0 ? <div className="flex justify-between text-[#475569]"><dt>Contingency ({formatBps(doc.pricing.contingencyBps)})</dt><dd className="tabular-nums">{formatCents(totals.contingencyCents)}</dd></div> : null}
              {totals.taxCents > 0 ? <div className="flex justify-between text-[#475569]"><dt>Tax ({formatBps(doc.pricing.taxBps)})</dt><dd className="tabular-nums">{formatCents(totals.taxCents)}</dd></div> : null}
              <div className="flex justify-between border-t border-[#cbd5e1] pt-1 text-base font-semibold text-[#0f172a]"><dt>Total</dt><dd className="tabular-nums">{formatCents(totals.totalCents)}</dd></div>
            </dl>
          </section>

          {doc.assumptions.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-[#0f172a]">Assumptions</h2>
              <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#64748b]">{doc.assumptions.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </section>
          ) : null}
          {doc.exclusions.length > 0 ? (
            <section className="mt-4">
              <h2 className="text-sm font-semibold text-[#0f172a]">Exclusions</h2>
              <ul className="mt-1 list-disc pl-5 text-xs leading-5 text-[#64748b]">{doc.exclusions.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-[#e2e8f0] pt-3 text-[10px] text-[#94a3b8]">
            Generated by EstimatePros on {new Date(doc.generatedAt).toLocaleString()}. Reflects EST-{String(doc.number).padStart(4, "0")} revision {doc.version} at time of generation.
          </footer>
        </article>
      </div>
    </div>
  );
}
