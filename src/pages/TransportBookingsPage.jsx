import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clockLabel, money, shortDate, transportGet, typeMeta } from '../lib/transportClient.js';

/**
 * "My Transport Bookings" — a booking reference is all a guest needs, so this
 * stays a lookup rather than requiring an account.
 */
export default function TransportBookingsPage() {
  const navigate = useNavigate();
  const [ref, setRef] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (event) => {
    event.preventDefault();
    const code = ref.trim().toUpperCase();
    if (!code) { setError('Enter the booking reference from your email.'); return; }
    setError('');
    setLoading(true);
    const result = await transportGet('order', { ref: code });
    setLoading(false);
    if (!result.ok) { setOrder(null); setError(result.error || 'No booking matches that reference.'); return; }
    setOrder(result.order);
  };

  const meta = order ? typeMeta(order.transportType) : null;

  return (
    <main className="min-h-screen bg-slate-50 pb-16 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">My transport bookings</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Enter the reference from your ticket email — it starts with <span className="font-mono font-bold">TR-</span>.
        </p>

        <form onSubmit={lookup} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="booking-ref" className="sr-only">Booking reference</label>
          <input
            id="booking-ref"
            value={ref}
            onChange={(event) => setRef(event.target.value)}
            placeholder="TR-XXXXXXXXXX"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold uppercase tracking-wide text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Looking…' : 'Find booking'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </p>
        )}

        {order && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-slate-700 dark:text-emerald-400">
                <i className={`ph ${meta.icon} text-sm`} aria-hidden="true" /> {order.transportLabel}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                order.status === 'cancelled'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}>
                {order.status}
              </span>
            </div>

            <h2 className="mt-2 text-base font-black text-slate-900 dark:text-white">{order.routeName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {shortDate(order.travelDate)} · {clockLabel(order.departTime)} · {order.operatorName}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-slate-400">Passengers</dt>
                <dd className="font-bold text-slate-900 dark:text-white">{order.passengerCount}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-slate-400">Seats</dt>
                <dd className="font-bold text-slate-900 dark:text-white">{order.seatLabels.join(', ') || 'General admission'}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-slate-400">Total</dt>
                <dd className="font-bold text-slate-900 dark:text-white">{money(order.total, order.currency)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-slate-400">Tickets</dt>
                <dd className="font-bold text-slate-900 dark:text-white">{order.tickets.length}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => navigate(`/transport/confirmation?ref=${encodeURIComponent(order.bookingRef)}`)}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              View tickets
            </button>
          </section>
        )}

        <Link to="/transport" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700">
          <i className="ph ph-arrow-left text-base" aria-hidden="true" /> Book a new trip
        </Link>
      </div>
    </main>
  );
}
