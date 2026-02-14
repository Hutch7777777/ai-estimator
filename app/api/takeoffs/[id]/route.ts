import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// =============================================================================
// Types
// =============================================================================

interface TakeoffRecord {
  id: string;
  project_id?: string;
  takeoff_name?: string;
  project_name?: string;
  client_name?: string;
  address?: string;
  total_material_cost?: number;
  total_labor_cost?: number;
  total_overhead_cost?: number;
  subtotal?: number;
  markup_percent?: number;
  final_price?: number;
  squares?: number;
  created_at?: string;
  [key: string]: unknown;
}

interface LineItemRecord {
  id: string;
  description: string;
  quantity?: number;
  unit?: string;
  material_unit_cost?: number;
  labor_unit_cost?: number;
  equipment_unit_cost?: number;
  material_extended?: number;
  labor_extended?: number;
  line_total?: number;
  presentation_group?: string;
  category?: string;
  item_number?: number;
  item_type?: 'material' | 'labor' | 'overhead' | 'paint';
  sku?: string;
  notes?: string;
  formula_used?: string;
  size_display?: string;
  [key: string]: unknown;
}

interface LaborItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  notes?: string;
}

interface OverheadItem {
  id: string;
  description: string;
  amount: number;
  notes?: string;
}

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get takeoff header
    const { data: takeoffData, error: takeoffError } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('id', id)
      .single();

    if (takeoffError) {
      console.error('[API] Takeoff fetch error:', takeoffError);
      return NextResponse.json(
        { success: false, error: 'Takeoff not found' },
        { status: 404 }
      );
    }

    const takeoff = takeoffData as unknown as TakeoffRecord;

    // Get extraction job ID for this project (needed for "Back to Editor" link)
    let extractionJobId: string | null = null;
    if (takeoff.project_id) {
      const { data: jobData } = await supabase
        .from('extraction_jobs')
        .select('id')
        .eq('project_id', takeoff.project_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (jobData) {
        extractionJobId = jobData.id;
      }
    }

    // Get all line items ordered by presentation group and item number
    const { data: allItemsData, error: itemsError } = await supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', id)
      .order('presentation_group', { ascending: true })
      .order('item_number', { ascending: true });

    if (itemsError) {
      console.error('[API] Line items fetch error:', itemsError);
    }

    const allItems = (allItemsData || []) as LineItemRecord[];

    // ==========================================================================
    // Separate items by item_type
    // ==========================================================================

    // Material and Paint items (returned in line_items array)
    // Paint items have item_type='paint', materials have item_type='material' or undefined
    const line_items = allItems
      .filter(item => !item.item_type || item.item_type === 'material' || item.item_type === 'paint')
      .map(item => {
        const qty = Number(item.quantity) || 0;
        const materialUnitCost = Number(item.material_unit_cost) || 0;
        const laborUnitCost = Number(item.labor_unit_cost) || 0;
        const materialExtended = qty * materialUnitCost;
        const laborExtended = qty * laborUnitCost;

        // Preserve the original item_type ('paint' or default to 'material')
        const itemType = item.item_type === 'paint' ? 'paint' : 'material';

        return {
          id: item.id,
          description: item.description,
          size_display: item.size_display,
          quantity: qty,
          unit: item.unit || 'EA',
          material_unit_cost: materialUnitCost,
          labor_unit_cost: laborUnitCost,
          material_extended: item.material_extended ?? materialExtended,
          labor_extended: item.labor_extended ?? laborExtended,
          line_total: item.line_total ?? (materialExtended + laborExtended),
          presentation_group: item.presentation_group,
          category: item.category,
          item_number: item.item_number,
          item_type: itemType,
          sku: item.sku,
          notes: item.notes,
          formula_used: item.formula_used,
        };
      });

    // Labor items
    const labor_items: LaborItem[] = allItems
      .filter(item => item.item_type === 'labor')
      .map(item => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.labor_unit_cost) || 0;

        return {
          id: item.id,
          description: item.description,
          quantity: qty,
          unit: item.unit || 'SQ',
          rate: rate,
          total: qty * rate,
          notes: item.notes,
        };
      });

    // Overhead items
    const overhead_items: OverheadItem[] = allItems
      .filter(item => item.item_type === 'overhead')
      .map(item => ({
        id: item.id,
        description: item.description,
        amount: Number(item.equipment_unit_cost) || Number(item.line_total) || 0,
        notes: item.notes,
      }));

    // ==========================================================================
    // Calculate totals from separated items
    // ==========================================================================

    // Separate paint items from material items for cost calculation
    const materialOnlyItems = line_items.filter(item => item.item_type === 'material');
    const paintOnlyItems = line_items.filter(item => item.item_type === 'paint');

    const calculatedMaterialCost = materialOnlyItems.reduce(
      (sum, item) => sum + (item.material_extended || 0),
      0
    );

    // Paint cost includes both material and labor extended costs
    const calculatedPaintCost = paintOnlyItems.reduce(
      (sum, item) => sum + (item.material_extended || 0) + (item.labor_extended || 0),
      0
    );

    const calculatedLaborCost = labor_items.reduce(
      (sum, item) => sum + (item.total || 0),
      0
    );

    const calculatedOverheadCost = overhead_items.reduce(
      (sum, item) => sum + (item.amount || 0),
      0
    );

    // Always use calculated totals from filtered line items
    // Database stored totals may include paint items in wrong categories
    // Paint items are now separated, so we recalculate everything from line items
    const materialCost = calculatedMaterialCost;
    const paintCost = calculatedPaintCost;
    const laborCost = calculatedLaborCost;
    const overheadCost = calculatedOverheadCost;
    const subtotal = materialCost + paintCost + laborCost + overheadCost;
    const markupPercent = takeoff.markup_percent ?? 15;
    // Recalculate final price from new subtotal
    const finalPrice = subtotal * (1 + markupPercent / 100);

    // ==========================================================================
    // Return response
    // ==========================================================================

    return NextResponse.json({
      success: true,
      takeoff: {
        id: takeoff.id,
        project_id: takeoff.project_id || null,
        extraction_job_id: extractionJobId,
        takeoff_name: takeoff.takeoff_name,
        project_name: takeoff.project_name,
        client_name: takeoff.client_name,
        address: takeoff.address,
        total_material_cost: materialCost,
        total_labor_cost: laborCost,
        total_overhead_cost: overheadCost,
        subtotal: subtotal,
        markup_percent: markupPercent,
        final_price: finalPrice,
        squares: takeoff.squares || null,
        created_at: takeoff.created_at,
      },
      line_items,
      labor_items,
      overhead_items,
      totals: {
        material_cost: materialCost,
        paint_cost: paintCost,
        labor_cost: laborCost,
        overhead_cost: overheadCost,
        subtotal: subtotal,
        markup_percent: markupPercent,
        final_price: finalPrice,
      },
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
