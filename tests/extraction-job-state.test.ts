import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionExtractionJob,
  isExtractionJobActive,
  isExtractionJobStatus,
} from '../lib/types/extractionJob.ts';

test('recognizes the complete frontend/backend job status vocabulary', () => {
  for (const status of [
    'pending',
    'importing',
    'converting',
    'analyzing',
    'classifying',
    'classified',
    'processing',
    'refining',
    'complete',
    'approved',
    'failed',
  ]) {
    assert.equal(isExtractionJobStatus(status), true);
  }
  assert.equal(isExtractionJobStatus('deleted'), false);
});

test('prevents deletion during every active processing state', () => {
  for (const status of [
    'pending',
    'importing',
    'converting',
    'analyzing',
    'classifying',
    'processing',
    'refining',
  ] as const) {
    assert.equal(isExtractionJobActive(status), true);
  }
  assert.equal(isExtractionJobActive('classified'), false);
  assert.equal(isExtractionJobActive('complete'), false);
  assert.equal(isExtractionJobActive('failed'), false);
});

test('allows known workflow transitions and rejects invalid skips', () => {
  assert.equal(canTransitionExtractionJob('pending', 'converting'), true);
  assert.equal(canTransitionExtractionJob('converting', 'classifying'), true);
  assert.equal(canTransitionExtractionJob('classified', 'processing'), true);
  assert.equal(canTransitionExtractionJob('processing', 'refining'), true);
  assert.equal(canTransitionExtractionJob('refining', 'complete'), true);
  assert.equal(canTransitionExtractionJob('complete', 'approved'), true);
  assert.equal(canTransitionExtractionJob('pending', 'approved'), false);
  assert.equal(canTransitionExtractionJob('approved', 'processing'), false);
});
