/**
 * ============================================================================
 * VALIDATE & NORMALIZE MEASUREMENTS  —  EXACT MIRROR OF n8n V9.2
 * ============================================================================
 *
 * Source of truth: the "Validate & Normalize" Code node in the n8n workflow
 * "Approve from Detection Editor (V9.2)".
 *
 * This module preserves the n8n node's behavior EXACTLY, including:
 *   - Output shape (top-level keys + nested `measurements` shape).
 *   - Default values (markup 10, trim_system 'hardie', product names).
 *   - Coercion rules (`Number(x) || 0`).
 *   - The `selected_trades` filter (drop 'roofing', ensure 'siding' first).
 *   - The string-to-array coercion for `selected_trades`.
 *   - The `body = input.body || input` unwrap for direct vs webhook-wrapped JSON.
 *   - The thrown error on missing `job_id`.
 *   - `console.log` side-effects, including the V7.6 banner that the n8n node
 *     never updated.
 *
 * No improvements have been made. Do not "fix" defaults, ordering, log lines,
 * or coercion behavior here without first updating the upstream n8n node.
 * ============================================================================
 */

// The function takes whatever the webhook passed in; in n8n that is
// `$input.first().json` which may have a wrapping `body` property when the
// trigger is a webhook in raw mode.
type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeDetectionEditorApprovalPayload(input: unknown): AnyRecord {
  const root = (input ?? {}) as AnyRecord;
  const body: AnyRecord = (root.body as AnyRecord) || root;

  console.log('═'.repeat(60));
  console.log('✅ APPROVE FROM DETECTION EDITOR V7.6');
  console.log('═'.repeat(60));

  // Required fields
  const jobId = body.job_id;
  if (!jobId) {
    throw new Error('❌ job_id is required');
  }

  console.log(`📋 Job ID: ${jobId}`);
  console.log(`📋 Project: ${body.project_name || 'Not specified'}`);

  // Extract measurements with defaults
  const facade: AnyRecord = body.facade || {};
  const windows: AnyRecord = body.windows || {};
  const doors: AnyRecord = body.doors || {};
  const garages: AnyRecord = body.garages || {};
  const trim: AnyRecord = body.trim || {};
  const corners: AnyRecord = body.corners || {};
  const gables: AnyRecord = body.gables || {};
  const products: AnyRecord = body.products || {};

  // ============================================================================
  // NEW: Extract material_assignments from frontend
  // ============================================================================
  const materialAssignments: AnyRecord[] = body.material_assignments || [];
  const organizationId = body.organization_id || null;

  console.log(`📋 Material Assignments: ${materialAssignments.length} items`);
  if (materialAssignments.length > 0) {
    console.log(`   Sample: ${JSON.stringify(materialAssignments[0])}`);
  }

  // ============================================================================
  // NEW V7.6: Extract detection_counts for point markers
  // ============================================================================
  const detectionCounts: AnyRecord = body.detection_counts || {};
  const totalPointCount = body.total_point_count || 0;

  console.log(`📋 Detection Counts: ${Object.keys(detectionCounts).length} types, ${totalPointCount} total`);
  if (Object.keys(detectionCounts).length > 0) {
    Object.entries(detectionCounts).forEach(([_cls, info]) => {
      const i = info as AnyRecord;
      console.log(`   ${i.display_name}: ${i.count} ${i.unit}`);
    });
  }

  // ============================================================================
  // NEW V8.2.2: Extract estimate settings from frontend
  // ============================================================================
  const markupPercent = body.markup_percent ?? 10;
  const trimSystem = body.trim_system || body.products?.trim_system || 'hardie';
  const wrbProduct = body.wrb_product || body.products?.wrb_product || null;

  console.log('📋 Markup Percent: ' + markupPercent + '%');
  console.log('📋 Trim System: ' + trimSystem);
  console.log('📋 WRB Product: ' + (wrbProduct || 'not specified'));

  // ============================================================================
  // NEW: Extract unmatched_bluebeam_items for safety net passthrough
  // ============================================================================
  const unmatchedBluebeamItems: AnyRecord[] = body.unmatched_bluebeam_items || [];
  console.log(`📋 Unmatched Bluebeam Items: ${unmatchedBluebeamItems.length} items`);
  if (unmatchedBluebeamItems.length > 0) {
    unmatchedBluebeamItems.forEach((item) => {
      console.log(`   ⚠️ ${item.bluebeam_content} (${item.class}): ${item.total_area_sf || 0} SF, ${item.total_item_count || 0} ct`);
    });
  }

  // ============================================================================
  // SELECTED TRADES - Dynamic from frontend with safety filter
  // ============================================================================
  let selectedTrades: any = body.selected_trades || ['siding']; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof selectedTrades === 'string') {
    selectedTrades = [selectedTrades];
  }

  // Log what was received from frontend
  console.log(`📋 Trades received from frontend: ${JSON.stringify(body.selected_trades)}`);

  // SAFETY: Filter out 'roofing' - feature is disabled due to page_id bug
  const originalTrades: string[] = [...selectedTrades];
  selectedTrades = (selectedTrades as string[]).filter((trade: string) => trade !== 'roofing');

  if (originalTrades.length !== selectedTrades.length) {
    console.log(`⚠️ Filtered out 'roofing' trade (feature disabled)`);
  }

  // Ensure 'siding' is always included (core business)
  if (!(selectedTrades as string[]).includes('siding')) {
    (selectedTrades as string[]).unshift('siding');
    console.log(`📋 Added 'siding' trade (always required)`);
  }

  console.log(`📋 Final Selected Trades: ${(selectedTrades as string[]).join(', ')}`);

  // Validate we have minimum required data
  const grossArea = facade.gross_area_sf || 0;
  const _netSiding = facade.net_siding_sf || 0;

  if (grossArea === 0) {
    console.warn('⚠️ Warning: gross_area_sf is 0 - no exterior walls detected?');
  }

  // Build standardized measurements object
  const measurements = {
    // Source tracking
    source: 'detection_editor',
    extraction_id: jobId,

    // Facade measurements
    facade_gross_sf: Number(facade.gross_area_sf) || 0,
    facade_net_sf: Number(facade.net_siding_sf) || 0,
    facade_perimeter_lf: Number(facade.perimeter_lf) || 0,
    level_starter_lf: Number(facade.level_starter_lf) || 0,

    // Windows
    window_count: Number(windows.count) || 0,
    window_area_sf: Number(windows.area_sf) || 0,
    window_perimeter_lf: Number(windows.perimeter_lf) || 0,
    window_head_lf: Number(windows.head_lf) || 0,
    window_jamb_lf: Number(windows.jamb_lf) || 0,
    window_sill_lf: Number(windows.sill_lf) || 0,

    // Doors
    door_count: Number(doors.count) || 0,
    door_area_sf: Number(doors.area_sf) || 0,
    door_perimeter_lf: Number(doors.perimeter_lf) || 0,
    door_head_lf: Number(doors.head_lf) || 0,
    door_jamb_lf: Number(doors.jamb_lf) || 0,

    // Garages
    garage_count: Number(garages.count) || 0,
    garage_area_sf: Number(garages.area_sf) || 0,
    garage_perimeter_lf: Number(garages.perimeter_lf) || 0,
    garage_head_lf: Number(garages.head_lf) || 0,
    garage_jamb_lf: Number(garages.jamb_lf) || 0,

    // Corners
    outside_corner_count: Number(corners.outside_count) || 0,
    outside_corner_lf: Number(corners.outside_lf) || 0,
    inside_corner_count: Number(corners.inside_count) || 0,
    inside_corner_lf: Number(corners.inside_lf) || 0,

    // Gables
    gable_count: Number(gables.count) || 0,
    gable_area_sf: Number(gables.area_sf) || 0,
    gable_rake_lf: Number(gables.rake_lf) || 0,

    // Trim totals
    total_head_lf: Number(trim.total_head_lf) || 0,
    total_jamb_lf: Number(trim.total_jamb_lf) || 0,
    total_sill_lf: Number(trim.total_sill_lf) || 0,
    total_trim_lf: Number(trim.total_trim_lf) || 0,

    // Calculated totals
    total_opening_area_sf:
      (Number(windows.area_sf) || 0) +
      (Number(doors.area_sf) || 0) +
      (Number(garages.area_sf) || 0),
    total_opening_count:
      (Number(windows.count) || 0) +
      (Number(doors.count) || 0) +
      (Number(garages.count) || 0),
    siding_squares: (Number(facade.net_siding_sf) || 0) / 100,
  };

  console.log('\n📊 MEASUREMENTS SUMMARY:');
  console.log(`   Facade: ${measurements.facade_gross_sf.toFixed(1)} SF gross, ${measurements.facade_net_sf.toFixed(1)} SF net`);
  console.log(`   Windows: ${measurements.window_count} (${measurements.window_area_sf.toFixed(1)} SF)`);
  console.log(`   Doors: ${measurements.door_count} (${measurements.door_area_sf.toFixed(1)} SF)`);
  console.log(`   Garages: ${measurements.garage_count} (${measurements.garage_area_sf.toFixed(1)} SF)`);
  console.log(`   Outside Corners: ${measurements.outside_corner_count} (${measurements.outside_corner_lf.toFixed(1)} LF)`);
  console.log(`   Total Trim: ${measurements.total_trim_lf.toFixed(1)} LF`);
  console.log(`   Siding Squares: ${measurements.siding_squares.toFixed(2)}`);

  return {
    job_id: jobId,
    project_id: body.project_id || null,
    project_name: body.project_name || 'Untitled Project',
    client_name: body.client_name || '',
    address: body.address || '',
    selected_trades: selectedTrades,
    measurements: measurements,
    products: {
      siding_product: products.siding_product || 'HardiePlank 8.25" Cedarmill',
      siding_color: products.siding_color || 'Arctic White',
      trim_product: products.trim_product || 'HardieTrim 4/4',
      trim_color: products.trim_color || 'Arctic White',
    },

    // NEW: Pass through material assignments for ID-based pricing
    material_assignments: materialAssignments,
    organization_id: organizationId,

    // NEW V7.6: Pass through detection counts for point markers
    detection_counts: detectionCounts,
    total_point_count: totalPointCount,

    // NEW V8.2.2: Pass through estimate settings
    markup_percent: markupPercent,
    trim_system: trimSystem,
    wrb_product: wrbProduct,

    // V9.2: Pass full estimate_settings for Phase 2B
    estimate_settings: body.estimate_settings || null,

    // NEW: Unmatched Bluebeam items passthrough
    unmatched_bluebeam_items: unmatchedBluebeamItems,

    timestamp: new Date().toISOString(),
  };
}
