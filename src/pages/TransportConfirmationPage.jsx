import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  clockLabel,
  money,
  qrSrc,
  shortDate,
  transportGet,
  transportPost,
  typeMeta,
} from '../lib/transportClient.js';

function TicketCard({ ticket, order }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900/60">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <i className="ph ph-ticket text-sm" aria-hidden="true" />
          {order.transportLabel} ticket
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          ticket.status === 'valid'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : ticket.status === 'used'
              ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
        }`}>
          {ticket.status}
        </span>
      </div>

      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-900 dark:text-white">{ticket.passengerName || order.customerName}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{order.operatorName} · {order.fareClassName || ticket.fareClass}</p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Seat</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{ticket.seatLabel || 'General admission'}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Boarding</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{clockLabel(order.departTime)}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Date</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{shortDate(order.travelDate)}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Ticket</dt>
              <dd className="font-mono text-[11px] font-bold text-slate-900 dark:text-white">{ticket.ticketNo}</dd>
            </div>
          </dl>
        </div>

        <div className="shrink-0 text-center">
          <img
            src={qrSrc(ticket.qrToken)}
            alt={`QR code for ticket ${ticket.ticketNo}`}
            width="96"
            height="96"
            loading="lazy"
            className="h-24 w-24 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700"
          />
          <p className="mt-1 text-[10px] font-semibold text-slate-400">Scan at boarding</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-700">
        <span>{order.boardingPoint}</span>
        <i className="ph ph-arrow-right" aria-hidden="true" />
        <span>{order.dropoffPoint}</span>
      </div>
    </article>
  );
}

export default function TransportConfirmationPage() {
  const [params] = useSearchParams();
  const ref = params.get('ref') || '';
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!ref) { setError('No booking reference supplied'); setLoading(false); return; }
    setLoading(true);
    const result = await transportGet('order', { ref });
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Booking not found'); return; }
    setOrder(result.order);
  }, [ref]);

  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!window.confirm('Cancel this booking? The seats will be released immediately.')) return;
    setCancelling(true);
    const result = await transportPost('cancel', { ref, email: order?.customerEmail || '' });
    setCancelling(false);
    if (!result.ok) { setNotice(result.error || 'Could not cancel this booking'); return; }
    setOrder(result.order);
    setNotice('Your booking is cancelled and the seats are back on sale.');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl animate-pulse space-y-3">
          <div className="h-28 rounded-2xl bg-white dark:bg-slate-800" />
          <div className="h-44 rounded-2xl bg-white dark:bg-slate-800" />
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16 dark:bg-slate-950">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <i className="ph ph-ticket mx-auto mb-3 block text-4xl text-slate-300" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">We could not find that booking</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <Link to="/transport" className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">Search transport</Link>
        </div>
      </main>
    );
  }

  const meta = typeMeta(order.transportType);
  const cancelled = order.status === 'cancelled';

  return (
    <main className="min-h-screen bg-slate-50 pb-16 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <section className={`rounded-2xl border p-5 text-center ${
          cancelled
            ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20'
            : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
        }`}>
          <span className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
            cancelled ? 'bg-rose-600' : 'bg-emerald-600'
          } text-white`}>
            <i className={`ph ${cancelled ? 'ph-x' : 'ph-check'} text-2xl`} aria-hidden="true" />
          </span>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">
            {cancelled ? 'Booking cancelled' : 'You are booked'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {cancelled
              ? 'The seats have been released. Any refund is handled by the operator.'
              : `Tickets for ${order.passengerCount} ${order.passengerCount === 1 ? 'passenger' : 'passengers'} are ready — a copy went to ${order.customerEmail}.`}
          </p>
          <p className="mt-3 inline-block rounded-xl bg-white px-3 py-1.5 font-mono text-sm font-bold text-slate-900 dark:bg-slate-900 dark:text-white">
            {order.bookingRef}
          </p>
        </section>

        {notice && (
          <p role="status" className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {notice}
          </p>
        )}

        {/* ── Journey ── */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-slate-700 dark:text-emerald-400">
              <i className={`ph ${meta.icon} text-sm`} aria-hidden="true" /> {order.transportLabel}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{order.operatorName}</span>
          </div>
          <h2 className="mt-1.5 text-base font-black text-slate-900 dark:text-white">{order.routeName}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {shortDate(order.travelDate)} · depart {clockLabel(order.departTime)} · {order.vehicleName}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Boarding at</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{order.boardingPoint || '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Alight at</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{order.dropoffPoint || '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Seats</dt>
              <dd className="font-bold text-slate-900 dark:text-white">{order.seatLabels.join(', ') || 'General admission'}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Total</dt>
              <dd className="font-bold text-slate-900 dark:text-white">
                {money(order.total, order.currency)} · {order.paymentMethod === 'card' ? 'paid by card' : 'pay at the counter'}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Tickets ── */}
        <h2 className="mt-6 mb-2 text-sm font-bold text-slate-900 dark:text-white">
          {order.tickets.length === 1 ? 'Your ticket' : 'Your tickets'}
        </h2>
        <div className="space-y-3">
          {order.tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} order={order} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <i className="ph ph-printer text-base" aria-hidden="true" /> Print tickets
          </button>
          <Link
            to="/transport"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <i className="ph ph-magnifying-glass text-base" aria-hidden="true" /> Book another trip
          </Link>
          {!cancelled && (
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:hover:bg-rose-900/20"
            >
              <i className="ph ph-x-circle text-base" aria-hidden="true" /> {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Keep this page or the email — the QR code is scanned once at boarding.
        </p>
      </div>
    </main>
  );
}
