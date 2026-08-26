const STORAGE_KEY = 'bookingcart_attractions_v1';
const SESSION_KEY = 'bookingcart_attractions_session';

export function readAttractionState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { version: 1, saved: Array.isArray(parsed.saved) ? parsed.saved : [], itinerary: Array.isArray(parsed.itinerary) ? parsed.itinerary : [] };
  } catch { return { version: 1, saved: [], itinerary: [] }; }
}

export function writeAttractionState(state) {
  const next = { version: 1, saved: (state.saved || []).slice(0, 200), itinerary: (state.itinerary || []).slice(0, 100) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('bookingcart:attractions-state', { detail: next }));
  return next;
}

export function compactAttraction(item) {
  return { id: item.id, source: item.source, sourceId: item.sourceId, name: item.name, category: item.category, city: item.city, country: item.country, lat: item.lat, lon: item.lon, image: item.image, bookable: item.bookable, offers: item.offers || [], savedAt: new Date().toISOString() };
}

export function toggleSaved(item) {
  const state = readAttractionState();
  const exists = state.saved.some((saved) => saved.id === item.id);
  state.saved = exists ? state.saved.filter((saved) => saved.id !== item.id) : [...state.saved, compactAttraction(item)];
  writeAttractionState(state);
  trackAttractionEvent(exists ? 'unsaved' : 'saved', item);
  return !exists;
}

export function addToItinerary(item) {
  const state = readAttractionState();
  if (state.itinerary.some((entry) => entry.attraction.id === item.id)) return state;
  state.itinerary.push({ id: `${item.id}:${Date.now()}`, attraction: compactAttraction(item), visitAt: '', note: '', position: state.itinerary.length });
  writeAttractionState(state); trackAttractionEvent('itinerary_added', item); return state;
}

export function updateItinerary(nextItems) {
  const state = readAttractionState();
  state.itinerary = nextItems.map((item, position) => ({ ...item, position }));
  return writeAttractionState(state);
}

function sessionId() {
  let value = sessionStorage.getItem(SESSION_KEY);
  if (!value) { value = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; sessionStorage.setItem(SESSION_KEY, value); }
  return value;
}

export function trackAttractionEvent(eventType, attraction = {}, context = {}) {
  const token = localStorage.getItem('bookingcart_jwt_token') || localStorage.getItem('bookingcart_google_id_token') || '';
  fetch('/api/attractions/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, keepalive: true,
    body: JSON.stringify({ eventType, sessionId: sessionId(), attractionId: attraction.id || '', source: attraction.source || '', destination: attraction.city || attraction.country || context.destination || '', context }) }).catch(() => {});
}

export async function syncAttractionState(user, getToken) {
  if (!user?.email) return readAttractionState();
  const token = getToken?.(); if (!token) return readAttractionState();
  try {
    const response = await fetch(`/api/user?email=${encodeURIComponent(user.email)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json(); if (!response.ok) return readAttractionState();
    const local = readAttractionState(); const remote = data.state?.attractions || {};
    const merge = (a, b, key) => Array.from(new Map([...(b || []), ...(a || [])].map((item) => [key(item), item])).values());
    const merged = { version: 1, saved: merge(local.saved, remote.saved, (i) => i.id), itinerary: merge(local.itinerary, remote.itinerary, (i) => i.attraction?.id || i.id) };
    writeAttractionState(merged);
    await fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email: user.email, state: { ...(data.state || {}), attractions: merged } }) });
    return merged;
  } catch { return readAttractionState(); }
}
