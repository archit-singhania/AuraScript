'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function voiceModule() {
  const source = await fs.readFile(path.join(__dirname, '../src/renderer/voice.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
function browserGlobals(t, getUserMedia) {
  const names = ['navigator', 'MediaRecorder', 'cancelAnimationFrame'];
  const originals = names.map((name) => [name, Object.getOwnPropertyDescriptor(global, name)]);
  let recorderStarts = 0;
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia }, language: 'en-US' },
  });
  global.MediaRecorder = class {
    constructor() {
      recorderStarts++;
    }
  };
  global.cancelAnimationFrame = () => {};
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(global, name, descriptor);
      else delete global[name];
    }
  });
  return () => recorderStarts;
}
test('cancel during microphone permission releases a late stream without recording or transcription', async (t) => {
  let grant,
    requests = 0,
    released = 0,
    transcriptionCalls = 0;
  const recorderStarts = browserGlobals(t, () => {
    requests++;
    return new Promise((resolve) => {
      grant = resolve;
    });
  });
  const { VoiceInput } = await voiceModule();
  const voice = new VoiceInput({
    invoke: async () => {
      transcriptionCalls++;
    },
    onState() {},
    onLevel() {},
    onText() {},
    onError(error) {
      throw error;
    },
  });
  const pending = voice.start();
  await assert.rejects(voice.start());
  await voice.toggle();
  grant({
    getTracks: () => [
      {
        stop: () => {
          released++;
        },
      },
    ],
  });
  await pending;
  assert.equal(requests, 1);
  assert.equal(released, 1);
  assert.equal(recorderStarts(), 0);
  assert.equal(transcriptionCalls, 0);
  assert.equal(voice.recording, false);
  assert.equal(voice.acquiring, false);
});
test('denied microphone permission resets acquisition and never submits audio', async (t) => {
  let transcriptionCalls = 0;
  const recorderStarts = browserGlobals(t, async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  });
  const { VoiceInput } = await voiceModule();
  const voice = new VoiceInput({
    invoke: async () => {
      transcriptionCalls++;
    },
    onState() {},
    onLevel() {},
    onText() {},
    onError() {},
  });
  await assert.rejects(voice.start(), /permission was denied/);
  assert.equal(recorderStarts(), 0);
  assert.equal(transcriptionCalls, 0);
  assert.equal(voice.acquiring, false);
  assert.equal(voice.recording, false);
});
