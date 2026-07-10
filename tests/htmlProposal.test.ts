import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProposalHtml } from '../lib/proposals/htmlProposal.ts';

test('renders grouped proposal totals and business terms', () => {
  const html = renderProposalHtml({
    companyName: 'Northwest Exteriors',
    businessInfo: {
      license_number: 'LIC-123',
      default_payment_terms: '50% deposit, 50% completion',
      default_warranty_period: '2 years labor',
    },
    project: {
      name: 'Smith Residence',
      clientName: 'Jane Smith',
      address: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      zipCode: '98101',
    },
    takeoff: {
      name: 'Exterior Renovation',
      markupPercent: 10,
    },
    sections: [{ id: 'section-1', section_name: 'Siding' }],
    lineItems: [{
      id: 'item-1',
      section_id: 'section-1',
      description: 'Fiber cement siding',
      quantity: 10,
      unit: 'SQ',
      material_unit_cost: 100,
      labor_unit_cost: 50,
    }],
    generatedAt: new Date('2026-07-10T12:00:00Z'),
  });

  assert.match(html, /Northwest Exteriors/);
  assert.match(html, /Fiber cement siding/);
  assert.match(html, /\$1,500\.00/);
  assert.match(html, /\$1,650\.00/);
  assert.match(html, /50% deposit, 50% completion/);
  assert.match(html, /2 years labor/);
});

test('escapes user-controlled proposal content and emits no scripts', () => {
  const html = renderProposalHtml({
    companyName: '<script>alert(1)</script>',
    project: {
      name: 'Project',
      clientName: 'Client <b>Name</b>',
      address: '1 & 2 Main',
    },
    takeoff: { name: 'Proposal' },
    sections: [{ id: 'section-1', section_name: '<img src=x onerror=alert(1)>' }],
    lineItems: [{
      id: 'item-1',
      section_id: 'section-1',
      description: '<script>bad()</script>',
      quantity: 1,
      line_total: 25,
    }],
    generatedAt: new Date('2026-07-10T12:00:00Z'),
  });

  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img src=x/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Client &lt;b&gt;Name&lt;\/b&gt;/);
  assert.match(html, /1 &amp; 2 Main/);
});

