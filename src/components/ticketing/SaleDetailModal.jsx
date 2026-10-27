import { useCallback, useEffect, useState } from 'react';
import { salesGet, salesPost, money, formatDate, formatDateTime } from '../../lib/ticketingClient.js';
import {
  Badge, Button, ErrorNote, Field, inputClass, Loading, Modal, Notice, StatusBadge,
  TableWrap, Td, Th,
} from './TicketingShared.jsx';

// Booking detail drawer used by the sales desk. Scanners can read everything;
// only managers can resend, mark paid, cancel or refund.
export default function SaleDetailModal({ attractionId, headers, orderId, role, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [dialog, setDialog] = useState(null); // 'cancel' | 'refund'
  const [reason, setReason] = useState('');
  const [skipRefund, setSkipRefund] = useState(false);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);

  const canManage = role === 'manager' || role === 'owner';

  const load = useCallback(async () => {
    if (!attractionId || !orderId) return;
    setLoading(true);
    const payload = await salesGet('sale', { attractionId, id: orderId }, headers);
    if (payload.ok) { setData(payload); setError(''); } else setError(payload.error || 'Could not load this booking');
    setLoading(false);
  }, [attractionId, orderId, headers]);

  useEffect(() => { load(); }, [load]);

  const openDialog = async (kind) => {
    setDialog(kind);
    setReason('');
    setSkipRefund(false);
    setAmount('');
    setQuote(null);
    const payload = await salesPost('refund-quote', { attractionId, id: orderId }, headers);
    if (payload.ok) {
      setQuote(payload);
      setAmount(String(payload.quote?.refundAmount ?? ''));
    }
  };

  const run = async (action, body = {}) => {
    setBusy(action);
    setNotice('');
    const payload = await salesPost(action, { attractionId, id: orderId, ...body }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'That action failed'); return null; }
    setError('');
    setDialog(null);
    setNotice(payload.message || 'Booking updated.');
    await load();
    onChanged?.();
    return payload;
  };

  const order = data?.order;
  const currency = order?.currency || 'USD';
  const openBalance = order ? Math.max(0, Number(order.total || 0) - Number(order.refundAmount || 0)) : 0;

  return (
    <Modal open onClose={onClose} wide icon="ph-receipt" title={order ? `Booking ${order.bookingRef}` : 'Booking detail'}>
      <ErrorNote message={error} onRetry={load} />
      <Notice onClose={() => setNotice('')}>{notice}</Notice>

      {loading ? <Loading label="Loading booking…" /> : !order ? (
        <p className="text-sm font-semibold text-slate-500">This booking no longer exists.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.paymentStatus === 'paid' ? order.status : order.paymentStatus} />
            <StatusBadge status={order.validationStatus} />
            <Badge tone="slate">{order.channel || 'online'}</Badge>
            {order.paymentMethod && <Badge tone="slate">{order.paymentMethod}</Badge>}
            {order.ticketsTotal > 0 && (
              <Badge tone="sky">{order.ticketsUsed}/{order.ticketsTotal} tickets admitted</Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Visitor" value={order.customerName || '—'} />
            <Detail label="Email" value={order.customerEmail || '—'} />
            <Detail label="Phone" value={order.customerPhone || '—'} />
            <Detail label="Purchased" value={formatDateTime(order.createdAt)} />
            <Detail label="Visit date" value={formatDate(order.visitDate)} />
            <Detail label="Entry time" value={order.slotLabel || 'All day'} />
            <Detail label="Admissions" value={`${order.admissionsUsed || 0} of ${order.admissionsTotal || 0} used`} />
            <Detail label="Tickets" value={String(order.ticketsTotal || order.quantity)} />
            {order.promoCode && <Detail label="Promo code" value={order.promoCode} />}
            {order.notes && <Detail label="Notes" value={order.notes} />}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <TableWrap>
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Ticket type</Th><Th>Qty</Th><Th>Unit</Th><Th>Admissions</Th><Th>Line total</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(data.items || []).map((item) => (
                    <tr key={item.id}>
                      <Td className="font-semibold">{item.ticketTypeName}</Td>
                      <Td>{item.quantity}</Td>
                      <Td>{money(item.unitPrice, currency)}</Td>
                      <Td>{item.admissionsPerUnit * item.quantity}</Td>
                      <Td className="font-bold">{money(item.lineTotal, currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>

          <div className="grid gap-1.5 text-sm sm:grid-cols-2 sm:gap-x-8">
            <Row label="Subtotal" value={money(order.subtotal, currency)} />
            {order.discount > 0 && <Row label="Discount" value={`− ${money(order.discount, currency)}`} />}
            <Row label="Taxes" value={money(order.taxAmount, currency)} />
            <Row label="Service fee" value={money(order.serviceFee, currency)} />
            <Row label="Total paid" value={money(order.total, currency)} strong />
            {order.refundAmount > 0 && <Row label="Refunded" value={money(order.refundAmount, currency)} />}
          </div>

          {(data.tickets || []).length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Digital tickets</h4>
              <div className="space-y-2">
                {data.tickets.map((ticket) => (
                  <div key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{ticket.ticketNo}</p>
                      <p className="text-[11px] text-slate-500">
                        {ticket.ticketTypeName} · {ticket.holderName || order.customerName} · {formatDate(ticket.visitDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500">
                        {ticket.admissionsUsed}/{ticket.admissionsTotal} admissions
                      </span>
                      <StatusBadge status={ticket.status} />
                    </div>
                  </div>
                ))}
              </div>
              <a
                href={`/attraction-tickets/confirmation?ref=${encodeURIComponent(order.bookingRef)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-green-700 dark:text-green-400 hover:underline"
              >
                <i className="ph ph-printer" /> Open printable tickets
              </a>
            </div>
          )}

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <Button variant="soft" size="sm" icon="ph-paper-plane-tilt" disabled={busy === 'resend'}
                onClick={() => run('resend')}>Resend confirmation</Button>
              {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                <Button variant="soft" size="sm" icon="ph-check-square" disabled={busy === 'mark-paid'}
                  onClick={() => run('mark-paid', { paymentMethod: 'cash' })}>Mark as paid</Button>
              )}
              {!['cancelled', 'refunded'].includes(order.status) && (
                <Button variant="soft" size="sm" icon="ph-x-circle" onClick={() => openDialog('cancel')}>Cancel booking</Button>
              )}
              {openBalance > 0 && order.paymentStatus === 'paid' && (
                <Button variant="danger" size="sm" icon="ph-arrow-u-up-left" onClick={() => openDialog('refund')}>
                  Refund {money(openBalance, currency)}
                </Button>
              )}
            </div>
          )}

          {(data.validations || []).length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Validation history</h4>
              <TableWrap>
                <table className="min-w-full">
                  <thead className="border-b border-slate-200 dark:border-slate-800">
                    <tr><Th>Ticket</Th><Th>Result</Th><Th>Staff</Th><Th>When</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.validations.map((entry, index) => (
                      <tr key={`${entry.ticketNumber}-${entry.createdAt}-${index}`}>
                        <Td className="font-mono text-xs">{entry.ticketNumber}</Td>
                        <Td className={entry.result === 'success' ? 'text-emerald-600 font-bold text-xs' : 'text-rose-600 font-bold text-xs'}>
                          {entry.result === 'success' ? entry.action : (entry.reason || 'rejected').replace(/_/g, ' ')}
                        </Td>
                        <Td className="text-xs">{entry.staff || '—'}</Td>
                        <Td className="text-xs whitespace-nowrap">{formatDateTime(entry.createdAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}

          {(data.audit || []).length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Audit trail</h4>
              <ul className="space-y-1.5 text-xs">
                {data.audit.map((entry, index) => (
                  <li key={`${entry.action}-${entry.createdAt}-${index}`} className="flex flex-wrap gap-2 text-slate-600 dark:text-slate-300">
                    <span className="font-mono font-bold">{entry.action}</span>
                    <span className="text-slate-400">{entry.actor || 'system'}</span>
                    <span className="text-slate-400">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel booking" icon="ph-x-circle">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          The refund policy for each ticket type is applied automatically. Service fees are never refunded.
        </p>
        {!quote ? <Loading label="Working out the refund…" /> : (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm space-y-1">
              {(quote.quote?.lines || []).map((line, index) => (
                <div key={`${line.ticketTypeId}-${index}`} className="flex justify-between gap-3">
                  <span className="font-semibold">{line.ticketTypeName}</span>
                  <span className="text-slate-500 text-xs">
                    {line.percent}% · {money(line.refundable, quote.currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5 font-black">
                <span>Refund due</span>
                <span>{money(quote.quote?.refundAmount, quote.currency)}</span>
              </div>
            </div>
            <Field label="Reason" hint="Stored on the booking and in the audit log.">
              <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)}
                placeholder="Customer requested cancellation" />
            </Field>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={skipRefund} onChange={(event) => setSkipRefund(event.target.checked)} />
              Cancel without refunding the card
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>Keep booking</Button>
              <Button variant="danger" size="sm" icon="ph-x-circle" disabled={busy === 'cancel'}
                onClick={() => run('cancel', { reason, skipRefund })}>
                {busy === 'cancel' ? 'Cancelling…' : 'Confirm cancellation'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={dialog === 'refund'} onClose={() => setDialog(null)} title="Process refund" icon="ph-arrow-u-up-left">
        {!quote ? <Loading label="Checking the paid amount…" /> : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Refundable balance: <strong>{money(openBalance, quote.currency)}</strong>. The card is credited through
              the same payment provider used for the purchase.
            </p>
            <Field label="Refund amount">
              <input type="number" min="0" step="0.01" max={openBalance} value={amount}
                onChange={(event) => setAmount(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Reason">
              <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)}
                placeholder="Goodwill refund" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>Close</Button>
              <Button variant="danger" size="sm" icon="ph-credit-card" disabled={busy === 'refund'}
                onClick={() => run('refund', { amount, reason })}>
                {busy === 'refund' ? 'Refunding…' : 'Send refund'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900 dark:text-white break-words">{value}</p>
    </div>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-black text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
