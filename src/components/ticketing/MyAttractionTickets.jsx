import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { checkoutGet, checkoutPost, money, formatDate } from '../../lib/ticketingClient.js';
import { StatusBadge } from './TicketingShared.jsx';

function qrSrc(value, size = 96) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0f172a&format=svg&margin=3`;
}

const STATUS_LABEL = {
  confirmed: 'Confirmed',
  pending_payment: 'Awaiting payment',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

// Attraction passes inside My Bookings. Everything is read from the real
// booking records so a ticket only shows once payment has been verified.
export default function MyAttractionTickets() {
  const { user, authHeaders } = useAuth();
  const headers = useMemo(() => authHeaders(), [authHeaders]);
  const [passes, setPasses] = useState([]);
  const [view, setView] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    if (!user?.email) { setLoading(false); return; }
    setLoading(true);
    const payload = await checkoutGet('mine', {}, headers);
    if (payload.ok) { setPasses(payload.passes || []); setError(''); }
    else setError(payload.error || 'Could not load your attraction tickets');
    setLoading(false);
  }, [user, headers]);

  useEffect(() => { load(); }, [load]);

  const upcoming = passes.filter((entry) => entry.upcoming);
  const past = passes.filter((entry) => !entry.upcoming);
  const list = view === 'upcoming' ? upcoming : past;

  const resend = async (pass) => {
    setBusy(`resend-${pass.bookingRef}`);
    setNotice('');
    const payload = await checkoutPost('resend', { ref: pass.bookingRef }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not send the confirmation'); return; }
    setNotice(`Tickets for ${pass.bookingRef} were emailed to ${pass.customerEmail}.`);
  };

  const cancel = async () => {
    const pass = cancelTarget;
    if (!pass) return;
    setBusy(`cancel-${pass.bookingRef}`);
    setNotice('');
    const payload = await checkoutPost('request-cancel', { ref: pass.bookingRef, reason: cancelReason }, headers);
    setBusy('');
    setCancelTarget(null);
    setCancelReason('');
    if (!payload.ok) { setError(payload.error || 'Could not cancel this booking'); return; }
    setNotice(payload.message || 'Cancellation request recorded.');
    load();
  };

  if (!user) {
    return (
      <Empty icon="ph-user" title="Sign in to see your tickets"
        message="Ticket purchases are linked to the email on your account." />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mr-3" />
        Loading attraction tickets…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          {[['upcoming', `Upcoming (${upcoming.length})`], ['past', `Past (${past.length})`]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
                view === key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} className="text-xs font-black uppercase tracking-wide text-green-700 hover:underline">
          <i className="ph ph-arrows-clockwise mr-1" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-4 text-sm font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {!list.length ? (
        <Empty
          icon="ph-ticket"
          title={view === 'upcoming' ? 'No upcoming attraction visits' : 'No past visits yet'}
          message="Tickets you buy from an attraction appear here with their QR codes."
        />
      ) : list.map((pass) => {
        const currency = pass.currency || 'USD';
        return (
          <article key={pass.bookingRef} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-700">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Booking {pass.bookingRef}</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">{pass.attractionName}</h3>
                <p className="text-xs font-semibold text-slate-500">
                  {formatDate(pass.visitDate)}{pass.slotLabel ? ` · ${pass.slotLabel}` : ''} · {pass.quantity} ticket(s)
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={pass.paymentStatus === 'paid' ? pass.status : pass.paymentStatus} />
                <span className="text-sm font-black text-slate-900 dark:text-white">{money(pass.total, currency)}</span>
              </div>
            </div>

            {pass.tickets?.length > 0 ? (
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {pass.tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    <img src={qrSrc(ticket.qrToken)} alt={`QR for ${ticket.ticketNo}`} width={64} height={64}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white p-1" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{ticket.ticketTypeName}</p>
                      <p className="font-mono text-[10px] text-slate-500">{ticket.ticketNo}</p>
                      <p className="text-[11px] font-bold text-slate-500">
                        {ticket.admissionsRemaining} of {ticket.admissionsTotal} admissions left · {ticket.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-4 text-xs font-semibold text-slate-500">
                {pass.status === 'pending_payment'
                  ? 'Your tickets are issued as soon as the payment clears.'
                  : 'No digital tickets were issued for this booking.'}
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-700 px-5 py-3">
              {pass.tickets?.length > 0 && (
                <Link to={`/attraction-tickets/confirmation?ref=${encodeURIComponent(pass.bookingRef)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-black text-white">
                  <i className="ph ph-ticket" /> View & print tickets
                </Link>
              )}
              {pass.status === 'confirmed' && (
                <button type="button" onClick={() => resend(pass)} disabled={busy === `resend-${pass.bookingRef}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-xs font-black text-slate-700 dark:text-slate-200 disabled:opacity-50">
                  <i className="ph ph-paper-plane-tilt" /> {busy === `resend-${pass.bookingRef}` ? 'Sending…' : 'Email tickets'}
                </button>
              )}
              {pass.canCancel && (
                <button type="button" onClick={() => setCancelTarget(pass)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-600">
                  <i className="ph ph-x-circle" /> Request cancellation
                </button>
              )}
              {pass.refundRequestedAt && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">
                  <i className="ph ph-hourglass-medium" /> Cancellation requested
                </span>
              )}
            </div>
          </article>
        );
      })}

      {cancelTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setCancelTarget(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Cancel {cancelTarget.bookingRef}?</h3>
            <p className="mt-1 text-sm text-slate-500">
              The refund follows the attraction's cancellation policy. Inside the cancellation window the request is
              sent to the attraction for approval.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Reason (optional)"
              className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelTarget(null)}
                className="rounded-xl px-4 py-2 text-xs font-black text-slate-500">Keep booking</button>
              <button type="button" onClick={cancel} disabled={busy.startsWith('cancel-')}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                {busy.startsWith('cancel-') ? 'Cancelling…' : 'Request cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ icon, title, message }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 p-8">
      <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
        <i className={`ph ${icon} text-4xl text-emerald-600`} />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-6">{message}</p>
      <Link to="/attractions/results"
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm">
        <i className="ph ph-compass" /> Browse attractions
      </Link>
    </div>
  );
}
