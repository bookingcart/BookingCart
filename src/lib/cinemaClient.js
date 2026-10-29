// Small fetch wrapper for the cinema API. Shares the money / date helpers with
// the rest of ticketing so a seat price and a ticket price always format alike.

import { addDays, formatDate, formatDateTime, money, todayISO } from './ticketingClient.js';

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

export function cinemaGet(action, query, headers) {
  return request('/api/cinema', { headers, query: { action, ...query } });
}

export function cinemaPost(action, payload, headers) {
  return request('/api/cinema', { method: 'POST', headers, body: { action, ...payload } });
}

/** CSV export needs the raw blob, so it cannot reuse `request`. */
export async function downloadCinemaReport({ attractionId, report, from, to, headers }) {
  const params = new URLSearchParams({
    action: 'report-export',
    attractionId: String(attractionId),
    report,
    from,
    to,
  });
  const response = await fetch(`/api/cinema?${params.toString()}`, { headers });
  if (!response.ok) {
    let message = 'Export failed';
    try { message = (await response.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cinema-${report}-${from}-to-${to}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function clockLabel(time) {
  const value = String(time || '');
  if (!/^\d{2}:\d{2}$/.test(value)) return value || '—';
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function shortDate(iso) {
  if (!iso) return '';
  const parsed = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function dayParts(iso) {
  const parsed = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { weekday: '', day: '', month: '' };
  return {
    weekday: parsed.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: parsed.toLocaleDateString('en-GB', { day: '2-digit' }),
    month: parsed.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

export { addDays, formatDate, formatDateTime, money, todayISO };
