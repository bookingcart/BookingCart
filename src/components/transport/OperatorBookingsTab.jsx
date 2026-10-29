import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays, clockLabel, formatDateTime, money, operatorGet, operatorPost, shortDate, todayISO,
} from '../../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Modal, Note, Panel, Table, btn, inputCls,
} from './ConsoleKit.jsx';

const STATUS_FILTERS = ['', 'confirmed', 'pending_payment', 'cancelled', 'expired'];

/** The passenger manifest: who is on board, who still owes money, who cancelled. */
export default function OperatorBookingsTab({ operatorId, headers, can }) {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({
    from: addDays(todayISO(), -30),
    to: addDays(todayISO(), 180),
    status: '',
    channel: '',
    search: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [busy, setBusy] = useState(false);

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('bookings', operatorId, {
      from: filters.from,
      to: filters.to,
      status: filters.status,
      channel: filters.channel,
      search: filters.search,
      limit: 200,
    }, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load bookings'); return; }
    setError('');
    setOrders(result.orders || []);
  }, [operatorId, authHeaders, filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (order) => {
    setDetailLoading(true);
    setNote('');
    setRefundReason('');
    setPaymentRef('');
    const result = await operatorGet('booking', operatorId, { ref: order.bookingRef }, authHeaders);
    setDetailLoading(false);
    if (!result.ok) { setError(result.error || 'Could not open that booking'); return; }
    setDetail(result.order);
    setPaymentMethod(result.order.paymentMethod === 'card' ? 'card' : 'cash');
  };

  const settle = async () => {
    if (!detail) return;
    setBusy(true);
    const result = await operatorPost('booking-settle', operatorId, {
      ref: detail.bookingRef,
      paymentMethod,
      paymentRef,
    }, authHeaders);
    setBusy(false);
    if (!result.ok) { setError(result.error || 'Could not settle the booking'); return; }
    setDetail(result.order);
    setNote(`${detail.bookingRef} marked paid (${paymentMethod}).`);
    await load();
  };

  const refund = async () => {
    if (!detail) return;
    if (!window.confirm(`Cancel ${detail.bookingRef} and refund it? This frees the seats immediately.`)) return;
    setBusy(true);
    const result = await operatorPost('booking-refund', operatorId, {
      ref: detail.bookingRef,
      reason: refundReason || 'Cancelled by the operator',
    }, authHeaders);
    setBusy(false);
    if (!result.ok) { setError(result.error || 'Could not refund the booking'); return; }
    setDetail(result.order);
    setNote(`Cancelled ${detail.bookingRef}. Refunded ${money(result.refundAmount || 0, detail.currency)}.`);
    await load();
  };

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {note && <Note>{note}</Note>}

      <Panel
        title="Bookings & manifests"
        subtitle="Every ticket sold online and at the counter"
        actions={(
          <button type="button" className={btn.secondary} onClick={load}>
            <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Refresh
          </button>
        )}
        padded={false}
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
          <Field label="From">
            <input type="date" value={filters.from} onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={filters.to} onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))} className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={filters.status} onChange={(event) => setFilters((f) => ({ ...f, status: event.target.value }))} className={inputCls}>
              {STATUS_FILTERS.map((status) => <option key={status || 'all'} value={status}>{status || 'All statuses'}</option>)}
            </select>
          </Field>
          <Field label="Channel">
            <select value={filters.channel} onChange={(event) => setFilters((f) => ({ ...f, channel: event.target.value }))} className={inputCls}>
              <option value="">All channels</option>
              <option value="online">Online</option>
              <option value="pos">Counter</option>
            </select>
          </Field>
          <Field label="Search" hint="Reference, name, email or phone">
            <input
              value={filters.search}
              onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
              className={inputCls}
              placeholder="TR-…"
            />
          </Field>
        </div>

        {loading ? (
          <Loading />
        ) : orders.length === 0 ? (
          <div className="p-4">
            <Empty icon="ph-user-list" title="No bookings in this window" message="Try a wider date range or clear the filters." />
          </div>
        ) : (
          <Table head={['Ref', 'Journey', 'Customer', 'Pax / seats', 'Total', 'Payment', 'Channel', '']}>
            {orders.map((order) => (
              <tr key={order.bookingRef} className="align-middle">
                <td className="px-2 py-2.5">
                  <p className="font-mono text-[11px] font-black text-slate-900 dark:text-white">{order.bookingRef}</p>
                  <p className="text-[11px] text-slate-400">{formatDateTime(order.createdAt)}</p>
                </td>
                <td className="px-2 py-2.5">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{order.routeName}</p>
                  <p className="text-[11px] text-slate-400">
                    {shortDate(order.travelDate)} · {clockLabel(order.departTime)}
                  </p>
                </td>
                <td className="px-2 py-2.5">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{order.customerName}</p>
                  <p className="text-[11px] text-slate-400">{order.customerEmail}</p>
                </td>
                <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                  {order.passengerCount}
                  <p className="text-[11px] text-slate-400">{order.seatLabels.join(', ') || 'General'}</p>
                </td>
                <td className="px-2 py-2.5">
                  <p className="font-bold text-slate-800 dark:text-white">{money(order.total, order.currency)}</p>
                  {order.refundAmount > 0 && <p className="text-[11px] font-bold text-violet-500">−{money(order.refundAmount, order.currency)}</p>}
                </td>
                <td className="px-2 py-2.5"><Badge status={order.status === 'cancelled' ? 'cancelled' : order.paymentStatus} /></td>
                <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                  {order.channel === 'pos' ? 'Counter' : 'Online'}
                  {order.soldByEmail && <p className="text-[11px] text-slate-400">{order.soldByEmail}</p>}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button type="button" className={btn.ghost} onClick={() => openDetail(order)}>
                    <i className="ph ph-arrow-square-out" aria-hidden="true" /> Open
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal open={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} title={detail ? `Booking ${detail.bookingRef}` : 'Loading booking'} wide>
        {detailLoading || !detail ? (
          <Loading />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Journey</p>
                <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{detail.routeName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {detail.travelDate} · {clockLabel(detail.departTime)} · {detail.vehicleName || 'Vehicle TBC'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {detail.boardingPoint || 'Boarding TBC'} → {detail.dropoffPoint || detail.routeName}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Customer</p>
                <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{detail.customerName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{detail.customerEmail}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{detail.customerPhone || 'No phone'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge status={detail.status} />
                  <Badge status={detail.paymentStatus} />
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <i className={`ph ${detail.channel === 'pos' ? 'ph-cash-register' : 'ph-globe'} text-[11px]`} aria-hidden="true" />
                    {detail.channel === 'pos' ? 'Counter' : 'Online'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Passengers', detail.passengerCount],
                ['Seats', detail.seatLabels.join(', ') || 'General'],
                ['Class', detail.fareClassName || detail.fareClass || '—'],
                ['Total', money(detail.total, detail.currency)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-0.5 truncate text-xs font-black text-slate-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>

            <Panel title="Tickets" padded={false}>
              <Table head={['Ticket', 'Passenger', 'Seat', 'Class', 'Status', 'Boarded']}>
                {(detail.tickets || []).map((ticket) => (
                  <tr key={ticket.ticketNo}>
                    <td className="px-2 py-2 font-mono text-[11px] font-black text-slate-900 dark:text-white">{ticket.ticketNo}</td>
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{ticket.passengerName}</td>
                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{ticket.seatLabel || 'General'}</td>
                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{ticket.fareClass}</td>
                    <td className="px-2 py-2"><Badge status={ticket.status} /></td>
                    <td className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {ticket.admittedAt ? `${formatDateTime(ticket.admittedAt)}${ticket.admittedBy ? ` · ${ticket.admittedBy}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>

            {detail.status !== 'cancelled' && can('refund') && (
              <Panel title="Counter actions">
                {detail.paymentStatus === 'paid' ? (
                  <Note>This booking is paid. Cancelling it refunds under your cancellation policy.</Note>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Payment method">
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputCls}>
                        {['cash', 'card', 'mobile_money', 'bank_transfer', 'agent_credit'].map((method) => (
                          <option key={method} value={method}>{method.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Payment reference">
                      <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} className={inputCls} placeholder="Receipt / txn id" />
                    </Field>
                    <div className="flex items-end">
                      <button type="button" className={`${btn.primary} w-full justify-center`} onClick={settle} disabled={busy}>
                        <i className="ph ph-check-circle" aria-hidden="true" /> Mark paid
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Field label="Cancellation reason" className="sm:col-span-2">
                    <input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} className={inputCls} placeholder="Passenger request, operator change…" />
                  </Field>
                  <div className="flex items-end">
                    <button type="button" className={`${btn.danger} w-full justify-center`} onClick={refund} disabled={busy}>
                      <i className="ph ph-arrow-u-up-left" aria-hidden="true" /> Cancel & refund
                    </button>
                  </div>
                </div>
              </Panel>
            )}

            {detail.status === 'cancelled' && (
              <Note tone="rose">
                Cancelled {detail.cancelledAt ? formatDateTime(detail.cancelledAt) : ''}
                {detail.cancelReason ? ` — ${detail.cancelReason}` : ''}. Refund:{' '}
                {money(detail.refundAmount, detail.currency)} ({detail.refundStatus}).
              </Note>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
