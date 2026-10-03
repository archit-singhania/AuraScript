'use strict';

function aborted(signal) {
  if (signal?.aborted) throw new DOMException('The request was interrupted.', 'AbortError');
}

async function lines(response, consume, { signal, maxBytes = 4 * 1024 * 1024, maxLine = 256 * 1024 } = {}) {
  if (!response?.body) throw new Error('The provider returned no response stream.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    bytes = 0,
    finished = false;
  const cancel = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      aborted(signal);
      const result = await reader.read();
      aborted(signal);
      if (result.done) {
        finished = true;
        pending += decoder.decode();
        break;
      }
      bytes += result.value.byteLength;
      if (bytes > maxBytes) throw new Error('The provider response exceeds the streaming limit.');
      pending += decoder.decode(result.value, { stream: true });
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (line.length > maxLine) throw new Error('The provider returned an oversized stream event.');
        if ((await consume(line)) === false) return;
        aborted(signal);
      }
      if (pending.length > maxLine) throw new Error('The provider returned an oversized stream event.');
    }
    if (pending && (await consume(pending.replace(/\r$/, ''))) === false) return;
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readNDJSON(response, onEvent, options = {}) {
  await lines(
    response,
    async (line) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error('The provider returned malformed streaming JSON.');
      }
      return onEvent(event);
    },
    options,
  );
}

async function readSSE(response, onEvent, options = {}) {
  const maxEvent = options.maxEvent || 256 * 1024;
  let data = [],
    size = 0,
    name = 'message',
    id;
  async function dispatch() {
    if (!data.length) {
      name = 'message';
      return;
    }
    const event = { event: name, data: data.join('\n'), id };
    data = [];
    size = 0;
    name = 'message';
    return onEvent(event);
  }
  await lines(
    response,
    async (line) => {
      if (!line) return dispatch();
      if (line.startsWith(':')) return;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') {
        data.push(value);
        size += value.length + 1;
        if (size > maxEvent) throw new Error('The provider returned an oversized stream event.');
      } else if (field === 'event') name = value;
      else if (field === 'id' && !value.includes('\0')) id = value;
    },
    options,
  );
  // Dispatch a complete event that ends at EOF without the final blank line.
  await dispatch();
}

module.exports = { readNDJSON, readSSE };
