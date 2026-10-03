'use strict';
const path = require('node:path');

const METHODS = new Set([
  'bootstrap',
  'workspace:open',
  'workspace:recent',
  'workspace:list',
  'workspace:search',
  'workspace:replace',
  'file:read',
  'file:create',
  'file:save',
  'file:rename',
  'file:trash',
  'file:restore',
  'trash:list',
  'diagnostics:check',
  'process:start',
  'process:cancel',
  'process:list',
  'git:status',
  'git:diff',
  'git:stage',
  'git:unstage',
  'git:commit',
  'git:log',
  'git:branches',
  'git:branch',
  'settings:get',
  'settings:update',
  'secret:set',
  'provider:health',
  'ai:send',
  'ai:cancel',
  'patch:preview',
  'patch:apply',
  'conversations:list',
  'conversations:read',
  'conversations:delete',
  'conversations:search',
  'conversations:rename',
  'documents:import',
  'documents:list',
  'documents:read',
  'documents:delete',
  'documents:search',
  'memory:list',
  'memory:save',
  'memory:delete',
  'reminders:list',
  'reminders:save',
  'reminders:cancel',
  'reminders:complete',
  'reminders:delete',
  'workflows:list',
  'workflows:save',
  'workflows:delete',
  'workflows:run',
  'receipts:list',
  'usage:get',
  'export:get',
  'import:preview',
  'import:apply',
  'voice:transcribe',
  'vision:analyze',
]);

function trustedFrame(event, webContents) {
  try {
    const frame = event.senderFrame;
    const url = new URL(frame.url);
    return (
      event.sender === webContents &&
      frame === webContents.mainFrame &&
      url.protocol === 'aura:' &&
      url.hostname === 'app'
    );
  } catch {
    return false;
  }
}

function validateInvocation(method, payload) {
  if (typeof method !== 'string' || !METHODS.has(method))
    throw Object.assign(new Error('This operation is not supported.'), { code: 'UNSUPPORTED' });
  if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload)))
    throw new Error('Operation details must be an object.');
  let encoded;
  try {
    encoded = JSON.stringify(payload || {});
  } catch {
    throw new Error('Operation details contain an unsupported value.');
  }
  if (encoded.length > 16 * 1024 * 1024) throw new Error('Operation exceeds the input size limit.');
}

function publicAsset(root, urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'aura:' || url.hostname !== 'app') throw new Error('Unknown application origin.');
  const decoded = decodeURIComponent(url.pathname);
  if (decoded.includes('\0') || !/^\/(renderer|vendor)\//.test(decoded))
    throw new Error('Unknown application asset.');
  const target = path.resolve(root, '.' + decoded);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw new Error('Application asset path is outside its root.');
  if (!['renderer', 'vendor'].includes(relative.split(path.sep)[0]))
    throw new Error('Only public application assets are available.');
  return target;
}

function publicError(error) {
  const codes = new Set([
    'CONFLICT',
    'UNSUPPORTED',
    'NOT_FOUND',
    'UNAVAILABLE',
    'INVALID_INPUT',
    'FORBIDDEN',
    'LIMIT_EXCEEDED',
  ]);
  return {
    code: codes.has(error?.code) ? error.code : 'OPERATION_FAILED',
    message: String(error?.message || 'The operation could not be completed.').slice(0, 1000),
  };
}

module.exports = { METHODS, trustedFrame, validateInvocation, publicAsset, publicError };
