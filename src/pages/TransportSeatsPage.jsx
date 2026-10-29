import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  clockLabel,
  durationLabel,
  money,
  shortDate,
  transportGet,
  transportPost,
  typeMeta,
} from '../lib/transportClient.js';

const SEAT_STATE = {
  available: 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  selected: 'border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/30',
  held: 'border-amber-300 bg-amber-100 text-amber-700 cursor-not-allowed dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  sold: 'border-slate-200 bg-slate-200 text-slate-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-700 dark:text-slate-500',
  blocked: 'border-dashed border-slate-300 bg-slate-50 text-slate-300 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/40',
};

const LEGEND = [
  { key: 'available', label: 'Available' },
  { key: 'selected', label: 'Selected' },
  { key: 'held', label: 'On hold' },
  { key: 'sold', label: 'Sold' },
];

function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return {
    seconds,
    expired: seconds <= 0,
    label: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
  };
}

/** One carriage / deck of the vehicle, laid out row by row with an aisle. */
function SeatDeck({ carriage, seats, selected, onToggle }) {
  const rows = useMemo(() => {
    const byRow = new Map();
    seats.forEach((seat) => {
      if (!byRow.has(seat.rowLabel)) byRow.set(seat.rowLabel, []);
      byRow.get(seat.rowLabel).push(seat);
    });
    return Array.from(byRow.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[0]).localeCompare(String(b[0])))
      .map(([label, rowSeats]) => ({ label, seats: rowSeats.sort((a, b) => a.x - b.x) }));
  }, [seats]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      {carriage && (
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">{carriage}</p>
      )}
      <div className="mb-4 flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:bg-slate-700 dark:text-slate-300">
          <i className="ph ph-steering-wheel text-sm" aria-hidden="true" /> Front
        </span>
      </div>
      <div className="mx-auto flex max-w-[22rem] flex-col gap-1.5">
        {rows.map((row) => {
          const half = Math.ceil(row.seats.length / 2);
          const left = row.seats.slice(0, half);
          const right = row.seats.slice(half);
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-[10px] font-bold text-slate-400">{row.label}</span>
              <div className="flex flex-1 justify-end gap-1.5">
                {left.map((seat) => (
                  <SeatButton key={seat.id} seat={seat} selected={selected.includes(seat.id)} onToggle={onToggle} />
                ))}
              </div>
              <span className="w-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-1 gap-1.5">
                {right.map((seat) => (
                  <SeatButton key={seat.id} seat={seat} selected={selected.includes(seat.id)} onToggle={onToggle} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeatButton({ seat, selected, onToggle }) {
  const state = selected ? 'selected' : seat.status;
  const disabled = seat.status !== 'available';
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Seat ${seat.label}, ${state}`}
      disabled={disabled}
      onClick={() => onToggle(seat)}
      className={`h-9 w-9 shrink-0 rounded-lg border text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed ${SEAT_STATE[state] || SEAT_STATE.available}`}
    >
      {seat.label}
    </button>
  );
}

export default function TransportSeatsPage() {
  const { departureId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const fromStop = Number(params.get('from')) || 0;
  const toStop = Number(params.get('to')) || 0;
  const passengers = Math.min(10, Math.max(1, Number(params.get('pax')) || 1));

  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [fareClass, setFareClass] = useState('standard');
  const [hold, setHold] = useState(null);
  const [holding, setHolding] = useState(false);
  const [booking, setBooking] = useState(false);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [names, setNames] = useState(() => Array.from({ length: passengers }, () => ''));
  const holdRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await transportGet('seat-map', { departureId, fromStop, toStop });
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load this departure'); return; }
    setMap(result);
    setFareClass((current) => (result.classes.some((entry) => entry.code === current) ? current : result.classes[0]?.code || 'standard'));
  }, [departureId, fromStop, toStop]);

  useEffect(() => { load(); }, [load]);

  // Give the seats back if the visitor walks away without paying.
  useEffect(() => () => {
    if (holdRef.current) transportPost('release-hold', { holdRef: holdRef.current });
  }, []);

  const countdown = useCountdown(hold?.expiresAt);
  const departure = map?.departure;
  const seating = departure?.seating === 'capacity' ? 'capacity' : 'assigned';
  const klass = map?.classes?.find((entry) => entry.code === fareClass);
  const unitPrice = klass?.price ?? departure?.segmentPrice ?? 0;
  const quantity = seating === 'assigned' ? selected.length : passengers;

  const toggleSeat = (seat) => {
    if (hold) return;
    setSelected((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= passengers) return [...current.slice(1), seat.id];
      return [...current, seat.id];
    });
  };

  const decks = useMemo(() => {
    if (!map || seating !== 'assigned') return [];
    const byCarriage = new Map();
    map.seats.forEach((seat) => {
      const key = seat.carriage || '';
      if (!byCarriage.has(key)) byCarriage.set(key, []);
      byCarriage.get(key).push(seat);
    });
    return Array.from(byCarriage.entries()).map(([carriage, seats]) => ({ carriage, seats }));
  }, [map, seating]);

  // The server resolves ties to the route's first and last stop, so read the
  // segment back from the departure rather than trusting the query string.
  const tripMinutes = useMemo(() => {
    if (!map) return 0;
    const board = map.stops.find((stop) => stop.order === map.departure.fromStop)?.minutesFromOrigin ?? 0;
    const alight = map.stops.find((stop) => stop.order === map.departure.toStop)?.minutesFromOrigin ?? 0;
    return Math.max(0, alight - board);
  }, [map]);

  const startHold = async () => {
    setError('');
    if (seating === 'assigned' && selected.length !== passengers) {
      setError(`Pick ${passengers} ${passengers === 1 ? 'seat' : 'seats'} to continue.`);
      return;
    }
    setHolding(true);
    const result = await transportPost('hold', {
      departureId: Number(departureId),
      seatIds: seating === 'assigned' ? selected : [],
      fromStop: departure.fromStop,
      toStop: departure.toStop,
      passengers,
      fareClass,
      customerEmail: contact.email,
    });
    setHolding(false);
    if (!result.ok) {
      setError(result.error || 'Those seats are no longer available');
      setSelected([]);
      load();
      return;
    }
    setHold(result.hold);
    holdRef.current = result.hold.holdRef;
    const labels = seating === 'assigned' ? result.hold.seats.map((seat) => seat.label) : [];
    setNames((current) => current.map((name, index) => name || (index === 0 ? contact.name : '')));
    setSelected(labels.length ? result.hold.seats.map((seat) => seat.seatId) : []);
  };

  const confirm = async () => {
    setError('');
    if (!contact.name.trim()) { setError('Enter the lead passenger name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) { setError('Enter a valid email so we can send the tickets.'); return; }
    setBooking(true);
    const result = await transportPost('book', {
      holdRef: hold.holdRef,
      customer: contact,
      passengers: names.map((name, index) => ({ name: name || (index === 0 ? contact.name : '') })),
      paymentMethod: 'counter',
    });
    setBooking(false);
    if (!result.ok) { setError(result.error || 'Could not complete the booking'); return; }
    holdRef.current = '';
    navigate(`/transport/confirmation?ref=${encodeURIComponent(result.order.bookingRef)}`, { replace: true });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl animate-pulse space-y-3">
          <div className="h-24 rounded-2xl bg-white dark:bg-slate-800" />
          <div className="h-72 rounded-2xl bg-white dark:bg-slate-800" />
        </div>
      </main>
    );
  }

  if (!map || !departure) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16 dark:bg-slate-950">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <i className="ph ph-warning-circle mx-auto mb-3 block text-4xl text-rose-400" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">This departure is unavailable</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error || 'It may have been cancelled or sold out.'}</p>
          <Link to="/transport" className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">Search again</Link>
        </div>
      </main>
    );
  }

  const meta = typeMeta(departure.transportType);
  const step = hold ? 2 : 1;

  return (
    <main className="min-h-screen bg-slate-50 pb-16 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <nav className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-slate-400" aria-label="Breadcrumb">
          <Link to="/transport" className="hover:text-emerald-600">Transport</Link>
          <i className="ph ph-caret-right" aria-hidden="true" />
          <span className="text-slate-600 dark:text-slate-300">Choose your {seating === 'assigned' ? 'seat' : 'places'}</span>
        </nav>

        {/* ── Journey summary ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-slate-700 dark:text-emerald-400">
                  <i className={`ph ${meta.icon} text-sm`} aria-hidden="true" /> {departure.transportLabel}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{departure.operatorName}</span>
              </div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white sm:text-xl">{departure.routeName}</h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {shortDate(departure.travelDate)} · {departure.vehicleName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">From</p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{money(unitPrice, departure.currency)}</p>
              <p className="text-[11px] text-slate-400">per passenger</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
            <div className="text-center">
              <p className="text-base font-black text-slate-900 dark:text-white">{clockLabel(departure.boardTime)}</p>
              <p className="max-w-[8rem] truncate text-[11px] text-slate-500 dark:text-slate-400">{departure.boardAt?.name}</p>
            </div>
            <div className="flex-1">
              <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {durationLabel(tripMinutes)}
              </p>
              <span className="mt-1 flex items-center gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            </div>
            <div className="text-center">
              <p className="text-base font-black text-slate-900 dark:text-white">{clockLabel(departure.alightTime)}</p>
              <p className="max-w-[8rem] truncate text-[11px] text-slate-500 dark:text-slate-400">{departure.alightAt?.name}</p>
            </div>
          </div>
        </section>

        {/* ── Steps ── */}
        <ol className="mt-5 flex items-center gap-2 text-xs font-bold">
          <li className={`flex items-center gap-1.5 ${step === 1 ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === 1 ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>1</span>
            {seating === 'assigned' ? 'Seats' : 'Places'}
          </li>
          <li className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <li className={`flex items-center gap-1.5 ${step === 2 ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === 2 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>2</span>
            Passengers
          </li>
          <li className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <li className="flex items-center gap-1.5 text-slate-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] dark:bg-slate-800">3</span>
            Tickets
          </li>
        </ol>

        {error && (
          <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            <i className="ph ph-warning-circle text-base" aria-hidden="true" /> {error}
          </p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            {/* ── Fare class ── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-2.5 text-sm font-bold text-slate-900 dark:text-white">Travel class</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {map.classes.map((entry) => (
                  <button
                    key={entry.code}
                    type="button"
                    disabled={Boolean(hold)}
                    aria-pressed={fareClass === entry.code}
                    onClick={() => setFareClass(entry.code)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      fareClass === entry.code
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{entry.name}</span>
                    <span className="text-sm font-black text-slate-700 dark:text-slate-200">{money(entry.price, departure.currency)}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* ── Seat map / capacity ── */}
            {seating === 'assigned' ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-3 py-2 dark:bg-slate-800">
                  {LEGEND.map((entry) => (
                    <span key={entry.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span className={`h-3.5 w-3.5 rounded border ${SEAT_STATE[entry.key].split(' ').slice(0, 2).join(' ')}`} aria-hidden="true" />
                      {entry.label}
                    </span>
                  ))}
                  <span className="ml-auto text-[11px] font-bold text-slate-400">
                    {departure.seatsAvailable} of {departure.seatsTotal} free
                  </span>
                </div>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {selected.length} of {passengers} selected
                </p>
                {decks.map((deck) => (
                  <SeatDeck
                    key={deck.carriage || 'main'}
                    carriage={deck.carriage}
                    seats={deck.seats}
                    selected={selected}
                    onToggle={toggleSeat}
                  />
                ))}
              </>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
                <i className="ph ph-users-three mx-auto mb-2 block text-3xl text-emerald-600" aria-hidden="true" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">General admission</h2>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                  This vessel has no assigned seating — your booking reserves {passengers} {passengers === 1 ? 'place' : 'places'} on board.
                </p>
                <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                  {passengers} <span className="text-sm font-semibold text-slate-400">of {departure.seatsAvailable} places left</span>
                </p>
              </section>
            )}
          </div>

          {/* ── Checkout rail ── */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Your booking</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <dt>{klass?.name || 'Standard'} × {quantity || passengers}</dt>
                  <dd className="font-semibold">{money(unitPrice * (quantity || passengers), departure.currency)}</dd>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <dt>Booking fee</dt>
                  <dd>Included</dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-900 dark:border-slate-700 dark:text-white">
                  <dt>Total</dt>
                  <dd>{money(unitPrice * (quantity || passengers), departure.currency)}</dd>
                </div>
              </dl>

              {!hold ? (
                <button
                  type="button"
                  onClick={startHold}
                  disabled={holding || (seating === 'assigned' && selected.length !== passengers)}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {holding ? 'Holding…' : `Hold ${seating === 'assigned' ? 'seats' : 'places'} & continue`}
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${countdown?.expired ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                    <span>{countdown?.expired ? 'Hold expired' : 'Seats held for you'}</span>
                    <span className="font-mono tabular-nums">{countdown?.label || '00:00'}</span>
                  </p>

                  <div>
                    <label htmlFor="lead-name" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lead passenger</label>
                    <input
                      id="lead-name"
                      value={contact.name}
                      onChange={(event) => setContact({ ...contact, name: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label htmlFor="lead-email" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email for tickets</label>
                    <input
                      id="lead-email"
                      type="email"
                      value={contact.email}
                      onChange={(event) => setContact({ ...contact, email: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="lead-phone" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Phone (optional)</label>
                    <input
                      id="lead-phone"
                      type="tel"
                      value={contact.phone}
                      onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm"
                      placeholder="+256 …"
                    />
                  </div>

                  {Array.from({ length: passengers }).map((_, index) => (
                    <div key={index}>
                      <label htmlFor={`pax-${index}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Passenger {index + 1}
                        {seating === 'assigned' && hold.seats[index] ? ` · seat ${hold.seats[index].label}` : ''}
                      </label>
                      <input
                        id={`pax-${index}`}
                        value={names[index] || ''}
                        onChange={(event) => setNames((current) => current.map((name, position) => (position === index ? event.target.value : name)))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm"
                        placeholder={index === 0 ? contact.name || 'Full name' : 'Full name'}
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={confirm}
                    disabled={booking || countdown?.expired}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {booking ? 'Issuing tickets…' : `Confirm & get tickets`}
                  </button>
                  <p className="text-center text-[11px] text-slate-400">
                    Pay {money(unitPrice * passengers, departure.currency)} at the counter or on board.
                  </p>
                </div>
              )}

              {map.departure.cancellation && (
                <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                  <i className="ph ph-info mt-0.5 shrink-0" aria-hidden="true" /> {map.departure.cancellation}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
