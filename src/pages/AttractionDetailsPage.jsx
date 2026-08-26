import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import AttractionImage from '../components/AttractionImage.jsx';
import { addToItinerary, readAttractionState, toggleSaved, trackAttractionEvent } from '../lib/attractionsClient.js';

const AttractionMap = lazy(() => import('../components/AttractionMap.jsx'));

export default function AttractionDetailsPage() {
  const { source, id } = useParams(); const location = useLocation();
  const [item, setItem] = useState(location.state?.attraction || null); const [status, setStatus] = useState(item ? 'ready' : 'loading');
  const [saved, setSaved] = useState(() => readAttractionState().saved.some((entry) => entry.id === `${source}:${id}`)); const [notice, setNotice] = useState('');
  useEffect(() => {
    const seeded = location.state?.attraction || null;
    setItem(seeded);
    setStatus(seeded ? 'ready' : 'loading');
    setNotice('');

    const controller = new AbortController();
    fetch(`/api/attractions/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (r) => ({ r, data: await r.json() }))
      .then(({ r, data }) => {
        if (!r.ok) throw new Error(data.error);
        setItem(data.attraction);
        setStatus('ready');
        trackAttractionEvent('detail_viewed', data.attraction);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setStatus('error');
          setNotice(error.message);
        }
      });

    return () => controller.abort();
  }, [source, id]);
  if (status === 'loading') return <main className="min-h-screen bg-slate-50 pt-32 text-center dark:bg-slate-950">Loading field guide…</main>;
  if (status === 'error' || !item) return <main className="min-h-screen bg-slate-50 px-4 pt-32 text-center dark:bg-slate-950"><h1 className="text-2xl font-black">Attraction unavailable</h1><p className="mt-2 text-slate-500">{notice || 'The source did not return this place.'}</p><Link className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-3 font-bold text-white" to="/attractions/results">Search attractions</Link></main>;
  const offer = item.offers?.[0];
  return <main className="min-h-screen bg-slate-50 pb-20 pt-24 dark:bg-slate-950 dark:text-white"><div className="mx-auto max-w-6xl px-4 sm:px-6">
    <Link to={-1} className="text-sm font-bold text-emerald-700">← Back to results</Link>
    <section className="mt-4 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><AttractionImage image={item.image} name={item.name} className="h-[38vh] min-h-72 w-full object-cover" />
      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:p-10"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{item.category} · {[item.city,item.country].filter(Boolean).join(', ')}</p><h1 className="mt-2 text-4xl font-black tracking-tight">{item.name}</h1><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">{item.summary || item.address || 'Location and source information for this attraction.'}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs font-bold uppercase text-slate-400">Location</p><p className="mt-1 font-semibold">{item.address || [item.city,item.country].filter(Boolean).join(', ') || 'See map'}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs font-bold uppercase text-slate-400">Accessibility</p><p className="mt-1 font-semibold">{item.accessibility?.wheelchair === true ? 'Wheelchair access reported' : item.accessibility?.wheelchair === false ? 'Not reported as wheelchair accessible' : 'Check with the venue'}</p></div></div>
        {Number.isFinite(item.lat) && Number.isFinite(item.lon) ? <div className="mt-8 h-80 overflow-hidden rounded-3xl"><Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-100">Loading map…</div>}><AttractionMap items={[item]} center={[item.lat,item.lon]} /></Suspense></div> : null}</div>
        <aside><div className="sticky top-28 rounded-3xl border border-slate-200 p-5 dark:border-slate-700"><h2 className="text-lg font-black">Plan your visit</h2><div className="mt-4 grid gap-2"><button onClick={() => { const next = toggleSaved(item); setSaved(next); setNotice(next ? 'Saved' : 'Removed'); }} className="rounded-xl border border-slate-200 px-4 py-3 font-bold dark:border-slate-600">{saved ? '♥ Saved' : '♡ Save attraction'}</button><button onClick={() => { addToItinerary(item); setNotice('Added to trip plan'); }} className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white dark:bg-white dark:text-slate-900">Add to trip plan</button>{item.canonicalUrl ? <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-4 py-3 text-center font-bold dark:border-slate-600">Official source ↗</a> : null}</div>{notice ? <p aria-live="polite" className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}
          {offer?.url ? <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><p className="text-xs font-bold uppercase text-slate-400">Bookable offer</p><a href={offer.url} onClick={() => trackAttractionEvent('outbound_booking_click', item, { provider: offer.provider })} target="_blank" rel="noopener noreferrer sponsored" className="mt-2 block rounded-xl bg-emerald-600 px-4 py-3 text-center font-bold text-white">Check availability on {offer.provider} ↗</a><p className="mt-2 text-xs text-slate-400">Booking, payment, fulfillment, and changes are handled by {offer.provider}.</p></div> : <p className="mt-5 text-sm text-slate-500">This is a discovery listing. No verified booking offer is currently available.</p>}
          <p className="mt-5 text-xs text-slate-400">Information from <a className="underline" href={item.attribution?.url} target="_blank" rel="noreferrer">{item.attribution?.label}</a>.</p></div></aside></div>
    </section>
  </div></main>;
}
