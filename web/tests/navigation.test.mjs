import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../src/navigation.ts';

test('bookmarked page paths resolve without a hash', () => {
  for (const page of ['models', 'providers', 'call-logs', 'system-logs', 'settings']) {
    assert.deepEqual(resolveRoute(new URL(`http://localhost/${page}?locale=en`)), { page });
  }
});

test('old hash bookmarks migrate while preserving the query string', () => {
  for (const page of ['models', 'providers', 'call-logs', 'system-logs', 'settings']) {
    assert.deepEqual(resolveRoute(new URL(`http://localhost/?locale=en#${page}`)), { page, canonicalHref: `/${page}?locale=en` });
  }
  assert.deepEqual(resolveRoute(new URL('http://localhost/')), { page: 'models', canonicalHref: '/models' });
});

test('a real page path takes priority over an unrelated hash', () => {
  assert.deepEqual(resolveRoute(new URL('http://localhost/settings#models')), { page: 'settings' });
});

test('known pages with one trailing slash canonicalize without losing query or hash', () => {
  for (const page of ['models', 'providers', 'call-logs', 'system-logs', 'settings']) {
    assert.deepEqual(resolveRoute(new URL(`http://localhost/${page}/?locale=en#section`)), { page, canonicalHref: `/${page}?locale=en#section` });
  }
});

test('unknown paths do not silently display the model page or follow a hash', () => {
  for (const path of ['/missing', '/models/nested', '/api/admin/models', '/missing#providers', '/missing/', '/models//', '//models/']) {
    assert.deepEqual(resolveRoute(new URL(`http://localhost${path}`)), { page: null });
  }
});
