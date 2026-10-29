import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { clockLabel, money, shortDate, transportGet, typeMeta } from '../lib/transportClient.js';

/**
 * "My Transport Bookings" — a booking reference is all a guest needs, so the
 * lookup works signed out. Signed-in travellers also get every trip booked with
 * their email address.
 */
export default function TransportBookingsPage() {
  const navigate = useNavigate();
  const { user, authHeaders } = useAuth();
  const headers = useMemo(() => authHeaders(), [authHeaders]);
  const [ref, setRef] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (!user?.email) { setMyOrders([]); return; }
    let cancelled = false;
    setListLoading(true);
    transportGet('my-bookings', { limit: 20 }, headers).then((result) => {
      if (cancelled) return;
      setListLoading(false);
      if (result.ok) setMyOrders(result.orders || []);
    });
    return () => { cancelled = true; };
  }, [user?.email, headers]);

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

        {user?.email && (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Your trips</h2>
              {listLoading && <span className="text-[11px] font-bold text-slate-400">Loading…</span>}
            </div>
            {!listLoading && myOrders.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs font-semibold text-slate-400 dark:border-slate-700">
                No trips booked with {user.email} yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                {myOrders.map((entry) => {
                  const entryMeta = typeMeta(entry.transportType);
                  return (
                    <li key={entry.bookingRef} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <i className={`ph ${entryMeta.icon} text-sm`} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900 dark:text-white">{entry.routeName}</p>
                          <p className="text-[11px] text-slate-400">
                            {shortDate(entry.travelDate)} · {clockLabel(entry.departTime)} · {entry.passengerCount} pax
                            {entry.seatLabels?.length ? ` · ${entry.seatLabels.join(', ')}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                          entry.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            : entry.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}>
                          {entry.status === 'cancelled' ? 'Cancelled' : entry.paymentStatus === 'paid' ? 'Paid' : 'Pay pending'}
                        </span>
                        <button
                          type="button"
                          onClick={() => navigate(`/transport/confirmation?ref=${encodeURIComponent(entry.bookingRef)}`)}
                          className="rounded-lg px-2 py-1 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Tickets
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRef(entry.bookingRef); setOrder(entry); setError(''); }}
                          className="rounded-lg px-2 py-1 text-[11px] font-black text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Details
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
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
