import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cinemaGet, cinemaPost, clockLabel, formatDate, money } from '../lib/cinemaClient.js';

const CATEGORY_ACCENT = {
  standard: 'border-slate-300 dark:border-slate-600',
  premium: 'border-sky-400 dark:border-sky-500',
  vip: 'border-violet-400 dark:border-violet-500',
  couple: 'border-rose-400 dark:border-rose-500',
  recliner: 'border-amber-400 dark:border-amber-500',
  wheelchair: 'border-blue-400 dark:border-blue-500',
  companion: 'border-teal-400 dark:border-teal-500',
};

const LEGEND = [
  { key: 'available', label: 'Available', swatch: 'bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-600' },
  { key: 'selected', label: 'Selected', swatch: 'bg-emerald-500 border-emerald-600' },
  { key: 'held', label: 'On hold', swatch: 'bg-amber-100 border-amber-400 dark:bg-amber-900/50' },
  { key: 'sold', label: 'Sold', swatch: 'bg-slate-300 border-slate-400 dark:bg-slate-700 dark:border-slate-600' },
  { key: 'blocked', label: 'Blocked', swatch: 'bg-slate-100 border-dashed border-slate-300 dark:bg-slate-800/40 dark:border-slate-700' },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

/** mm:ss left on the seat hold. */
function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const msLeft = new Date(expiresAt).getTime() - now;
  const seconds = Math.max(0, Math.floor(msLeft / 1000));
  return {
    seconds,
    expired: seconds <= 0,
    label: `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`,
    urgent: seconds <= 120,
  };
}

function SeatButton({ seat, selected, onToggle, seatSize }) {
  const disabled = seat.status !== 'available';
  const isSelected = selected;
  const accent = CATEGORY_ACCENT[seat.category] || CATEGORY_ACCENT.standard;
  const accessible = seat.category === 'wheelchair' || seat.category === 'companion';

  let tone = 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700';
  let text = 'text-slate-500 dark:text-slate-300';
  if (seat.status === 'sold') {
    tone = 'bg-slate-300 dark:bg-slate-700';
    text = 'text-slate-400 dark:text-slate-500';
  } else if (seat.status === 'held') {
    tone = 'bg-amber-100 dark:bg-amber-900/40';
    text = 'text-amber-600 dark:text-amber-400';
  } else if (seat.status === 'blocked' || seat.status === 'unavailable') {
    tone = 'bg-slate-100/70 dark:bg-slate-800/40 border-dashed';
    text = 'text-slate-300 dark:text-slate-600';
  } else if (isSelected) {
    tone = 'bg-emerald-500';
    text = 'text-white';
  }

  const title = disabled
    ? `${seat.label} · ${seat.categoryLabel} · ${seat.status === 'sold' ? 'sold' : 'unavailable'}`
    : `${seat.label} · ${seat.categoryLabel}${seat.price != null ? ` · ${seat.price}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => onToggle(seat)}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isSelected}
      style={{ width: seatSize, height: seatSize }}
      className={`flex items-center justify-center rounded-md rounded-t-lg border-2 text-[9px] font-black leading-none transition-all duration-150 ${accent} ${tone} ${text} ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0'
      } ${isSelected ? 'ring-2 ring-emerald-300 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
    >
      {accessible && seat.status !== 'sold' && seat.status !== 'blocked'
        ? <i className={`ph ph-wheelchair ${isSelected ? 'text-white' : ''} text-[11px]`} />
        : <span className="tabular-nums">{seat.number}</span>}
    </button>
  );
}

export default function CinemaSeatsPage() {
  const { showtimeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [seatIds, setSeatIds] = useState([]);
  const [step, setStep] = useState('seats');
  const [hold, setHold] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', method: 'card' });
  const formRef = useRef(null);
  const seatScrollRef = useRef(null);
  const didFitRef = useRef(false);

  // Scale the grid down so a wide screen fits a phone without horizontal scrolling.
  const fitSeats = useCallback(() => {
    const container = seatScrollRef.current;
    const inner = container?.firstElementChild;
    if (!container || !inner) return;
    const available = container.clientWidth - 8;
    const natural = inner.scrollWidth;
    if (!available || !natural) return;
    setZoom(Math.max(0.5, Math.min(1, Number((available / natural).toFixed(2)))));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('seat-map', { showtimeId });
    if (payload.ok) {
      setMap(payload);
      setLoadError('');
    } else {
      setLoadError(payload.error || 'This screening is not available');
    }
    setLoading(false);
  }, [showtimeId]);

  useEffect(() => { load(); }, [load]);

  // First paint: fit the whole layout on screen, then leave the zoom control alone.
  useEffect(() => {
    if (!map || didFitRef.current) return undefined;
    didFitRef.current = true;
    const timer = window.setTimeout(fitSeats, 80);
    return () => window.clearTimeout(timer);
  }, [map, fitSeats]);

  // Stripe sends the customer back here when they back out of the payment page.
  // Hand the seats straight back so they can pick again immediately.
  useEffect(() => {
    if (searchParams.get('canceled') !== '1') return;
    const ref = searchParams.get('ref') || '';
    if (ref) {
      cinemaPost('abandon', { ref }).then(() => load());
      setMessage('Payment was cancelled and your seats were released. Pick your seats again when you are ready.');
    } else {
      setMessage('Payment was cancelled. Your seats are still available.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('canceled');
    next.delete('ref');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, load]);

  const countdown = useCountdown(hold?.expiresAt);

  // When the hold runs out the seats are gone, so send the customer back to the
  // map instead of letting them pay for something that no longer exists.
  useEffect(() => {
    if (!countdown?.expired || step === 'seats') return;
    setStep('seats');
    setHold(null);
    setSeatIds([]);
    setMessage('Your seat hold expired. The seats are available again — please pick again.');
    load();
  }, [countdown?.expired, step, load]);

  const seats = map?.seats || [];
  const selected = useMemo(
    () => seats.filter((seat) => seatIds.includes(seat.id)),
    [seats, seatIds]
  );
  const localSubtotal = useMemo(
    () => selected.reduce((sum, seat) => sum + Number(seat.price || 0), 0),
    [selected]
  );
  const maxSeats = map?.pricing?.maxSeats || 12;
  const currency = map?.pricing?.currency || 'USD';

  const toggleSeat = (seat) => {
    if (seat.status !== 'available') return;
    setMessage('');
    setSeatIds((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= maxSeats) {
        setMessage(`You can select up to ${maxSeats} seats at a time.`);
        return current;
      }
      // A companion seat is only meaningful next to a wheelchair space.
      if (seat.category === 'companion') {
        const hasWheelchair = seats.some(
          (entry) => entry.category === 'wheelchair' && entry.row === seat.row && current.includes(entry.id)
        );
        if (!hasWheelchair) {
          setMessage('Companion seats are booked together with a wheelchair space in the same row.');
          return current;
        }
      }
      return [...current, seat.id];
    });
  };

  const holdSeats = async () => {
    if (!seatIds.length) { setMessage('Pick at least one seat first.'); return; }
    setBusy(true);
    const payload = await cinemaPost('hold', {
      showtimeId: Number(showtimeId),
      seatIds,
      customerEmail: form.email.trim(),
    });
    setBusy(false);
    if (!payload.ok) {
      setMessage(payload.error || 'Those seats could not be held');
      // Drop the seats somebody else just won so the next attempt starts clean.
      const gone = new Set(payload.taken || []);
      if (gone.size) {
        setSeatIds((current) => seats
          .filter((seat) => current.includes(seat.id) && !gone.has(seat.label))
          .map((seat) => seat.id));
      }
      load();
      return;
    }
    setHold(payload.hold);
    setStep('details');
    setMessage('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const changeSeats = async () => {
    if (hold?.holdRef) await cinemaPost('release-hold', { holdRef: hold.holdRef });
    setHold(null);
    setStep('seats');
    setSeatIds([]);
    setMessage('');
    load();
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    setFormError('');
    const name = form.name.trim();
    const email = form.email.trim();
    if (name.length < 2) { setFormError('Enter the name for the booking.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setFormError('Enter a valid email address so we can send the tickets.'); return; }

    setBusy(true);
    const payload = await cinemaPost('create-order', {
      holdRef: hold?.holdRef,
      customerName: name,
      customerEmail: email,
      customerPhone: form.phone.trim(),
      paymentMethod: form.method,
    });
    setBusy(false);

    if (!payload.ok) {
      setFormError(payload.error || 'We could not start the booking.');
      // A dead hold means the seats are no longer ours.
      if (/hold|expired/i.test(payload.error || '')) {
        setStep('seats');
        setHold(null);
        setSeatIds([]);
        load();
      }
      return;
    }

    if (payload.payment?.method === 'card' && payload.payment.url) {
      window.location.href = payload.payment.url;
      return;
    }
    navigate(`/attractions/cinemas/confirmation?ref=${encodeURIComponent(payload.bookingRef)}`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mx-auto mb-8 h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-72 animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
        <div className="mt-4 h-28 animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
      </div>
    );
  }

  if (loadError || !map) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-rose-500 dark:bg-rose-950/40">
          <i className="ph ph-warning-circle" />
        </div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Seat map unavailable</h1>
        <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{loadError}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
            Retry
          </button>
          <Link to="/attractions/cinemas" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            All cinemas
          </Link>
        </div>
      </div>
    );
  }

  const { showtime } = map;
  const seatsPerRow = Math.max(0, ...seats.map((seat) => seat.x));
  const occupancy = map.stats.total ? Math.round((map.stats.sold / map.stats.total) * 100) : 0;
  const totals = hold
    ? { subtotal: hold.subtotal, serviceFee: hold.serviceFee, taxAmount: hold.taxAmount, total: hold.total }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-48 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <Link
            to={`/attractions/cinemas/${showtime.cinemaId}?date=${showtime.showDate}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-emerald-600"
          >
            <i className="ph ph-arrow-left" /> {showtime.cinemaName || 'Back to cinema'}
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black text-slate-900 dark:text-white sm:text-2xl">
                {showtime.movieTitle}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <i className="ph ph-calendar-blank text-emerald-600" /> {formatDate(showtime.showDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="ph ph-clock text-emerald-600" /> {clockLabel(showtime.startTime)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="ph ph-monitor-play text-emerald-600" /> {showtime.screenName}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {showtime.format}
                  </span>
                </span>
                {showtime.ageRating && <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-black dark:border-slate-700">{showtime.ageRating}</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sold</p>
              <p className="text-lg font-black tabular-nums text-slate-900 dark:text-white">{occupancy}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        {message && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <i className="ph ph-warning-circle text-base" />
            <p className="flex-1">{message}</p>
            <button type="button" onClick={() => setMessage('')} aria-label="Dismiss" className="text-amber-500"><i className="ph ph-x" /></button>
          </div>
        )}

        {/* Screen + seats */}
        <div className={`rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 ${step === 'details' ? 'opacity-60' : ''}`}>
          <div className="mx-auto max-w-md">
            <svg viewBox="0 0 400 44" className="w-full" aria-hidden="true">
              <defs>
                <linearGradient id="screenArc" x1="0" x2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0" />
                  <stop offset="50%" stopColor="#34d399" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M4 40 Q200 -28 396 40" fill="none" stroke="url(#screenArc)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="mb-5 text-center text-[9px] font-black uppercase tracking-[0.45em] text-slate-400">
              Screen this way
            </p>
          </div>

          <div className="mb-3 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.7, Number((value - 0.15).toFixed(2))))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Zoom out"
            >
              <i className="ph ph-minus" />
            </button>
            <span className="w-12 text-center text-[10px] font-black tabular-nums text-slate-400">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.9, Number((value + 0.15).toFixed(2))))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Zoom in"
            >
              <i className="ph ph-plus" />
            </button>
            <button
              type="button"
              onClick={fitSeats}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <i className="ph ph-arrows-out-line-horizontal text-xs" /> Fit
            </button>
            <span className="ml-2 text-[10px] font-bold text-slate-400">Pinch to zoom · swipe to pan</span>
          </div>

          <div ref={seatScrollRef} className="overflow-x-auto pb-2">
            <div
              className="mx-auto w-max transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            >
              {map.rows.map((row) => (
                <div key={row.label} className="mb-1 flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[10px] font-black text-slate-400">{row.label}</span>
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${seatsPerRow}, minmax(0, 34px))` }}
                  >
                    {row.seats.map((seat) => (
                      <div key={seat.id} style={{ gridColumn: `${seat.x} / span 1` }}>
                        <SeatButton
                          seat={seat}
                          selected={seatIds.includes(seat.id)}
                          onToggle={toggleSeat}
                          seatSize={34}
                        />
                      </div>
                    ))}
                  </div>
                  <span className="w-5 shrink-0" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {LEGEND.map((entry) => (
              <span key={entry.key} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <span className={`h-3.5 w-3.5 rounded-t-md rounded-b-sm border-2 ${entry.swatch}`} />
                {entry.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-t-md rounded-b-sm border-2 border-blue-400 text-[7px] text-blue-500">
                <i className="ph ph-wheelchair" />
              </span>
              Accessible
            </span>
          </div>

          {/* Category prices */}
          {map.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
              {map.categories.map((category) => (
                <span key={category.id} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span className={`h-2.5 w-2.5 rounded-sm border-2 ${CATEGORY_ACCENT[category.id] || CATEGORY_ACCENT.standard}`} />
                  {category.label}
                  <span className="tabular-nums text-slate-400">{money(category.price, currency)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Checkout details */}
        {step === 'details' && hold && (
          <div ref={formRef} className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Who are the tickets for?</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums ${
                  countdown?.urgent
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                }`}
              >
                <i className="ph ph-timer" /> Seats held {countdown?.label || '—'}
              </span>
            </div>

            <form onSubmit={submitOrder} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Full name *</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    autoComplete="name"
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Email *</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    autoComplete="email"
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Phone (optional)</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  autoComplete="tel"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>

              <fieldset>
                <legend className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  How would you like to pay? *
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {map.allowOnline && (
                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${form.method === 'card' ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}>
                      <input
                        type="radio"
                        name="method"
                        value="card"
                        checked={form.method === 'card'}
                        onChange={() => setForm({ ...form, method: 'card' })}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                          <i className="ph ph-credit-card text-emerald-600" /> Pay now by card
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          Secure checkout. Tickets are issued the moment payment clears.
                        </span>
                      </span>
                    </label>
                  )}
                  {map.allowPayAtVenue && (
                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${form.method === 'venue' ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}>
                      <input
                        type="radio"
                        name="method"
                        value="venue"
                        checked={form.method === 'venue'}
                        onChange={() => setForm({ ...form, method: 'venue' })}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                          <i className="ph ph-storefront text-emerald-600" /> Pay at the box office
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          Seats stay reserved until the hold runs out. Collect before then.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              </fieldset>

              {formError && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <i className="ph ph-warning-circle mt-0.5" /> {formError}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <><i className="ph ph-circle-notch animate-spin" /> Working…</> : <><i className="ph ph-lock-key" /> {form.method === 'venue' ? 'Reserve these seats' : `Pay ${money(hold.total, hold.currency)}`}</>}
                </button>
                <button
                  type="button"
                  onClick={changeSeats}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Change seats
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Sticky summary */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200">
                <i className="ph ph-armchair text-emerald-600" />
                {selected.length === 0 ? 'No seats selected' : selected.map((seat) => seat.label).join(', ')}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                {selected.length === 0
                  ? `Tap a seat to select · up to ${maxSeats} seats`
                  : `${selected.length} ${selected.length === 1 ? 'seat' : 'seats'}${hold ? ` · ${hold.admissionsTotal} admission${hold.admissionsTotal === 1 ? '' : 's'}` : ''}`}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {totals ? 'Total' : 'From'}
              </p>
              <p className="text-lg font-black tabular-nums text-slate-900 dark:text-white">
                {money(totals ? totals.total : localSubtotal, currency)}
              </p>
            </div>

            {step === 'seats' ? (
              <button
                type="button"
                onClick={holdSeats}
                disabled={busy || selected.length === 0}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800"
              >
                {busy ? <><i className="ph ph-circle-notch animate-spin" /> Holding…</> : <>Hold seats <i className="ph ph-arrow-right" /></>}
              </button>
            ) : (
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-xs font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                <i className="ph ph-lock-simple" /> Seats locked
              </span>
            )}
          </div>

          {totals && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
              <span>Seats {money(totals.subtotal, currency)}</span>
              {totals.serviceFee > 0 && <span>+ Booking fee {money(totals.serviceFee, currency)}</span>}
              {totals.taxAmount > 0 && <span>+ Tax {money(totals.taxAmount, currency)}</span>}
              <span className="text-emerald-600 dark:text-emerald-400">Final amount checked by the server</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
