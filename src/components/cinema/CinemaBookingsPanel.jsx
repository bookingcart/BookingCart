import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, cinemaGet, cinemaPost, formatDate, money, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Notice, Pill, cx, inputCls } from './ui.jsx';

const STATUS_TONE = {
  confirmed: 'green',
  pending_payment: 'amber',
  cancelled: 'rose',
  refunded: 'rose',
  partially_refunded: 'amber',
  expired: 'slate',
};

function ConfirmPageLink({ bookingRef }) {
  const url = `/attractions/cinemas/confirmation?ref=${encodeURIComponent(bookingRef)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <i className="ph ph-printer" /> Tickets
    </a>
  );
}

function BookingDetail({ bookingRef, attractionId, headers, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('booking', { attractionId, ref: bookingRef }, headers);
    if (payload.ok) { setData(payload); setError(''); }
    else setError(payload.error || 'Could not load this booking');
    setLoading(false);
  }, [attractionId, bookingRef, headers]);

  useEffect(() => { load(); }, [load]);

  const act = async (action, payload = {}) => {
    setBusy(action);
    const response = await cinemaPost(action, { attractionId, ref: bookingRef, ...payload }, headers);
    setBusy('');
    if (!response.ok) { setError(response.error || 'That action failed'); return; }
    setError('');
    await load();
    onChanged?.();
  };

  if (loading) return <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />;
  if (!data?.order) return <Notice tone="error">{error || 'Booking not found'}</Notice>;

  const { order } = data;
  const paid = order.paymentStatus === 'paid';
  const canCancel = ['confirmed', 'pending_payment'].includes(order.status);

  return (
    <div className="space-y-3">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <dl className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-[11px] dark:bg-slate-800/60">
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Customer</dt><dd className="truncate font-bold text-slate-700 dark:text-slate-200">{order.customerName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Email</dt><dd className="truncate font-bold text-slate-700 dark:text-slate-200">{order.customerEmail}</dd></div>
          {order.customerPhone && <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Phone</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{order.customerPhone}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Channel</dt><dd className="font-bold capitalize text-slate-700 dark:text-slate-200">{order.channel}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Created</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{formatDate(order.createdAt)}</dd></div>
        </dl>

        <dl className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-[11px] dark:bg-slate-800/60">
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Seats</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{order.seatLabels.join(', ')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Screen</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{order.screenName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Admissions</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{order.admissionsTotal}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-black uppercase tracking-wider text-slate-400">Payment</dt><dd className="font-bold capitalize text-slate-700 dark:text-slate-200">{order.paymentStatus} · {order.paymentMethod}</dd></div>
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 dark:border-slate-700"><dt className="font-black uppercase tracking-wider text-slate-400">Total</dt><dd className="font-black tabular-nums text-slate-900 dark:text-white">{money(order.total, order.currency)}</dd></div>
        </dl>
      </div>

      <div className="space-y-1.5">
        {order.tickets.map((ticket) => (
          <div key={ticket.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black tabular-nums text-white dark:bg-white dark:text-slate-900">
              {ticket.seatLabel || '—'}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold text-slate-400">{ticket.ticketNo}</span>
            <span className="text-[10px] font-bold capitalize text-slate-500 dark:text-slate-400">{ticket.seatCategory}</span>
            <Pill tone={ticket.status === 'used' ? 'slate' : ticket.status === 'cancelled' ? 'rose' : 'green'}>
              {ticket.status === 'used' ? `admitted ${ticket.admissionsUsed}/${ticket.admissionsTotal}` : ticket.status}
            </Pill>
            <span className="text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">{money(ticket.unitPrice, ticket.currency)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ConfirmPageLink bookingRef={order.bookingRef} />
        <Button size="sm" variant="ghost" icon={busy === 'booking-resend' ? 'ph-circle-notch' : 'ph-envelope-simple'}
          className={busy === 'booking-resend' ? '[&>i]:animate-spin' : ''}
          disabled={Boolean(busy)} onClick={() => act('booking-resend')}>
          Resend email
        </Button>
        {!paid && canCancel && (
          <Button size="sm" icon={busy === 'booking-settle' ? 'ph-circle-notch' : 'ph-cash-register'}
            className={busy === 'booking-settle' ? '[&>i]:animate-spin' : ''}
            disabled={Boolean(busy)} onClick={() => act('booking-settle', { paymentMethod: 'cash' })}>
            Take cash payment
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="danger" icon="ph-x-circle" disabled={Boolean(busy)} onClick={() => {
            const reason = window.prompt('Cancel this booking and release the seats?\n\nReason:', 'Cancelled by staff');
            if (reason === null) return;
            act('booking-cancel', { reason });
          }}>
            Cancel booking
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CinemaBookingsPanel({ attractionId, headers }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openRef, setOpenRef] = useState('');
  const [filters, setFilters] = useState({
    from: todayISO(),
    to: addDays(todayISO(), 7),
    status: '',
    channel: '',
    search: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('bookings', { attractionId, ...filters }, headers);
    if (payload.ok) { setBookings(payload.bookings || []); setError(''); }
    else setError(payload.error || 'Could not load bookings');
    setLoading(false);
  }, [attractionId, headers, filters]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const paid = bookings.filter((booking) => booking.paymentStatus === 'paid');
    return {
      count: bookings.length,
      paid: paid.length,
      revenue: paid.reduce((sum, booking) => sum + Number(booking.total || 0), 0),
      seats: paid.reduce((sum, booking) => sum + Number(booking.quantity || 0), 0),
      scanned: bookings.reduce((sum, booking) => sum + Number(booking.ticketsScanned || 0), 0),
      currency: bookings[0]?.currency || 'USD',
    };
  }, [bookings]);

  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <Card bodyClass="p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">From</span>
            <input type="date" value={filters.from} onChange={(event) => set('from', event.target.value)} className={cx(inputCls, 'py-2')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">To</span>
            <input type="date" value={filters.to} onChange={(event) => set('to', event.target.value)} className={cx(inputCls, 'py-2')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Status</span>
            <select value={filters.status} onChange={(event) => set('status', event.target.value)} className={cx(inputCls, 'py-2')}>
              <option value="">Any status</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending_payment">Pending payment</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Channel</span>
            <select value={filters.channel} onChange={(event) => set('channel', event.target.value)} className={cx(inputCls, 'py-2')}>
              <option value="">All channels</option>
              <option value="online">Online</option>
              <option value="pos">Box office</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Search</span>
            <input value={filters.search} onChange={(event) => set('search', event.target.value)} placeholder="Ref, name, seat…" className={cx(inputCls, 'py-2')} />
          </label>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span>{totals.count} bookings</span>
        <span className="text-slate-300">|</span>
        <span>{totals.paid} paid</span>
        <span className="text-slate-300">|</span>
        <span>{totals.seats} seats sold</span>
        <span className="text-slate-300">|</span>
        <span>{totals.scanned} tickets scanned</span>
        <span className="text-slate-300">|</span>
        <span className="font-black text-green-700 dark:text-green-400">{money(totals.revenue, totals.currency)} collected</span>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="ph-receipt"
          title="No bookings in this range"
          message="Widen the dates, clear the filters, or take a booking at the box office."
        />
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => {
            const open = openRef === booking.bookingRef;
            return (
              <article key={booking.bookingRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setOpenRef(open ? '' : booking.bookingRef)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  aria-expanded={open}
                >
                  <span className="w-[104px] shrink-0">
                    <span className="block font-mono text-[11px] font-black text-slate-900 dark:text-white">{booking.bookingRef}</span>
                    <span className="block text-[10px] font-bold text-slate-400">{formatDate(booking.showDate)} · {booking.slotLabel}</span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-100">{booking.movieTitle}</span>
                    <span className="block truncate text-[10px] font-bold text-slate-400">
                      {booking.customerName} · seats {booking.seatLabels.join(', ') || '—'} · {booking.screenName}
                    </span>
                  </span>

                  <Pill tone={STATUS_TONE[booking.status] || 'slate'}>{booking.status.replace('_', ' ')}</Pill>
                  <span className="w-16 shrink-0 text-right text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {money(booking.total, booking.currency)}
                  </span>
                  <i className={cx('ph ph-caret-down text-slate-400 transition-transform', open && 'rotate-180')} />
                </button>

                {open && (
                  <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                    <BookingDetail
                      bookingRef={booking.bookingRef}
                      attractionId={attractionId}
                      headers={headers}
                      onChanged={() => { setNotice(`${booking.bookingRef} updated.`); load(); }}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
