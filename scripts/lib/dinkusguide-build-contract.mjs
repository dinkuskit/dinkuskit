import assert from 'node:assert/strict';

/** Check the authored trust boundary and both generated representations. */
export function validateConfiguredGuideHosts(authored, generated) {
  assert.deepEqual(authored.capabilities, ['network:request']);
  assert.deepEqual(generated.capabilities, ['network:request']);
  const hosts = authored.allowedHosts;
  assert.ok(Array.isArray(hosts) && hosts.length === 1, 'DinkusGuide requires one exact ingress hostname');
  const host = hosts[0];
  assert.ok(typeof host === 'string' && /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host), 'Ingress must be a concrete hostname without a wildcard, URL, port or path');
  assert.deepEqual(generated.allowedHosts, hosts);
  assert.deepEqual(generated.declaredAccess, { network: { request: { allowedHosts: hosts } } });
}
