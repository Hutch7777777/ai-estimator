/**
 * scripts/verify-normalize-approval.ts
 *
 * Manual verification harness for `normalizeDetectionEditorApprovalPayload`.
 * Mirrors a realistic Detection Editor approval payload, runs it through the
 * package's public export, and prints the parts of the result we care about.
 *
 * Run with:
 *   npx tsx scripts/verify-normalize-approval.ts
 *
 * (The package isn't registered as an npm workspace yet, so we import via a
 * relative path. The `.js` extension matches the engine's ESM-style imports —
 * tsx resolves it back to the `.ts` source.)
 */

import { normalizeDetectionEditorApprovalPayload } from '../packages/estimating-engine/src/index.js';

// =============================================================================
// Realistic sample payload
// =============================================================================
// Loosely modeled on MN568 — a 2-story Hardie siding job with a garage,
// belly band, gable top-out, corbels, and a few unmatched Bluebeam items.
// `selected_trades` deliberately includes 'roofing' so the n8n filter rule
// (drop roofing, force-include siding) is exercised end-to-end.

const payload = {
  job_id: 'job-mn568-verify-001',
  project_id: 'proj-mn568',
  project_name: 'MN568 Verification Sample',
  client_name: 'Sample Client LLC',
  address: '568 Maple Ln, Minneapolis MN',

  // Note: roofing should be stripped, siding should be kept first.
  selected_trades: ['roofing', 'gutters', 'windows', 'siding'],

  facade: {
    gross_area_sf: 3200,
    net_siding_sf: 2740,
    perimeter_lf: 218,
    level_starter_lf: 218,
  },

  windows: {
    count: 12,
    area_sf: 168,
    perimeter_lf: 220,
    head_lf: 60,
    jamb_lf: 100,
    sill_lf: 60,
  },

  doors: {
    count: 2,
    area_sf: 42,
    perimeter_lf: 28,
    head_lf: 6,
    jamb_lf: 22,
  },

  garages: {
    count: 1,
    area_sf: 80,
    perimeter_lf: 36,
    head_lf: 16,
    jamb_lf: 20,
  },

  trim: {
    total_head_lf: 82,
    total_jamb_lf: 142,
    total_sill_lf: 60,
    total_trim_lf: 284,
  },

  corners: {
    outside_count: 8,
    outside_lf: 72,
    inside_count: 2,
    inside_lf: 18,
  },

  gables: {
    count: 2,
    area_sf: 240,
    rake_lf: 56,
  },

  products: {
    siding_product: 'HardiePlank 8.25" Cedarmill',
    siding_color: 'Iron Gray',
    trim_product: 'HardieTrim 4/4',
    trim_color: 'Arctic White',
    // products.trim_system / products.wrb_product are also accepted
    // as fallback sources by the adapter.
    trim_system: 'hardie' as const,
    wrb_product: 'Tyvek HomeWrap',
  },

  detection_counts: {
    corbel: {
      count: 4,
      display_name: 'Corbel',
      measurement_type: 'count' as const,
      unit: 'EA',
    },
    belly_band: {
      count: 1,
      total_lf: 64,
      display_name: 'Belly Band',
      measurement_type: 'linear' as const,
      unit: 'LF',
    },
    gable_topout: {
      count: 2,
      total_lf: 36,
      display_name: 'Gable Top-Out',
      measurement_type: 'linear' as const,
      unit: 'LF',
    },
  },
  total_point_count: 4,

  markup_percent: 18,
  trim_system: 'hardie' as const,
  wrb_product: 'Tyvek HomeWrap',

  estimate_settings: {
    markup_percent: 18,
    trim_system: 'hardie',
    window_trim: { include: true },
    door_trim: { include: true },
    belly_band: { include: true, manual_lf: null },
    gable_topout: { include: true },
  },

  material_assignments: [
    {
      detection_id: 'det-001',
      material_id: 'sku-hardieplank-825-cedarmill',
      class: 'siding',
    },
  ],

  organization_id: 'org-exterior-finishes',

  unmatched_bluebeam_items: [
    {
      bluebeam_content: '1" x 6" WW Trim Count = 12',
      class: 'trim',
      total_area_sf: 0,
      total_item_count: 12,
      annotation_count: 1,
    },
  ],
};

// =============================================================================
// Run + report
// =============================================================================

console.log('\n');
console.log('━'.repeat(60));
console.log('VERIFICATION: normalizeDetectionEditorApprovalPayload');
console.log('━'.repeat(60));

const result = normalizeDetectionEditorApprovalPayload(payload) as Record<string, unknown>;

console.log('\n── selected_trades ──');
console.log(result.selected_trades);

console.log('\n── measurements ──');
console.dir(result.measurements, { depth: null });

const measurements = result.measurements as Record<string, number>;

console.log('\n── derived totals ──');
console.log('siding_squares          :', measurements.siding_squares);
console.log('total_opening_area_sf   :', measurements.total_opening_area_sf);
console.log('total_opening_count     :', measurements.total_opening_count);

console.log('\n── products ──');
console.dir(result.products, { depth: null });

console.log('\n━'.repeat(60));
console.log('OK — adapter returned a result. Inspect logs above for any');
console.log('unexpected default fall-throughs (e.g. "Arctic White" appearing');
console.log('when the payload supplied a different color).');
console.log('━'.repeat(60));
console.log('\n');
