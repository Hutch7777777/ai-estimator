import { NextRequest, NextResponse } from 'next/server';

// Strip any trailing path from the URL (e.g. /webhook/multi-trade-coordinator)
// We only want the base origin like https://n8n-production-293e.up.railway.app
function getN8nBaseUrl(): string {
  const raw =
    process.env.N8N_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
    'https://n8n-production-293e.up.railway.app';
  try {
    const url = new URL(raw);
    return url.origin; // Returns just https://hostname — strips any path
  } catch {
    return raw;
  }
}

const N8N_BASE_URL = getN8nBaseUrl();

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

    // Read response as text first, then try to parse as JSON
    const responseText = await n8nResponse.text();

    console.log(`[n8n-proxy] Response status: ${n8nResponse.status}, content-type: ${contentType}, body length: ${responseText.length}`);

    if (!responseText || responseText.length === 0) {
      // Empty response — n8n webhook may not be active or returned nothing
      if (n8nResponse.ok) {
        return NextResponse.json({ success: true, message: 'Webhook executed (empty response)' });
      }
      return NextResponse.json(
        { error: 'n8n returned empty response', status: n8nResponse.status },
        { status: n8nResponse.status || 502 }
      );
    }

    // Try JSON parse
    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data, { status: n8nResponse.status });
    } catch {
      // Not JSON — return as text (could be HTML error page)
      console.error(`[n8n-proxy] Non-JSON response: ${responseText.substring(0, 500)}`);

      // If it's an HTML error page from n8n, extract the message
      if (contentType.includes('html')) {
        return NextResponse.json(
          { error: 'n8n returned HTML instead of JSON', hint: 'The webhook may not be active or the path may be incorrect', rawPreview: responseText.substring(0, 200) },
          { status: n8nResponse.status || 502 }
        );
      }

      return new NextResponse(responseText, {
        status: n8nResponse.status,
        headers: { 'Content-Type': contentType || 'text/plain' },
      });
    }
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
