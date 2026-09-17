import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfiguration, saveModel, reorderAccounts, removeAccount, parseProxyAddress, proxyAddresses } from '../src/domain.ts';

const model = { id: 'stable', label: 'Model', model: 'upstream', apiStyle: 'chat', apiKey: 'preserved-key', baseUrl: 'https://example.com/v1' };
function configuration() {
  return normalizeConfiguration({ profiles: [{ name: 'Custom API', kind: 'api', models: [model] }, { name: 'Codex', kind: 'subscription', subscriptionProviderId: 'codex', models: [model] }], subscriptionAccounts: [{ id: 'a', providerId: 'codex', credentialRef: 'subscription/a.json' }, { id: 'b', providerId: 'codex', credentialRef: 'subscription/b.json' }], routeBackends: [{ id: 'a-route', sourceType: 'subscription', providerId: 'codex', sourceId: 'a', priority: 1 }, { id: 'b-route', sourceType: 'subscription', providerId: 'codex', sourceId: 'b', priority: 2 }, { id: 'other', providerId: 'custom', priority: 9 }] });
}
test('editing preserves stable model IDs and unrelated credentials and routes', () => {
  const before = configuration();
  const after = saveModel(before, 'Custom API', { ...model, id: 'changed', label: 'Renamed' }, 'stable');
  assert.equal(after.profiles[0].models[0].id, 'stable');
  assert.equal(after.profiles[0].models[0].label, 'Renamed');
  assert.equal(after.profiles[1], before.profiles[1]);
  assert.equal(after.subscriptionAccounts, before.subscriptionAccounts);
  assert.equal(after.routeBackends, before.routeBackends);
  assert.equal(before.profiles[0].models[0].label, 'Model');
});
test('duplicate IDs and stale edits are rejected', () => {
  assert.throws(() => saveModel(configuration(), 'Custom API', { ...model, id: 'STABLE' }), /exists/);
  assert.throws(() => saveModel(configuration(), 'Custom API', model, 'deleted'), /removed/);
});
test('account ordering changes matching routing priorities only', () => {
  const result = reorderAccounts(configuration(), 'codex', 1, 0);
  assert.deepEqual(result.subscriptionAccounts.map(item => item.id), ['b', 'a']);
  assert.deepEqual(result.routeBackends.map(item => item.priority), [2, 1, 9]);
});
test('last account removal clears its model routes without changing other providers', () => {
  let value = configuration();
  value = removeAccount(value, value.subscriptionAccounts[0]);
  assert.equal(value.profiles[1].models.length, 1);
  value = removeAccount(value, value.subscriptionAccounts[0]);
  assert.equal(value.profiles[1].models.length, 0);
  assert.equal(value.profiles[0].models[0].apiKey, 'preserved-key');
  assert.deepEqual(value.routeBackends.map(item => item.id), ['other']);
});
test('proxy address handles IPv6 and rejects paths and credentials', () => {
  assert.deepEqual(parseProxyAddress('[::1]:27483'), { host: '::1', port: 27483 });
  assert.deepEqual(parseProxyAddress('127.0.0.1:3000'), { host: '127.0.0.1', port: 3000 });
  assert.deepEqual(parseProxyAddress('http://127.0.0.1:80/'), { host: '127.0.0.1', port: 80 });
  for (const address of ['https://example.com:3000', '127.0.0.1:3000/v1', 'user:pass@example.com:3000', '127.0.0.1:99999']) assert.throws(() => parseProxyAddress(address));
});

test('running proxy display retains its live URL and edits its saved listen address', () => {
  assert.deepEqual(proxyAddresses({
    running: true, baseUrl: 'http://127.0.0.1:27483', host: '0.0.0.0', port: 27483,
    config: { host: '0.0.0.0', port: 3000 },
  }), { listenAddress: '0.0.0.0:3000', baseUrl: 'http://127.0.0.1:27483' });
});

test('stopped proxy display uses saved configuration instead of its stale runtime URL', () => {
  assert.deepEqual(proxyAddresses({
    running: false, baseUrl: 'http://127.0.0.1:27483', host: '0.0.0.0', port: 27483,
    config: { host: '0.0.0.0', port: 3000 },
  }), { listenAddress: '0.0.0.0:3000', baseUrl: 'http://127.0.0.1:3000' });
});

test('proxy display brackets IPv6 listen addresses and converts wildcard URLs to loopback', () => {
  for (const host of ['::', '::ffff:0.0.0.0']) {
    assert.deepEqual(proxyAddresses({ config: { host, port: 3000 } }), {
      listenAddress: `[${host}]:3000`, baseUrl: 'http://127.0.0.1:3000',
    });
  }
  assert.deepEqual(proxyAddresses({ config: { host: '2001:db8::5', port: 3000 } }), {
    listenAddress: '[2001:db8::5]:3000', baseUrl: 'http://[2001:db8::5]:3000',
  });
});

test('proxy display falls back to runtime host and port, then core defaults', () => {
  assert.deepEqual(proxyAddresses({ host: '::1', port: 3000 }), {
    listenAddress: '[::1]:3000', baseUrl: 'http://[::1]:3000',
  });
  assert.deepEqual(proxyAddresses({}), {
    listenAddress: '0.0.0.0:27483', baseUrl: 'http://127.0.0.1:27483',
  });
  assert.deepEqual(proxyAddresses({
    running: true, host: '127.0.0.1', port: 27483, config: { host: '0.0.0.0', port: 3000 },
  }), { listenAddress: '0.0.0.0:3000', baseUrl: 'http://127.0.0.1:27483' });
});
