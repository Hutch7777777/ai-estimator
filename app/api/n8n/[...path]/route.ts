import { NextRequest, NextResponse } from 'next/server';

const N8N_BASE_URL =
  process.env.N8N_WEBHOOK_URL ||
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
  'https://n8n-production-293e.up.railway.app';

const TIMEOUT_MS = 120_000; // 2 min — Excel generation can be slow

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const webhookPath = path.join('/');

  console.log(`[n8n-proxy] POST /webhook/${webhookPath}`);

  try {
    const body = await request.json();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = n8nResponse.headers.get('content-type') || '';

    // Handle binary responses (Excel files from Multi-Trade Coordinator)
    if (
      contentType.includes('spreadsheet') ||
      contentType.includes('octet-stream') ||
      contentType.includes('excel')
    ) {
      const buffer = await n8nResponse.arrayBuffer();
      return new NextResponse(buffer, {
        status: n8nResponse.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition':
            n8nResponse.headers.get('content-disposition') || 'attachment; filename="takeoff.xlsx"',
        },
      });
    }

    // Handle JSON responses
    if (contentType.includes('application/json')) {
      const data = await n8nResponse.json();
      return NextResponse.json(data, { status: n8nResponse.status });
    }

    // Pass through any other response type (HTML proposals, etc.)
    const buffer = await n8nResponse.arrayBuffer();
    const headers: Record<string, string> = { 'Content-Type': contentType };
    const disposition = n8nResponse.headers.get('content-disposition');
    if (disposition) headers['Content-Disposition'] = disposition;

    return new NextResponse(buffer, { status: n8nResponse.status, headers });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[n8n-proxy] Error proxying /webhook/${webhookPath}:`, err);

    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'n8n webhook timed out' }, { status: 504 });
    }

    return NextResponse.json(
      { error: 'Failed to proxy request to n8n', details: err.message },
      { status: 502 }
    );
  }
}
