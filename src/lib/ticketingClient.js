// Thin fetch layer for the attraction ticketing APIs. Components pass the
// `authHeaders()` result from useAuth so the token handling stays in one place.

async function request(path, { method = 'GET', headers, body, query } = {}) {
  let url = path;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text.slice(0, 200) }; }
  if (!response.ok && !data.error) data.error = `Request failed (${response.status})`;
  return { ...data, httpStatus: response.status };
}

export function ownerGet(action, query, headers) {
  return request('/api/attraction-ticketing', { headers, query: { action, ...query } });
}

export function ownerPost(action, payload, headers) {
  return request('/api/attraction-ticketing', { method: 'POST', headers, body: { action, ...payload } });
}

export function salesGet(action, query, headers) {
  return request('/api/attraction-ticket-sales', { headers, query: { action, ...query } });
}

export function salesPost(action, payload, headers) {
  return request('/api/attraction-ticket-sales', { method: 'POST', headers, body: { action, ...payload } });
}

export function checkoutGet(action, query) {
  return request('/api/attraction-ticket-checkout', { query: { action, ...query } });
}

export function checkoutPost(action, payload, headers) {
  return request('/api/attraction-ticket-checkout', { method: 'POST', headers, body: { action, ...payload } });
}

/** CSV export needs the raw blob, so it cannot reuse `request`. */
export async function downloadReport({ attractionId, report, from, to, headers }) {
  const params = new URLSearchParams({
    action: 'export',
    attractionId: String(attractionId),
    report,
    from,
    to,
  });
  const response = await fetch(`/api/attraction-ticketing?${params.toString()}`, { headers });
  if (!response.ok) {
    let message = 'Export failed';
    try { message = (await response.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ticket-${report}-${from}-to-${to}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function money(amount, currency = 'USD') {
  const value = Number(amount);
  const code = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(
      Number.isFinite(value) ? value : 0
    );
  } catch {
    return `${code} ${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  }
}

export function formatDate(iso) {
  if (!iso) return '—';
  const value = String(iso).slice(0, 10);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}
