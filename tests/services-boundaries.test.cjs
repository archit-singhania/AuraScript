'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { AppService, zonedInstant } = require('../src/services/app-service.cjs');
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-boundary-')),
    root = path.join(directory, 'project'),
    events = [];
  fs.mkdirSync(root);
  const service = new AppService({
    userDataDir: path.join(directory, 'private'),
    emit: (event) => events.push(event),
  });
  t.after(async () => {
    await service.dispose();
    fs.rmSync(directory, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
  });
  await service.invoke('workspace:open', { path: root });
  return { directory, root, events, service };
}
async function waitFor(condition, timeout = 10000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for service result.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
test('two simultaneous saves cannot both overwrite the same disk revision', async (t) => {
  const { service, root } = await fixture(t);
  fs.writeFileSync(path.join(root, 'race.txt'), 'original');
  const file = await service.invoke('file:read', { path: 'race.txt' });
  const outcomes = await Promise.allSettled([
    service.invoke('file:save', { path: file.path, revision: file.revision, content: 'writer one' }),
    service.invoke('file:save', { path: file.path, revision: file.revision, content: 'writer two' }),
  ]);
  assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((row) => row.status === 'rejected').reason.code, 'CONFLICT');
});
test('replace modifies only selected positions and honors case-insensitive search', async (t) => {
  const { service, root } = await fixture(t);
  fs.writeFileSync(path.join(root, 'matches.txt'), 'Alpha alpha\nALPHA alpha\n');
  const file = await service.invoke('file:read', { path: 'matches.txt' });
  const result = await service.invoke('workspace:replace', {
    query: 'alpha',
    replacement: 'Selected',
    caseSensitive: false,
    paths: [file.path],
    revisions: { [file.path]: file.revision },
    matches: [{ path: file.path, line: 2, column: 1 }],
    confirmed: true,
  });
  assert.equal(result.matches, 1);
  assert.equal(fs.readFileSync(path.join(root, 'matches.txt'), 'utf8'), 'Alpha alpha\nSelected alpha\n');
  const current = await service.invoke('file:read', { path: file.path });
  await assert.rejects(
    service.invoke('workspace:replace', {
      query: 'alpha',
      replacement: 'wrong',
      caseSensitive: true,
      paths: [file.path],
      revisions: { [file.path]: current.revision },
      matches: [{ path: file.path, line: 1, column: 1 }],
      confirmed: true,
    }),
    /changed/,
  );
});
test('invalid calendar dates and nonexistent DST wall times never normalize silently', () => {
  assert.throws(() => zonedInstant('2030-02-30T12:00', 'UTC'), /invalid/);
  assert.throws(() => zonedInstant('2030-01-00T12:00', 'UTC'), /invalid/);
  assert.throws(() => zonedInstant('2030-02-30T12:00:00.000Z', 'UTC'), /invalid/);
  assert.throws(() => zonedInstant('2030-01-01T24:00:00Z', 'UTC'), /invalid/);
  assert.throws(() => zonedInstant('2027-03-14T02:30', 'America/New_York'), /does not exist/);
});
test('trash metadata failure preserves the original file', async (t) => {
  const { service, root } = await fixture(t);
  fs.writeFileSync(path.join(root, 'keep.txt'), 'safe');
  const original = service.store.save.bind(service.store);
  service.store.save = () => {
    throw new Error('Disk full fixture');
  };
  await assert.rejects(service.invoke('file:trash', { path: 'keep.txt' }), /Disk full/);
  assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'safe');
  service.store.save = original;
});
test('request budget rejects actual subsequent requests; dollar budgets cannot pretend to work', async (t) => {
  const { service } = await fixture(t);
  await assert.rejects(service.invoke('settings:update', { monthlyBudget: 10 }), /unavailable/);
  await service.invoke('settings:update', { model: 'fixture', maxRequests: 1 });
  service.store.state.usage.requests = 1;
  await assert.rejects(service.invoke('ai:send', { text: 'second request' }), /budget/);
});
test('mocked provider boundary streams isolated conversations and explicit selected fragments', async (t) => {
  const { service, root, events } = await fixture(t);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(JSON.stringify({ message: { content: 'Verified 🌙 ' }, done: false }) + '\n');
    setTimeout(
      () =>
        res.end(
          JSON.stringify({
            message: { content: 'response' },
            done: true,
            prompt_eval_count: 2,
            eval_count: 3,
          }) + '\n',
        ),
      20,
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await service.invoke('settings:update', {
    model: 'fixture-model',
    endpoint: `http://127.0.0.1:${server.address().port}`,
  });
  fs.writeFileSync(path.join(root, 'code.py'), 'first = 1\nsecond = 2\n');
  const file = await service.invoke('file:read', { path: 'code.py' });
  const one = await service.invoke('ai:send', {
    text: 'Private prompt one',
    context: [{ path: file.path, content: 'first = 1', revision: file.revision }],
  });
  const two = await service.invoke('ai:send', { text: 'Private prompt two' });
  await waitFor(() => events.filter((event) => event.type === 'ai:done').length === 2);
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every((request) => request.messages.filter((message) => message.role === 'user').length === 1),
  );
  assert.equal(requests[0].messages.at(-1).content.includes('second = 2'), false);
  assert.equal(
    (await service.invoke('conversations:read', { id: one.conversationId })).messages.at(-1).content,
    'Verified 🌙 response',
  );
  assert.notEqual(one.conversationId, two.conversationId);
  const usage = await service.invoke('usage:get');
  assert.equal(usage.inputTokens, 4);
  assert.equal(usage.outputTokens, 6);
});
test('disposing a running response aborts transport and persists cancelled partial content', async (t) => {
  const { service, directory, events } = await fixture(t);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(JSON.stringify({ message: { content: 'Partial' }, done: false }) + '\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  await service.invoke('settings:update', {
    model: 'fixture-model',
    endpoint: `http://127.0.0.1:${server.address().port}`,
  });
  const started = await service.invoke('ai:send', { text: 'Slow response' });
  await waitFor(() => events.some((event) => event.type === 'ai:delta'));
  await service.dispose();
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'private', 'state.json'), 'utf8'));
  const message = state.sessions.find((row) => row.id === started.conversationId).messages.at(-1);
  assert.equal(message.status, 'cancelled');
  assert.equal(message.content, 'Partial');
});

for (const failure of ['timeout', 'output limit']) {
  test(`provider ${failure} remains a failed response with bounded partial history`, async (t) => {
    const { service, events } = await fixture(t);
    service.options.responseTimeoutMs = 500;
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(JSON.stringify({ message: { content: 'Partial' }, done: false }) + '\n');
      if (failure === 'output limit')
        res.end(JSON.stringify({ message: { content: 'x'.repeat(200001) }, done: false }) + '\n');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    await service.invoke('settings:update', {
      model: 'fixture',
      endpoint: `http://127.0.0.1:${server.address().port}`,
    });
    const turn = await service.invoke('ai:send', { text: 'Check provider failure' });
    await waitFor(() => events.some((event) => event.type === 'ai:error'));
    const error = events.find((event) => event.type === 'ai:error');
    assert.equal(error.cancelled, false);
    assert.match(error.error, failure === 'timeout' ? /timed out/ : /size limit/);
    const history = await service.invoke('conversations:read', { id: turn.conversationId });
    assert.equal(history.messages.at(-1).status, 'failed');
    assert.ok(history.messages.at(-1).content.startsWith('Partial'));
    assert.ok(history.messages.at(-1).content.length <= 200000);
    assert.equal((await service.invoke('receipts:list'))[0].status, 'failed');
  });
}
