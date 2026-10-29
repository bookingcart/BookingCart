import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { cinemaGet, cinemaPost, clockLabel, formatDate, formatDateTime, money } from '../lib/cinemaClient.js';

function qrSrc(value, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0f172a&format=svg&margin=4`;
}

const STATUS_COPY = {
  confirmed: { tone: 'emerald', icon: 'ph-check-circle', title: 'Your cinema tickets are confirmed' },
  pending_payment: { tone: 'amber', icon: 'ph-hourglass-medium', title: 'Seats reserved — finish at the box office' },
  cancelled: { tone: 'rose', icon: 'ph-x-circle', title: 'This booking was cancelled' },
  refunded: { tone: 'rose', icon: 'ph-arrow-u-up-left', title: 'This booking was refunded' },
  partially_refunded: { tone: 'amber', icon: 'ph-arrow-u-up-left', title: 'Partially refunded booking' },
  expired: { tone: 'rose', icon: 'ph-clock-countdown', title: 'This reservation expired' },
};

const TONE = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
};

function Empty({ icon, title, message }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400 dark:bg-slate-800">
        <i className={`ph ${icon}`} />
      </div>
      <h1 className="text-xl font-black text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{message}</p>
      <Link
        to="/attractions/cinemas"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
      >
        <i className="ph ph-film-strip" /> Browse cinemas
      </Link>
    </div>
  );
}

function SeatTicket({ ticket, order, cinema }) {
  const currency = ticket.currency || order.currency;
  return (
    <article className="print-card overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col sm:flex-row">
        {/* Stub */}
        <div className="relative flex-1 border-b border-dashed border-slate-200 p-5 dark:border-slate-700 sm:border-b-0 sm:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">Admit one{ticket.admissionsTotal > 1 ? ` · ${ticket.admissionsTotal} people` : ''}</p>
              <h3 className="mt-1 truncate text-lg font-black leading-tight text-slate-900 dark:text-white">{ticket.movieTitle || order.movieTitle}</h3>
              <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {cinema?.name || order.attractionName} · {ticket.screenName || order.screenName}
              </p>
            </div>
            <div className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-center dark:bg-white">
              <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Seat</p>
              <p className="text-lg font-black leading-tight tabular-nums text-white dark:text-slate-900">{ticket.seatLabel || '—'}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Date</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{formatDate(ticket.showDate || order.showDate)}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Time</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{order.slotLabel || clockLabel(order.slotLabel)}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Category</dt>
              <dd className="font-bold capitalize text-slate-700 dark:text-slate-200">{ticket.seatCategory || 'standard'}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Price</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{money(ticket.unitPrice, currency)}</dd>
            </div>
          </dl>

          <p className="mt-4 truncate font-mono text-[10px] font-bold tracking-wide text-slate-400">{ticket.ticketNo}</p>
        </div>

        {/* QR */}
        <div className="flex w-full shrink-0 flex-col items-center justify-center gap-2 bg-slate-50 p-5 dark:bg-slate-950/40 sm:w-[190px]">
          {ticket.qrToken ? (
            <img
              src={qrSrc(ticket.qrToken)}
              alt={`QR code for seat ${ticket.seatLabel}`}
              width="150"
              height="150"
              className="h-[150px] w-[150px] rounded-lg bg-white p-1"
            />
          ) : (
            <div className="flex h-[150px] w-[150px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs font-bold text-slate-400">
              QR issued on payment
            </div>
          )}
          <p className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {ticket.status === 'used' ? 'Already scanned' : 'Scan at the door'}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function CinemaConfirmationPage() {
  const [params] = useSearchParams();
  const ref = params.get('ref') || '';
  const sessionId = params.get('session_id') || '';
  const { user, getToken } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(Boolean(sessionId));
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!ref) { setLoading(false); return; }
    setLoading(true);
    const payload = await cinemaGet('order', { ref });
    if (payload.ok) {
      setData(payload);
      setError('');
    } else {
      setError(payload.error || 'We could not find this booking');
    }
    setLoading(false);
  }, [ref]);

  const confirmPayment = useCallback(async () => {
    if (!ref || !sessionId) return;
    setConfirming(true);
    const payload = await cinemaPost('confirm', { ref, sessionId });
    setConfirming(false);
    if (!payload.ok) {
      if (payload.pending) { setPending(true); setError(payload.error || ''); return; }
      setError(payload.error || 'We could not verify this payment');
      return;
    }
    setPending(false);
    await loadOrder();
  }, [ref, sessionId, loadOrder]);

  useEffect(() => {
    if (sessionId) confirmPayment();
    else loadOrder();
  }, [sessionId, confirmPayment, loadOrder]);

  const cancelBooking = async () => {
    if (!window.confirm('Cancel this booking and release the seats?')) return;
    setCancelling(true);
    const payload = await cinemaPost('cancel', { ref, reason: 'Cancelled by customer' }, { Authorization: `Bearer ${getToken()}` });
    setCancelling(false);
    if (!payload.ok) { setError(payload.error || 'Could not cancel this booking'); return; }
    await loadOrder();
  };

  if (loading || confirming) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="text-sm font-bold text-slate-500">
          {confirming ? 'Verifying your payment…' : 'Loading your tickets…'}
        </p>
      </div>
    );
  }

  if (!ref) {
    return (
      <Empty
        icon="ph-ticket"
        title="No booking reference"
        message="Open the confirmation link from your email, or find the booking in My Bookings."
      />
    );
  }

  if (!data?.order) {
    return <Empty icon="ph-warning-circle" title="Booking not found" message="We could not find that reference. Check the link in your email or search My Bookings." />;
  }

  const { order, cinema } = data;
  const status = order.status || '';
  const copy = STATUS_COPY[status] || STATUS_COPY.pending_payment;
  const tickets = order.tickets || [];
  const paid = status === 'confirmed' && order.paymentStatus === 'paid';
  const canCancel = paid && user?.email && String(user.email).toLowerCase() === String(order.customerEmail || '').toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50 py-8 dark:bg-slate-950 print:bg-white">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .print-hide { display: none !important; }
          .print-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-4">
        <div className={`print-hide rounded-3xl border p-5 ${TONE[copy.tone]}`}>
          <div className="flex items-start gap-3">
            <i className={`ph ${copy.icon} text-3xl`} />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-black sm:text-xl">{copy.title}</h1>
              <p className="mt-1 text-sm font-semibold">
                {order.bookingRef} · {order.movieTitle} · {formatDate(order.showDate)}{order.slotLabel ? ` at ${order.slotLabel}` : ''}
              </p>
              {status === 'pending_payment' && order.expiresAt && (
                <p className="mt-1 text-xs font-bold">
                  Seats held until {formatDateTime(order.expiresAt)}. Pay at the box office before then.
                </p>
              )}
              {pending && <p className="mt-1 text-xs font-bold">The payment is still processing — refresh in a moment.</p>}
              {error && status !== 'pending_payment' && <p className="mt-1 text-xs font-bold">{error}</p>}
            </div>
          </div>
        </div>

        {/* Booking summary */}
        <div className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">{cinema?.name || order.attractionName}</h2>
              <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {[cinema?.address, cinema?.city].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total</p>
              <p className="text-lg font-black tabular-nums text-slate-900 dark:text-white">{money(order.total, order.currency)}</p>
              <p className="text-[10px] font-bold capitalize text-slate-400">
                {order.paymentMethod === 'venue' ? 'Pay at box office' : `${order.paymentStatus} · ${order.paymentMethod}`}
              </p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-[11px] dark:border-slate-800 sm:grid-cols-4">
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Screen</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{order.screenName || '—'}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Seats</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{order.seatLabels.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Admissions</dt>
              <dd className="font-bold text-slate-700 dark:text-slate-200">{order.admissionsTotal}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wider text-slate-400">Booking</dt>
              <dd className="font-mono font-bold text-slate-700 dark:text-slate-200">{order.bookingRef}</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <p className="flex justify-between"><span>Seats</span><span className="tabular-nums">{money(order.subtotal, order.currency)}</span></p>
            {order.serviceFee > 0 && <p className="flex justify-between"><span>Booking fee</span><span className="tabular-nums">{money(order.serviceFee, order.currency)}</span></p>}
            {order.taxAmount > 0 && <p className="flex justify-between"><span>Tax</span><span className="tabular-nums">{money(order.taxAmount, order.currency)}</span></p>}
            <p className="flex justify-between text-sm font-black text-slate-900 dark:text-white"><span>{paid ? 'Total paid' : 'Total due'}</span><span className="tabular-nums">{money(order.total, order.currency)}</span></p>
          </div>
        </div>

        {/* Tickets */}
        {tickets.length > 0 ? (
          <div className="mt-4 space-y-3">
            <h2 className="flex items-center gap-2 px-1 text-sm font-black text-slate-900 dark:text-white print-hide">
              <i className="ph ph-qr-code text-emerald-600" />
              {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'} · one QR per seat
            </h2>
            {tickets.map((ticket) => (
              <SeatTicket key={ticket.id} ticket={ticket} order={order} cinema={cinema} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <i className="ph ph-ticket text-3xl text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">Tickets are issued once the payment clears</p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Your seats are reserved. This page will show the QR tickets the moment payment is confirmed.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="print-hide mt-6 flex flex-wrap gap-2">
          {tickets.length > 0 && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              <i className="ph ph-printer" /> Print / save PDF
            </button>
          )}
          <Link
            to={`/attractions/cinemas/${order.attractionId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300"
          >
            <i className="ph ph-film-strip" /> More screenings
          </Link>
          <Link
            to="/my-bookings"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300"
          >
            <i className="ph ph-suitcase" /> My bookings
          </Link>
          {canCancel && (
            <button
              type="button"
              onClick={cancelBooking}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <i className="ph ph-x-circle" /> {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          )}
        </div>

        <p className="print-hide mt-4 px-1 text-[11px] font-medium text-slate-400">
          Keep this page — each QR code is unique to one seat and stops working once scanned.
        </p>
      </div>
    </div>
  );
}
