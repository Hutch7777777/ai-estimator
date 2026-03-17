import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// DELETE Handler - Delete extraction job
// =============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch the job to verify it exists and check status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: fetchError } = await (supabase as any)
      .from('extraction_jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { success: false, error: 'Extraction job not found' },
        { status: 404 }
      );
    }

    // Block deletion if job is currently processing
    if (job.status === 'processing' || job.status === 'converting') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a job that is currently processing' },
        { status: 400 }
      );
    }

    // Delete the job (child tables have ON DELETE CASCADE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('extraction_jobs')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[API] Error deleting extraction job:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
