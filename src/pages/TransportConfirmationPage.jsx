import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TRANSPORT_PHOTOS,
  clockLabel,
  money,
  qrSrc,
  shortDate,
  transportGet,
  transportPost,
  typeMeta,
} from '../lib/transportClient.js';
import { FlightFooter } from '../components/FlightFooter.jsx';

// "Bus no / Boat no / Train no" — the vehicle registration on the boarding pass.
const TYPE_NOUN = { bus: 'Bus', boat: 'Boat', train: 'Train' };

/** Compact weekday date for the ticket face — "Thu, 29 Oct 2026". */
function longDate(value) {
  if (!value) return '—';
  const text = String(value);
  const parsed = new Date(text.length <= 10 ? `${text.slice(0, 10)}T00:00:00` : text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "Port Bell Pier · Kampala" reads better as just "Port Bell Pier" under the
 * city line, so drop a trailing duplicate of the city name.
 */
function stopDetail(point, city) {
  const parts = String(point || '').split('·').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && city && parts[parts.length - 1].toLowerCase() === String(city).toLowerCase()) parts.pop();
  return parts.join(' · ');
}

/**
 * One boarding pass. The layout is the printed artwork: brand band, vehicle
 * photo carrying the journey facts, white ticket face with the QR, then the
 * perforated operator stub.
 */
function TicketCard({ ticket, order }) {
  const meta = typeMeta(order.transportType);
  const noun = TYPE_NOUN[order.transportType] || 'Bus';
  const fromCity = order.boardingCity || order.boardingPoint || '—';
  const toCity = order.dropoffCity || order.dropoffPoint || '—';
  const arrival = order.arrivalTime ? clockLabel(order.arrivalTime) : '—';
  const arrivalDay = order.arrivalDayOffset > 0 ? ` +${order.arrivalDayOffset}d` : '';
  const valid = ticket.status === 'valid';

  return (
    <article className="ticket-print relative mx-auto w-full max-w-[404px] overflow-hidden rounded-[28px] bg-[#1e2226] text-white shadow-2xl">
      {/* Brand band */}
      <header className="px-6 pb-3.5 pt-5 text-center">
        <img
          src="/images/logo%20.png"
          alt="BookingCart"
          className="mx-auto h-14 w-auto brightness-0 invert"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Compare · Book · Instant</p>
      </header>

      {/* Vehicle photo, with the journey facts laid over it */}
      <section className="relative mx-3.5 overflow-hidden rounded-[22px] bg-slate-900">
        <img
          src={TRANSPORT_PHOTOS[order.transportType] || TRANSPORT_PHOTOS.bus}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/30 to-slate-950/90" />

        <div className="relative flex min-h-[300px] flex-col justify-between gap-6 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <i className={`ph ${meta.icon} mt-0.5 text-2xl leading-none`} aria-hidden="true" />
              <p className="text-[15px] font-extrabold leading-tight text-white">
                {noun} Boarding<br /><span className="text-green-400">Pass</span>
              </p>
            </div>
            <p className="max-w-[48%] text-right text-[13px] font-extrabold uppercase leading-tight">
              {order.operatorName}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <div className="min-w-0">
                <p className="truncate text-xl font-black uppercase leading-tight tracking-tight">{fromCity}</p>
                <p className="mt-0.5 truncate text-[9px] font-semibold text-white/60">{stopDetail(order.boardingPoint, fromCity)}</p>
              </div>
              <span className="mt-2 h-0 flex-1 border-t-2 border-dashed border-white/40" aria-hidden="true" />
              <div className="min-w-0 text-right">
                <p className="truncate text-xl font-black uppercase leading-tight tracking-tight">{toCity}</p>
                <p className="mt-0.5 truncate text-[9px] font-semibold text-white/60">{stopDetail(order.dropoffPoint, toCity)}</p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-[1.4fr_.8fr_1.1fr] gap-2">
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wider text-green-400">{noun} no</dt>
                <dd className="truncate text-[13px] font-bold leading-tight">
                  {order.vehicleRegistration || order.vehicleName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wider text-green-400">Seat</dt>
                <dd className="truncate text-[13px] font-bold leading-tight">{ticket.seatLabel || 'GA'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-black uppercase tracking-wider text-green-400">Boarding time</dt>
                <dd className="text-[13px] font-bold leading-tight">{clockLabel(order.departTime)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* White face: the passenger's copy */}
      <div className="bg-white px-4 py-4 text-slate-900">
        <div className="flex items-start gap-3">
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
            <div className="col-span-2">
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Passenger</dt>
              <dd className="truncate text-sm font-bold">{ticket.passengerName || order.customerName}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Travel date</dt>
              <dd className="text-[10px] font-bold leading-snug">{longDate(order.travelDate)}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Est. arrival</dt>
              <dd className="text-[11px] font-bold leading-snug">{arrival}{arrivalDay}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Ticket no</dt>
              <dd className="truncate font-mono text-[11px] font-bold">{ticket.ticketNo}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Issue date</dt>
              <dd className="text-[10px] font-bold leading-snug">{longDate(order.createdAt)}</dd>
            </div>
          </dl>

          <div className="shrink-0 rounded-2xl bg-slate-950 p-2">
            <img
              src={qrSrc(ticket.qrToken)}
              alt={`QR code for ticket ${ticket.ticketNo}`}
              width="96"
              height="96"
              loading="lazy"
              className="h-24 w-24 rounded-lg bg-white"
            />
          </div>
        </div>
        <p className="mt-2 text-[9px] font-semibold text-slate-400">Scan at boarding — the code is valid for one trip only.</p>
      </div>

      {/* Perforated operator stub */}
      <div className="relative border-t-2 border-dashed border-slate-300 bg-[#1e2226] px-6 pb-5 pt-4 text-center">
        <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-950 print:bg-white" />
        <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-950 print:bg-white" />
        {order.operatorLogo ? (
          <img src={order.operatorLogo} alt={order.operatorName} className="mx-auto h-8 w-auto max-w-[160px] object-contain" />
        ) : (
          <p className="text-base font-black tracking-tight text-white">{order.operatorName}</p>
        )}
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-500">
          Travel with {order.operatorName}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[9px] font-bold uppercase tracking-wider">
          <span className="font-mono text-slate-400">{order.bookingRef}</span>
          <span className={valid ? 'text-green-400' : 'text-rose-400'}>{ticket.status}</span>
        </div>
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
          <Link to="/transport" className="mt-4 inline-block rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white">Search transport</Link>
        </div>
      </main>
    );
  }

  const meta = typeMeta(order.transportType);
  const cancelled = order.status === 'cancelled';

  return (
    <>
    <main className="min-h-screen bg-slate-50 pb-16 dark:bg-slate-950 print:bg-white print:pb-0">
      {/* Printing keeps only the boarding passes: the site chrome, the summary
          and the buttons are all dropped so the page never breaks mid-ticket. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { background: #fff !important; }
          .bookingcart-navbar,
          footer[aria-label="Site Footer"],
          [aria-modal="true"] { display: none !important; }
          .ticket-print {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ticket-print * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ticket-print + .ticket-print {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <section className={`print:hidden rounded-2xl border p-5 text-center ${
          cancelled
            ? 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20'
            : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
        }`}>
          <span className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
            cancelled ? 'bg-rose-600' : 'bg-green-600'
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
          <p role="status" className="print:hidden mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {notice}
          </p>
        )}

        {/* ── Journey ── */}
        <section className="print:hidden mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-green-600 dark:bg-slate-700 dark:text-green-400">
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
        <h2 className="print:hidden mt-6 mb-2 text-sm font-bold text-slate-900 dark:text-white">
          {order.tickets.length === 1 ? 'Your ticket' : 'Your tickets'}
        </h2>
        <div className="space-y-4">
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

        <p className="print:hidden mt-6 text-center text-xs text-slate-400">
          Keep this page or the email — the QR code is scanned once at boarding.
        </p>
      </div>
    </main>
      <FlightFooter />
    </>
  );
}
