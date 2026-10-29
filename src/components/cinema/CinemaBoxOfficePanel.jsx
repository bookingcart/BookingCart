import { useCallback, useEffect, useMemo, useState } from 'react';
import { cinemaGet, cinemaPost, clockLabel, money, shortDate, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Field, Notice, Pill, cx, inputCls } from './ui.jsx';

const CATEGORY_BORDER = {
  standard: 'border-slate-300 dark:border-slate-600',
  premium: 'border-sky-400',
  vip: 'border-violet-400',
  couple: 'border-rose-400',
  recliner: 'border-amber-400',
  wheelchair: 'border-blue-400',
  companion: 'border-teal-400',
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'ph-money' },
  { id: 'card', label: 'Card', icon: 'ph-credit-card' },
  { id: 'mobile', label: 'Mobile money', icon: 'ph-device-mobile' },
];

const LEGEND = [
  { label: 'Available', swatch: 'bg-white dark:bg-slate-800' },
  { label: 'Selected', swatch: 'bg-green-500 border-green-600' },
  { label: 'On hold', swatch: 'bg-amber-100 dark:bg-amber-900/40 border-amber-300' },
  { label: 'Sold', swatch: 'bg-slate-300 dark:bg-slate-700 border-slate-400' },
  { label: 'Blocked', swatch: 'border-dashed bg-slate-100/70 dark:bg-slate-800/40' },
];

function PosSeat({ seat, selected, onToggle }) {
  const disabled = seat.status !== 'available';
  let tone = 'bg-white dark:bg-slate-800';
  let text = 'text-slate-500 dark:text-slate-300';
  if (seat.status === 'sold') { tone = 'bg-slate-300 dark:bg-slate-700'; text = 'text-slate-400'; }
  else if (seat.status === 'held') { tone = 'bg-amber-100 dark:bg-amber-900/40'; text = 'text-amber-600'; }
  else if (seat.status !== 'available') { tone = 'bg-slate-100/70 dark:bg-slate-800/40 border-dashed'; text = 'text-slate-300 dark:text-slate-600'; }
  else if (selected) { tone = 'bg-green-500'; text = 'text-white'; }

  return (
    <button
      type="button"
      onClick={() => onToggle(seat)}
      disabled={disabled}
      aria-pressed={selected}
      title={`${seat.label} · ${seat.categoryLabel} · ${seat.status}`}
      className={cx(
        'flex h-[30px] w-[30px] items-center justify-center rounded-md rounded-t-lg border-2 text-[9px] font-black tabular-nums',
        CATEGORY_BORDER[seat.category] || CATEGORY_BORDER.standard,
        tone,
        text,
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5'
      )}
    >
      {seat.number}
    </button>
  );
}

function Receipt({ sale, onNewSale }) {
  const { order } = sale;
  return (
    <Card
      title="Sale complete"
      icon="ph-check-circle"
      action={<Button size="sm" variant="ghost" icon="ph-arrow-counter-clockwise" onClick={onNewSale}>New sale</Button>}
    >
      <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4 dark:border-green-900/60 dark:bg-green-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-black text-slate-900 dark:text-white">{order.bookingRef}</p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {order.movieTitle} · {order.screenName} · {order.showDate} {order.slotLabel}
            </p>
          </div>
          <p className="text-xl font-black tabular-nums text-green-700 dark:text-green-400">{money(order.total, order.currency)}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.tickets.map((ticket) => (
            <span key={ticket.id} className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
              {ticket.seatLabel}
              <span className="ml-1 font-mono font-bold text-slate-400">{ticket.ticketNo}</span>
            </span>
          ))}
        </div>

        <p className="mt-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          {order.customerName} · paid by {sale.order.paymentMethod} · cashier {sale.cashier}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/attractions/cinemas/confirmation?ref=${encodeURIComponent(order.bookingRef)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <i className="ph ph-printer" /> Print / reprint tickets
        </a>
      </div>

      <p className="mt-3 text-[10px] font-medium text-slate-400">
        Printing does not mark these tickets as used — they are only spent when the QR is scanned at the door.
      </p>
    </Card>
  );
}

export default function CinemaBoxOfficePanel({ attractionId, headers, currency = 'USD' }) {
  const [showtimes, setShowtimes] = useState([]);
  const [selectedShowtime, setSelectedShowtime] = useState(0);
  const [map, setMap] = useState(null);
  const [seatIds, setSeatIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sale, setSale] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', paymentMethod: 'cash' });

  const loadShowtimes = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('pos-showtimes', { attractionId }, headers);
    if (payload.ok) {
      const list = (payload.showtimes || []).filter((show) => show.status === 'on_sale');
      setShowtimes(list);
      setSelectedShowtime((current) => current || list[0]?.id || 0);
      setError('');
    } else {
      setError(payload.error || 'Could not load today’s screenings');
    }
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { loadShowtimes(); }, [loadShowtimes]);

  const loadMap = useCallback(async (showtimeId) => {
    if (!showtimeId) { setMap(null); return; }
    setMapLoading(true);
    const payload = await cinemaGet('seat-map-admin', { attractionId, showtimeId }, headers);
    if (payload.ok) { setMap(payload); setSeatIds([]); setError(''); }
    else setError(payload.error || 'Could not open the seat map');
    setMapLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { loadMap(selectedShowtime); }, [selectedShowtime, loadMap]);

  const seats = map?.seats || [];
  const selectedSeats = useMemo(
    () => seats.filter((seat) => seatIds.includes(seat.id)),
    [seats, seatIds]
  );
  const subtotal = selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const showtime = map?.showtime || showtimes.find((show) => show.id === selectedShowtime);

  const toggleSeat = (seat) => {
    if (seat.status !== 'available') return;
    setMessage('');
    setSeatIds((current) => (current.includes(seat.id)
      ? current.filter((id) => id !== seat.id)
      : current.length >= (map?.pricing?.maxSeats || 12) ? current : [...current, seat.id]));
  };

  const sell = async () => {
    if (!seatIds.length) { setMessage('Pick at least one seat.'); return; }
    setBusy(true);
    const payload = await cinemaPost('pos-sell', {
      attractionId,
      showtimeId: selectedShowtime,
      seatIds,
      customerName: form.customerName.trim() || 'Walk-in customer',
      customerEmail: form.customerEmail.trim(),
      paymentMethod: form.paymentMethod,
    }, headers);
    setBusy(false);
    if (!payload.ok) {
      setMessage(payload.error || 'The sale could not be completed');
      loadMap(selectedShowtime);
      setSeatIds([]);
      return;
    }
    setSale(payload);
    setSeatIds([]);
    loadMap(selectedShowtime);
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }

  if (sale) {
    return <Receipt sale={sale} onNewSale={() => { setSale(null); setForm({ customerName: '', customerEmail: '', paymentMethod: 'cash' }); }} />;
  }

  if (!showtimes.length) {
    return (
      <EmptyState
        icon="ph-cash-register"
        title="Nothing on sale today"
        message="The box office sells seats for screenings happening in the next three days. Schedule a screening first."
      />
    );
  }

  const maxX = Math.max(1, ...seats.map((seat) => seat.x));

  return (
    <div className="space-y-4">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {message && <Notice tone="warning" onClose={() => setMessage('')}>{message}</Notice>}

      <Card title="Pick a screening" subtitle="Live seat inventory — a counter sale removes the seat from the website instantly" icon="ph-monitor-play" bodyClass="p-4">
        <div className="flex flex-wrap gap-2">
          {showtimes.map((show) => {
            const active = show.id === selectedShowtime;
            return (
              <button
                key={show.id}
                type="button"
                onClick={() => setSelectedShowtime(show.id)}
                className={cx(
                  'min-w-[132px] rounded-2xl border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-green-600 bg-green-50 dark:border-green-600 dark:bg-green-950/40'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                )}
              >
                <span className={cx('block text-xs font-black', active ? 'text-green-800 dark:text-green-300' : 'text-slate-800 dark:text-slate-100')}>
                  {clockLabel(show.startTime)} · {shortDate(show.showDate)}
                </span>
                <span className="block truncate text-[10px] font-bold text-slate-400">{show.movieTitle}</span>
                <span className="block text-[10px] font-bold text-slate-400">{show.screenName} · {show.seatsTotal - show.seatsSold} free</span>
              </button>
            );
          })}
        </div>
      </Card>

      {mapLoading ? (
        <div className="h-56 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      ) : map ? (
        <Card
          title="Select seats"
          subtitle={`${map.stats.available} available · ${map.stats.sold} sold · ${map.stats.held} on hold`}
          icon="ph-armchair"
        >
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            {map.rows.map((row) => (
              <div key={row.label} className="mb-1 flex items-center gap-2">
                <span className="w-4 shrink-0 text-center text-[10px] font-black text-slate-400">{row.label}</span>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${maxX}, minmax(0, 30px))` }}>
                  {row.seats.map((seat) => (
                    <div key={seat.id} style={{ gridColumn: `${seat.x} / span 1` }}>
                      <PosSeat seat={seat} selected={seatIds.includes(seat.id)} onToggle={toggleSeat} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* State key — the same swatches the counter sees in the grid */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
            {LEGEND.map((entry) => (
              <span key={entry.label} className="inline-flex items-center gap-1.5">
                <span className={cx('h-3.5 w-3.5 rounded border-2 border-slate-300 dark:border-slate-600', entry.swatch)} />
                {entry.label}
              </span>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Customer name" hint="Leave blank for a walk-in">
              <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className={inputCls} placeholder="Walk-in customer" />
            </Field>
            <Field label="Email (optional)" hint="Used to send the QR tickets">
              <input type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} className={inputCls} />
            </Field>
            <Field label="Payment taken">
              <div className="flex gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setForm({ ...form, paymentMethod: method.id })}
                    className={cx(
                      'flex-1 rounded-xl px-2 py-2.5 text-[11px] font-black transition-colors',
                      form.paymentMethod === method.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    )}
                  >
                    <i className={cx('ph', method.icon, 'mr-1')} />{method.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
            <div>
              <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                {selectedSeats.length ? selectedSeats.map((seat) => seat.label).join(', ') : 'No seats selected'}
              </p>
              <p className="text-[10px] font-bold text-slate-400">
                {showtime?.movieTitle} · {clockLabel(showtime?.startTime)}
              </p>
            </div>
            <p className="text-lg font-black tabular-nums text-slate-900 dark:text-white">{money(subtotal, currency)}</p>
            <Button icon={busy ? 'ph-circle-notch' : 'ph-cash-register'} onClick={sell} disabled={busy || !selectedSeats.length} className={busy ? '[&>i]:animate-spin' : ''}>
              {busy ? 'Processing…' : 'Complete sale'}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
