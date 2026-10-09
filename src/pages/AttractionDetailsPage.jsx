import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AttractionImage from '../components/AttractionImage.jsx';
import { addToItinerary, readAttractionState, toggleSaved, trackAttractionEvent } from '../lib/attractionsClient.js';

const AttractionMap = lazy(() => import('../components/AttractionMap.jsx'));

export default function AttractionDetailsPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const source = params.source || 'local_event';
  const id = params.id || params.eventId;

  const [item, setItem] = useState(location.state?.attraction || null);
  const [status, setStatus] = useState(item ? 'ready' : 'loading');
  const [saved, setSaved] = useState(() => readAttractionState().saved.some((entry) => entry.id === `${source}:${id}`));
  const [notice, setNotice] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [ticketQty, setTicketQty] = useState(1);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const seeded = location.state?.attraction || null;
    setItem(seeded);
    if (seeded?.ticketOptions?.length) {
      setSelectedTicketId(seeded.ticketOptions[0].id);
    }
    setStatus(seeded ? 'ready' : 'loading');
    setNotice('');

    const controller = new AbortController();
    fetch(`/api/attractions/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (r) => ({ r, data: await r.json() }))
      .then(({ r, data }) => {
        if (!r.ok) throw new Error(data.error);
        setItem(data.attraction);
        if (data.attraction.ticketOptions?.length) {
          setSelectedTicketId(data.attraction.ticketOptions[0].id);
        }
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

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center pt-24 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-semibold text-sm">Loading attraction details…</p>
        </div>
      </main>
    );
  }

  if (status === 'error' || !item) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 pt-32 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <i className="ph ph-warning-circle text-5xl text-amber-400 mb-3 block" />
          <h1 className="text-2xl font-black">Attraction Unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{notice || 'This place or event could not be found or loaded.'}</p>
          <Link to="/attractions/results" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-500 transition-all">
            Browse All Attractions
          </Link>
        </div>
      </main>
    );
  }

  const offer = item.offers?.[0];
  const isLocalEvent = item.source === 'local_event' || (item.ticketOptions && item.ticketOptions.length > 0);
  const selectedTicket = item.ticketOptions?.find((t) => t.id === selectedTicketId) || item.ticketOptions?.[0];
  const minPrice = item.ticketOptions?.length ? Math.min(...item.ticketOptions.map((t) => t.price)) : (offer?.amount || 0);
  const currency = selectedTicket?.currency || item.ticketOptions?.[0]?.currency || offer?.currency || 'USD';
  const formattedMinPrice = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minPrice);
  const totalAmount = selectedTicket ? selectedTicket.price * ticketQty : minPrice * ticketQty;
  const formattedTotal = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(totalAmount);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-24 pt-20">
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-emerald-400 transition-colors bg-slate-900/60 px-4 py-2 rounded-full border border-slate-800"
        >
          <i className="ph ph-arrow-left text-base" /> Back
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = toggleSaved(item);
              setSaved(next);
              setNotice(next ? 'Saved to favorites' : 'Removed from favorites');
              setTimeout(() => setNotice(''), 3000);
            }}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full border transition-all ${
              saved
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <i className={`ph ${saved ? 'ph-heart-fill text-rose-500' : 'ph-heart'}`} />
            {saved ? 'Saved' : 'Save'}
          </button>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: item.name, url: window.location.href }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                setNotice('Link copied to clipboard!');
                setTimeout(() => setNotice(''), 3000);
              }
            }}
            className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all"
          >
            <i className="ph ph-share-network" /> Share
          </button>
        </div>
      </div>

      {notice && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white font-bold text-sm px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <i className="ph ph-check-circle-fill text-lg" /> {notice}
        </div>
      )}

      {/* ── Main Container ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-2">
        {/* ── Hero Banner ──────────────────────────────────────────────── */}
        <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl group">
          <AttractionImage
            image={item.image}
            name={item.name}
            className="h-[42vh] min-h-[320px] max-h-[500px] w-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

          {/* Banner Badges & Title */}
          <div className="absolute bottom-6 left-6 right-6 sm:left-8 sm:right-8 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                {item.category || 'Attraction'}
              </span>
              {[item.city, item.country].filter(Boolean).length > 0 && (
                <span className="px-3 py-1 rounded-full bg-slate-900/80 text-slate-300 border border-slate-700 text-xs font-bold backdrop-blur-md flex items-center gap-1">
                  <i className="ph ph-map-pin text-emerald-400" />
                  {[item.city, item.country].filter(Boolean).join(', ')}
                </span>
              )}
              {isLocalEvent && (
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1">
                  <i className="ph ph-ticket text-amber-400" /> Verified Organizer
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-md">
              {item.name}
            </h1>
          </div>
        </div>

        {/* ── Content Grid ─────────────────────────────────────────────── */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
          {/* Left Column: Details & Features */}
          <div className="space-y-8">
            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 gap-6 text-sm font-bold">
              {[
                { id: 'overview', label: 'Overview & Highlights', icon: 'ph-info' },
                { id: 'tickets', label: 'Tickets & Admission', icon: 'ph-ticket' },
                { id: 'location', label: 'Location & Map', icon: 'ph-map-trifold' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 flex items-center gap-2 border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <i className={`ph ${tab.icon} text-lg`} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quick Info Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Instant Confirmation</span>
                <span className="text-sm font-extrabold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <i className="ph ph-lightning text-lg" /> Digital E-Ticket
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Accessibility</span>
                <span className="text-sm font-extrabold text-slate-200 flex items-center gap-1.5 mt-0.5">
                  <i className="ph ph-wheelchair text-lg text-emerald-400" />
                  {item.accessibility?.wheelchair === true
                    ? 'Wheelchair Access'
                    : item.accessibility?.wheelchair === false
                    ? 'Limited Access'
                    : 'Check Venue'}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Mobile Voucher</span>
                <span className="text-sm font-extrabold text-slate-200 flex items-center gap-1.5 mt-0.5">
                  <i className="ph ph-qr-code text-lg text-emerald-400" /> QR Code Entry
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Rating</span>
                <span className="text-sm font-extrabold text-amber-400 flex items-center gap-1.5 mt-0.5">
                  <i className="ph ph-star-fill text-lg" /> {item.rating ? `${item.rating} / 5` : '4.9 (Verified)'}
                </span>
              </div>
            </div>

            {/* Overview Section */}
            {(activeTab === 'overview' || activeTab === 'tickets') && (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-6">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-article text-emerald-400" /> About This Experience
                </h2>
                <p className="text-slate-300 text-base leading-relaxed whitespace-pre-line">
                  {item.summary || item.address || 'Full location and visitor details for this attraction.'}
                </p>

                {/* Key Experience Highlights */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">Why Visit</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      'Direct mobile e-ticket scan at gate',
                      'Guaranteed entry with verified booking',
                      'Instant receipt and QR ticket download',
                      'Customer support assistance included',
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <i className="ph ph-check-circle-fill text-emerald-400 text-lg shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Ticket Options Section */}
            {isLocalEvent && item.ticketOptions?.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-6">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-ticket text-emerald-400" /> Ticket Options & Pricing
                </h2>

                <div className="space-y-4">
                  {item.ticketOptions.map((opt) => {
                    const isSelected = selectedTicketId === opt.id;
                    const optPrice = new Intl.NumberFormat(undefined, { style: 'currency', currency: opt.currency || currency }).format(opt.price);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setSelectedTicketId(opt.id)}
                        className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-950/50'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'}`}>
                            {isSelected && <div className="h-2 w-2 rounded-full bg-slate-950" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-white text-base">{opt.name}</h3>
                              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold uppercase">{opt.type || 'General'}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{opt.description || 'Standard entry admission ticket with mobile QR code.'}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xl font-black text-emerald-400">{optPrice}</span>
                          <span className="text-xs text-slate-400 block">per ticket</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Location & Map Section */}
            {(activeTab === 'location' || activeTab === 'overview') && (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-6">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-map-pin text-emerald-400" /> Location & Venue
                </h2>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-200 text-base">{item.address || [item.city, item.country].filter(Boolean).join(', ') || 'Venue Address'}</p>
                    <p className="text-xs text-slate-400 mt-1">Check map below for directions and arrival gates.</p>
                  </div>
                </div>

                {Number.isFinite(item.lat) && Number.isFinite(item.lon) ? (
                  <div className="h-80 overflow-hidden rounded-2xl border border-slate-800">
                    <Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-900 text-slate-400">Loading interactive map…</div>}>
                      <AttractionMap items={[item]} center={[item.lat, item.lon]} />
                    </Suspense>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-sm">
                    Interactive map coordinates are not available for this venue.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Sticky Booking Widget */}
          <div>
            <aside className="sticky top-28 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Admission Price</span>
                    <span className="text-3xl font-black text-emerald-400 mt-0.5 block">{formattedMinPrice}</span>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Best Price
                  </span>
                </div>

                {/* Ticket Selection Widget */}
                {isLocalEvent && item.ticketOptions?.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Select Ticket</label>
                      <select
                        value={selectedTicketId}
                        onChange={(e) => setSelectedTicketId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-emerald-500 outline-none"
                      >
                        {item.ticketOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} — {new Intl.NumberFormat(undefined, { style: 'currency', currency: t.currency || currency }).format(t.price)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Quantity</label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setTicketQty((q) => Math.max(1, q - 1))}
                          className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-lg flex items-center justify-center hover:border-slate-700"
                        >
                          -
                        </button>
                        <span className="flex-1 text-center font-black text-lg text-white">{ticketQty}</span>
                        <button
                          onClick={() => setTicketQty((q) => Math.min(10, q + 1))}
                          className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-lg flex items-center justify-center hover:border-slate-700"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-300">Total Price</span>
                      <span className="text-2xl font-black text-white">{formattedTotal}</span>
                    </div>

                    <Link
                      to={`/events/${encodeURIComponent(item.sourceId)}/checkout`}
                      state={{ event: item, ticketId: selectedTicketId, quantity: ticketQty }}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-center rounded-xl shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 text-base transition-all hover:-translate-y-0.5"
                    >
                      <i className="ph ph-ticket text-xl" /> Choose Tickets & Checkout
                    </Link>
                  </div>
                ) : offer?.url ? (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400">Bookable through our official partner platform:</p>
                    <a
                      href={offer.url}
                      onClick={() => trackAttractionEvent('outbound_booking_click', item, { provider: offer.provider })}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-center rounded-xl shadow-lg flex items-center justify-center gap-2 text-base transition-all"
                    >
                      Book on {offer.provider} <i className="ph ph-arrow-square-out text-lg" />
                    </a>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
                    <p className="text-xs text-slate-400">Discovery Listing</p>
                    <p className="text-sm font-semibold text-slate-300 mt-1">No online ticket purchase required for this venue.</p>
                  </div>
                )}

                {/* Auxiliary Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      addToItinerary(item);
                      setNotice('Added to trip plan!');
                      setTimeout(() => setNotice(''), 3000);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <i className="ph ph-plus-circle text-emerald-400" /> Trip Plan
                  </button>
                  {item.canonicalUrl ? (
                    <a
                      href={item.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-all text-center"
                    >
                      <i className="ph ph-globe" /> Official Site
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        const next = toggleSaved(item);
                        setSaved(next);
                        setNotice(next ? 'Saved to favorites' : 'Removed from favorites');
                        setTimeout(() => setNotice(''), 3000);
                      }}
                      className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <i className="ph ph-heart text-rose-400" /> Favorite
                    </button>
                  )}
                </div>
              </div>

              {/* Guarantees Box */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-2 text-slate-400">
                <div className="flex items-center gap-2 font-bold text-slate-300">
                  <i className="ph ph-shield-check text-emerald-400 text-base" /> BookingCart Protection
                </div>
                <p>All tickets purchased through BookingCart are 100% verified and issued with direct QR validation codes for instant gate access.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

