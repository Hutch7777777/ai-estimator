import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRedirectPath } from '../lib/auth/redirect.ts';

test('allows same-site paths with query strings and fragments', () => {
  assert.equal(sanitizeRedirectPath('/project'), '/project');
  assert.equal(
    sanitizeRedirectPath('/projects/123?tab=takeoff#summary'),
    '/projects/123?tab=takeoff#summary'
  );
});

test('rejects absolute, protocol-relative, escaped, and control-character redirects', () => {
  for (const value of [
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/project\nmalicious',
    '',
  ]) {
    assert.equal(sanitizeRedirectPath(value), '/project');
  }
});

test('uses a caller-provided safe fallback', () => {
  assert.equal(sanitizeRedirectPath('https://evil.example', '/login'), '/login');
});
