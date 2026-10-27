/**
 * Client-side visitor location detection.
 *
 * Resolution order:
 *   1. `/api/geo` — our own endpoint. Uses the CDN's geo headers (Vercel/Cloudflare)
 *      and falls back to an IP lookup server-side, so it also works when browser
 *      calls to third-party geo APIs are blocked by ad-blockers or CORS.
 *   2. ipapi.co, then ipwho.is, called directly from the browser.
 *   3. The browser timezone, which is offline-safe and never needs a key.
 *
 * Results are cached for six hours. A different timezone invalidates the cache so a
 * traveller (or a VPN switch) sees the destination update instead of a stale country.
 */

const CACHE_KEY = 'bc_geo_v2';
const LEGACY_CACHE_KEYS = ['bc_geo_data'];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const TZ_TO_CC = {
  'Africa/Kampala': 'UG', 'Africa/Nairobi': 'KE', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kigali': 'RW', 'Africa/Addis_Ababa': 'ET', 'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA', 'Africa/Dakar': 'SN', 'Africa/Lusaka': 'ZM',
  'Africa/Harare': 'ZW', 'Africa/Maputo': 'MZ', 'Africa/Khartoum': 'SD',
  'Indian/Mauritius': 'MU', 'Indian/Reunion': 'RE',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Lisbon': 'PT',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Athens': 'GR',
  'Europe/Istanbul': 'TR', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU',
  'America/New_York': 'US', 'America/Los_Angeles': 'US', 'America/Chicago': 'US',
  'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Toronto': 'CA',
  'America/Vancouver': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  'America/Argentina/Buenos_Aires': 'AR',
  'Asia/Kolkata': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Asia/Beirut': 'LB', 'Asia/Amman': 'JO', 'Asia/Baghdad': 'IQ',
  'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL', 'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Hong_Kong': 'HK',
  'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ',
};

let inflight = null;

/** Country code → flag emoji, without shipping a lookup table. */
export function countryFlag(code) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🌍';
  return String.fromCodePoint(...[...cc].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function countryNameFromCode(code) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function clearLegacyCache() {
  try {
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {}
}

function readCache() {
  clearLegacyCache();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.countryCode) return null;
    if (Date.now() - Number(parsed.ts || 0) > CACHE_TTL_MS) return null;
    if (parsed.timeZone && parsed.timeZone !== browserTimeZone()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(location) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(location));
  } catch {}
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(payload, source) {
  const countryCode = String(payload.countryCode || payload.country_code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    countryCode,
    countryName: payload.countryName || payload.country_name || payload.country || countryNameFromCode(countryCode),
    city: payload.city || '',
    region: payload.region || payload.region_name || '',
    latitude: toNumber(payload.latitude ?? payload.lat),
    longitude: toNumber(payload.longitude ?? payload.lon),
    source,
  };
}

async function detect() {
  const own = await fetchJson('/api/geo');
  if (own?.ok) {
    const location = normalize(own, own.source ? `server:${own.source}` : 'server');
    if (location) return location;
  }

  const ipapi = await fetchJson('https://ipapi.co/json/');
  if (ipapi && !ipapi.error) {
    const location = normalize(ipapi, 'ipapi');
    if (location) return location;
  }

  const ipwho = await fetchJson('https://ipwho.is/');
  if (ipwho && ipwho.success !== false) {
    const location = normalize(ipwho, 'ipwho');
    if (location) return location;
  }

  const cc = TZ_TO_CC[browserTimeZone()];
  if (cc) {
    return {
      countryCode: cc,
      countryName: countryNameFromCode(cc),
      city: '',
      region: '',
      latitude: null,
      longitude: null,
      source: 'timezone',
    };
  }

  return null;
}

/** Resolve the visitor's location once per page load (and once per cache window). */
export function getGeo() {
  const cached = readCache();
  if (cached) return Promise.resolve(cached);

  if (!inflight) {
    inflight = detect()
      .then((location) => {
        if (!location) return null;
        const entry = { ...location, timeZone: browserTimeZone(), ts: Date.now() };
        writeCache(entry);
        return entry;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop the cache — useful after a manual "change location" action. */
export function clearGeoCache() {
  clearLegacyCache();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}
