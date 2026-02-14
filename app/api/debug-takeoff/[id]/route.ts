import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check takeoff data directly from the database.
 * This bypasses any frontend logic to verify what's actually stored.
 *
 * Usage: GET /api/debug-takeoff/{takeoff_id}
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    console.log('[debug-takeoff] Checking takeoff ID:', id);

    // 1. Get the takeoff record
    const { data: takeoff, error: takeoffError } = await supabase
      .from('takeoffs')
      .select('*')
      .eq('id', id)
      .single();

    if (takeoffError) {
      console.error('[debug-takeoff] Takeoff fetch error:', takeoffError);
      return NextResponse.json({
        success: false,
        error: 'Takeoff not found',
        details: takeoffError.message,
      }, { status: 404 });
    }

    console.log('[debug-takeoff] Takeoff record:', takeoff);

    // Cast to explicit type since Supabase client doesn't have proper types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const takeoffData = takeoff as Record<string, any>;

    // 2. Get line items for this takeoff
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', id)
      .order('item_number', { ascending: true });

    if (lineItemsError) {
      console.error('[debug-takeoff] Line items fetch error:', lineItemsError);
    }

    console.log('[debug-takeoff] Line items count:', lineItems?.length || 0);
    if (lineItems?.length) {
      console.log('[debug-takeoff] Sample line item:', lineItems[0]);
    }

    // 3. Get sections for this takeoff
    const { data: sections, error: sectionsError } = await supabase
      .from('takeoff_sections')
      .select('*')
      .eq('takeoff_id', id);

    if (sectionsError) {
      console.error('[debug-takeoff] Sections fetch error:', sectionsError);
    }

    console.log('[debug-takeoff] Sections count:', sections?.length || 0);

    // 4. If we have a project_id, check for extraction job
    let extractionJob = null;
    if (takeoffData.project_id) {
      const { data: jobData } = await supabase
        .from('extraction_jobs')
        .select('id, status, created_at')
        .eq('project_id', takeoffData.project_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      extractionJob = jobData;
    }

    return NextResponse.json({
      success: true,
      debug: {
        takeoff_id: id,
        project_id: takeoffData.project_id,
      },
      takeoff: {
        id: takeoffData.id,
        takeoff_name: takeoffData.takeoff_name,
        status: takeoffData.status,
        total_material_cost: takeoffData.total_material_cost,
        total_labor_cost: takeoffData.total_labor_cost,
        total_overhead_cost: takeoffData.total_overhead_cost,
        subtotal: takeoffData.subtotal,
        final_price: takeoffData.final_price,
        created_at: takeoffData.created_at,
        updated_at: takeoffData.updated_at,
      },
      line_items: {
        count: lineItems?.length || 0,
        items: lineItems || [],
      },
      sections: {
        count: sections?.length || 0,
        items: sections || [],
      },
      extraction_job: extractionJob,
    });
  } catch (error) {
    console.error('[debug-takeoff] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
