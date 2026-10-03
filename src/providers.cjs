'use strict';
const { readNDJSON, readSSE } = require('./streaming.cjs');

const CLOUD = { openai: 'https://api.openai.com/v1', groq: 'https://api.groq.com/openai/v1' };
const fail = (message, code = 'UNAVAILABLE') => Object.assign(new Error(message), { code });
function provider(settings) {
  if (!['ollama', 'openai', 'groq'].includes(settings?.provider))
    throw fail('Select Ollama, OpenAI, or Groq in Preferences.');
  return settings.provider;
}
function modelName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\r\n\0]/.test(value))
    throw fail('Choose an installed or accessible model in Preferences.');
  return value.trim();
}
function ollamaBase(settings) {
  let url;
  try {
    url = new URL(settings.endpoint || 'http://127.0.0.1:11434');
  } catch {
    throw fail('The Ollama endpoint must be a valid HTTP or HTTPS URL.', 'INVALID_INPUT');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw fail(
      'The Ollama endpoint cannot contain credentials, query parameters, or fragments.',
      'INVALID_INPUT',
    );
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw fail(
      'Remote Ollama endpoints require HTTPS. Use a loopback address for local HTTP.',
      'INVALID_INPUT',
    );
  return url.toString().replace(/\/$/, '');
}
function keyHeaders(name, key) {
  if (name === 'ollama') return {};
  if (typeof key !== 'string' || !key.trim())
    throw fail(
      `Configure your ${name === 'openai' ? 'OpenAI' : 'Groq'} API key in Preferences or its environment variable.`,
    );
  return { Authorization: `Bearer ${key.trim()}` };
}
function requestSignal(signal, timeout = 180000) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}
async function request(url, options, name) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error' });
  } catch (error) {
    if (options.signal?.aborted)
      throw options.signal.reason || new DOMException('The request was interrupted.', 'AbortError');
    throw fail(`Cannot reach ${name}. Check its endpoint, network connection, and provider health.`);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const hint =
      response.status === 401 || response.status === 403
        ? 'Check the API key and model access.'
        : response.status === 404
          ? 'Check the selected model and endpoint.'
          : response.status === 429
            ? 'The provider rate or account limit was reached.'
            : 'Check the model capability and provider configuration.';
    throw fail(`${name} returned HTTP ${response.status}. ${hint}`);
  }
  return response;
}
async function json(response, limit = 2 * 1024 * 1024) {
  if (!response.body) throw fail('The provider returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw fail('The provider response exceeds the size limit.', 'LIMIT_EXCEEDED');
      chunks.push(Buffer.from(part.value));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw fail('The provider returned invalid JSON.');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function tokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}
function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 100)
    throw fail('A bounded conversation is required.', 'INVALID_INPUT');
  let size = 0;
  const clean = messages.map((message) => {
    if (!['system', 'user', 'assistant'].includes(message?.role) || typeof message.content !== 'string')
      throw fail('Conversation messages must contain a supported role and text.', 'INVALID_INPUT');
    size += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (size > 120000)
    throw fail(
      'Conversation context is too large. Start a new session or attach fewer files.',
      'LIMIT_EXCEEDED',
    );
  return clean;
}
async function streamChat({ settings, key, signal, messages, onDelta }) {
  const name = provider(settings),
    model = modelName(settings.model),
    clean = validateMessages(messages);
  const merged = requestSignal(signal);
  let content = '',
    completed = false,
    usage = { inputTokens: null, outputTokens: null };
  const accept = async (text) => {
    if (typeof text !== 'string' || !text) return;
    if (merged.aborted) throw merged.reason;
    if (content.length + text.length > 500000)
      throw fail('The response exceeds the output limit.', 'LIMIT_EXCEEDED');
    content += text;
    await onDelta?.(text);
  };
  if (name === 'ollama') {
    const body = {
      model,
      messages: clean,
      stream: true,
      options: { num_predict: Math.max(16, Math.min(8192, Number(settings.maxOutputTokens) || 2048)) },
    };
    if (typeof settings.think === 'boolean') body.think = settings.think;
    const response = await request(
      ollamaBase(settings) + '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: merged,
      },
      'Ollama',
    );
    await readNDJSON(
      response,
      async (event) => {
        if (event.error)
          throw fail(
            'Ollama could not generate this response. Check the selected model and available memory.',
          );
        await accept(event.message?.content);
        if (event.done === true) {
          completed = true;
          usage = {
            inputTokens: tokenCount(event.prompt_eval_count),
            outputTokens: tokenCount(event.eval_count),
          };
          return false;
        }
      },
      { signal: merged },
    );
  } else {
    const body = { model, messages: clean, stream: true, stream_options: { include_usage: true } };
    if (name === 'openai') {
      body.store = false;
      body.max_completion_tokens = Math.max(16, Math.min(8192, Number(settings.maxOutputTokens) || 2048));
    } else body.max_tokens = Math.max(16, Math.min(8192, Number(settings.maxOutputTokens) || 2048));
    const response = await request(
      CLOUD[name] + '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders(name, key) },
        body: JSON.stringify(body),
        signal: merged,
      },
      name,
    );
    await readSSE(
      response,
      async (event) => {
        if (event.data.trim() === '[DONE]') {
          completed = true;
          return false;
        }
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          throw fail('The provider returned malformed streaming JSON.');
        }
        if (data.error)
          throw fail('The provider could not complete the response. Check its health and model access.');
        await accept(data.choices?.[0]?.delta?.content);
        const measured = data.usage || data.x_groq?.usage;
        if (measured)
          usage = {
            inputTokens: tokenCount(measured.prompt_tokens),
            outputTokens: tokenCount(measured.completion_tokens),
          };
      },
      { signal: merged },
    );
  }
  if (!completed) throw fail('The provider stream ended before completion. Retry this turn.');
  if (!content.trim())
    throw fail('The model returned no text. Select a compatible text model or increase the output limit.');
  return { content, usage };
}
async function providerHealth(settings, key) {
  let name;
  try {
    name = provider(settings);
    const base = name === 'ollama' ? ollamaBase(settings) : CLOUD[name];
    const response = await request(
      base + (name === 'ollama' ? '/api/tags' : '/models'),
      { headers: keyHeaders(name, key), signal: requestSignal(undefined, 5000) },
      name,
    );
    const result = await json(response);
    const models = (name === 'ollama' ? result.models || [] : result.data || [])
      .map((item) => item.name || item.id)
      .filter((value) => typeof value === 'string')
      .slice(0, 1000);
    const selected = settings.model || '';
    return {
      available: true,
      provider: name,
      models,
      selectedModel: selected,
      message: selected
        ? models.includes(selected)
          ? 'Selected model is available.'
          : 'Provider is reachable. Confirm the selected model is compatible and accessible.'
        : 'Provider is reachable. Select a model to start.',
    };
  } catch (error) {
    return {
      available: false,
      provider: name || settings?.provider || 'none',
      models: [],
      message: error.name === 'TimeoutError' ? 'Provider health check timed out.' : error.message,
    };
  }
}
function decodeAsset(data, maximum, label) {
  if (
    typeof data !== 'string' ||
    !data ||
    data.length > Math.ceil(maximum / 3) * 4 + 4 ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw fail(`The ${label} must be a bounded, valid base64 attachment.`, 'INVALID_INPUT');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > maximum || bytes.toString('base64') !== data)
    throw fail(`The ${label} exceeds its size limit or is malformed.`, 'INVALID_INPUT');
  return bytes;
}
function audioFormat(bytes, requested) {
  const mime = String(requested || '')
    .split(';')[0]
    .toLowerCase();
  const formats = {
    'audio/webm': 'webm',
    'video/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'audio/flac': 'flac',
  };
  const extension = formats[mime];
  if (!extension) throw fail('Use a finalized WebM, Ogg, WAV, MP3, MP4, or FLAC recording.', 'INVALID_INPUT');
  const signature =
    extension === 'webm'
      ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : extension === 'ogg'
        ? bytes.toString('ascii', 0, 4) === 'OggS'
        : extension === 'wav'
          ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
          : extension === 'flac'
            ? bytes.toString('ascii', 0, 4) === 'fLaC'
            : ['mp4', 'm4a'].includes(extension)
              ? bytes.toString('ascii', 4, 8) === 'ftyp'
              : bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!signature) throw fail('The recording bytes do not match the selected audio format.', 'INVALID_INPUT');
  return { mime, extension };
}
async function transcribe(settings, key, payload, signal) {
  const name = settings.voiceProvider || settings.provider;
  if (!CLOUD[name])
    throw fail(
      'Transcription requires a configured OpenAI or Groq speech provider. Ollama does not transcribe recordings.',
    );
  const model = modelName(settings.voiceModel);
  const bytes = decodeAsset(payload.data, 10 * 1024 * 1024, 'recording');
  const format = audioFormat(bytes, payload.mimeType);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: format.mime }), `recording.${format.extension}`);
  form.set('model', model);
  form.set('response_format', 'json');
  if (payload.language) {
    if (!/^[a-z]{2}$/.test(payload.language))
      throw fail('Use a two-letter speech language code.', 'INVALID_INPUT');
    form.set('language', payload.language);
  }
  const response = await request(
    CLOUD[name] + '/audio/transcriptions',
    { method: 'POST', headers: keyHeaders(name, key), body: form, signal: requestSignal(signal, 120000) },
    name,
  );
  const result = await json(response);
  if (typeof result.text !== 'string' || !result.text.trim())
    throw fail('The speech provider returned no transcript. Record clear speech and retry.');
  return { text: result.text.slice(0, 100000), provider: name, model };
}
function imageFormat(bytes, requested) {
  const mime = String(requested || '').toLowerCase();
  const valid =
    mime === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mime === 'image/webp'
          ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          : false;
  if (!valid)
    throw fail('Choose a valid PNG, JPEG, or WebP image whose bytes match its file type.', 'INVALID_INPUT');
  return mime;
}
async function analyzeImage(settings, key, payload, signal) {
  const name = provider(settings),
    model = modelName(settings.visionModel || settings.model);
  const bytes = decodeAsset(payload.data, 5 * 1024 * 1024, 'image');
  const mime = imageFormat(bytes, payload.mimeType);
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 12000)
    throw fail('Enter an image question within 12,000 characters.', 'INVALID_INPUT');
  const merged = requestSignal(signal);
  let body, base;
  if (name === 'ollama') {
    base = ollamaBase(settings);
    const info = await json(
      await request(
        base + '/api/show',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
          signal: merged,
        },
        'Ollama',
      ),
    );
    if (!Array.isArray(info.capabilities) || !info.capabilities.includes('vision'))
      throw fail(
        'The selected Ollama model does not report vision capability. Choose an installed vision model.',
      );
    body = {
      model,
      stream: false,
      messages: [{ role: 'user', content: payload.prompt, images: [bytes.toString('base64')] }],
      options: { num_predict: 2048 },
    };
  } else {
    base = CLOUD[name];
    body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: payload.prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } },
          ],
        },
      ],
    };
    if (name === 'openai') {
      body.store = false;
      body.max_completion_tokens = 2048;
    } else body.max_tokens = 2048;
  }
  const result = await json(
    await request(
      base + (name === 'ollama' ? '/api/chat' : '/chat/completions'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders(name, key) },
        body: JSON.stringify(body),
        signal: merged,
      },
      name,
    ),
  );
  const text = name === 'ollama' ? result.message?.content : result.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim())
    throw fail('The vision provider returned no analysis. Check model compatibility.');
  return {
    text,
    provider: name,
    model,
    usage: {
      inputTokens: tokenCount(result.usage?.prompt_tokens ?? result.prompt_eval_count),
      outputTokens: tokenCount(result.usage?.completion_tokens ?? result.eval_count),
    },
  };
}
module.exports = { streamChat, providerHealth, transcribe, analyzeImage };
