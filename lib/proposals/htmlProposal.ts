export interface ProposalBusinessInfo {
  license_number?: string | null;
  default_payment_terms?: string | null;
  default_warranty_period?: string | null;
  company_tagline?: string | null;
  estimate_contact_phone?: string | null;
  estimate_contact_email?: string | null;
}

export interface ProposalSection {
  id: string;
  section_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  display_order?: number | null;
  sort_order?: number | null;
  notes?: string | null;
}

export interface ProposalLineItem {
  id: string;
  section_id: string;
  description: string;
  quantity?: number | string | null;
  unit?: string | null;
  line_total?: number | string | null;
  material_unit_cost?: number | string | null;
  labor_unit_cost?: number | string | null;
  equipment_unit_cost?: number | string | null;
  item_number?: number | null;
  is_deleted?: boolean | null;
}

export interface ProposalDocumentInput {
  companyName: string;
  businessInfo?: ProposalBusinessInfo;
  project: {
    name: string;
    clientName: string;
    address: string;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  };
  takeoff: {
    name: string;
    status?: string | null;
    subtotal?: number | string | null;
    markupPercent?: number | string | null;
    markupAmount?: number | string | null;
    finalPrice?: number | string | null;
    createdAt?: string | null;
  };
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  generatedAt?: Date;
}

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatCurrency = (value: number): string => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const calculateLineTotal = (item: ProposalLineItem): number => {
  if (item.line_total !== null && item.line_total !== undefined) {
    return toNumber(item.line_total);
  }
  const quantity = toNumber(item.quantity);
  return quantity * (
    toNumber(item.material_unit_cost)
    + toNumber(item.labor_unit_cost)
    + toNumber(item.equipment_unit_cost)
  );
};

export function renderProposalHtml(input: ProposalDocumentInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const activeItems = input.lineItems.filter((item) => !item.is_deleted);
  const sortedSections = [...input.sections].sort((a, b) =>
    (a.display_order ?? a.sort_order ?? 0) - (b.display_order ?? b.sort_order ?? 0)
  );
  const calculatedSubtotal = activeItems.reduce(
    (sum, item) => sum + calculateLineTotal(item),
    0
  );
  const subtotal = input.takeoff.subtotal !== null && input.takeoff.subtotal !== undefined
    ? toNumber(input.takeoff.subtotal)
    : calculatedSubtotal;
  const markupPercent = toNumber(input.takeoff.markupPercent);
  const markupAmount = input.takeoff.markupAmount !== null && input.takeoff.markupAmount !== undefined
    ? toNumber(input.takeoff.markupAmount)
    : subtotal * (markupPercent / 100);
  const finalPrice = input.takeoff.finalPrice !== null && input.takeoff.finalPrice !== undefined
    ? toNumber(input.takeoff.finalPrice)
    : subtotal + markupAmount;
  const address = [
    input.project.address,
    [input.project.city, input.project.state, input.project.zipCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  const sectionRows = sortedSections.map((section) => {
    const items = activeItems
      .filter((item) => item.section_id === section.id)
      .sort((a, b) => (a.item_number ?? 0) - (b.item_number ?? 0));
    if (items.length === 0) return '';

    const sectionTotal = items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
    const itemRows = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="number">${escapeHtml(toNumber(item.quantity).toFixed(2))}</td>
        <td>${escapeHtml(item.unit || 'EA')}</td>
        <td class="number">${escapeHtml(formatCurrency(calculateLineTotal(item)))}</td>
      </tr>`).join('');

    const sectionName = section.display_name || section.section_name || section.name || 'Scope';
    return `
      <section>
        <h2>${escapeHtml(sectionName)}</h2>
        ${section.notes ? `<p class="section-note">${escapeHtml(section.notes)}</p>` : ''}
        <table>
          <thead><tr><th>Description</th><th class="number">Qty</th><th>Unit</th><th class="number">Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="3">Section total</td><td class="number">${escapeHtml(formatCurrency(sectionTotal))}</td></tr></tfoot>
        </table>
      </section>`;
  }).join('');

  const businessInfo = input.businessInfo ?? {};
  const contactParts = [businessInfo.estimate_contact_phone, businessInfo.estimate_contact_email]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.takeoff.name)} — ${escapeHtml(input.project.clientName)}</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #64748b; --brand: #087a4d; --line: #dbe3ec; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fa; color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { width: min(920px, calc(100% - 32px)); margin: 32px auto; background: white; padding: 48px; border: 1px solid var(--line); border-radius: 12px; }
    header { display: flex; justify-content: space-between; gap: 32px; padding-bottom: 24px; border-bottom: 3px solid var(--brand); }
    h1 { margin: 0; font-size: 30px; }
    h2 { margin: 28px 0 10px; color: var(--brand); font-size: 19px; }
    .tagline, .muted, .section-note { color: var(--muted); }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 36px; margin: 28px 0; }
    .label { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .number { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; }
    .totals { width: min(420px, 100%); margin: 32px 0 0 auto; }
    .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals .grand { margin-top: 8px; padding-top: 14px; border-top: 2px solid var(--brand); color: var(--brand); font-size: 21px; font-weight: 800; }
    .terms { margin-top: 36px; padding: 20px; background: #f8fafc; border-radius: 8px; }
    footer { margin-top: 32px; color: var(--muted); font-size: 12px; text-align: center; }
    @media print { body { background: white; } .page { width: 100%; margin: 0; border: 0; padding: 24px; } }
    @media (max-width: 640px) { .page { padding: 24px; } header { display: block; } .meta { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>${escapeHtml(input.companyName)}</h1>
        ${businessInfo.company_tagline ? `<div class="tagline">${escapeHtml(businessInfo.company_tagline)}</div>` : ''}
        ${contactParts ? `<div class="muted">${contactParts}</div>` : ''}
      </div>
      <div>
        <div class="label">Proposal</div>
        <strong>${escapeHtml(input.takeoff.name)}</strong>
        <div class="muted">${escapeHtml(generatedAt.toLocaleDateString('en-US'))}</div>
      </div>
    </header>

    <div class="meta">
      <div><div class="label">Prepared for</div><strong>${escapeHtml(input.project.clientName)}</strong></div>
      <div><div class="label">Project</div><strong>${escapeHtml(input.project.name)}</strong></div>
      <div><div class="label">Project address</div>${escapeHtml(address)}</div>
      ${businessInfo.license_number ? `<div><div class="label">License</div>${escapeHtml(businessInfo.license_number)}</div>` : ''}
    </div>

    ${sectionRows || '<p>No proposal line items are available.</p>'}

    <div class="totals">
      <div><span>Subtotal</span><strong>${escapeHtml(formatCurrency(subtotal))}</strong></div>
      ${markupAmount ? `<div><span>Markup (${escapeHtml(markupPercent.toFixed(2))}%)</span><strong>${escapeHtml(formatCurrency(markupAmount))}</strong></div>` : ''}
      <div class="grand"><span>Proposal total</span><span>${escapeHtml(formatCurrency(finalPrice))}</span></div>
    </div>

    ${(businessInfo.default_payment_terms || businessInfo.default_warranty_period) ? `
    <div class="terms">
      <h2>Terms</h2>
      ${businessInfo.default_payment_terms ? `<p><strong>Payment:</strong> ${escapeHtml(businessInfo.default_payment_terms)}</p>` : ''}
      ${businessInfo.default_warranty_period ? `<p><strong>Warranty:</strong> ${escapeHtml(businessInfo.default_warranty_period)}</p>` : ''}
    </div>` : ''}

    <footer>Generated by Estimate.ai on ${escapeHtml(generatedAt.toLocaleString('en-US'))}</footer>
  </main>
</body>
</html>`;
}

