import { createHash, createHmac, randomUUID } from 'node:crypto';

export const EXTRACTION_SIGNATURE_VERSION = 'v1';

export interface ExtractionRequestClaims {
  method: string;
  path: string;
  userId: string;
  organizationId: string;
  requestId: string;
  timestamp: string;
  bodySha256: string;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(value?: string | null): string {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

export function sha256Hex(body?: ArrayBuffer | Uint8Array | string): string {
  if (typeof body === 'string') return createHash('sha256').update(body).digest('hex');
  if (body instanceof ArrayBuffer) {
    return createHash('sha256').update(new Uint8Array(body)).digest('hex');
  }
  return createHash('sha256').update(body || new Uint8Array()).digest('hex');
}

export function canonicalizeExtractionRequest(claims: ExtractionRequestClaims): string {
  return [
    EXTRACTION_SIGNATURE_VERSION,
    claims.method.toUpperCase(),
    claims.path.startsWith('/') ? claims.path : `/${claims.path}`,
    claims.userId,
    claims.organizationId,
    claims.requestId,
    claims.timestamp,
    claims.bodySha256,
  ].join('\n');
}

export function signExtractionRequest(
  claims: ExtractionRequestClaims,
  secret: string
): string {
  return createHmac('sha256', secret)
    .update(canonicalizeExtractionRequest(claims))
    .digest('hex');
}

export function createExtractionServiceHeaders({
  method,
  path,
  body,
  userId,
  organizationId,
  requestId = resolveRequestId(),
  timestamp = Math.floor(Date.now() / 1000).toString(),
}: {
  method: string;
  path: string;
  body?: ArrayBuffer | Uint8Array | string;
  userId: string;
  organizationId: string;
  requestId?: string;
  timestamp?: string;
}): Headers {
  const headers = new Headers({
    'X-Estimate-User-Id': userId,
    'X-Estimate-Organization-Id': organizationId,
    'X-Estimate-Request-Id': requestId,
  });

  const apiKey = process.env.EXTRACTION_API_KEY;
  if (apiKey) headers.set('X-API-Key', apiKey);

  const signingSecret = process.env.EXTRACTION_API_SIGNING_SECRET;
  if (!signingSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EXTRACTION_API_SIGNING_SECRET is required in production');
    }
    return headers;
  }

  const claims: ExtractionRequestClaims = {
    method,
    path,
    userId,
    organizationId,
    requestId,
    timestamp,
    bodySha256: sha256Hex(body),
  };

  headers.set('X-Estimate-Signature-Version', EXTRACTION_SIGNATURE_VERSION);
  headers.set('X-Estimate-Timestamp', timestamp);
  headers.set('X-Estimate-Body-SHA256', claims.bodySha256);
  headers.set('X-Estimate-Signature', `sha256=${signExtractionRequest(claims, signingSecret)}`);
  return headers;
}
