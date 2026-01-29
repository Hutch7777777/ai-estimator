/**
 * Test Cases for Manufacturer-Aware Auto-Scope
 *
 * Copy this file to: exterior-estimation-api/tests/manufacturer-autoscope.test.ts
 */

import {
  buildManufacturerGroups,
  generateAutoScopeItemsV2,
  buildMeasurementContext,
} from '../src/calculations/siding/autoscope-v2';
import { getPricingByIds } from '../src/services/pricing';
import { ManufacturerGroups } from '../src/types/autoscope';

// Mock the pricing service
jest.mock('../src/services/pricing', () => ({
  getPricingByIds: jest.fn(),
  getPricingBySkus: jest.fn().mockResolvedValue(new Map()),
  calculateTotalLabor: jest.fn((base) => base * 1.1395),
}));

// Mock database service
jest.mock('../src/services/database', () => ({
  isDatabaseConfigured: jest.fn().mockReturnValue(true),
  getSupabaseClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: getMockRules(),
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

// Mock rules for testing
function getMockRules() {
  return [
    // Generic rule - WRB
    {
      rule_id: 1,
      rule_name: 'HardieWrap Weather Barrier',
      material_sku: 'HWRAP-9X100',
      quantity_formula: 'Math.ceil(facade_area_sqft / 1350)',
      unit: 'ROLL',
      output_unit: 'ROLL',
      trigger_condition: { always: true },
      presentation_group: 'Flashing & Weatherproofing',
      material_category: 'water_barrier',
      manufacturer_filter: null, // Generic
      group_order: 1,
      item_order: 1,
      priority: 1,
      active: true,
    },
    // James Hardie specific - Nails
    {
      rule_id: 2,
      rule_name: 'Siding Nails (Stainless Steel)',
      material_sku: 'NAIL-JH-SS-1LB',
      quantity_formula: 'Math.ceil(facade_area_sqft / 100)',
      unit: 'BOX',
      output_unit: 'BOX',
      trigger_condition: { always: true },
      presentation_group: 'Fasteners',
      material_category: 'fasteners',
      manufacturer_filter: ['James Hardie'], // Hardie specific
      group_order: 5,
      item_order: 1,
      priority: 1,
      active: true,
    },
    // FastPlank specific - Clips
    {
      rule_id: 3,
      rule_name: 'FastPlank Plank Clips (100/bag)',
      material_sku: 'FP-P22-CLIP',
      quantity_formula: 'Math.ceil(facade_area_sqft / 90)',
      unit: 'BAG',
      output_unit: 'BAG',
      trigger_condition: { always: true },
      presentation_group: 'Fasteners',
      material_category: 'fasteners',
      manufacturer_filter: ['Engage Building Products'], // FastPlank specific
      group_order: 5,
      item_order: 2,
      priority: 1,
      active: true,
    },
    // FastPlank specific - Screws
    {
      rule_id: 4,
      rule_name: 'FastPlank Wood Screws (250/bag)',
      material_sku: 'FP-WS112',
      quantity_formula: 'Math.ceil(facade_area_sqft / 200)',
      unit: 'BAG',
      output_unit: 'BAG',
      trigger_condition: { always: true },
      presentation_group: 'Fasteners',
      material_category: 'fasteners',
      manufacturer_filter: ['Engage Building Products'],
      group_order: 5,
      item_order: 3,
      priority: 1,
      active: true,
    },
  ];
}

describe('Manufacturer-Aware Auto-Scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildManufacturerGroups', () => {
    it('should group assignments by manufacturer', async () => {
      // Mock pricing lookup to return manufacturer info
      (getPricingByIds as jest.Mock).mockResolvedValue(
        new Map([
          ['uuid-hardie-1', { id: 'uuid-hardie-1', manufacturer: 'James Hardie', sku: 'HP-LAP-8' }],
          ['uuid-fastplank-1', { id: 'uuid-fastplank-1', manufacturer: 'Engage Building Products', sku: 'FP-PLANK' }],
        ])
      );

      const assignments = [
        { pricing_item_id: 'uuid-hardie-1', quantity: 800, unit: 'SF' },
        { pricing_item_id: 'uuid-fastplank-1', quantity: 700, unit: 'SF' },
      ];

      const groups = await buildManufacturerGroups(assignments);

      expect(Object.keys(groups)).toHaveLength(2);
      expect(groups['James Hardie']).toBeDefined();
      expect(groups['James Hardie'].area_sqft).toBe(800);
      expect(groups['Engage Building Products']).toBeDefined();
      expect(groups['Engage Building Products'].area_sqft).toBe(700);
    });

    it('should aggregate multiple items from same manufacturer', async () => {
      (getPricingByIds as jest.Mock).mockResolvedValue(
        new Map([
          ['uuid-1', { id: 'uuid-1', manufacturer: 'James Hardie', sku: 'HP-LAP-8' }],
          ['uuid-2', { id: 'uuid-2', manufacturer: 'James Hardie', sku: 'HP-LAP-6' }],
        ])
      );

      const assignments = [
        { pricing_item_id: 'uuid-1', quantity: 500, unit: 'SF' },
        { pricing_item_id: 'uuid-2', quantity: 300, unit: 'SF' },
      ];

      const groups = await buildManufacturerGroups(assignments);

      expect(Object.keys(groups)).toHaveLength(1);
      expect(groups['James Hardie'].area_sqft).toBe(800);
    });

    it('should handle linear feet separately', async () => {
      (getPricingByIds as jest.Mock).mockResolvedValue(
        new Map([
          ['uuid-1', { id: 'uuid-1', manufacturer: 'James Hardie', sku: 'HP-TRIM-4' }],
        ])
      );

      const assignments = [
        { pricing_item_id: 'uuid-1', quantity: 100, unit: 'LF' },
      ];

      const groups = await buildManufacturerGroups(assignments);

      expect(groups['James Hardie'].area_sqft).toBe(0);
      expect(groups['James Hardie'].linear_ft).toBe(100);
    });

    it('should return empty object for no assignments', async () => {
      const groups = await buildManufacturerGroups([]);
      expect(groups).toEqual({});
    });
  });

  describe('generateAutoScopeItemsV2', () => {
    it('should apply manufacturer-specific rules only to matching manufacturers', async () => {
      const manufacturerGroups: ManufacturerGroups = {
        'James Hardie': {
          manufacturer: 'James Hardie',
          area_sqft: 800,
          linear_ft: 120,
          piece_count: 0,
          detection_ids: [],
        },
        'Engage Building Products': {
          manufacturer: 'Engage Building Products',
          area_sqft: 700,
          linear_ft: 100,
          piece_count: 0,
          detection_ids: [],
        },
      };

      const result = await generateAutoScopeItemsV2(
        undefined, // extractionId
        { facade_sqft: 1500 }, // webhookMeasurements (total)
        undefined, // organizationId
        { manufacturerGroups }
      );

      // Should have generic WRB (for 1500 SF)
      const wrbItems = result.line_items.filter(i => i.sku === 'HWRAP-9X100');
      expect(wrbItems.length).toBe(1);
      expect(wrbItems[0].quantity).toBe(Math.ceil(1500 / 1350)); // 2 rolls

      // Should have Hardie nails (for 800 SF only)
      const hardieNails = result.line_items.filter(i => i.sku === 'NAIL-JH-SS-1LB');
      expect(hardieNails.length).toBe(1);
      expect(hardieNails[0].quantity).toBe(Math.ceil(800 / 100)); // 8 boxes
      expect(hardieNails[0].description).toContain('James Hardie');

      // Should have FastPlank clips (for 700 SF only)
      const fpClips = result.line_items.filter(i => i.sku === 'FP-P22-CLIP');
      expect(fpClips.length).toBe(1);
      expect(fpClips[0].quantity).toBe(Math.ceil(700 / 90)); // 8 bags
      expect(fpClips[0].description).toContain('Engage Building Products');

      // Should have FastPlank screws (for 700 SF only)
      const fpScrews = result.line_items.filter(i => i.sku === 'FP-WS112');
      expect(fpScrews.length).toBe(1);
      expect(fpScrews[0].quantity).toBe(Math.ceil(700 / 200)); // 4 bags
    });

    it('should skip manufacturer-specific rules when no manufacturer groups', async () => {
      const result = await generateAutoScopeItemsV2(
        undefined,
        { facade_sqft: 1500 },
        undefined,
        { manufacturerGroups: {} } // No manufacturer groups
      );

      // Should only have generic WRB
      const wrbItems = result.line_items.filter(i => i.sku === 'HWRAP-9X100');
      expect(wrbItems.length).toBe(1);

      // Should NOT have manufacturer-specific items
      const hardieNails = result.line_items.filter(i => i.sku === 'NAIL-JH-SS-1LB');
      expect(hardieNails.length).toBe(0);

      const fpClips = result.line_items.filter(i => i.sku === 'FP-P22-CLIP');
      expect(fpClips.length).toBe(0);

      // Check skipped rules
      expect(result.rules_skipped).toContain('NAIL-JH-SS-1LB: no matching manufacturer groups');
      expect(result.rules_skipped).toContain('FP-P22-CLIP: no matching manufacturer groups');
    });

    it('should apply generic rules to total project area', async () => {
      const manufacturerGroups: ManufacturerGroups = {
        'James Hardie': {
          manufacturer: 'James Hardie',
          area_sqft: 800,
          linear_ft: 0,
          piece_count: 0,
          detection_ids: [],
        },
      };

      const result = await generateAutoScopeItemsV2(
        undefined,
        { facade_sqft: 1500 }, // Total is 1500, not 800
        undefined,
        { manufacturerGroups }
      );

      // WRB should use total 1500 SF, not manufacturer's 800 SF
      const wrbItems = result.line_items.filter(i => i.sku === 'HWRAP-9X100');
      expect(wrbItems.length).toBe(1);
      expect(wrbItems[0].quantity).toBe(Math.ceil(1500 / 1350)); // 2 rolls, not 1
    });

    it('should handle single manufacturer (James Hardie only)', async () => {
      const manufacturerGroups: ManufacturerGroups = {
        'James Hardie': {
          manufacturer: 'James Hardie',
          area_sqft: 1500,
          linear_ft: 220,
          piece_count: 0,
          detection_ids: [],
        },
      };

      const result = await generateAutoScopeItemsV2(
        undefined,
        { facade_sqft: 1500 },
        undefined,
        { manufacturerGroups }
      );

      // Should have Hardie accessories
      const hardieNails = result.line_items.filter(i => i.sku === 'NAIL-JH-SS-1LB');
      expect(hardieNails.length).toBe(1);
      expect(hardieNails[0].quantity).toBe(15); // 1500/100

      // Should NOT have FastPlank accessories
      const fpClips = result.line_items.filter(i => i.sku === 'FP-P22-CLIP');
      expect(fpClips.length).toBe(0);
    });

    it('should handle single manufacturer (FastPlank only)', async () => {
      const manufacturerGroups: ManufacturerGroups = {
        'Engage Building Products': {
          manufacturer: 'Engage Building Products',
          area_sqft: 1500,
          linear_ft: 220,
          piece_count: 0,
          detection_ids: [],
        },
      };

      const result = await generateAutoScopeItemsV2(
        undefined,
        { facade_sqft: 1500 },
        undefined,
        { manufacturerGroups }
      );

      // Should have FastPlank accessories
      const fpClips = result.line_items.filter(i => i.sku === 'FP-P22-CLIP');
      expect(fpClips.length).toBe(1);
      expect(fpClips[0].quantity).toBe(17); // ceil(1500/90)

      // Should NOT have Hardie accessories
      const hardieNails = result.line_items.filter(i => i.sku === 'NAIL-JH-SS-1LB');
      expect(hardieNails.length).toBe(0);
    });
  });

  describe('Integration: Full Flow', () => {
    it('should correctly calculate mixed manufacturer project', async () => {
      // Mock pricing for material assignments
      (getPricingByIds as jest.Mock).mockResolvedValue(
        new Map([
          ['hardie-uuid', { id: 'hardie-uuid', manufacturer: 'James Hardie', sku: 'HP-LAP-8', material_cost: 2.50 }],
          ['fp-uuid', { id: 'fp-uuid', manufacturer: 'Engage Building Products', sku: 'FP-PLANK', material_cost: 3.00 }],
        ])
      );

      // Step 1: Build manufacturer groups from material assignments
      const materialAssignments = [
        { pricing_item_id: 'hardie-uuid', quantity: 800, unit: 'SF', detection_id: 'd1' },
        { pricing_item_id: 'fp-uuid', quantity: 700, unit: 'SF', detection_id: 'd2' },
      ];

      const manufacturerGroups = await buildManufacturerGroups(materialAssignments);

      // Verify groups
      expect(manufacturerGroups['James Hardie'].area_sqft).toBe(800);
      expect(manufacturerGroups['Engage Building Products'].area_sqft).toBe(700);

      // Step 2: Generate auto-scope items
      const result = await generateAutoScopeItemsV2(
        undefined,
        { facade_sqft: 1500, openings_count: 10 },
        undefined,
        { manufacturerGroups, skipSidingPanels: true }
      );

      // Step 3: Verify results
      expect(result.line_items.length).toBeGreaterThan(0);

      // WRB uses total area
      const wrb = result.line_items.find(i => i.sku === 'HWRAP-9X100');
      expect(wrb).toBeDefined();
      expect(wrb!.quantity).toBe(2); // 1500/1350 = 2 rolls

      // Hardie nails use 800 SF
      const nails = result.line_items.find(i => i.sku === 'NAIL-JH-SS-1LB');
      expect(nails).toBeDefined();
      expect(nails!.quantity).toBe(8); // 800/100 = 8 boxes

      // FastPlank clips use 700 SF
      const clips = result.line_items.find(i => i.sku === 'FP-P22-CLIP');
      expect(clips).toBeDefined();
      expect(clips!.quantity).toBe(8); // 700/90 = 8 bags
    });
  });
});
