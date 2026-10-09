const crypto = require('crypto');
const fetch = require('node-fetch');
const { query, isDbConfigured, initDb } = require('./db');

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = Number(process.env.ATTRACTIONS_CACHE_TTL_MS || 15 * 60 * 1000);
const memoryCache = new Map();
// Force clear cache once to allow newly approved local events to show up immediately
memoryCache.clear();

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
  const filtered = requested.filter((key) => CATEGORY_MAP[key]);
  const keys = filtered.length ? filtered : ['culture', 'museums', 'nature', 'heritage', 'entertainment', 'family'];
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
    lat: Number.isFinite(Number(tour.coordinates?.lat ?? tour.latitude)) ? Number(tour.coordinates?.lat ?? tour.latitude) : null,
    lon: Number.isFinite(Number(tour.coordinates?.lng ?? tour.longitude)) ? Number(tour.coordinates?.lng ?? tour.longitude) : null,
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

// ── Local Attraction Profiles (owner-listed attractions) ──
async function searchLocalAttractionProfiles(input) {
  let rows = [];

  if (isDbConfigured()) {
    try {
      await initDb();
      let sql = `SELECT * FROM bc_attraction_profiles WHERE status IN ('published', 'approved') AND deleted = false`;
      const params = [];
      if (input.q) {
        sql += ` AND (name ILIKE $1 OR city ILIKE $1 OR country ILIKE $1 OR category ILIKE $1 OR description ILIKE $1)`;
        params.push(`%${input.q}%`);
      }
      const res = await query(sql, params);
      rows = res.rows;
    } catch (err) {
      console.error('Error fetching local attraction profiles from db:', err);
    }
  } else if (global.__bc_attraction_profiles) {
    for (const [, p] of global.__bc_attraction_profiles) {
      if (!['published', 'approved'].includes(p.status) || p.deleted) continue;
      const qLower = (input.q || '').toLowerCase();
      if (qLower) {
        const matchName    = (p.name     || '').toLowerCase().includes(qLower);
        const matchCity    = (p.city     || '').toLowerCase().includes(qLower);
        const matchCountry = (p.country  || '').toLowerCase().includes(qLower);
        const matchCat    = (p.category  || '').toLowerCase().includes(qLower);
        if (!matchName && !matchCity && !matchCountry && !matchCat) continue;
      }
      rows.push(p);
    }
  }

  return rows.map(row => {
    const gallery = Array.isArray(row.gallery) ? row.gallery : [];
    const imageUrl = safeHttpsUrl(row.featured_image) || safeHttpsUrl(gallery[0]?.url || gallery[0]) || '';

    // Try to get coordinates from the row (schema doesn't store coords yet, so usually NaN)
    const lat = Number(row.lat || row.latitude || (row.contact && row.contact.lat));
    const lon = Number(row.lon || row.longitude || (row.contact && row.contact.lon));

    // Radius filter — only applied when the listing itself has stored coordinates.
    // If no coords are stored (most attraction profiles), always include the result.
    let distance = null;
    if (Number.isFinite(lat) && Number.isFinite(lon) &&
        Number.isFinite(input.lat) && Number.isFinite(input.lon)) {
      const R = 6371e3;
      const φ1 = input.lat * Math.PI / 180;
      const φ2 = lat * Math.PI / 180;
      const Δφ = (lat - input.lat) * Math.PI / 180;
      const Δλ = (lon - input.lon) * Math.PI / 180;
      const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distance > (input.radius || 12000)) return null;
    }

    const offers = row.price > 0 ? [{
      provider: 'BookingCart',
      url: `/attractions/local_attraction/${row.id}`,
      currency: row.currency || 'USD',
      amount: Number(row.price),
      label: 'Book Now',
    }] : [];

    return {
      id: `local_attraction:${row.id}`,
      source: 'local_event',   // reuse card renderer
      sourceId: String(row.id),
      name: cleanText(row.name, 160) || 'Local Attraction',
      category: cleanText(row.category, 80) || 'Attraction',
      categories: [cleanText(row.category, 80) || 'attraction'],
      summary: cleanText(row.description, 400),
      address: cleanText(row.location, 240),
      city: cleanText(row.city, 100),
      country: cleanText(row.country, 100),
      countryCode: '',
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      distance: distance !== null ? Math.round(distance) : null,
      image: imageUrl ? { url: imageUrl, alt: cleanText(row.name, 160), attribution: 'Organizer' } : null,
      accessibility: { wheelchair: null },
      website: '',
      canonicalUrl: '',
      attribution: { label: row.owner_email || 'BookingCart', url: '' },
      bookable: offers.length > 0,
      offers,
      rating: null,
      reviewCount: Number(row.bookings) || null,
      duration: cleanText(row.duration, 80),
    };
  }).filter(Boolean);
}

// ── Local Database Events ──
async function searchLocalEvents(input) {
  let rows = [];

  if (isDbConfigured()) {
    try {
      await initDb();
      let sql = `SELECT * FROM bc_event_profiles WHERE status = 'approved'`;
      let params = [];
      if (input.q) {
        sql += ` AND (step_event_info->>'eventName' ILIKE $1 OR step_location->>'city' ILIKE $1 OR step_location->>'country' ILIKE $1)`;
        params.push(`%${input.q}%`);
      }
      const res = await query(sql, params);
      rows = res.rows;
    } catch (err) {
      console.error('Error fetching local events from db:', err);
    }
  } else if (global.__bc_event_profiles) {
    // In-memory fallback
    for (const [, p] of global.__bc_event_profiles) {
      if (p.status !== 'approved') continue;
      
      const qLower = (input.q || '').toLowerCase();
      if (qLower) {
        const name = (p.step_event_info?.eventName || '').toLowerCase();
        const city = (p.step_location?.city || '').toLowerCase();
        const country = (p.step_location?.country || '').toLowerCase();
        
        if (!name.includes(qLower) && !city.includes(qLower) && !country.includes(qLower)) {
          continue;
        }
      }
      rows.push(p);
    }
  }

  return rows.map(row => {
      const info = row.step_event_info || {};
      const loc = row.step_location || {};
      const tickets = row.step_tickets?.list || [];
      const lowestPrice = tickets.reduce((min, t) => Math.min(min, Number(t.price) || Infinity), Infinity);
      
      const lat = Number(loc.latitude);
      const lon = Number(loc.longitude);
      
      // Calculate simple distance if input coordinates are provided
      let distance = null;
      if (Number.isFinite(input.lat) && Number.isFinite(input.lon) && Number.isFinite(lat) && Number.isFinite(lon)) {
        // approximate distance in meters (haversine)
        const R = 6371e3;
        const φ1 = input.lat * Math.PI/180;
        const φ2 = lat * Math.PI/180;
        const Δφ = (lat - input.lat) * Math.PI/180;
        const Δλ = (lon - input.lon) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }
      
      // Filter out if outside radius
      if (distance !== null && distance > (input.radius || 12000)) return null;

      const offer = tickets.length > 0 ? {
        provider: 'BookingCart',
        url: `/events/${row.id}`,
        currency: tickets[0].currency || 'USD',
        amount: lowestPrice !== Infinity ? lowestPrice : null,
        label: 'Book Ticket',
      } : null;

      return {
        id: `local_event:${row.id}`,
        source: 'local_event',
        sourceId: String(row.id),
        name: cleanText(info.eventName, 160) || 'Local Event',
        category: cleanText(info.eventType, 80) || 'Event',
        categories: [cleanText(info.eventType, 80) || 'event'],
        summary: cleanText(info.description, 400),
        address: cleanText(loc.address, 240),
        city: cleanText(loc.city, 100),
        country: cleanText(loc.country, 100),
        countryCode: '',
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        distance: distance !== null ? Math.round(distance) : null,
        image: row.ticket_banner_image ? { url: row.ticket_banner_image, alt: info.eventName, attribution: 'Organizer' } : null,
        accessibility: { wheelchair: null },
        website: '',
        canonicalUrl: '',
        attribution: { label: info.organizerName || row.email, url: '' },
        bookable: tickets.length > 0,
        offers: offer ? [offer] : [],
        ticketOptions: tickets.map((ticket, index) => ({
          id: String(ticket.id || `ticket_${index + 1}`),
          name: cleanText(ticket.name, 120) || cleanText(ticket.type, 80) || 'Admission',
          type: cleanText(ticket.type, 80) || 'General admission',
          description: cleanText(ticket.description, 240),
          price: Math.max(0, Number(ticket.price) || 0),
          currency: /^[A-Z]{3}$/.test(String(ticket.currency || '').toUpperCase()) ? String(ticket.currency).toUpperCase() : 'USD',
        })),
        policies: row.step_policies || {},
        contact: row.step_contact || {},
        duration: info.duration || '',
      };
    }).filter(Boolean);
}


async function getAttraction(source, id, options = {}) {
  if (source === 'local_event') {
    const events = await searchLocalEvents({});
    return events.find((event) => String(event.sourceId) === String(id)) || null;
  }
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
    ['local_attractions', searchLocalAttractionProfiles(input)],
    ['local', searchLocalEvents(input)],
    ['geoapify', searchGeoapify(input)],
    ['wikimedia', searchWikimedia(input)],
    ['getyourguide', searchGetYourGuide(input)],
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
  const allProvidersFailed = errors.length === providers.length;
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.max(1, Number(input.limit) || 30);
  const payload = {
    ok: !allProvidersFailed,
    results: results.slice((page - 1) * limit, page * limit),
    total: results.length,
    page,
    limit,
    partial: errors.length > 0 && !allProvidersFailed,
    errors,
  };
  if (!allProvidersFailed) await writeCache(key, payload);
  return payload;
}

module.exports = {
  CATEGORY_MAP, cleanText, safeHttpsUrl, normalizeGeoapify, normalizeWikiPage,
  normalizeGetYourGuide, dedupeAttractions, geocodeDestination, searchAttractions, getAttraction,
  searchLocalEvents, searchLocalAttractionProfiles,
};
