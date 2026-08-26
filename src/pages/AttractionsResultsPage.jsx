import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AttractionImage from '../components/AttractionImage.jsx';
import { addToItinerary, readAttractionState, toggleSaved, trackAttractionEvent } from '../lib/attractionsClient.js';

const AttractionMap = lazy(() => import('../components/AttractionMap.jsx'));
const CATEGORIES = [['','All'],['culture','Culture'],['museums','Museums'],['nature','Nature'],['heritage','Landmarks'],['family','Family']];

function useQuery() { const { search } = useLocation(); return useMemo(() => new URLSearchParams(search), [search]); }

function StatePanel({ icon, title, message, action }) {
  return <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700 dark:bg-emerald-950"><i className={`ph ${icon}`} aria-hidden="true" /></div>
    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2><p className="mx-auto mt-2 max-w-md text-slate-500 dark:text-slate-400">{message}</p>{action}
  </div>;
}

function AttractionCard({ item, saved, onSave, onAdd, onHover }) {
  const offer = item.offers?.[0];
  const price = offer?.amount != null && offer?.currency ? new Intl.NumberFormat(undefined, { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 }).format(offer.amount) : '';
  return <article id={`attraction-${item.id.replace(/[^a-z0-9_-]/gi, '-')}`} onMouseEnter={() => onHover(item.id)} onFocus={() => onHover(item.id)} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800">
    <div className="relative h-48 overflow-hidden"><AttractionImage image={item.image} name={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">{item.category}</span>
      {item.bookable ? <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Bookable</span> : null}
    </div>
    <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{[item.city,item.country].filter(Boolean).join(', ') || item.attribution?.label}</p>
      <h2 className="mt-1 text-lg font-extrabold leading-snug text-slate-900 dark:text-white">{item.name}</h2>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-500 dark:text-slate-400">{item.summary || item.address || 'Open the field guide for location and source details.'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/attractions/${item.source}/${encodeURIComponent(item.sourceId)}`} state={{ attraction: item }} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900">View details</Link>
        <button type="button" onClick={() => onSave(item)} aria-pressed={saved} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-600"><i className={`ph ${saved ? 'ph-fill ph-heart text-rose-500' : 'ph-heart'}`} aria-hidden="true" /> {saved ? 'Saved' : 'Save'}</button>
        <button type="button" onClick={() => onAdd(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-600">Add to trip</button>
      </div>
      {offer?.url ? <a href={offer.url} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackAttractionEvent('outbound_booking_click', item, { provider: offer.provider })} className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><span>{price ? `From ${price}` : 'Check live availability'}</span><span>Book on {offer.provider} <i className="ph ph-arrow-up-right" aria-hidden="true" /></span></a> : null}
      <p className="mt-3 text-[11px] text-slate-400">Source: <a href={item.attribution?.url} target="_blank" rel="noreferrer" className="underline">{item.attribution?.label}</a></p>
    </div>
  </article>;
}

export default function AttractionsResultsPage() {
  const query = useQuery(); const navigate = useNavigate();
  const q = query.get('q') || ''; const lat = query.has('lat') ? Number(query.get('lat')) : NaN; const lon = query.has('lon') ? Number(query.get('lon')) : NaN;
  const category = query.get('categories') || ''; const sort = query.get('sort') || 'relevance'; const currency = query.get('currency') || localStorage.getItem('bookingcart_currency') || 'USD';
  const [searchText, setSearchText] = useState(q); const [suggestions, setSuggestions] = useState([]); const [items, setItems] = useState([]);
  const [status, setStatus] = useState(Number.isFinite(lat) && Number.isFinite(lon) ? 'loading' : q ? 'resolving' : 'initial'); const [errors, setErrors] = useState([]);
  const [view, setView] = useState('list'); const [activeId, setActiveId] = useState(''); const [pendingBounds, setPendingBounds] = useState('');
  const [savedIds, setSavedIds] = useState(() => new Set(readAttractionState().saved.map((item) => item.id))); const [notice, setNotice] = useState('');

  const updateQuery = useCallback((updates) => { const next = new URLSearchParams(query); Object.entries(updates).forEach(([key,value]) => value === '' || value == null ? next.delete(key) : next.set(key, value)); navigate(`/attractions/results?${next.toString()}`); }, [navigate, query]);

  useEffect(() => { if (!q || (Number.isFinite(lat) && Number.isFinite(lon))) return; let cancelled = false;
    fetch(`/api/attractions/destinations?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((data) => { if (cancelled) return; const destination = data.results?.[0]; if (destination) updateQuery({ lat: destination.lat, lon: destination.lon, destination: destination.label }); else setStatus(data.ok ? 'empty-destination' : 'unavailable'); }).catch(() => setStatus('unavailable'));
    return () => { cancelled = true; };
  }, [q, lat, lon, updateQuery]);

  useEffect(() => { if (!Number.isFinite(lat) || !Number.isFinite(lon)) return; const controller = new AbortController(); setStatus('loading');
    const params = new URLSearchParams({ q, lat: String(lat), lon: String(lon), radius: query.get('radius') || '12000', categories: category, sort, currency, limit: '40' });
    if (query.get('bookable') === '1') params.set('bookable','1'); if (query.get('bounds')) params.set('bounds', query.get('bounds'));
    trackAttractionEvent('search_submitted', {}, { destination: q, category, sort });
    fetch(`/api/attractions/search?${params}`, { signal: controller.signal }).then(async (response) => ({ response, data: await response.json() })).then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || 'Search failed'); setItems(data.results || []); setErrors(data.errors || []); setStatus(data.results?.length ? (data.partial ? 'partial' : 'ready') : 'empty');
      trackAttractionEvent(data.partial ? 'results_partial' : data.results?.length ? 'results_loaded' : 'zero_results', {}, { destination: q, count: data.results?.length || 0 });
    }).catch((error) => { if (error.name !== 'AbortError') { setStatus('unavailable'); setErrors([{ message: error.message }]); trackAttractionEvent('results_error', {}, { destination: q }); } });
    return () => controller.abort();
  }, [q, lat, lon, category, sort, currency, query]);

  useEffect(() => { if (searchText.trim().length < 2 || searchText === q) { setSuggestions([]); return; } const timer = setTimeout(() => fetch(`/api/attractions/destinations?q=${encodeURIComponent(searchText.trim())}`).then((r) => r.json()).then((d) => setSuggestions(d.results || [])).catch(() => setSuggestions([])), 300); return () => clearTimeout(timer); }, [searchText, q]);

  const selectedCenter = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  const savedCount = savedIds.size; const itineraryCount = readAttractionState().itinerary.length;
  const selectDestination = (destination) => { setSuggestions([]); setSearchText(destination.name); navigate(`/attractions/results?${new URLSearchParams({ q: destination.name, destination: destination.label, lat: destination.lat, lon: destination.lon, currency })}`); };
  const save = (item) => { const next = toggleSaved(item); setSavedIds((current) => { const updated = new Set(current); next ? updated.add(item.id) : updated.delete(item.id); return updated; }); setNotice(next ? 'Saved to your attractions' : 'Removed from saved attractions'); };
  const add = (item) => { addToItinerary(item); setNotice('Added to your trip plan'); };
  const submit = (event) => { event.preventDefault(); const value = searchText.trim(); if (value) navigate(`/attractions/results?q=${encodeURIComponent(value)}&currency=${currency}`); };

  return <main className="min-h-screen bg-slate-50 pb-20 pt-24 text-slate-900 dark:bg-slate-950 dark:text-white">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center"><div className="min-w-0 xl:w-72"><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Global field guide</p><h1 className="truncate text-2xl font-black">{q ? `Explore ${q}` : 'Find an attraction'}</h1></div>
          <form onSubmit={submit} className="relative flex min-w-0 flex-1 gap-2"><label className="sr-only" htmlFor="attractions-search">Destination or attraction</label><input id="attractions-search" value={searchText} onChange={(e) => setSearchText(e.target.value)} autoComplete="off" placeholder="City, country, landmark, or activity" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800" /><button className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">Search</button>
            {suggestions.length ? <ul className="absolute left-0 right-20 top-full z-[1200] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">{suggestions.map((s) => <li key={s.id}><button type="button" onClick={() => selectDestination(s)} className="w-full px-4 py-3 text-left hover:bg-emerald-50 dark:hover:bg-slate-700"><strong>{s.name}</strong><span className="ml-2 text-sm text-slate-500">{s.country}</span><span className="block truncate text-xs text-slate-400">{s.label}</span></button></li>)}</ul> : null}</form>
          <Link to="/attractions/trip" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold dark:border-slate-700">Trip plan · {itineraryCount}</Link><span className="text-sm text-slate-500">Saved · {savedCount}</span>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Attraction filters">{CATEGORIES.map(([value,label]) => <button key={label} type="button" onClick={() => updateQuery({ categories: value })} aria-pressed={category === value} className={`rounded-full px-4 py-2 text-sm font-bold ${category === value ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>{label}</button>)}
        <label className="ml-auto text-sm font-semibold">Sort <select value={sort} onChange={(e) => updateQuery({ sort: e.target.value })} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"><option value="relevance">Recommended</option><option value="distance">Distance</option><option value="name">Name</option></select></label>
        <label className="text-sm font-semibold">Currency <select value={currency} onChange={(e) => { localStorage.setItem('bookingcart_currency', e.target.value); updateQuery({ currency: e.target.value }); }} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"><option>USD</option><option>EUR</option><option>GBP</option><option>RWF</option></select></label>
        <button type="button" onClick={() => setView((v) => v === 'map' ? 'list' : 'map')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white lg:hidden">{view === 'map' ? 'Show list' : 'Show map'}</button>
      </div>

      <div aria-live="polite" className="mt-4 min-h-6">{notice ? <p className="text-sm font-semibold text-emerald-700">{notice}</p> : null}{status === 'partial' ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Some sources are unavailable; showing verified results from the sources that responded.</p> : null}</div>

      {status === 'initial' ? <StatePanel icon="ph-map-trifold" title="Choose somewhere to explore" message="Search any city or country to find landmarks, museums, parks, cultural sites, and bookable experiences." /> : null}
      {status === 'loading' || status === 'resolving' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading attractions">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-96 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div> : null}
      {status === 'empty' || status === 'empty-destination' ? <StatePanel icon="ph-binoculars" title="No verified attractions found" message="Try a nearby city, a broader category, or clear the bookable-only filter." /> : null}
      {status === 'unavailable' ? <StatePanel icon="ph-cloud-slash" title="Attraction sources are unavailable" message={errors[0]?.message || 'Try again shortly. We never substitute unrelated or fabricated results.'} action={<button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">Try again</button>} /> : null}

      {['ready','partial'].includes(status) ? <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <section className={`${view === 'map' ? 'hidden lg:grid' : 'grid'} min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3`} aria-label={`${items.length} attraction results`}>{items.map((item) => <AttractionCard key={item.id} item={item} saved={savedIds.has(item.id)} onSave={save} onAdd={add} onHover={setActiveId} />)}</section>
        <aside className={`${view === 'list' ? 'hidden lg:block' : 'block'} sticky top-24 h-[calc(100vh-7rem)] min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900`} aria-label="Attractions map">
          {pendingBounds ? <button onClick={() => { updateQuery({ bounds: pendingBounds }); setPendingBounds(''); trackAttractionEvent('map_interaction', {}, { destination: q }); }} className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg">Search this area</button> : null}
          <Suspense fallback={<div className="flex h-full items-center justify-center">Loading map…</div>}><AttractionMap items={items} center={selectedCenter} activeId={activeId} onSelect={(id) => { setActiveId(id); document.getElementById(`attraction-${id.replace(/[^a-z0-9_-]/gi, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} onBoundsChange={setPendingBounds} /></Suspense>
        </aside>
      </div> : null}
    </div>
  </main>;
}
