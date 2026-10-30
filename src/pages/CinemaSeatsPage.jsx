import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  cinemaGet, cinemaPost, clockLabel, dayParts, formatDate, money, shortDate, todayISO,
} from '../lib/cinemaClient.js';

const SEAT_SIZE = 26;
const SEAT_GAP = 5;
// Aisles widen the track instead of adding a column, so seat x positions keep
// matching the owner's layout no matter where the aisle runs.
const AISLE_SIZE = 18;

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

function durationLabel(minutes) {
  const value = Number(minutes || 0);
  if (!value) return '';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins}min`;
  return `${hours}h ${mins ? `${mins}min` : ''}`.trim();
}

/** Outlined square in the seat-map language, reused for the legend. */
function SeatGlyph({ tone = 'available', children }) {
  const tones = {
    available: 'border-slate-400 bg-white dark:border-slate-600 dark:bg-slate-800/40',
    unavailable: 'border-slate-200 bg-slate-200 text-slate-400 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-600',
    selected: 'border-emerald-400 bg-emerald-600 text-white',
    wheelchair: 'border-slate-400 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400',
  };
  return (
    <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border text-[10px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Legend({ showHeld }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:gap-x-7">
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <SeatGlyph /> Available
      </span>
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <SeatGlyph tone="unavailable"><i className="ph ph-x" /></SeatGlyph> Unavailable
      </span>
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <SeatGlyph tone="selected" /> Selected
      </span>
      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <SeatGlyph tone="wheelchair"><i className="ph ph-wheelchair" /></SeatGlyph> Wheelchair
      </span>
      {showHeld && (
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <SeatGlyph tone="unavailable" /> On hold
        </span>
      )}
    </div>
  );
}

function ScreenArc({ label, position = 'top' }) {
  const arc = (
    <svg viewBox="0 0 600 58" className="w-full" aria-hidden="true">
      <defs>
        <linearGradient id="screenArc" x1="0" x2="1">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0" />
          <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M6 52 Q300 -20 594 52" fill="none" stroke="url(#screenArc)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
  const caption = (
    <p className="mt-2 text-center text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">{label}</p>
  );
  return (
    <div className="mx-auto max-w-2xl">
      {position === 'bottom' ? (
        <>
          <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">{label}</p>
          <div className="rotate-180">{arc}</div>
        </>
      ) : (
        <>
          {arc}
          {caption}
        </>
      )}
    </div>
  );
}

/** Doors and exits the owner placed on the published layout. */
function Entrances({ entrances }) {
  if (!entrances?.length) return null;
  const icons = { left: 'ph-arrow-left', right: 'ph-arrow-right', top: 'ph-arrow-up', bottom: 'ph-arrow-down' };
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
      {entrances.map((entrance) => (
        <span
          key={entrance.id}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          <i className={`ph ${icons[entrance.side] || 'ph-door-open'}`} />
          {entrance.label || 'Entrance'}
        </span>
      ))}
    </div>
  );
}

function Seat({ seat, selected, locked, currency, onToggle }) {
  const unavailable = seat.status === 'sold' || seat.status === 'unavailable';
  const disabled = locked || seat.status !== 'available';
  const accessible = seat.accessible || seat.category === 'wheelchair' || seat.category === 'companion';
  const accent = seat.categoryColor || '';

  let tone = 'border-slate-400 bg-white text-slate-500 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300';
  const style = { width: SEAT_SIZE, height: SEAT_SIZE };
  if (selected) {
    tone = 'border-emerald-400 bg-emerald-600 text-white shadow-[0_0_14px_rgba(5,150,105,0.45)]';
  } else if (unavailable) {
    tone = 'border-slate-200 bg-slate-100 text-slate-300 dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-600';
  } else if (seat.status === 'held') {
    tone = 'border-amber-400/60 bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400';
  } else if (seat.status === 'blocked') {
    tone = 'border-dashed border-slate-300 bg-transparent text-slate-300 dark:border-slate-700 dark:text-slate-600';
  } else if (accent) {
    // The owner's own colour for this seat type, light enough to keep the
    // numbers readable in both themes.
    tone = 'text-slate-600 dark:text-slate-200';
    style.borderColor = accent;
    style.backgroundColor = `${accent}26`;
  }

  const title = disabled && !selected
    ? `${seat.label} · ${seat.categoryLabel} · ${unavailable ? 'unavailable' : seat.status}`
    : `${seat.label} · ${seat.categoryLabel}${seat.price != null ? ` · ${money(seat.price, currency)}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => onToggle(seat)}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={Boolean(selected)}
      style={style}
      className={`flex items-center justify-center rounded-[6px] border text-[9px] font-bold leading-none transition duration-150 ${tone} ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5'
      }`}
    >
      {accessible
        ? <i className="ph ph-wheelchair text-[12px]" />
        : unavailable
          ? <i className="ph ph-x text-[10px]" />
          : <span className="tabular-nums">{seat.number}</span>}
    </button>
  );
}

function DateStrip({ dates, activeDate, onPick }) {
  return (
    <div className="no-scrollbar overflow-x-auto px-4 py-4 sm:py-6">
      <div className="mx-auto flex w-max gap-2 sm:gap-3">
        {dates.map((entry) => {
          const { weekday, day, month } = dayParts(entry.date);
          const active = entry.date === activeDate;
          return (
            <button
              key={entry.date}
              type="button"
              onClick={() => onPick(entry.date)}
              aria-pressed={active}
              className={`flex w-[74px] shrink-0 flex-col items-center rounded-xl border px-2 py-2.5 transition-colors sm:w-[88px] ${
                active
                  ? 'border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/20'
              }`}
            >
              <span className={`text-[10px] font-bold ${active ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'}`}>
                {month}
              </span>
              <span className="mt-0.5 text-xl font-black leading-none">{day}</span>
              <span className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${active ? 'text-emerald-200' : 'text-slate-400 dark:text-slate-500'}`}>
                {entry.date === todayISO() ? 'Today' : weekday}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CinemaSeatsPage() {
  const { showtimeId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [map, setMap] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [seatIds, setSeatIds] = useState([]);
  const [step, setStep] = useState('seats');
  const [hold, setHold] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [activeDate, setActiveDate] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', method: 'card' });
  const formRef = useRef(null);
  const seatScrollRef = useRef(null);
  const didFitRef = useRef(false);

  // Scale the grid down so a wide screen fits a phone, but keep seats big enough
  // to tap; anything wider than the screen simply scrolls sideways.
  const fitSeats = useCallback(() => {
    const container = seatScrollRef.current;
    const stage = container?.querySelector('[data-seat-stage]');
    if (!container || !stage) return;
    const available = container.clientWidth - 8;
    const natural = stage.scrollWidth;
    if (!available || !natural) return;
    setNaturalWidth(natural);
    setZoom(Math.max(0.6, Math.min(1, Number((available / natural).toFixed(2)))));
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

  // A different screening means a different screen: drop the old picks.
  useEffect(() => {
    setSeatIds([]);
    setStep('seats');
    setHold(null);
    setFormError('');
  }, [showtimeId]);

  // The schedule powers the date strip and the times beside the map.
  useEffect(() => {
    const cinemaId = map?.showtime?.cinemaId;
    if (!cinemaId) return undefined;
    let alive = true;
    cinemaGet('cinema', { cinemaId }).then((payload) => {
      if (alive && payload.ok) setSchedule(payload);
    });
    return () => { alive = false; };
  }, [map?.showtime?.cinemaId]);

  useEffect(() => {
    if (map?.showtime?.showDate) setActiveDate(map.showtime.showDate);
  }, [map?.showtime?.showDate]);

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
  const rows = map?.rows || [];
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
  const locked = step === 'details' && Boolean(hold);

  const seatsPerRow = Math.max(0, ...seats.map((seat) => seat.x));

  // Screening seats carry the auditorium layout version they were sold on, so
  // aisles and the screen position always match what the owner published.
  const layout = map?.layout || null;
  const screenAtBottom = layout?.screen?.position === 'bottom';
  const totalCols = Math.max(seatsPerRow, Number(layout?.cols || 0), 1);
  const aisles = Array.isArray(layout?.aisles) ? layout.aisles : [];

  /** One track per column: aisle columns are wider and drawn as a dashed lane. */
  const columnPlan = useCallback((y) => {
    const lanes = [];
    const widths = [];
    for (let x = 1; x <= totalCols; x += 1) {
      const lane = aisles.some((aisle) => x >= Number(aisle.fromX)
        && x < Number(aisle.fromX) + Number(aisle.width)
        && y >= Number(aisle.fromY)
        && y <= Number(aisle.toY));
      if (lane) lanes.push(x);
      widths.push(`${lane ? AISLE_SIZE : SEAT_SIZE}px`);
    }
    return { template: widths.join(' '), lanes };
  }, [aisles, totalCols]);

  // Rows are labelled with the price tier most of their seats belong to, so the
  // map reads like a cinema's own seat plan.
  const tiers = useMemo(() => {
    const groups = [];
    for (const row of rows) {
      const counts = new Map();
      for (const seat of row.seats) {
        counts.set(seat.categoryLabel, (counts.get(seat.categoryLabel) || 0) + 1);
      }
      const label = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Seats';
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else groups.push({ key: `${label}-${groups.length}`, label, rows: [row] });
    }
    return groups;
  }, [rows]);

  const toggleSeat = (seat) => {
    if (locked || seat.status !== 'available') return;
    setMessage('');
    setSeatIds((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= maxSeats) {
        setMessage(`You can select up to ${maxSeats} seats at a time.`);
        return current;
      }
      // A companion seat is only meaningful next to a wheelchair space.
      if (seat.baseCategory === 'companion' || seat.category === 'companion') {
        const hasWheelchair = seats.some(
          (entry) => (entry.baseCategory === 'wheelchair' || entry.category === 'wheelchair')
            && entry.row === seat.row
            && current.includes(entry.id)
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
    if (name.length < 2) {
      setFormError('Enter the name for the booking.');
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setFormError('Enter a valid email address so we can send the tickets.');
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-[#08090c]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex justify-center gap-3">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="h-[88px] w-[88px] animate-pulse rounded-xl bg-white dark:bg-white/5" />
            ))}
          </div>
          <div className="h-[420px] animate-pulse rounded-3xl bg-white dark:bg-white/5" />
        </div>
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
  const movie = schedule?.movies?.find((entry) => Number(entry.id) === Number(showtime.movieId));
  const times = schedule
    ? schedule.showtimes.filter((entry) => entry.showDate === activeDate)
    : [];
  const stripDates = schedule?.dates?.length ? schedule.dates.slice(0, 7) : [{ date: showtime.showDate, shows: 1 }];
  const viewingOtherDate = Boolean(activeDate) && activeDate !== showtime.showDate;
  const occupancy = map.stats.total ? Math.round((map.stats.sold / map.stats.total) * 100) : 0;
  const totals = hold
    ? { subtotal: hold.subtotal, serviceFee: hold.serviceFee, taxAmount: hold.taxAmount, total: hold.total }
    : null;
  const payable = totals ? totals.total : localSubtotal;
  const fromPrice = map.categories.length
    ? Math.min(...map.categories.map((category) => Number(category.price)))
    : showtime.basePrice;
  const cinemaHref = `/attractions/cinemas/${showtime.cinemaId}`;
  const filmHref = `${cinemaHref}/movie/${showtime.movieId}`;
  const ticketCount = selected.length || Number(hold?.admissionsTotal || 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-[150px] dark:bg-[#08090c]">
      <h1 className="sr-only">{showtime.movieTitle} · select your seats</h1>

      {/* Date strip */}
      <section className="border-b border-slate-200 bg-white dark:border-white/5 dark:bg-[#0b0d10]">
        <DateStrip dates={stripDates} activeDate={activeDate || showtime.showDate} onPick={setActiveDate} />
      </section>

      <div className="mx-auto max-w-[1180px] px-4 pt-5 sm:px-6">
        {message && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <i className="ph ph-warning-circle text-base" />
            <p className="flex-1">{message}</p>
            <button type="button" onClick={() => setMessage('')} aria-label="Dismiss" className="text-amber-500"><i className="ph ph-x" /></button>
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Venue + times */}
          <aside className="lg:w-[204px] lg:shrink-0">
            <Link
              to={filmHref}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <i className="ph ph-arrow-left text-sm" /> Back to film
            </Link>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/5 dark:bg-white/[0.02]">
              <p className="text-sm font-black leading-snug text-slate-900 dark:text-white">
                {showtime.cinemaName || 'Cinema'}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {shortDate(activeDate || showtime.showDate)} · {times.length || 0} {times.length === 1 ? 'time' : 'times'}
              </p>

              <div className="mt-3 space-y-1.5">
                {times.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] font-semibold text-slate-400 dark:border-white/10">
                    No screenings on this date.
                  </p>
                )}
                {times.map((entry) => {
                  const active = Number(entry.id) === Number(showtimeId);
                  return (
                    <Link
                      key={entry.id}
                      to={`/attractions/cinemas/${showtime.cinemaId}/seats/${entry.id}`}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-lg px-2 py-2 text-center text-xs font-bold transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      {clockLabel(entry.startTime)}
                      {(schedule?.movies?.length || 0) > 1 && (
                        <span className={`mt-0.5 block truncate text-[9px] font-semibold ${active ? 'text-white/75' : 'text-slate-400 dark:text-slate-500'}`}>
                          {entry.movieTitle}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              <Link to={cinemaHref} className="mt-3 block text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400">
                Cinema details
              </Link>
            </div>

            {step === 'seats' && (
              <p className="mt-3 text-[10px] font-semibold leading-relaxed text-slate-400 dark:text-slate-500">
                Seats are held for {map.holdMinutes} minutes once you continue, so you can finish paying without losing them.
                <span className="mt-1 block">{occupancy}% of this screen is already sold.</span>
              </p>
            )}
          </aside>

          {/* Seat map */}
          <div className="min-w-0 flex-1">
            <Legend showHeld={map.stats.held > 0} />

            {viewingOtherDate && (
              <div className="mx-auto mt-4 flex max-w-xl items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <i className="ph ph-info mt-0.5" />
                <p>
                  You are viewing {shortDate(showtime.showDate)}. Pick a time for {shortDate(activeDate)} on the left to change the show.
                </p>
              </div>
            )}

            <div className="relative mt-4 rounded-3xl border border-slate-200 bg-white px-2 py-6 dark:border-white/5 dark:bg-white/[0.015] sm:px-6">
              {/* Zoom: vertical on desktop, a small row on phones */}
              <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0e1013] lg:flex">
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}
                  aria-label="Zoom in"
                  className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <i className="ph ph-plus" />
                </button>
                <span className="h-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))}
                  aria-label="Zoom out"
                  className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <i className="ph ph-minus" />
                </button>
              </div>

              <div className="mb-1 flex items-center justify-end gap-1.5 px-1 lg:hidden">
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))}
                  aria-label="Zoom out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-300"
                >
                  <i className="ph ph-minus" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}
                  aria-label="Zoom in"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-300"
                >
                  <i className="ph ph-plus" />
                </button>
                <button
                  type="button"
                  onClick={fitSeats}
                  className="flex h-8 items-center rounded-lg border border-slate-200 px-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-300"
                >
                  Fit
                </button>
              </div>

              {!screenAtBottom && (
                <ScreenArc
                  position="top"
                  label={`${layout?.screen?.label || showtime.screenName}${showtime.screenType ? ` · ${showtime.screenType}` : ''}`}
                />
              )}
              <Entrances entrances={layout?.entrances} />

              <div ref={seatScrollRef} className="mt-5 overflow-x-auto pb-2">
                <div
                  className="mx-auto transition-[width] duration-200"
                  style={{ width: naturalWidth ? Math.ceil(naturalWidth * zoom) : undefined }}
                >
                  <div
                    data-seat-stage
                    className={`w-max transition-transform duration-200 ${locked ? 'pointer-events-none opacity-60' : ''}`}
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                  >
                    <div className="space-y-5">
                      {tiers.map((tier) => (
                        <div key={tier.key}>
                          <p className="mb-2.5 text-center text-[9px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">
                            {tier.label}
                          </p>
                          <div className="space-y-1.5">
                            {tier.rows.map((row) => {
                              const plan = columnPlan(row.seats[0]?.y || 1);
                              return (
                                <div key={row.label} className="flex items-center justify-center gap-2.5">
                                  <span className="w-4 text-right text-[10px] font-bold text-slate-400 dark:text-slate-500">{row.label}</span>
                                  <div
                                    className="grid items-center"
                                    style={{ gridTemplateColumns: plan.template, gap: `${SEAT_GAP}px` }}
                                  >
                                    {plan.lanes.map((x) => (
                                      <div
                                        key={`aisle-${row.label}-${x}`}
                                        aria-hidden="true"
                                        style={{ gridColumn: x, minHeight: SEAT_SIZE }}
                                        className="rounded-[4px] border-x border-dashed border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]"
                                      />
                                    ))}
                                    {row.seats.map((seat) => (
                                      <div key={seat.id} style={{ gridColumn: `${seat.x} / span 1` }}>
                                        <Seat
                                          seat={seat}
                                          selected={seatIds.includes(seat.id)}
                                          locked={locked}
                                          currency={currency}
                                          onToggle={toggleSeat}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <span className="w-4 text-[10px] font-bold text-slate-400 dark:text-slate-500">{row.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {screenAtBottom && (
                <div className="mt-2">
                  <ScreenArc
                    position="bottom"
                    label={`${layout?.screen?.label || showtime.screenName}${showtime.screenType ? ` · ${showtime.screenType}` : ''}`}
                  />
                </div>
              )}

              {map.categories.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-4 dark:border-white/5">
                  {map.categories.map((category) => (
                    <span key={category.id} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      <span
                        className="h-2.5 w-2.5 rounded-[3px] border"
                        style={{ borderColor: category.color, backgroundColor: `${category.color}40` }}
                      />
                      {category.label}
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">{money(category.price, currency)}</span>
                    </span>
                  ))}
                </div>
              )}

            </div>

            <p className="mt-3 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              Up to {maxSeats} seats per booking · tap a seat again to remove it
            </p>
          </div>
        </div>

        {/* Checkout details */}
        {step === 'details' && hold && (
          <div
            ref={formRef}
            id="cinema-checkout"
            className="mx-auto mt-8 max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
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

            <form id="cinema-checkout-form" onSubmit={submitOrder} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Full name *</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    autoComplete="name"
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
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
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
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
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                />
              </label>

              <fieldset>
                <legend className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  How would you like to pay? *
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {map.allowOnline && (
                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${form.method === 'card' ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
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
                          <i className="ph ph-credit-card text-emerald-600 dark:text-emerald-400" /> Pay now by card
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          Secure checkout. Tickets are issued the moment payment clears.
                        </span>
                      </span>
                    </label>
                  )}
                  {map.allowPayAtVenue && (
                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 transition-colors ${form.method === 'venue' ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
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
                          <i className="ph ph-storefront text-emerald-600 dark:text-emerald-400" /> Pay at the box office
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
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Change seats
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Order summary + action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-5xl justify-center px-4">
          <div className="relative w-full">
            {summaryOpen && (
              <div className="absolute bottom-full left-1/2 mb-3 w-full max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/20 dark:border-white/10 dark:bg-[#0e1013]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order summary</p>
                  {countdown && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black tabular-nums ${countdown.urgent ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      <i className="ph ph-timer" /> {countdown.label}
                    </span>
                  )}
                </div>

                <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto">
                  {selected.length === 0 && map.categories.map((category) => (
                    <li key={category.id} className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>{category.label} · {category.count} seats</span>
                      <span className="tabular-nums">{money(category.price, currency)}</span>
                    </li>
                  ))}
                  {selected.map((seat) => (
                    <li key={seat.id} className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="ph ph-armchair text-emerald-500" /> {seat.label}
                        <span className="text-slate-400 dark:text-slate-500">{seat.categoryLabel}</span>
                      </span>
                      <span className="tabular-nums">{money(seat.price, currency)}</span>
                    </li>
                  ))}
                </ul>

                {totals && (
                  <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <p className="flex items-center justify-between"><span>Seats</span><span className="tabular-nums">{money(totals.subtotal, currency)}</span></p>
                    {totals.serviceFee > 0 && <p className="flex items-center justify-between"><span>Booking fee</span><span className="tabular-nums">{money(totals.serviceFee, currency)}</span></p>}
                    {totals.taxAmount > 0 && <p className="flex items-center justify-between"><span>Tax</span><span className="tabular-nums">{money(totals.taxAmount, currency)}</span></p>}
                  </div>
                )}

                <p className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm font-black text-slate-900 dark:border-white/10 dark:text-white">
                  <span>{selected.length ? 'Total' : 'From'}</span>
                  <span className="tabular-nums">{money(selected.length ? payable : fromPrice, currency)}</span>
                </p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setSummaryOpen((value) => !value)}
                aria-expanded={summaryOpen}
                className="relative -mb-px inline-flex items-center gap-1.5 rounded-t-xl border border-b-0 border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-[#0b0d10] dark:text-slate-300 dark:hover:text-white"
              >
                Order Summary
                <i className={`ph ${summaryOpen ? 'ph-caret-down' : 'ph-caret-up'} text-xs`} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#0b0d10]/95">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
            {showtime.posterUrl && (
              <img
                src={showtime.posterUrl}
                alt=""
                className="hidden h-14 w-10 shrink-0 rounded-md object-cover sm:block"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900 dark:text-white">{showtime.movieTitle}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {[showtime.ageRating, movie?.language, durationLabel(showtime.durationMin)].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {showtime.screenName} · {formatDate(showtime.showDate)} · {clockLabel(showtime.startTime)}
                {ticketCount > 0 && ` · ${ticketCount} ${ticketCount === 1 ? 'ticket' : 'tickets'}`}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {totals ? 'Total' : selected.length ? 'Selected' : 'From'}
              </p>
              <p className="text-base font-black tabular-nums text-slate-900 dark:text-white">
                {money(selected.length ? payable : fromPrice, currency)}
              </p>
            </div>

            {step === 'seats' ? (
              <button
                type="button"
                onClick={holdSeats}
                disabled={busy || selected.length === 0}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-slate-500 sm:px-5"
              >
                {busy ? <><i className="ph ph-circle-notch animate-spin" /> Holding…</> : selected.length ? <>Proceed to Pay <span className="hidden tabular-nums sm:inline">{money(payable, currency)}</span></> : <>Select seats</>}
              </button>
            ) : (
              <button
                type="submit"
                form="cinema-checkout-form"
                disabled={busy}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
              >
                {busy ? <><i className="ph ph-circle-notch animate-spin" /> Working…</> : <>{form.method === 'venue' ? 'Reserve seats' : 'Pay'} <span className="tabular-nums">{money(hold.total, hold.currency)}</span></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
