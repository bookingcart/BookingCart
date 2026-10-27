import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { checkoutGet, checkoutPost, money, formatDate, formatDateTime } from '../lib/ticketingClient.js';

function qrSrc(value, size = 190) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0f172a&format=svg&margin=4`;
}

const STATUS_COPY = {
  confirmed: { tone: 'emerald', icon: 'ph-check-circle', title: 'Payment confirmed — your tickets are ready' },
  pending_payment: { tone: 'amber', icon: 'ph-hourglass-medium', title: 'Waiting for payment to clear' },
  cancelled: { tone: 'rose', icon: 'ph-x-circle', title: 'This booking was cancelled' },
  refunded: { tone: 'rose', icon: 'ph-arrow-u-up-left', title: 'This booking was refunded' },
  partially_refunded: { tone: 'amber', icon: 'ph-arrow-u-up-left', title: 'Partially refunded booking' },
  expired: { tone: 'rose', icon: 'ph-clock-countdown', title: 'This booking expired before payment' },
};

const TONE = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
};

// Public confirmation + digital tickets. Verifies the Stripe session before
// showing anything, so a paid ticket is never issued for an unpaid booking.
export default function AttractionTicketsConfirmationPage() {
  const [params] = useSearchParams();
  const ref = params.get('ref') || '';
  const sessionId = params.get('session_id') || '';

  const [order, setOrder] = useState(null);
  const [attraction, setAttraction] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(Boolean(sessionId));
  const [pending, setPending] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!ref) { setLoading(false); return; }
    setLoading(true);
    const payload = await checkoutGet('order', { ref });
    if (payload.ok) {
      setOrder(payload.order);
      setAttraction(payload.attraction);
      setSettings(payload.settings);
      setError('');
    } else {
      setError(payload.error || 'We could not find this booking');
    }
    setLoading(false);
  }, [ref]);

  const confirmPayment = useCallback(async () => {
    if (!ref || !sessionId) return;
    setConfirming(true);
    const payload = await checkoutPost('confirm', { ref, sessionId });
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

  const status = order?.status || '';
  const copy = STATUS_COPY[status] || STATUS_COPY.pending_payment;
  const currency = order?.currency || 'USD';
  const tickets = order?.tickets || [];

  if (loading || confirming) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
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

  if (error && !order) {
    return <Empty icon="ph-warning-circle" title="Booking not found" message={error} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 print:bg-white">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .print-hide { display: none !important; }
          .print-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto px-4">
        <div className={`rounded-3xl border p-5 ${TONE[copy.tone]} print-hide`}>
          <div className="flex items-start gap-3">
            <i className={`ph ${copy.icon} text-3xl`} />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-black">{copy.title}</h1>
              <p className="mt-1 text-sm font-semibold">
                {order.bookingRef} · {order.attractionName} · {formatDate(order.visitDate)}
                {order.slotLabel ? ` · ${order.slotLabel}` : ''}
              </p>
              {status === 'pending_payment' && (
                <p className="mt-2 text-xs font-bold">
                  {pending
                    ? 'The payment provider has not confirmed the charge yet. This page updates automatically once it clears — refresh in a moment.'
                    : 'Your seats are held until the payment is confirmed. No ticket has been issued yet.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {status === 'pending_payment' && (
          <div className="mt-4 flex flex-wrap gap-2 print-hide">
            <button type="button" onClick={() => { setError(''); confirmPayment(); }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white dark:bg-slate-700">
              <i className="ph ph-arrows-clockwise" /> Check payment again
            </button>
            <Link to={`/attractions/tickets?ref=${encodeURIComponent(order.bookingRef)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-black text-white">
              <i className="ph ph-credit-card" /> Book again
            </Link>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            {tickets.length === 0 ? (
              <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center">
                <i className="ph ph-ticket text-4xl text-slate-300" />
                <p className="mt-2 font-black text-slate-900 dark:text-white">No tickets issued yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Digital tickets appear here as soon as the payment is confirmed.
                </p>
              </section>
            ) : tickets.map((ticket) => (
              <article key={ticket.id}
                className="print-card rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 dark:border-slate-700 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Digital ticket</p>
                    <p className="font-black text-slate-900 dark:text-white truncate">
                      {attraction?.name || order.attractionName}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {[attraction?.city, attraction?.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {ticket.status}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 p-5">
                  <div className="shrink-0 text-center">
                    <img src={qrSrc(ticket.qrToken)} alt={`QR code for ${ticket.ticketNo}`}
                      width={150} height={150} className="mx-auto rounded-xl border border-slate-200 bg-white p-1.5" />
                    <p className="mt-2 font-mono text-[11px] font-bold text-slate-500">{ticket.ticketNo}</p>
                  </div>
                  <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Item label="Ticket type" value={ticket.ticketTypeName} />
                    <Item label="Visitor" value={ticket.holderName || order.customerName} />
                    <Item label="Visit date" value={formatDate(ticket.visitDate)} />
                    <Item label="Entry time" value={ticket.slotLabel || 'Anytime'} />
                    <Item label="Admissions" value={`${ticket.admissionsRemaining} of ${ticket.admissionsTotal} remaining`} />
                    <Item label="Booking reference" value={ticket.bookingRef || order.bookingRef} mono />
                  </dl>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-[10px] leading-relaxed text-slate-500">
                  {settings?.terms
                    || 'Present this QR code at the entrance. Each admission is scanned once; group tickets are valid for the number of admissions shown on the ticket.'}
                </div>
              </article>
            ))}

            {tickets.length > 0 && (
              <div className="flex flex-wrap gap-2 print-hide">
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white dark:bg-slate-700">
                  <i className="ph ph-printer" /> Print / save as PDF
                </button>
                <Link to="/my-bookings"
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-black text-white">
                  <i className="ph ph-suitcase" /> My bookings
                </Link>
              </div>
            )}
          </div>

          <aside className="print-card rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 h-fit">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Booking summary</h2>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Reference" value={order.bookingRef} mono />
              <Row label="Visitor" value={order.customerName} />
              <Row label="Email" value={order.customerEmail} />
              <Row label="Tickets" value={String(order.quantity)} />
              <Row label="Visit" value={formatDate(order.visitDate)} />
              <Row label="Entry" value={order.slotLabel || 'Anytime'} />
              <Row label="Purchased" value={formatDateTime(order.createdAt)} />
            </div>
            <div className="mt-3 space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3 text-sm">
              <Row label="Subtotal" value={money(order.subtotal, currency)} />
              {order.discount > 0 && <Row label="Discount" value={`− ${money(order.discount, currency)}`} />}
              <Row label="Taxes" value={money(order.taxAmount, currency)} />
              <Row label="Service fee" value={money(order.serviceFee, currency)} />
              {order.refundAmount > 0 && <Row label="Refunded" value={money(order.refundAmount, currency)} />}
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-base font-black">
                <span>Total</span>
                <span>{money(order.total, currency)}</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Refunds and date changes follow the attraction's policy. Contact the attraction from your booking page.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`font-semibold text-slate-900 dark:text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span className={`font-bold text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function Empty({ icon, title, message }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-3xl">
        <i className={`ph ${icon}`} />
      </div>
      <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-slate-500 max-w-md">{message}</p>
      <Link to="/my-bookings" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white">
        <i className="ph ph-suitcase" /> Go to My Bookings
      </Link>
    </div>
  );
}
