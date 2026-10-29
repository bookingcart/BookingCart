// Fetch wrapper for the transport API (bus, boat/ferry and train). Re-exports the
// shared money / date helpers so a seat price and a ticket price format alike.

import { addDays, formatDate, formatDateTime, money, todayISO } from './ticketingClient.js';

async function request({ method = 'GET', query, body, headers } = {}) {
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

export function transportGet(action, query, headers) {
  return request({ query: { action, ...query }, headers });
}

export function transportPost(action, payload, headers) {
  return request({ method: 'POST', body: { action, ...payload }, headers });
}

/**
 * Operator console calls. Every one carries the signed-in operator, because the
 * API re-checks that this account really owns (or works for) that company.
 */
export function operatorGet(action, operatorId, query, headers) {
  return transportGet(action, { operatorId, ...(query || {}) }, headers);
}

export function operatorPost(action, operatorId, payload, headers) {
  return transportPost(action, { operatorId, ...(payload || {}) }, headers);
}

/** CSV is a raw blob, so the report export cannot reuse the JSON wrapper. */
export async function downloadTransportReport({ operatorId, report, from, to, headers }) {
  const params = new URLSearchParams({ action: 'report-export', operatorId: String(operatorId), report, from, to });
  const response = await fetch(`/api/transport?${params.toString()}`, { headers });
  if (!response.ok) {
    let message = 'Export failed';
    try { message = (await response.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `transport-${report}-${from}-to-${to}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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

/** Vehicle photography, swapped by type on the search hero and the ticket stub. */
export const TRANSPORT_PHOTOS = {
  bus: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=2000&q=80',
  boat: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=2000&q=80',
  train: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=2000&q=80',
};

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
