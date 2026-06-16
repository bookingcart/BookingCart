const STORAGE_JWT_TOKEN = 'bookingcart_jwt_token';
const STORAGE_GOOGLE_TOKEN = 'bookingcart_google_id_token';

function getSupportAuthToken() {
  try {
    return localStorage.getItem(STORAGE_JWT_TOKEN) || localStorage.getItem(STORAGE_GOOGLE_TOKEN) || '';
  } catch {
    return '';
  }
}

function buildHeaders(includeJson = false) {
  const token = getSupportAuthToken();
  const headers = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function buildSupportQuery({ email = '', threadId = '', guest = false } = {}) {
  const params = new URLSearchParams();
  if (email) params.set('email', String(email).trim().toLowerCase());
  if (threadId) params.set('threadId', String(threadId).trim());
  if (guest) params.set('guest', '1');
  return params.toString();
}

export async function loadSupportThreads(options = {}) {
  const query = buildSupportQuery(options);
  const url = `/api/support${query ? `?${query}` : ''}`;

  try {
    const resp = await fetch(url, { headers: buildHeaders() });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: data.error || `HTTP ${resp.status}`, threads: [] };
    }
    return { ok: true, status: resp.status, threads: Array.isArray(data.threads) ? data.threads : [] };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || 'Network error', threads: [] };
  }
}

export async function postSupportMessage({ threadId, email = '', topic = '', message, guest = false }) {
  try {
    const resp = await fetch('/api/support', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({
        threadId,
        email,
        topic,
        message,
        guest,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: data.error || `HTTP ${resp.status}` };
    }
    return { ok: true, status: resp.status, thread: data.thread || null };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || 'Network error' };
  }
}

export async function patchSupportThread(id, updates) {
  try {
    const resp = await fetch('/api/support', {
      method: 'PATCH',
      headers: buildHeaders(true),
      body: JSON.stringify({ id, ...updates }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: data.error || `HTTP ${resp.status}`, thread: null };
    }
    return { ok: true, status: resp.status, thread: data.thread || null };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || 'Network error', thread: null };
  }
}

function parseEventBlock(block) {
  const lines = String(block || '').split('\n');
  let event = 'message';
  const data = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trim());
    }
  }

  if (!data.length) return null;

  let payload = null;
  try {
    payload = JSON.parse(data.join('\n'));
  } catch {
    payload = data.join('\n');
  }

  return { event, payload };
}

export function connectSupportStream(options = {}) {
  const { onReady, onThread, onError } = options;
  const query = buildSupportQuery(options);
  const url = `/api/support/stream${query ? `?${query}` : ''}`;
  const controller = new AbortController();
  const connectTimeoutId = window.setTimeout(() => {
    if (controller.signal.aborted) return;
    onError?.(new Error('Support live updates connection timed out'));
    controller.abort();
  }, 3000);

  (async () => {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      window.clearTimeout(connectTimeoutId);
      onReady?.();

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const parsed = parseEventBlock(chunk);
          if (!parsed) continue;
          if (parsed.event === 'thread') onThread?.(parsed.payload);
        }
      }
    } catch (err) {
      window.clearTimeout(connectTimeoutId);
      if (!controller.signal.aborted) onError?.(err);
    }
  })();

  return () => {
    window.clearTimeout(connectTimeoutId);
    controller.abort();
  };
}
