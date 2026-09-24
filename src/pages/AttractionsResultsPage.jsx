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
  const price = offer?.amount != null && offer?.currency 
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 }).format(offer.amount) 
    : '';

  const isLocalEvent = item.source === 'local_event';

  return (
    <article
      id={`attraction-${item.id.replace(/[^a-z0-9_-]/gi, '-')}`}
      onMouseEnter={() => onHover(item.id)}
      onFocus={() => onHover(item.id)}
      className="group flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
    >
      {/* ── Photo Section ── */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
        <AttractionImage 
          image={item.image} 
          name={item.name} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 items-start pointer-events-none">
          <span className="inline-flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-full shadow-md backdrop-blur-md border border-emerald-500/30">
            {isLocalEvent ? <i className="ph-fill ph-ticket text-emerald-500 text-sm" /> : <i className="ph-fill ph-map-pin text-emerald-500 text-sm" />}
            {item.category}
          </span>
        </div>
        
        {item.bookable && (
          <div className="absolute top-3 right-3 bg-emerald-500/95 backdrop-blur-md text-white px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm pointer-events-none">
            <i className="ph-fill ph-lightning text-xs" />
            <span className="text-[10px] font-black uppercase tracking-wider">Bookable</span>
          </div>
        )}

        {/* Bottom Info inside Photo */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 pointer-events-none">
          <div className="flex-1 min-w-0">
            {item.rating != null && (
              <div className="flex items-center gap-1.5 mb-1">
                <div className="flex items-center gap-0.5 text-sm text-amber-400">
                  <i className="ph-fill ph-star" />
                </div>
                <span className="text-white font-bold text-sm leading-none mt-0.5">
                  {Number(item.rating).toFixed(1)}
                </span>
                <span className="text-white/70 text-xs font-semibold mt-0.5">
                  ({item.reviewCount?.toLocaleString() || 0})
                </span>
              </div>
            )}
          </div>
          
          {price && (
            <div className="shrink-0 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-right">
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider leading-none mb-1">From</p>
              <p className="text-white font-black text-lg leading-none">{price}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Content Section ── */}
      <div className="p-5 flex flex-col flex-1">
        {/* Title & Location */}
        <div className="mb-3">
          <h2 className="font-black text-lg text-slate-900 dark:text-white leading-tight group-hover:text-emerald-600 transition-colors line-clamp-2 mb-1.5">
            {item.name}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold flex items-center gap-1.5">
            <i className="ph ph-map-pin text-emerald-500 text-base shrink-0" />
            <span className="truncate">{[item.city, item.country].filter(Boolean).join(', ') || item.attribution?.label}</span>
          </p>
        </div>
        
        <p className="line-clamp-2 min-h-10 text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1">
          {item.summary || item.address || 'Open the field guide for location and source details.'}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-auto">
          {isLocalEvent ? (
            <Link 
              to={`/event-confirmation?ref=book_${item.sourceId}`} 
              className="flex-1 text-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900 transition-colors"
            >
              Get Tickets
            </Link>
          ) : (
            <Link 
              to={`/attractions/${item.source}/${encodeURIComponent(item.sourceId)}`} 
              state={{ attraction: item }} 
              className="flex-1 text-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900 transition-colors"
            >
              View details
            </Link>
          )}
          
          <button 
            type="button" 
            onClick={() => onSave(item)} 
            aria-pressed={saved} 
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={saved ? "Remove from saved" : "Save attraction"}
          >
            <i className={`ph ${saved ? 'ph-fill ph-heart text-rose-500' : 'ph-heart text-slate-400 dark:text-slate-500'}`} />
          </button>
          
          <button 
            type="button" 
            onClick={() => onAdd(item)} 
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Add to itinerary"
          >
            <i className="ph ph-plus" />
          </button>
        </div>

        {offer?.url && !isLocalEvent && (
          <a 
            href={offer.url} 
            target="_blank" 
            rel="noopener noreferrer sponsored" 
            onClick={() => trackAttractionEvent('outbound_booking_click', item, { provider: offer.provider })} 
            className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
          >
            <span>Check live availability</span>
            <span className="flex items-center gap-1">On {offer.provider} <i className="ph ph-arrow-up-right" /></span>
          </a>
        )}
        
        <p className="mt-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-t border-slate-100 dark:border-slate-800 pt-3">
          Source: <a href={item.attribution?.url} target="_blank" rel="noreferrer" className="hover:text-slate-600 dark:hover:text-slate-300">{item.attribution?.label}</a>
        </p>
      </div>
    </article>
  );
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
