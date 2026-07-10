import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedExtractionRoute,
  parseExtractionBodyFields,
} from '../lib/server/extractionProxyPolicy.ts';

test('allows only explicit extraction operations and methods', () => {
  assert.equal(isAllowedExtractionRoute('POST', 'start-job'), true);
  assert.equal(isAllowedExtractionRoute('GET', 'wall-heights'), true);
  assert.equal(
    isAllowedExtractionRoute('PATCH', 'api/pages/123e4567-e89b-12d3-a456-426614174000/classify'),
    true
  );
  assert.equal(isAllowedExtractionRoute('GET', 'start-job'), false);
  assert.equal(isAllowedExtractionRoute('POST', 'list-jobs'), false);
  assert.equal(isAllowedExtractionRoute('POST', '../health'), false);
});

test('extracts authorization identifiers from JSON without coercing values', async () => {
  const body = new TextEncoder().encode(JSON.stringify({
    job_id: 'job-123',
    organization_id: 'org-456',
    count: 4,
  })).buffer;
  assert.deepEqual(
    await parseExtractionBodyFields(body, 'application/json'),
    { job_id: 'job-123', organization_id: 'org-456' }
  );
});

test('extracts string fields from multipart bodies while excluding file content', async () => {
  const formData = new FormData();
  formData.append('organization_id', 'org-456');
  formData.append('pdf_file', new Blob(['pdf bytes'], { type: 'application/pdf' }), 'plans.pdf');
  const request = new Request('http://estimate.local/upload', {
    method: 'POST',
    body: formData,
  });
  assert.deepEqual(
    await parseExtractionBodyFields(
      await request.arrayBuffer(),
      request.headers.get('content-type')
    ),
    { organization_id: 'org-456' }
  );
});
