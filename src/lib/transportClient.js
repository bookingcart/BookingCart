// Fetch wrapper for the transport API (bus, boat/ferry and train). Re-exports the
// shared money / date helpers so a seat price and a ticket price format alike.

import { addDays, formatDate, formatDateTime, money, todayISO } from './ticketingClient.js';

async function request({ method = 'GET', query, body } = {}) {
  let url = '/api/transport';
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text.slice(0, 200) }; }
  if (!response.ok && !data.error) data.error = `Request failed (${response.status})`;
  return { ...data, httpStatus: response.status };
}

export function transportGet(action, query) {
  return request({ query: { action, ...query } });
}

export function transportPost(action, payload) {
  return request({ method: 'POST', body: { action, ...payload } });
}

/** What each transport type is called, and the icon/accent it carries everywhere. */
export const TRANSPORT_TYPES = [
  {
    key: 'bus',
    label: 'Bus',
    plural: 'Buses',
    icon: 'ph-bus',
    accent: 'emerald',
    blurb: 'Intercity coaches with assigned seats',
    stopLabel: 'Bus terminal',
  },
  {
    key: 'boat',
    label: 'Boat & Ferry',
    plural: 'Boats & ferries',
    icon: 'ph-boat',
    accent: 'sky',
    blurb: 'Ferries and launches across the water',
    stopLabel: 'Port',
  },
  {
    key: 'train',
    label: 'Train',
    plural: 'Trains',
    icon: 'ph-train',
    accent: 'violet',
    blurb: 'Rail journeys with reserved berths',
    stopLabel: 'Station',
  },
];

export function typeMeta(key) {
  return TRANSPORT_TYPES.find((entry) => entry.key === key) || TRANSPORT_TYPES[0];
}

export function clockLabel(time) {
  const value = String(time || '');
  if (!/^\d{2}:\d{2}$/.test(value)) return value || '—';
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** "1h 30m" — travel duration shown on a journey card. */
export function durationLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function shortDate(iso) {
  if (!iso) return '';
  const parsed = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** QR image for a ticket — same renderer the cinema tickets use. */
export function qrSrc(value, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0b0d0c&margin=0`;
}

export { addDays, formatDate, formatDateTime, money, todayISO };
