const crypto = require('crypto');
const fetch = require('node-fetch');
const { query, isDbConfigured, initDb } = require('./db');

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = Number(process.env.ATTRACTIONS_CACHE_TTL_MS || 15 * 60 * 1000);
const memoryCache = new Map();

const CATEGORY_MAP = {
  culture: 'entertainment.culture,tourism.sights,tourism.attraction',
  museums: 'entertainment.museum',
  nature: 'natural,national_park,leisure.park',
  heritage: 'heritage,tourism.sights',
  entertainment: 'entertainment,commercial.shopping_mall',
  family: 'entertainment.theme_park,entertainment.zoo,leisure.park',
};

function cleanText(value, max = 500) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function withTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizeCategories(value) {
  const requested = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const keys = requested.length ? requested : ['culture', 'museums', 'nature', 'heritage', 'entertainment', 'family'];
  return Array.from(new Set(keys.flatMap((key) => String(CATEGORY_MAP[key] || '').split(',')).filter(Boolean))).join(',');
}

function categoryLabel(categories = []) {
  const joined = categories.join(' ').toLowerCase();
  if (joined.includes('museum')) return 'Museum';
  if (joined.includes('park') || joined.includes('natural')) return 'Nature & parks';
  if (joined.includes('heritage') || joined.includes('sight')) return 'Landmark';
  if (joined.includes('zoo') || joined.includes('theme_park')) return 'Family';
  if (joined.includes('entertainment')) return 'Entertainment';
  return 'Attraction';
}

function normalizeGeoapify(feature) {
  const p = feature?.properties || {};
  const lon = Number(feature?.geometry?.coordinates?.[0]);
  const lat = Number(feature?.geometry?.coordinates?.[1]);
  if (!p.place_id || !p.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const website = safeHttpsUrl(p.website || p.datasource?.raw?.website);
  return {
    id: `geoapify:${p.place_id}`,
    source: 'geoapify',
    sourceId: String(p.place_id),
    name: cleanText(p.name, 160),
    category: categoryLabel(categories),
    categories,
    summary: cleanText(p.formatted || p.address_line2 || '', 320),
    address: cleanText(p.formatted || p.address_line2 || '', 240),
    city: cleanText(p.city || p.county || p.state || '', 100),
    country: cleanText(p.country || '', 100),
    countryCode: cleanText(p.country_code || '', 8).toUpperCase(),
    lat,
    lon,
    distance: Number.isFinite(Number(p.distance)) ? Math.round(Number(p.distance)) : null,
    image: null,
    accessibility: {
      wheelchair: p.wheelchair === 'yes' ? true : p.wheelchair === 'no' ? false : null,
    },
    website,
    canonicalUrl: website,
    attribution: { label: 'Geoapify / OpenStreetMap contributors', url: 'https://www.geoapify.com/' },
    bookable: false,
    offers: [],
  };
}

function normalizeWikiPage(page) {
  const coordinates = page?.coordinates?.[0];
  if (!page?.pageid || !page?.title || !coordinates) return null;
  const canonicalUrl = safeHttpsUrl(page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`);
  const imageUrl = safeHttpsUrl(page.thumbnail?.source);
  return {
    id: `wikimedia:${page.pageid}`,
    source: 'wikimedia',
    sourceId: String(page.pageid),
    name: cleanText(page.title, 160),
    category: 'Place of interest',
    categories: ['wikimedia.place'],
    summary: cleanText(page.description || page.extract || '', 400),
    address: '', city: '', country: '', countryCode: '',
    lat: Number(coordinates.lat), lon: Number(coordinates.lon), distance: null,
    image: imageUrl ? { url: imageUrl, alt: cleanText(page.title, 160), attribution: 'Wikimedia Commons' } : null,
    accessibility: { wheelchair: null }, website: canonicalUrl, canonicalUrl,
    attribution: { label: 'Wikipedia contributors', url: canonicalUrl },
    bookable: false, offers: [],
  };
}

function normalizeGetYourGuide(tour, partnerId = '') {
  const rawUrl = safeHttpsUrl(tour.url || tour.web_url);
  if (!tour?.id || !tour?.title || !rawUrl) return null;
  const url = new URL(rawUrl);
  if (partnerId) url.searchParams.set('partner_id', partnerId);
  const image = safeHttpsUrl(tour.image_url || tour.pictures?.[0]?.url || tour.media?.[0]?.url);
  const amount = Number(tour.price?.amount ?? tour.price);
  const offer = {
    provider: 'GetYourGuide', url: url.toString(),
    currency: cleanText(tour.price?.currency || tour.currency || '', 8).toUpperCase(),
    amount: Number.isFinite(amount) ? amount : null,
    label: 'Check availability',
  };
  return {
    id: `getyourguide:${tour.id}`, source: 'getyourguide', sourceId: String(tour.id),
    name: cleanText(tour.title, 160), category: cleanText(tour.categories?.[0]?.name || 'Bookable experience', 80),
    categories: (tour.categories || []).map((c) => cleanText(c.name || c, 80)).filter(Boolean),
    summary: cleanText(tour.abstract || tour.description || '', 400), address: '',
    city: cleanText(tour.city?.name || '', 100), country: cleanText(tour.country?.name || '', 100), countryCode: '',
    lat: Number(tour.coordinates?.lat || tour.latitude) || null, lon: Number(tour.coordinates?.lng || tour.longitude) || null,
    distance: null, image: image ? { url: image, alt: cleanText(tour.title, 160), attribution: 'GetYourGuide' } : null,
    accessibility: { wheelchair: null }, website: url.toString(), canonicalUrl: url.toString(),
    attribution: { label: 'GetYourGuide', url: 'https://www.getyourguide.com/' },
    bookable: true, offers: [offer], rating: Number(tour.rating) || null,
    reviewCount: Number(tour.reviewCount || tour.reviews_count) || null,
    duration: cleanText(tour.duration || '', 80),
  };
}

function cacheKey(input) {
  return `attractions:${crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')}`;
}

async function readCache(key) {
  const memory = memoryCache.get(key);
  if (memory && memory.expiresAt > Date.now()) return memory.payload;
  if (!isDbConfigured()) return null;
  try {
    await initDb();
    const result = await query('SELECT payload FROM bc_search_cache WHERE key = $1 AND expires_at > NOW()', [key]);
    return result.rows[0]?.payload || null;
  } catch { return null; }
}

async function writeCache(key, payload) {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  memoryCache.set(key, { payload, expiresAt: expiresAt.getTime() });
  if (!isDbConfigured()) return;
  try {
    await initDb();
    await query(`INSERT INTO bc_search_cache (key, payload, meta, expires_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT (key) DO UPDATE
      SET payload = EXCLUDED.payload, meta = EXCLUDED.meta, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
      [key, payload, { feature: 'attractions' }, expiresAt]);
  } catch { /* memory cache remains available */ }
}

async function geocodeDestination(q, language = 'en') {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return { results: [], error: 'GEOAPIFY_API_KEY is not configured' };
  const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text', q); url.searchParams.set('lang', language); url.searchParams.set('limit', '8'); url.searchParams.set('type', 'city'); url.searchParams.set('apiKey', key);
  const response = await withTimeout(url);
  if (!response.ok) throw new Error(`Geoapify geocoding returned ${response.status}`);
  const data = await response.json();
  return { results: (data.features || []).map((f) => ({
    id: f.properties?.place_id, name: cleanText(f.properties?.city || f.properties?.name, 100),
    label: cleanText(f.properties?.formatted, 180), country: cleanText(f.properties?.country, 100),
    countryCode: cleanText(f.properties?.country_code, 8).toUpperCase(),
    lat: Number(f.properties?.lat), lon: Number(f.properties?.lon),
  })).filter((r) => r.id && r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon)) };
}

async function searchGeoapify(input) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new Error('GEOAPIFY_API_KEY is not configured');
  const url = new URL('https://api.geoapify.com/v2/places');
  url.searchParams.set('categories', normalizeCategories(input.categories));
  if (input.bounds) url.searchParams.set('filter', `rect:${input.bounds}`);
  else url.searchParams.set('filter', `circle:${input.lon},${input.lat},${input.radius}`);
  url.searchParams.set('bias', `proximity:${input.lon},${input.lat}`);
  url.searchParams.set('limit', String(input.limit)); url.searchParams.set('lang', input.language); url.searchParams.set('apiKey', key);
  const response = await withTimeout(url);
  if (!response.ok) throw new Error(`Geoapify places returned ${response.status}`);
  const data = await response.json();
  return (data.features || []).map(normalizeGeoapify).filter(Boolean);
}

async function searchWikimedia(input) {
  const url = new URL(`https://${/^[a-z]{2,3}$/.test(input.language) ? input.language : 'en'}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query'); url.searchParams.set('format', 'json'); url.searchParams.set('origin', '*');
  url.searchParams.set('generator', 'geosearch'); url.searchParams.set('ggscoord', `${input.lat}|${input.lon}`);
  url.searchParams.set('ggsradius', String(Math.min(input.radius, 10000))); url.searchParams.set('ggslimit', String(Math.min(input.limit, 30)));
  url.searchParams.set('prop', 'coordinates|pageimages|description|extracts|info'); url.searchParams.set('inprop', 'url');
  url.searchParams.set('exintro', '1'); url.searchParams.set('explaintext', '1'); url.searchParams.set('pithumbsize', '640');
  const response = await withTimeout(url, { headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' } });
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map(normalizeWikiPage).filter(Boolean);
}

async function searchGetYourGuide(input) {
  const key = process.env.GETYOURGUIDE_API_KEY;
  if (!key || !input.q) return [];
  const url = new URL('https://api.getyourguide.com/1/tours');
  url.searchParams.set('q', input.q); url.searchParams.set('cnt_language', input.language); url.searchParams.set('currency', input.currency); url.searchParams.set('limit', String(Math.min(input.limit, 20)));
  const response = await withTimeout(url, { headers: { Accept: 'application/json', 'X-ACCESS-TOKEN': key } });
  if (!response.ok) throw new Error(`GetYourGuide returned ${response.status}`);
  const data = await response.json();
  return (data.data?.tours || data.tours || []).map((tour) => normalizeGetYourGuide(tour, process.env.GETYOURGUIDE_PARTNER_ID || '')).filter(Boolean);
}

async function getAttraction(source, id, options = {}) {
  if (source === 'geoapify') {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) throw new Error('GEOAPIFY_API_KEY is not configured');
    const url = new URL('https://api.geoapify.com/v2/place-details');
    url.searchParams.set('id', id); url.searchParams.set('features', 'details'); url.searchParams.set('apiKey', key);
    const response = await withTimeout(url);
    if (!response.ok) throw new Error(`Geoapify place details returned ${response.status}`);
    const data = await response.json();
    return (data.features || []).map(normalizeGeoapify).find(Boolean) || null;
  }
  if (source === 'wikimedia') {
    const language = /^[a-z]{2,3}$/.test(options.language || '') ? options.language : 'en';
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'query'); url.searchParams.set('format', 'json'); url.searchParams.set('pageids', id);
    url.searchParams.set('prop', 'coordinates|pageimages|description|extracts|info'); url.searchParams.set('inprop', 'url');
    url.searchParams.set('explaintext', '1'); url.searchParams.set('pithumbsize', '1200');
    const response = await withTimeout(url, { headers: { 'User-Agent': 'BookingCart/1.0 (bookingcart.business@gmail.com)' } });
    if (!response.ok) throw new Error(`Wikimedia details returned ${response.status}`);
    const data = await response.json();
    return normalizeWikiPage(data.query?.pages?.[id]);
  }
  if (source === 'getyourguide') {
    const key = process.env.GETYOURGUIDE_API_KEY;
    if (!key) throw new Error('GETYOURGUIDE_API_KEY is not configured');
    const url = new URL(`https://api.getyourguide.com/1/tours/${encodeURIComponent(id)}`);
    url.searchParams.set('cnt_language', options.language || 'en'); url.searchParams.set('currency', options.currency || 'USD');
    const response = await withTimeout(url, { headers: { Accept: 'application/json', 'X-ACCESS-TOKEN': key } });
    if (!response.ok) throw new Error(`GetYourGuide details returned ${response.status}`);
    const data = await response.json();
    return normalizeGetYourGuide(data.data || data, process.env.GETYOURGUIDE_PARTNER_ID || '');
  }
  return null;
}

function dedupeAttractions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const coord = Number.isFinite(item.lat) && Number.isFinite(item.lon) ? `${item.lat.toFixed(3)}:${item.lon.toFixed(3)}` : '';
    const key = `${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}:${coord}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function searchAttractions(input) {
  const key = cacheKey(input);
  const cached = await readCache(key);
  if (cached) return { ...cached, cached: true };
  const providers = [
    ['geoapify', searchGeoapify(input)], ['wikimedia', searchWikimedia(input)], ['getyourguide', searchGetYourGuide(input)],
  ];
  const settled = await Promise.allSettled(providers.map(([, promise]) => promise));
  const errors = []; const items = [];
  settled.forEach((result, index) => {
    const provider = providers[index][0];
    if (result.status === 'fulfilled') items.push(...result.value);
    else errors.push({ provider, message: cleanText(result.reason?.message || 'Provider unavailable', 160) });
  });
  let results = dedupeAttractions(items);
  if (input.bookable) results = results.filter((item) => item.bookable);
  if (input.sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
  else if (input.sort === 'distance') results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const payload = { ok: results.length > 0 || errors.length < providers.length, partial: errors.length > 0 && results.length > 0, results, errors, total: results.length, cached: false };
  await writeCache(key, payload);
  return payload;
}

module.exports = {
  CATEGORY_MAP, cleanText, safeHttpsUrl, normalizeGeoapify, normalizeWikiPage,
  normalizeGetYourGuide, dedupeAttractions, geocodeDestination, searchAttractions, getAttraction,
};
