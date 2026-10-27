const fetch = require('node-fetch');
const { applyCors } = require('../lib/cors');

/**
 * GET /api/geo — resolve the visitor's approximate location.
 *
 * Order of preference:
 *   1. Edge geo headers (Vercel / Cloudflare / Netlify) — instant, free, no quota.
 *   2. ipapi.co, then ipwho.is, server-side (no browser CORS or ad-blocker issues).
 *
 * No API key is needed for any of these. The caller's IP is never returned.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;
const LOOKUP_TIMEOUT_MS = 3500;
const cache = new Map();

const INVALID_CODES = new Set(['', 'XX', 'ZZ', 'T1', 'A1', 'A2', 'O1']);

function firstHeader(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function decodeHeader(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value).replace(/\+/g, ' ').trim();
  } catch {
    return value.trim();
  }
}

function validCountryCode(code) {
  const normalized = String(code || '').toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && !INVALID_CODES.has(normalized) ? normalized : '';
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = firstHeader(forwarded, req.headers['x-real-ip'], req.headers['cf-connecting-ip'], req.socket?.remoteAddress);
  return raw.replace(/^::ffff:/, '').trim();
}

/** Loopback / private / link-local addresses cannot be geo-located. */
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === '::') return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

function countryNameFor(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(payload) {
  const countryCode = validCountryCode(payload.country_code || payload.countryCode);
  if (!countryCode) return null;
  return {
    countryCode,
    countryName: payload.country_name || payload.countryName || countryNameFor(countryCode),
    region: payload.region || payload.region_name || payload.regionName || '',
    city: payload.city || '',
    latitude: toNumber(payload.latitude ?? payload.lat),
    longitude: toNumber(payload.longitude ?? payload.lon ?? payload.lng),
  };
}

function fromEdgeHeaders(req) {
  const countryCode = validCountryCode(
    firstHeader(req.headers['x-vercel-ip-country'], req.headers['cf-ipcountry'], req.headers['x-country-code'], req.headers['x-geo-country'])
  );
  if (!countryCode) return null;
  return normalize({
    country_code: countryCode,
    city: decodeHeader(firstHeader(req.headers['x-vercel-ip-city'], req.headers['cf-ipcity'], req.headers['x-geo-city'])),
    region: decodeHeader(firstHeader(req.headers['x-vercel-ip-country-region'], req.headers['cf-region-code'], req.headers['x-geo-region'])),
    latitude: firstHeader(req.headers['x-vercel-ip-latitude'], req.headers['cf-iplatitude']),
    longitude: firstHeader(req.headers['x-vercel-ip-longitude'], req.headers['cf-iplongitude']),
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupByIp(ip) {
  const target = !isPrivateIp(ip) ? ip : '';
  const sources = [
    { name: 'ipapi', url: target ? `https://ipapi.co/${target}/json/` : 'https://ipapi.co/json/' },
    { name: 'ipwho', url: target ? `https://ipwho.is/${target}` : 'https://ipwho.is/' },
  ];

  for (const source of sources) {
    const data = await fetchJson(source.url);
    if (!data || data.error || data.success === false) continue;
    const location = normalize(data);
    if (location) return { ...location, source: source.name };
  }
  return null;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { ts: Date.now(), data });
}

async function resolveLocation(req) {
  // Edge headers are free and instant, so they are never cached — and caching them by
  // IP would leak one visitor's country to another visitor sharing that key.
  const edge = fromEdgeHeaders(req);
  if (edge) return { ...edge, source: 'edge' };

  const ip = clientIp(req);
  const cacheKey = ip || 'anonymous';
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const location = await lookupByIp(ip);
  if (!location) return null;

  writeCache(cacheKey, location);
  return location;
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const location = await resolveLocation(req);
    // Callers only need a coarse location, so let the browser reuse it briefly.
    res.setHeader('Cache-Control', 'private, max-age=1800');
    if (!location) return res.status(200).json({ ok: false, error: 'Location unavailable' });
    return res.status(200).json({ ok: true, ...location });
  } catch (error) {
    console.error('[geo] lookup failed:', error.message);
    return res.status(200).json({ ok: false, error: 'Location unavailable' });
  }
};
