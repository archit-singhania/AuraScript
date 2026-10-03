'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { streamChat, providerHealth } = require('../src/providers.cjs');
async function main() {
  const model = process.argv[2];
  if (!model) throw new Error('Pass the exact installed model: npm run test:local-model -- qwen3:8b');
  const settings = {
    provider: 'ollama',
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434',
    model,
    think: false,
    maxOutputTokens: 64,
  };
  const health = await providerHealth(settings);
  if (!health.available || !health.models.includes(model))
    throw new Error('The selected model is not installed on the reachable Ollama service.');
  const started = Date.now();
  const deltas = [];
  const prompt = 'Reply in one short sentence: what does a revision check prevent when saving a source file?';
  const result = await streamChat({
    settings,
    messages: [{ role: 'user', content: prompt }],
    onDelta: (text) => deltas.push(text),
  });
  if (deltas.length < 1 || !result.content.trim()) throw new Error('No actual streamed text was returned.');
  const evidence = {
    checkedAt: new Date().toISOString(),
    provider: 'ollama',
    model,
    prompt,
    response: result.content,
    measured: { elapsedMs: Date.now() - started, deltaEvents: deltas.length, ...result.usage },
    provenance: 'Actual installed local model; no cloud key or fixture response.',
  };
  const output = path.resolve(__dirname, '../test-results/local-model.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
