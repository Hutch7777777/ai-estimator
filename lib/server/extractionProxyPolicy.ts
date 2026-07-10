const ALLOWED_EXTRACTION_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^wall-heights$/ },
  { method: 'GET', pattern: /^linear-summary$/ },
  { method: 'POST', pattern: /^calculate-linear$/ },
  { method: 'POST', pattern: /^siding-polygons$/ },
  { method: 'POST', pattern: /^start-job$/ },
  { method: 'POST', pattern: /^process-job$/ },
  { method: 'POST', pattern: /^import-bluebeam$/ },
  { method: 'POST', pattern: /^import-bluebeam-fresh$/ },
  { method: 'POST', pattern: /^import-bluebeam-fresh\/preview$/ },
  { method: 'POST', pattern: /^reenrich-materials\/[0-9a-f-]{36}$/i },
  { method: 'POST', pattern: /^export-bluebeam$/ },
  { method: 'PATCH', pattern: /^api\/pages\/[0-9a-f-]{36}\/classify$/i },
];

export function isAllowedExtractionRoute(method: string, path: string): boolean {
  return ALLOWED_EXTRACTION_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path)
  );
}

export async function parseExtractionBodyFields(
  body: ArrayBuffer | undefined,
  contentType: string | null
): Promise<Record<string, string>> {
  if (!body || !contentType) return {};

  if (contentType.includes('application/json')) {
    try {
      const value = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(value)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      );
    } catch {
      return {};
    }
  }

  if (
    contentType.includes('multipart/form-data')
    || contentType.includes('application/x-www-form-urlencoded')
  ) {
    try {
      const formData = await new Response(body.slice(0), {
        headers: { 'Content-Type': contentType },
      }).formData();
      const fields: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') fields[key] = value;
      }
      return fields;
    } catch {
      return {};
    }
  }

  return {};
}
