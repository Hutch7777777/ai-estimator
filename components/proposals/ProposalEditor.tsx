"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/UserMenu";
import { ProposalStatusBadge } from "@/components/proposals/proposal-status-badge";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { computeEstimateTotals, formatBps } from "@/lib/estimates/pricing";
import { formatCents } from "@/lib/estimates/money";
import { isEditable, isRevisable } from "@/lib/estimates/workflow";
import {
  getEstimateDetail,
  reviseEstimate,
  setEstimateStatus,
  snapshotEstimate,
  updateEstimateContent,
} from "@/lib/supabase/estimates";
import type {
  CostType,
  EstimateContentInput,
  EstimateDetail,
  EstimateItemInput,
  ItemKind,
} from "@/lib/estimates/types";

interface Row {
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitCostDollars: string;
  costType: CostType;
  kind: ItemKind;
  taxable: boolean;
}
interface SectionDraft {
  key: string;
  title: string;
  description: string;
  items: Row[];
}
interface Draft {
  title: string;
  projectId: string | null;
  sections: SectionDraft[];
  markupPct: string;
  overheadPct: string;
  contingencyPct: string;
  taxPct: string;
  assumptions: string;
  exclusions: string;
}

const COST_TYPES: CostType[] = ["labor", "material", "equipment", "subcontractor", "other"];
const KINDS: ItemKind[] = ["base", "allowance", "alternate"];
const rid = () => Math.random().toString(36).slice(2);
const input =
  "w-full rounded-sm border border-[#e2e8f0] bg-white px-2 py-1 text-sm focus:border-[#00cc6a] focus:outline-none disabled:bg-[#f8fafc] disabled:text-[#94a3b8]";

function toDraft(detail: EstimateDetail): Draft {
  const { estimate } = detail;
  return {
    title: estimate.title,
    projectId: estimate.projectId,
    sections: estimate.sections.map((section) => ({
      key: section.id,
      title: section.title,
      description: section.description ?? "",
      items: section.items.map((item) => ({
        key: item.id,
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit,
        unitCostDollars: (item.unitCostCents / 100).toFixed(2),
        costType: item.costType,
        kind: item.kind,
        taxable: item.taxable,
      })),
    })),
    markupPct: String(estimate.pricing.markupBps / 100),
    overheadPct: String(estimate.pricing.overheadBps / 100),
    contingencyPct: String(estimate.pricing.contingencyBps / 100),
    taxPct: String(estimate.pricing.taxBps / 100),
    assumptions: estimate.assumptions.join("\n"),
    exclusions: estimate.exclusions.join("\n"),
  };
}

function pctToBps(value: string): number {
  const parsed = Number(value.trim() === "" ? "0" : value);
  return !Number.isFinite(parsed) || parsed < 0 ? Number.NaN : Math.round(parsed * 100);
}

function toContent(draft: Draft): EstimateContentInput | null {
  if (!draft.title.trim()) return null;
  const pricing = {
    markupBps: pctToBps(draft.markupPct),
    overheadBps: pctToBps(draft.overheadPct),
    contingencyBps: pctToBps(draft.contingencyPct),
    taxBps: pctToBps(draft.taxPct),
  };
  if (Object.values(pricing).some((bps) => Number.isNaN(bps))) return null;
  const sections = [];
  for (const section of draft.sections) {
    if (!section.title.trim()) return null;
    const items: EstimateItemInput[] = [];
    for (const row of section.items) {
      const quantity = Number(row.quantity);
      const dollars = Number(row.unitCostDollars);
      if (
        !row.description.trim() ||
        !row.unit.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(dollars) ||
        dollars < 0
      ) {
        return null;
      }
      items.push({
        description: row.description.trim(),
        quantity,
        unit: row.unit.trim(),
        unitCostCents: Math.round(dollars * 100),
        costType: row.costType,
        kind: row.kind,
        taxable: row.taxable,
        notes: null,
      });
    }
    sections.push({
      title: section.title.trim(),
      description: section.description.trim() || null,
      items,
    });
  }
  if (sections.length === 0) return null;
  const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    title: draft.title.trim(),
    projectId: draft.projectId,
    sections,
    pricing,
    assumptions: lines(draft.assumptions),
    exclusions: lines(draft.exclusions),
  };
}

export function ProposalEditor({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const { canEdit } = useOrganization();
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getEstimateDetail(estimateId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setDetail(data);
          setDraft(toDraft(data));
        } else {
          setLoadError("Proposal not found.");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [estimateId]);

  const content = useMemo(() => (draft ? toContent(draft) : null), [draft]);
  const totals = useMemo(() => {
    if (!content) return null;
    try {
      return computeEstimateTotals(
        content.sections.flatMap((s) => s.items),
        content.pricing
      );
    } catch {
      return null;
    }
  }, [content]);

  function edit(mutate: (d: Draft) => Draft) {
    setDraft((current) => (current ? mutate(current) : current));
    setDirty(true);
  }
  function apply(updated: EstimateDetail) {
    setDetail(updated);
    setDraft(toDraft(updated));
    setDirty(false);
  }

  async function run(label: string, action: () => Promise<EstimateDetail>) {
    if (pending) return;
    setPending(label);
    try {
      apply(await action());
    } catch (err) {
      toast.error("Action failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPending(null);
    }
  }

  async function save() {
    if (!content) {
      toast.error("Fix invalid fields before saving", {
        description: "Every item needs a description, unit, positive quantity, and cost.",
      });
      return;
    }
    await run("save", () => updateEstimateContent(estimateId, content));
    toast.success("Proposal saved");
  }

  async function generateProposal() {
    if (pending) return;
    setPending("snapshot");
    try {
      const snapshot = await snapshotEstimate(estimateId);
      router.push(`/proposals/${estimateId}/document/${snapshot.id}`);
    } catch (err) {
      toast.error("Could not generate proposal", {
        description: err instanceof Error ? err.message : undefined,
      });
      setPending(null);
    }
  }

  async function revise() {
    if (pending) return;
    setPending("revise");
    try {
      const revision = await reviseEstimate(estimateId);
      router.push(`/proposals/${revision.estimate.id}`);
    } catch (err) {
      toast.error("Could not revise", {
        description: err instanceof Error ? err.message : undefined,
      });
      setPending(null);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-[#64748b]">
        {loadError}{" "}
        <Link href="/proposals" className="font-medium text-[#00cc6a] underline">
          Back to proposals
        </Link>
      </div>
    );
  }
  if (!detail || !draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#94a3b8]" />
      </div>
    );
  }

  const { estimate } = detail;
  const editing = canEdit && isEditable(estimate.status);
  const isLatest = detail.versions[0]?.id === estimate.id;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 lg:px-6">
        <header className="mb-5 flex flex-wrap items-center gap-3 border-b border-[#e2e8f0] pb-4">
          <Link
            href={estimate.projectId ? `/projects/${estimate.projectId}?tab=proposals` : "/proposals"}
            className="inline-flex items-center text-sm text-[#64748b] hover:text-[#0f172a]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
          <span className="font-mono text-sm text-[#64748b]">
            EST-{String(estimate.number).padStart(4, "0")} · v{estimate.version}
          </span>
          <ProposalStatusBadge status={estimate.status} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" type="button" onClick={() => void save()} disabled={Boolean(pending) || !dirty}>
                  {pending === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {dirty ? "Save" : "Saved"}
                </Button>
                <Button size="sm" variant="outline" type="button" disabled={Boolean(pending) || dirty}
                  onClick={() => void run("status", () => setEstimateStatus(estimateId, "in_review"))}>
                  Submit for review
                </Button>
              </>
            ) : null}
            {estimate.status === "in_review" && canEdit ? (
              <>
                <Button size="sm" variant="outline" type="button" disabled={Boolean(pending)}
                  onClick={() => void run("status", () => setEstimateStatus(estimateId, "draft"))}>
                  Back to draft
                </Button>
                <Button size="sm" type="button" disabled={Boolean(pending)}
                  onClick={() => void run("status", () => setEstimateStatus(estimateId, "approved"))}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
              </>
            ) : null}
            {estimate.status === "approved" && canEdit ? (
              <Button size="sm" type="button" disabled={Boolean(pending)}
                onClick={() => void run("status", () => setEstimateStatus(estimateId, "sent"))}>
                <Send className="h-4 w-4" /> Mark sent
              </Button>
            ) : null}
            {canEdit && isRevisable(estimate.status) && isLatest ? (
              <Button size="sm" variant="outline" type="button" disabled={Boolean(pending)} onClick={() => void revise()}>
                <GitBranch className="h-4 w-4" /> Revise
              </Button>
            ) : null}
            <Button size="sm" variant="outline" type="button" disabled={Boolean(pending) || dirty} onClick={() => void generateProposal()}>
              {pending === "snapshot" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate document
            </Button>
            <UserMenu />
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <section className="rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-3">
                <label className="flex-1 text-xs text-[#64748b]">
                  Title
                  <input value={draft.title} disabled={!editing}
                    onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))}
                    className={`${input} mt-1 text-base font-medium`} />
                </label>
              </div>
            </section>

            {draft.sections.map((section, si) => (
              <section key={section.key} className="rounded-md border border-[#e2e8f0] bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-[#e2e8f0] px-4 py-2.5">
                  <input value={section.title} disabled={!editing}
                    onChange={(e) => edit((d) => {
                      const sections = [...d.sections];
                      sections[si] = { ...section, title: e.target.value };
                      return { ...d, sections };
                    })}
                    className={`${input} flex-1 font-semibold`} placeholder="Section title" />
                  {editing && draft.sections.length > 1 ? (
                    <button type="button" aria-label="Remove section" className="text-[#94a3b8] hover:text-red-600"
                      onClick={() => edit((d) => ({ ...d, sections: d.sections.filter((s) => s.key !== section.key) }))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="overflow-x-auto p-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[#94a3b8]">
                        <th className="px-1.5 py-1 font-medium">Description</th>
                        <th className="w-20 px-1.5 py-1 font-medium">Qty</th>
                        <th className="w-16 px-1.5 py-1 font-medium">Unit</th>
                        <th className="w-24 px-1.5 py-1 font-medium">Unit $</th>
                        <th className="w-28 px-1.5 py-1 font-medium">Cost type</th>
                        <th className="w-24 px-1.5 py-1 font-medium">Kind</th>
                        <th className="w-10 px-1.5 py-1 font-medium">Tax</th>
                        <th className="w-24 px-1.5 py-1 text-right font-medium">Total</th>
                        {editing ? <th className="w-8" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((row, ri) => {
                        const q = Number(row.quantity);
                        const d = Number(row.unitCostDollars);
                        const lineTotal =
                          Number.isFinite(q) && Number.isFinite(d) && q > 0 && d >= 0
                            ? Math.floor(q * Math.round(d * 100) + 0.5)
                            : null;
                        const set = (patch: Partial<Row>) =>
                          edit((draftState) => {
                            const sections = [...draftState.sections];
                            const items = [...section.items];
                            items[ri] = { ...row, ...patch };
                            sections[si] = { ...section, items };
                            return { ...draftState, sections };
                          });
                        return (
                          <tr key={row.key} className="border-t border-[#f1f5f9]">
                            <td className="px-1.5 py-1"><input value={row.description} disabled={!editing} onChange={(e) => set({ description: e.target.value })} className={input} placeholder="Line item" /></td>
                            <td className="px-1.5 py-1"><input value={row.quantity} disabled={!editing} onChange={(e) => set({ quantity: e.target.value })} className={`${input} text-right`} inputMode="decimal" /></td>
                            <td className="px-1.5 py-1"><input value={row.unit} disabled={!editing} onChange={(e) => set({ unit: e.target.value })} className={input} /></td>
                            <td className="px-1.5 py-1"><input value={row.unitCostDollars} disabled={!editing} onChange={(e) => set({ unitCostDollars: e.target.value })} className={`${input} text-right`} inputMode="decimal" /></td>
                            <td className="px-1.5 py-1">
                              <select value={row.costType} disabled={!editing} onChange={(e) => set({ costType: e.target.value as CostType })} className={input}>
                                {COST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <select value={row.kind} disabled={!editing} onChange={(e) => set({ kind: e.target.value as ItemKind })} className={input}>
                                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1 text-center"><input type="checkbox" checked={row.taxable} disabled={!editing} onChange={(e) => set({ taxable: e.target.checked })} aria-label="Taxable" /></td>
                            <td className="px-1.5 py-1 text-right font-medium tabular-nums">{lineTotal === null ? "—" : formatCents(lineTotal)}</td>
                            {editing ? (
                              <td className="px-1.5 py-1 text-center">
                                <button type="button" aria-label="Remove item" className="text-[#cbd5e1] hover:text-red-600"
                                  onClick={() => edit((draftState) => {
                                    const sections = [...draftState.sections];
                                    sections[si] = { ...section, items: section.items.filter((i) => i.key !== row.key) };
                                    return { ...draftState, sections };
                                  })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {editing ? (
                    <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#64748b] hover:text-[#0f172a]"
                      onClick={() => edit((d) => {
                        const sections = [...d.sections];
                        sections[si] = { ...section, items: [...section.items, { key: rid(), description: "", quantity: "1", unit: "ea", unitCostDollars: "0.00", costType: "other", kind: "base", taxable: true }] };
                        return { ...d, sections };
                      })}>
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </button>
                  ) : null}
                </div>
              </section>
            ))}

            {editing ? (
              <button type="button" className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[#cbd5e1] px-3 py-1.5 text-sm text-[#64748b] hover:border-[#94a3b8] hover:text-[#0f172a]"
                onClick={() => edit((d) => ({ ...d, sections: [...d.sections, { key: rid(), title: "New section", description: "", items: [] }] }))}>
                <Plus className="h-4 w-4" /> Add section
              </button>
            ) : null}

            <section className="grid gap-3 rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm sm:grid-cols-2">
              <label className="text-xs text-[#64748b]">Assumptions (one per line)
                <textarea value={draft.assumptions} disabled={!editing} rows={4} onChange={(e) => edit((d) => ({ ...d, assumptions: e.target.value }))} className={`${input} mt-1`} />
              </label>
              <label className="text-xs text-[#64748b]">Exclusions (one per line)
                <textarea value={draft.exclusions} disabled={!editing} rows={4} onChange={(e) => edit((d) => ({ ...d, exclusions: e.target.value }))} className={`${input} mt-1`} />
              </label>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Pricing</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([["Markup %", "markupPct"], ["Overhead %", "overheadPct"], ["Contingency %", "contingencyPct"], ["Tax %", "taxPct"]] as const).map(([label, field]) => (
                  <label key={field} className="text-xs text-[#64748b]">{label}
                    <input value={draft[field]} disabled={!editing} inputMode="decimal" onChange={(e) => edit((d) => ({ ...d, [field]: e.target.value }))} className={`${input} mt-1 text-right`} />
                  </label>
                ))}
              </div>
              <dl className="mt-3 space-y-1 border-t border-[#f1f5f9] pt-3 text-sm">
                {totals ? (
                  <>
                    {([["Subtotal", totals.subtotalCents], ["Markup", totals.markupCents], ["Overhead", totals.overheadCents], ["Contingency", totals.contingencyCents], ["Tax", totals.taxCents]] as const).map(([label, cents]) => (
                      <div key={label} className="flex justify-between text-[#475569]"><dt>{label}</dt><dd className="tabular-nums">{formatCents(cents)}</dd></div>
                    ))}
                    <div className="flex justify-between border-t border-[#e2e8f0] pt-1 font-semibold text-[#0f172a]"><dt>Total</dt><dd className="tabular-nums">{formatCents(totals.totalCents)}</dd></div>
                    {totals.allowanceCents > 0 ? <div className="flex justify-between text-xs text-amber-700"><dt>Incl. allowances</dt><dd className="tabular-nums">{formatCents(totals.allowanceCents)}</dd></div> : null}
                    {totals.alternateCents > 0 ? <div className="flex justify-between text-xs text-[#94a3b8]"><dt>Alternates (excl.)</dt><dd className="tabular-nums">{formatCents(totals.alternateCents)}</dd></div> : null}
                  </>
                ) : (
                  <p className="text-xs text-red-600">Totals unavailable — fix invalid fields.</p>
                )}
              </dl>
            </section>

            <section className="rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Versions</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    {v.id === estimate.id ? <span className="font-medium">v{v.version} (this)</span> : <Link href={`/proposals/${v.id}`} className="text-[#00cc6a] underline">v{v.version}</Link>}
                    <ProposalStatusBadge status={v.status} />
                    <span className="tabular-nums text-[#64748b]">{formatCents(v.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Proposal documents</h3>
              {detail.snapshots.length === 0 ? (
                <p className="mt-2 text-xs text-[#94a3b8]">None generated for this version yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.snapshots.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <Link href={`/proposals/${estimate.id}/document/${s.id}`} className="text-[#00cc6a] underline">{new Date(s.createdAt).toLocaleString()}</Link>
                      <span className="tabular-nums text-[#64748b]">{formatCents(s.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="rounded-md bg-[#f1f5f9] px-3 py-2 text-xs leading-5 text-[#64748b]">
              Percentages: markup {formatBps(pctToBps(draft.markupPct) || 0)}. Approved and sent versions are locked — use Revise to make changes.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
