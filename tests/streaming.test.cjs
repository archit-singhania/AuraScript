'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readNDJSON, readSSE } = require('../src/streaming.cjs');
function splitBytes(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
  );
}
test('NDJSON retains Unicode across byte boundaries and a trailing final record', async () => {
  const events = [];
  await readNDJSON(splitBytes('{"text":"हेलो 🌙"}\n{"done":true}'), (value) => events.push(value));
  assert.deepEqual(events, [{ text: 'हेलो 🌙' }, { done: true }]);
});
test('SSE handles CRLF, heartbeat comments, multiline events and complete EOF', async () => {
  const events = [];
  await readSSE(
    splitBytes(': heartbeat\r\nevent: token\r\nid: 5\r\ndata: first\r\ndata: 🌙\r\n\r\ndata: [DONE]'),
    (value) => events.push(value),
  );
  assert.deepEqual(events, [
    { event: 'token', id: '5', data: 'first\n🌙' },
    { event: 'message', id: '5', data: '[DONE]' },
  ]);
});
test('malformed and oversized streams fail rather than completing successfully', async () => {
  await assert.rejects(
    readNDJSON(splitBytes('{broken}\n'), () => {}),
    /malformed/,
  );
  await assert.rejects(
    readNDJSON(splitBytes('{"text":"long"}\n'), () => {}, { maxBytes: 4 }),
    /limit/,
  );
});
test('cancellation closes a waiting reader without delivering late content', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = readSSE(response, () => assert.fail('No event should be delivered'), {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled, true);
});
