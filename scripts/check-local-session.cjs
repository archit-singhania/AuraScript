'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppService } = require('../src/services/app-service.cjs');
const { providerHealth } = require('../src/providers.cjs');
async function main() {
  const model = process.argv[2];
  if (!model) throw new Error('Pass an exact installed model, such as qwen3:8b.');
  const settings = {
    provider: 'ollama',
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434',
    model,
    think: false,
    maxOutputTokens: 64,
  };
  const health = await providerHealth(settings);
  if (!health.available || !health.models.includes(model))
    throw new Error('This exact model must already be installed on the reachable Ollama service.');
  const directory = path.resolve(__dirname, '../.runtime', 'local-session-' + Date.now());
  let resolveTurn,
    rejectTurn,
    cancelOnDelta = false,
    cancelRequested = false,
    events = [];
  const service = new AppService({
    userDataDir: directory,
    emit: (event) => {
      events.push(event);
      if (event.type === 'ai:delta' && cancelOnDelta && !cancelRequested) {
        cancelRequested = true;
        service.invoke('ai:cancel', { turnId: event.turnId }).catch(rejectTurn);
      }
      if (event.type === 'ai:done' || event.type === 'ai:error') resolveTurn?.(event);
    },
  });
  function awaitTurn() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local assistant turn timed out.')), 185000);
      resolveTurn = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      rejectTurn = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });
  }
  let restarted;
  try {
    await service.invoke('settings:update', settings);
    const completed = awaitTurn();
    const started = await service.invoke('ai:send', {
      text: 'In one short sentence, explain why source-file revision checks matter.',
    });
    const result = await completed;
    if (result.type !== 'ai:done' || !result.message.content.trim())
      throw new Error('The actual local assistant turn did not complete.');
    const successDeltas = events.filter((event) => event.type === 'ai:delta').length;
    await service.invoke('settings:update', { maxOutputTokens: 1024 });
    cancelOnDelta = true;
    const cancelled = awaitTurn();
    await service.invoke('ai:send', {
      conversationId: started.conversationId,
      text: 'Write a long, detailed guide to source-file revision checks with many examples.',
    });
    const stopped = await cancelled;
    if (stopped.type !== 'ai:error' || !stopped.cancelled || !cancelRequested)
      throw new Error('The real local generation did not acknowledge cancellation.');
    await service.dispose();
    restarted = new AppService({ userDataDir: directory });
    const session = await restarted.invoke('conversations:read', { id: started.conversationId });
    if (
      !session.messages.some((message) => message.status === 'completed') ||
      !session.messages.some((message) => message.status === 'cancelled')
    )
      throw new Error('Completed and cancelled outcomes did not survive restart.');
    const evidence = {
      checkedAt: new Date().toISOString(),
      provider: 'ollama',
      model,
      profile: directory,
      response: result.message.content,
      passed: true,
      checks: [
        'Actual streamed AppService response',
        'Cancellation after a real model text delta',
        'Completed and cancelled messages survive service restart',
      ],
      measured: {
        completedDeltaEvents: successDeltas,
        messageCount: session.messages.length,
        ...result.message.usage,
      },
      provenance: 'Actual installed local model; private scratch profile; no paid API key.',
    };
    const output = path.resolve(__dirname, '../test-results/local-session.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await service.dispose();
    await restarted?.dispose();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
