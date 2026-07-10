import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStorageObjectPath } from '@/lib/supabase/storageUrls';

interface ProjectPdfRecord {
  hover_pdf_url: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('hover_pdf_url')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Project PDF not found' }, { status: 404 });
  }

  const project = data as unknown as ProjectPdfRecord;
  const objectPath = project.hover_pdf_url
    ? getStorageObjectPath(project.hover_pdf_url, 'hover-pdfs')
    : null;
  if (!objectPath) {
    return NextResponse.json({ error: 'Project PDF not found' }, { status: 404 });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('hover-pdfs')
    .createSignedUrl(objectPath, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Could not authorize PDF access' }, { status: 403 });
  }

  return NextResponse.redirect(new URL(signedData.signedUrl, request.url), 302);
}
