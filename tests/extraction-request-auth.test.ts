import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeExtractionRequest,
  resolveRequestId,
  sha256Hex,
  signExtractionRequest,
} from '../lib/server/extractionRequestAuth.ts';

const body = '{"job_id":"job-123"}';
const bodySha256 = '6a361b2790497a89d85e827330d891c10bfe4055d7321d5a6b6b0b32be90d9f2';
const claims = {
  method: 'POST',
  path: '/process-job',
  userId: 'user-123',
  organizationId: 'org-456',
  requestId: 'request-789',
  timestamp: '1700000000',
  bodySha256,
};

test('matches the extraction backend signing contract', () => {
  assert.equal(sha256Hex(body), bodySha256);
  assert.equal(
    canonicalizeExtractionRequest(claims),
    [
      'v1',
      'POST',
      '/process-job',
      'user-123',
      'org-456',
      'request-789',
      '1700000000',
      bodySha256,
    ].join('\n')
  );
  assert.equal(
    signExtractionRequest(claims, 'contract-test-secret'),
    '26cd902a1cd352c940fbc4f622a79f4db89e4fdbe405578ef3d8aa7280905737'
  );
});

test('accepts bounded request IDs and replaces unsafe values', () => {
  assert.equal(resolveRequestId('request-123'), 'request-123');
  assert.notEqual(resolveRequestId('../../unsafe'), '../../unsafe');
});
