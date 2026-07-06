import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api/access';
import { createServiceClient } from '@/lib/supabase/service';

const VALID_TRADES = new Set(['siding', 'roofing', 'windows', 'gutters']);

interface PlanIntakeBody {
  project_id?: unknown;
  organization_id?: unknown;
  project_name?: unknown;
  client_name?: unknown;
  address?: unknown;
  selected_trades?: unknown;
  markup_percent?: unknown;
  pdf_url?: unknown;
  configurations?: unknown;
}

interface InsertClient {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
    insert: (values: unknown) => Promise<{ error: { message: string } | null }>;
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asTrades(value: unknown): string[] {
  if (!Array.isArray(value)) return ['siding'];
  const trades = value
    .map((trade) => asString(trade))
    .filter((trade) => VALID_TRADES.has(trade));
  return trades.includes('siding') ? trades : ['siding', ...trades];
}

function asRecord(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, Record<string, unknown>>;
}

function cleanConfig(config: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (value === '' || value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = cleanConfig(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) cleaned[key] = nested;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as PlanIntakeBody;
  const projectId = asString(body.project_id);
  const organizationId = asString(body.organization_id);
  const projectName = asString(body.project_name);
  const clientName = asString(body.client_name);
  const address = asString(body.address);
  const pdfUrl = asString(body.pdf_url);
  const selectedTrades = asTrades(body.selected_trades);
  const markupPercent =
    typeof body.markup_percent === 'number' && Number.isFinite(body.markup_percent)
      ? body.markup_percent
      : 15;
  const configurations = asRecord(body.configurations);

  if (!projectId || !organizationId || !projectName || !clientName || !address || !pdfUrl) {
    return NextResponse.json(
      { success: false, error: 'project_id, organization_id, project_name, client_name, address, and pdf_url are required' },
      { status: 400 }
    );
  }

  if (!auth.ctx.devBypass) {
    const membership = await auth.ctx.supabase
      .from('organization_memberships')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', auth.ctx.user!.id)
      .maybeSingle();

    if (membership.error) {
      return NextResponse.json(
        { success: false, error: 'Failed to verify organization access', details: membership.error.message },
        { status: 500 }
      );
    }
    if (!membership.data) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const service = createServiceClient() as unknown as InsertClient;

  const projectInsert = {
    id: projectId,
    organization_id: organizationId,
    name: projectName,
    client_name: clientName,
    address,
    selected_trades: selectedTrades,
    markup_percent: markupPercent,
    status: 'pending',
  };

  const { error: projectError } = await service
    .from('projects')
    .insert(projectInsert);

  if (projectError) {
    return NextResponse.json(
      { success: false, error: 'Project save failed', details: projectError.message },
      { status: 500 }
    );
  }

  const configInserts = selectedTrades.map((trade) => {
    const configurationData = cleanConfig(configurations[trade] || {});
    return {
      project_id: projectId,
      trade,
      configuration_data:
        trade === 'siding'
          ? {
              ...configurationData,
              markup_percent: markupPercent,
              intake: {
                type: 'plans',
                source: 'construction_plans',
                pdf_url: pdfUrl,
                created_at: new Date().toISOString(),
              },
            }
          : configurationData,
    };
  });

  const { error: configError } = await service
    .from('project_configurations')
    .insert(configInserts);

  if (configError) {
    return NextResponse.json(
      { success: false, error: 'Configuration save failed', details: configError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, project_id: projectId });
}
