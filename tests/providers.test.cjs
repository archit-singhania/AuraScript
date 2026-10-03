'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { streamChat, providerHealth, transcribe, analyzeImage } = require('../src/providers.cjs');
async function localServer(run) {
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const part of request) body += part;
    await run(request, response, body ? JSON.parse(body) : undefined);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
test('Ollama HTTP transport streams Unicode and measures actual reported tokens', async () => {
  const requests = [];
  const server = await localServer((req, res, body) => {
    requests.push({ path: req.url, body });
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.end(
      JSON.stringify({ message: { content: 'Hello café' } }) +
        '\n' +
        JSON.stringify({ message: { content: ' 世界' }, done: true, prompt_eval_count: 12, eval_count: 6 }) +
        '\n',
    );
  });
  try {
    const deltas = [];
    const result = await streamChat({
      settings: {
        provider: 'ollama',
        endpoint: server.endpoint,
        model: 'fixture',
        think: false,
        maxOutputTokens: 32,
      },
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (text) => deltas.push(text),
    });
    assert.equal(result.content, 'Hello café 世界');
    assert.equal(deltas.length, 2);
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 6 });
    assert.equal(requests[0].path, '/api/chat');
    assert.equal(requests[0].body.think, false);
    assert.equal(requests[0].body.options.num_predict, 32);
  } finally {
    await server.close();
  }
});
test('an interrupted or incomplete provider stream cannot be reported as success', async () => {
  const server = await localServer((req, res) => {
    res.end('{"message":{"content":"partial"}}\n');
  });
  try {
    await assert.rejects(
      streamChat({
        settings: { provider: 'ollama', endpoint: server.endpoint, model: 'fixture' },
        messages: [{ role: 'user', content: 'hello' }],
      }),
      /before completion/,
    );
  } finally {
    await server.close();
  }
  const stalled = await localServer((req, res) => {
    res.write('{"message":{"content":"first"}}\n');
  });
  try {
    const controller = new AbortController();
    let count = 0;
    await assert.rejects(
      streamChat({
        settings: { provider: 'ollama', endpoint: stalled.endpoint, model: 'fixture' },
        signal: controller.signal,
        messages: [{ role: 'user', content: 'hello' }],
        onDelta: () => {
          count++;
          controller.abort();
        },
      }),
      { name: 'AbortError' },
    );
    assert.equal(count, 1);
  } finally {
    await stalled.close();
  }
});
test('OpenAI SSE request uses its token field, disables store, and rejects redirects', async () => {
  const fetchBefore = global.fetch;
  try {
    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(
        'data: {"choices":[{"delta":{"content":"real fixture"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
      );
    };
    const result = await streamChat({
      settings: { provider: 'openai', model: 'selected' },
      key: 'fixture-key',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(captured.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(captured.options.redirect, 'error');
    assert.equal(captured.body.store, false);
    assert.equal(captured.body.max_completion_tokens, 2048);
    assert.equal(captured.body.max_tokens, undefined);
    assert.equal(result.content, 'real fixture');
    assert.deepEqual(result.usage, { inputTokens: 3, outputTokens: 2 });
    global.fetch = async () => new Response('provider echoed fixture-key', { status: 401 });
    await assert.rejects(
      streamChat({
        settings: { provider: 'openai', model: 'selected' },
        key: 'fixture-key',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      (error) => error.message.includes('HTTP 401') && !error.message.includes('fixture-key'),
    );
  } finally {
    global.fetch = fetchBefore;
  }
});
test('health lists real models and endpoint checks prevent insecure remote requests', async () => {
  const server = await localServer((req, res) => {
    res.end(JSON.stringify({ models: [{ name: 'fixture-model' }] }));
  });
  try {
    const result = await providerHealth({
      provider: 'ollama',
      endpoint: server.endpoint,
      model: 'fixture-model',
    });
    assert.equal(result.available, true);
    assert.deepEqual(result.models, ['fixture-model']);
  } finally {
    await server.close();
  }
  const remote = await providerHealth({ provider: 'ollama', endpoint: 'http://example.com' });
  assert.equal(remote.available, false);
  assert.match(remote.message, /require HTTPS/);
  const key = await providerHealth({ provider: 'openai' });
  assert.equal(key.available, false);
  assert.match(key.message, /API key/);
});
test('speech preserves finalized audio MIME and uses actual multipart data', async () => {
  const fetchBefore = global.fetch;
  try {
    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return Response.json({ text: 'fixture transcript' });
    };
    const bytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);
    const result = await transcribe(
      { provider: 'ollama', voiceProvider: 'groq', voiceModel: 'selected-whisper' },
      'fixture-key',
      { data: bytes.toString('base64'), mimeType: 'audio/webm;codecs=opus', language: 'en' },
    );
    assert.equal(result.text, 'fixture transcript');
    assert.equal(captured.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.equal(captured.options.body.get('file').type, 'audio/webm');
    assert.equal(captured.options.body.get('file').name, 'recording.webm');
    assert.equal(captured.options.body.get('model'), 'selected-whisper');
    await assert.rejects(
      transcribe({ provider: 'groq', voiceModel: 'selected' }, 'fixture-key', {
        data: Buffer.from('fake wave').toString('base64'),
        mimeType: 'audio/wav',
      }),
      /do not match/,
    );
  } finally {
    global.fetch = fetchBefore;
  }
});
test('vision checks signatures and actual Ollama capabilities before image inference', async () => {
  const server = await localServer((req, res) => {
    assert.equal(req.url, '/api/show');
    res.end(JSON.stringify({ capabilities: ['completion'] }));
  });
  try {
    const payload = {
      data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
      mimeType: 'image/png',
      prompt: 'describe',
    };
    await assert.rejects(
      analyzeImage({ provider: 'ollama', endpoint: server.endpoint, model: 'fixture' }, null, payload),
      /does not report vision/,
    );
    await assert.rejects(
      analyzeImage({ provider: 'ollama', endpoint: server.endpoint, model: 'fixture' }, null, {
        ...payload,
        data: Buffer.from('not an image').toString('base64'),
      }),
      /valid PNG/,
    );
  } finally {
    await server.close();
  }
});
