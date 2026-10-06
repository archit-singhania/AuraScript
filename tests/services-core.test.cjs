'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AppService, zonedInstant } = require('../src/services/app-service.cjs');
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-service-'));
  const root = path.join(directory, 'project');
  fs.mkdirSync(root);
  const events = [];
  const service = new AppService({
    userDataDir: path.join(directory, 'private'),
    emit: (event) => events.push(event),
    sealSecret: (value) => Buffer.from(value).toString('base64'),
    openSecret: (value) => Buffer.from(value, 'base64').toString(),
  });
  t.after(async () => {
    await service.dispose();
    const relative = path.relative(os.tmpdir(), directory);
    assert(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('aura-service-'));
    // Async removal lets pending Windows watcher-close events release their handles.
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  await service.invoke('workspace:open', { path: root });
  return { directory, root, service, events };
}
test('text files preserve optimistic revisions, collisions, and executable mode', async (t) => {
  const { root, service } = await fixture(t);
  const created = await service.invoke('file:create', { path: 'script.sh', kind: 'file' });
  await assert.rejects(service.invoke('file:create', { path: 'script.sh', kind: 'file' }), /already exists/);
  fs.chmodSync(path.join(root, 'script.sh'), 0o755);
  const saved = await service.invoke('file:save', {
    path: 'script.sh',
    content: 'echo ready\n',
    revision: created.revision,
  });
  assert.equal(saved.content, 'echo ready\n');
  if (process.platform !== 'win32')
    assert.equal(fs.statSync(path.join(root, 'script.sh')).mode & 0o777, 0o755);
  fs.writeFileSync(path.join(root, 'script.sh'), 'external change');
  await assert.rejects(
    service.invoke('file:save', { path: 'script.sh', content: 'lost update', revision: saved.revision }),
    (error) => error.code === 'CONFLICT',
  );
  assert.equal(fs.readFileSync(path.join(root, 'script.sh'), 'utf8'), 'external change');
});
test('canonical workspace refuses traversal, internal Git files, and outside links', async (t) => {
  const { directory, root, service } = await fixture(t);
  fs.writeFileSync(path.join(directory, 'private.txt'), 'private');
  await assert.rejects(service.invoke('file:read', { path: '../private.txt' }), /escapes/);
  await assert.rejects(
    service.invoke('file:read', { path: path.join(directory, 'private.txt') }),
    /relative/,
  );
  await assert.rejects(service.invoke('file:save', { path: '.git/config', content: 'bad' }), /Git internal/);
  try {
    fs.symlinkSync(path.join(directory, 'private.txt'), path.join(root, 'link.txt'));
    await assert.rejects(service.invoke('file:read', { path: 'link.txt' }), /symbolic link/);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
});
test('search is literal and bounded; previewed replacements refuse external edits', async (t) => {
  const { root, service } = await fixture(t);
  fs.writeFileSync(path.join(root, 'one.txt'), 'alpha\nalpha beta');
  const file = await service.invoke('file:read', { path: 'one.txt' });
  const search = await service.invoke('workspace:search', { query: 'alpha' });
  assert.equal(search.matches.length, 2);
  await assert.rejects(service.invoke('workspace:search', { query: 'a+', regex: true }), /disabled/);
  const payload = {
    query: 'alpha',
    replacement: 'gamma',
    paths: ['one.txt'],
    revisions: { 'one.txt': file.revision },
  };
  const preview = await service.invoke('workspace:replace', payload);
  assert.equal(preview.changes[0].count, 2);
  assert.equal(fs.readFileSync(path.join(root, 'one.txt'), 'utf8'), 'alpha\nalpha beta');
  fs.writeFileSync(path.join(root, 'one.txt'), 'alpha external');
  await assert.rejects(service.invoke('workspace:replace', { ...payload, confirmed: true }), /changed/);
});
test('retained trash survives restart and restore cannot overwrite an occupied path', async (t) => {
  const { directory, root, service } = await fixture(t);
  fs.writeFileSync(path.join(root, 'restore.txt'), 'retained text');
  const trashed = await service.invoke('file:trash', { path: 'restore.txt' });
  assert.equal(fs.existsSync(path.join(root, 'restore.txt')), false);
  await service.dispose();
  const restarted = new AppService({ userDataDir: path.join(directory, 'private') });
  t.after(() => restarted.dispose());
  assert.equal((await restarted.invoke('trash:list'))[0].id, trashed.id);
  fs.writeFileSync(path.join(root, 'restore.txt'), 'collision');
  await assert.rejects(restarted.invoke('file:restore', { id: trashed.id }), /existing/);
  fs.unlinkSync(path.join(root, 'restore.txt'));
  await restarted.invoke('file:restore', { id: trashed.id });
  assert.equal(fs.readFileSync(path.join(root, 'restore.txt'), 'utf8'), 'retained text');
});
test('private data persists and encrypted keys are absent from bootstrap and export', async (t) => {
  const { directory, service } = await fixture(t);
  await service.invoke('settings:update', { theme: 'dark', collection: 'lagoon', timezone: 'Asia/Kolkata' });
  await assert.rejects(service.invoke('settings:update', { collection: 'unknown' }), /collection/);
  await service.invoke('secret:set', { provider: 'openai', key: 'private-fixture-key' });
  await service.invoke('memory:save', { title: 'Style', content: 'Use readable names' });
  await service.invoke('documents:import', {
    name: 'Guide',
    content: 'Cancellation is an important product feature.',
  });
  const search = await service.invoke('documents:search', { query: 'cancellation feature' });
  assert.equal(search.results.length, 1);
  assert.equal(
    (await service.invoke('documents:read', { id: search.results[0].id })).content,
    'Cancellation is an important product feature.',
  );
  const exported = await service.invoke('export:get');
  assert.equal(JSON.stringify(exported).includes('private-fixture-key'), false);
  assert.equal(JSON.stringify(await service.invoke('bootstrap')).includes('private-fixture-key'), false);
  assert.equal(
    fs.readFileSync(path.join(directory, 'private', 'state.json'), 'utf8').includes('private-fixture-key'),
    false,
  );
  await service.dispose();
  const restarted = new AppService({ userDataDir: path.join(directory, 'private') });
  t.after(() => restarted.dispose());
  assert.equal((await restarted.invoke('memory:list'))[0].content, 'Use readable names');
  assert.equal((await restarted.invoke('settings:get')).theme, 'dark');
  assert.equal((await restarted.invoke('settings:get')).collection, 'lagoon');
});
test('imports use confirmation, preserve existing data, and disable imported reminders', async (t) => {
  const { service } = await fixture(t);
  await service.invoke('memory:save', { title: 'Existing', content: 'Keep this' });
  const data = await service.invoke('export:get');
  data.data.memories[0].title = 'Imported';
  data.data.trash = [{ retained: 'C:/secret', root: 'C:/' }];
  data.data.secrets = { openai: 'bad' };
  data.data.reminders = [{ title: 'Imported reminder', dueAt: '2030-01-01T12:00:00.000Z', timezone: 'UTC' }];
  const preview = await service.invoke('import:preview', { data });
  await assert.rejects(service.invoke('import:apply', { id: preview.id }), /Confirm/);
  await service.invoke('import:apply', { id: preview.id, confirmed: true });
  assert.equal((await service.invoke('memory:list')).length, 2);
  assert.equal((await service.invoke('reminders:list'))[0].status, 'cancelled');
  assert.equal((await service.invoke('trash:list')).length, 0);
  assert.deepEqual((await service.invoke('settings:get')).configuredProviders, []);
});
test('patch proposals require unique original text, confirmation and unchanged revision', async (t) => {
  const { service, root } = await fixture(t);
  fs.writeFileSync(path.join(root, 'code.py'), 'answer = 1\n');
  const proposal = {
    path: 'code.py',
    before: 'answer = 1',
    after: 'answer = 42',
    reason: 'Correct the result',
  };
  const preview = await service.invoke('patch:preview', { proposal });
  await assert.rejects(service.invoke('patch:apply', { id: preview.id }), /confirm/);
  await service.invoke('patch:apply', { id: preview.id, confirmed: true });
  assert.equal(fs.readFileSync(path.join(root, 'code.py'), 'utf8'), 'answer = 42\n');
  const next = await service.invoke('patch:preview', {
    proposal: { ...proposal, before: '42', after: '84' },
  });
  fs.writeFileSync(path.join(root, 'code.py'), 'answer = 99\n');
  await assert.rejects(
    service.invoke('patch:apply', { id: next.id, confirmed: true }),
    (error) => error.code === 'CONFLICT',
  );
});
test('JSON and Python diagnostics use real parsers without executing submitted code', async (t) => {
  const { service } = await fixture(t);
  const json = await service.invoke('diagnostics:check', { path: 'bad.json', content: '{"a": }' });
  assert.equal(json.diagnostics[0].severity, 'error');
  const python = await service.invoke('diagnostics:check', {
    path: 'bad.py',
    content: 'def broken(:\n    pass',
  });
  assert.equal(python.provider, 'Python AST');
  assert.equal(python.diagnostics[0].line, 1);
});
test('terminal commands stream actual output and persist exit receipts', async (t) => {
  const { service, events } = await fixture(t);
  await assert.rejects(service.invoke('process:start', { command: 'echo wrong' }), /Confirm/);
  const started = await service.invoke('process:start', { command: 'echo AuraTerminal', confirmed: true });
  await waitFor(() => events.some((event) => event.type === 'process:exit' && event.id === started.id));
  assert.match(
    events
      .filter((event) => event.type === 'process:data')
      .map((event) => event.data)
      .join(''),
    /AuraTerminal/,
  );
  assert.equal(events.find((event) => event.type === 'process:exit').code, 0);
  assert.equal((await service.invoke('process:list'))[0].status, 'completed');
  assert.equal((await service.invoke('receipts:list'))[0].action, 'terminal');
});
test('terminal cancellation stops its process tree and records cancelled outcome', async (t) => {
  const { service, events } = await fixture(t);
  const command =
    process.platform === 'win32' ? 'Write-Output Started; Start-Sleep -Seconds 30' : 'echo Started; sleep 30';
  const started = await service.invoke('process:start', { command, confirmed: true });
  await waitFor(() => events.some((event) => event.type === 'process:data'));
  await service.invoke('process:cancel', { id: started.id });
  await waitFor(() => events.some((event) => event.type === 'process:exit' && event.id === started.id));
  assert.equal((await service.invoke('process:list'))[0].status, 'cancelled');
});
test('Git checkpoints use actual selected repository, staged files and inspectable diff', async (t) => {
  const { service, root } = await fixture(t);
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git('init');
  git('config', 'user.name', 'AuraScript Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(root, 'main.txt'), 'one\n');
  let status = await service.invoke('git:status');
  assert.equal(status.files[0].path, 'main.txt');
  await service.invoke('git:stage', { paths: ['main.txt'] });
  const commit = await service.invoke('git:commit', { message: 'Verified fixture checkpoint' });
  assert.match(commit.hash, /^[0-9a-f]{40}$/);
  assert.match((await service.invoke('git:diff', { commit: commit.hash })).diff, /one/);
  assert.equal((await service.invoke('git:log')).commits.length, 1);
  await service.invoke('git:branch', { name: 'feature/fixture' });
  assert.equal(
    (await service.invoke('git:branches')).branches.find((b) => b.current).name,
    'feature/fixture',
  );
  fs.mkdirSync(path.join(root, 'nested'));
  await service.invoke('workspace:open', { path: path.join(root, 'nested') });
  await assert.rejects(service.invoke('git:status'), /repository root/);
});
test('timezones convert real local time and reminders fire once with durable status', async (t) => {
  const { service, events } = await fixture(t);
  assert.equal(zonedInstant('2030-01-01T12:00', 'Asia/Kolkata'), '2030-01-01T06:30:00.000Z');
  await assert.rejects(service.invoke('settings:update', { timezone: '../../UTC' }), /timezone/);
  const reminder = await service.invoke('reminders:save', {
    title: 'Soon',
    dueAt: new Date(Date.now() + 500).toISOString(),
    timezone: 'UTC',
  });
  await waitFor(() => events.some((event) => event.type === 'reminder:due'), 4000);
  assert.equal((await service.invoke('reminders:list')).find((r) => r.id === reminder.id).status, 'due');
  service.checkReminders();
  assert.equal(events.filter((event) => event.type === 'reminder:due').length, 1);
});
async function waitFor(condition, timeout = 10000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for service event.');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
