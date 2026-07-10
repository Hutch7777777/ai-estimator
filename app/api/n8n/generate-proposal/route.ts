import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthorizedTakeoffOrganization } from '@/lib/server/extractionAuthorization';
import { renderProposalHtml, type ProposalBusinessInfo } from '@/lib/proposals/htmlProposal';

const requestSchema = z.object({
  takeoff_id: z.string().uuid(),
});

interface ProposalTakeoffRecord {
  id: string;
  project_id: string;
  takeoff_name: string;
  status?: string | null;
  subtotal?: number | string | null;
  markup_percent?: number | string | null;
  markup_amount?: number | string | null;
  final_price?: number | string | null;
  created_at?: string | null;
}

interface ProposalProjectRecord {
  name: string;
  client_name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

const safeFilename = (value: string): string => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'Client';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  let parsedBody: z.infer<typeof requestSchema>;
  try {
    parsedBody = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'A valid takeoff_id is required' }, { status: 400 });
  }

  const organizationId = await getAuthorizedTakeoffOrganization(supabase, parsedBody.takeoff_id);
  if (!organizationId) {
    return NextResponse.json({ success: false, error: 'Takeoff not found' }, { status: 404 });
  }

  const { data: takeoff, error: takeoffError } = await supabase
    .from('takeoffs')
    .select('*')
    .eq('id', parsedBody.takeoff_id)
    .maybeSingle();

  if (takeoffError || !takeoff) {
    return NextResponse.json({ success: false, error: 'Takeoff not found' }, { status: 404 });
  }
  const takeoffRecord = takeoff as unknown as ProposalTakeoffRecord;

  const [projectResult, organizationResult, sectionsResult, lineItemsResult] = await Promise.all([
    supabase.from('projects').select('*').eq('id', takeoffRecord.project_id).maybeSingle(),
    supabase.from('organizations').select('name, settings').eq('id', organizationId).maybeSingle(),
    supabase.from('takeoff_sections').select('*').eq('takeoff_id', takeoffRecord.id),
    supabase.from('takeoff_line_items').select('*').eq('takeoff_id', takeoffRecord.id),
  ]);

  if (projectResult.error || !projectResult.data || organizationResult.error || !organizationResult.data) {
    return NextResponse.json({ success: false, error: 'Proposal data is unavailable' }, { status: 404 });
  }
  if (sectionsResult.error || lineItemsResult.error) {
    console.error('[Proposal] Failed to load proposal rows', {
      sections: sectionsResult.error?.code,
      lineItems: lineItemsResult.error?.code,
    });
    return NextResponse.json({ success: false, error: 'Could not generate proposal' }, { status: 500 });
  }

  const organizationSettings = organizationResult.data.settings as {
    business_info?: ProposalBusinessInfo;
  } | null;
  const project = projectResult.data as unknown as ProposalProjectRecord;
  const html = renderProposalHtml({
    companyName: organizationResult.data.name,
    businessInfo: organizationSettings?.business_info,
    project: {
      name: project.name,
      clientName: project.client_name,
      address: project.address,
      city: project.city,
      state: project.state,
      zipCode: project.zip_code,
    },
    takeoff: {
      name: takeoffRecord.takeoff_name,
      status: takeoffRecord.status,
      subtotal: takeoffRecord.subtotal,
      markupPercent: takeoffRecord.markup_percent,
      markupAmount: takeoffRecord.markup_amount,
      finalPrice: takeoffRecord.final_price,
      createdAt: takeoffRecord.created_at,
    },
    sections: sectionsResult.data || [],
    lineItems: lineItemsResult.data || [],
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `Proposal_${safeFilename(project.client_name)}_${date}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
