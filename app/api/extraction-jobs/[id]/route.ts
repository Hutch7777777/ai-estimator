import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// PATCH Handler - Update extraction job (e.g., project name)
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { project_name } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    if (project_name === undefined) {
      return NextResponse.json(
        { success: false, error: 'project_name is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Use any to bypass type checking since extraction_jobs might not be in the generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('extraction_jobs')
      .update({ project_name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[API] Error updating extraction job:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, job: data });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
