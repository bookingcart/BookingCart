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
const OVERRIDE_KEY = 'bc_geo_override';
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
let resolved = null;

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

let codeByName = null;

/** Reverse of countryNameFromCode — Nominatim only gives us a country name. */
export function countryCodeFromName(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return '';
  if (!codeByName) {
    codeByName = new Map();
    const codes =
      'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW';
    for (const code of codes.split(' ')) {
      const label = countryNameFromCode(code).toLowerCase();
      if (label) codeByName.set(label, code);
    }
  }
  return codeByName.get(target) || '';
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

/** A location the visitor picked by hand — it always wins over IP detection. */
export function readGeoOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.city && !parsed?.countryCode) return null;
    return { ...parsed, source: 'manual' };
  } catch {
    return null;
  }
}

/** Pin the section to a chosen city/country (used when IP detection is wrong). */
export function setGeoOverride(location) {
  const entry = {
    city: location.city || '',
    countryCode: String(location.countryCode || '').toUpperCase(),
    countryName: location.countryName || countryNameFromCode(location.countryCode),
    latitude: toNumber(location.latitude),
    longitude: toNumber(location.longitude),
    source: 'manual',
  };
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(entry));
  } catch {}
  resolved = null;
  return entry;
}

export function clearGeoOverride() {
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {}
  resolved = null;
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

/**
 * Resolve the visitor's location.
 *
 * Detection always runs fresh so a network or VPN switch is reflected immediately; the
 * local cache is only used when every detector fails (offline).
 */
export function getGeo({ useCache = false } = {}) {
  const override = readGeoOverride();
  if (override) return Promise.resolve(override);

  // One detection per page load; several sections ask for it.
  if (resolved && !useCache) return Promise.resolve(resolved);

  const cached = readCache();
  if (useCache && cached) return Promise.resolve(cached);

  if (!inflight) {
    inflight = detect()
      .then((location) => location || cached)
      .then((location) => {
        if (!location) return null;
        const entry = { ...location, timeZone: browserTimeZone(), ts: Date.now() };
        writeCache(entry);
        resolved = entry;
        return entry;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop everything cached about the location. */
export function clearGeoCache() {
  clearLegacyCache();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}
