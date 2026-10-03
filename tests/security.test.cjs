'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { METHODS, trustedFrame, publicAsset, validateInvocation } = require('../src/security.cjs');

test('desktop bridge and local service expose the same versioned operations', () => {
  const serviceMethods = require('../src/services/app-service.cjs').METHODS;
  assert.deepEqual([...METHODS].sort(), [...serviceMethods].sort());
});

test('only the actual local main frame can invoke desktop operations', () => {
  const frame = { url: 'aura://app/renderer/index.html' };
  const contents = { mainFrame: frame };
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, contents), true);
  assert.equal(trustedFrame({ sender: contents, senderFrame: { url: frame.url } }, contents), false);
  frame.url = 'https://example.invalid/renderer/index.html';
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, contents), false);
});
test('protocol cannot expose services, encoded traversal or foreign assets', () => {
  const root = path.resolve('fixture/src');
  assert.equal(publicAsset(root, 'aura://app/renderer/index.html'), path.join(root, 'renderer/index.html'));
  for (const url of [
    'aura://app/services/app-service.cjs',
    'aura://app/renderer/%2e%2e/%2e%2e/package.json',
    'aura://foreign/renderer/index.html',
    'aura://app/renderer/%00.js',
  ])
    assert.throws(() => publicAsset(root, url));
  if (process.platform === 'win32')
    assert.throws(() => publicAsset(root, 'aura://app/renderer/%2e%2e%5cservices%5capp-service.cjs'));
});
test('unknown, oversized and malformed bridge requests fail before dispatch', () => {
  assert.throws(() => validateInvocation('arbitrary-shell', {}));
  assert.throws(() => validateInvocation('file:read', []));
  assert.throws(() => validateInvocation('file:save', { content: 'x'.repeat(17 * 1024 * 1024) }));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => validateInvocation('bootstrap', cyclic));
});
