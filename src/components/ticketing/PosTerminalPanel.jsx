import { useCallback, useMemo, useState } from 'react';
import { formatDate, money, posPost, todayISO } from '../../lib/ticketingClient.js';
import { Badge, Button, EmptyState, ErrorNote, Field, Modal, Notice, Panel, StatCard, inputClass } from './TicketingShared.jsx';
import {
  buildQrMap, buildReceiptHtml, buildTicketSheetHtml, normalizeTicket, printAttraction, printCompany, printHtml,
} from './PhysicalPrint.jsx';

// Counter sale: pick tickets, take payment, issue and print.
//
// Totals shown here are a client-side estimate purely for the cashier's change
// maths — the server recomputes the quote from stored prices and rejects the
// sale if anything disagrees. Each attempt carries an idempotency key, so a
// double click or a flaky network can only ever produce one sale.

function newKey() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `pos-${random.slice(0, 20)}`;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export default function PosTerminalPanel({ attractionId, headers, context, refresh, visitDate, setVisitDate }) {
  const currency = context?.attraction?.currency || 'USD';
  const permissions = context?.permissions || {};
  const types = context?.types || [];
  const availability = context?.availability || { types: [] };

  const [cart, setCart] = useState([]);
  const [slotId, setSlotId] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [verified, setVerified] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [batchId, setBatchId] = useState(0);
  const [notes, setNotes] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [viewReceipt, setViewReceipt] = useState(null);

  const remainingByType = useMemo(() => {
    const map = new Map();
    for (const entry of availability.types || []) map.set(Number(entry.id), entry);
    return map;
  }, [availability]);

  const slots = useMemo(() => {
    const required = types.some((type) => type.slotRequired && cart.some((line) => line.ticketTypeId === type.id));
    if (!required) return [];
    return availability.slots || [];
  }, [types, cart, availability]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => {
      const type = types.find((entry) => entry.id === line.ticketTypeId);
      const price = remainingByType.get(line.ticketTypeId)?.price ?? type?.price ?? 0;
      return sum + Number(price) * line.quantity;
    }, 0);
    const taxPercent = Number(context?.settings?.taxPercent || 0);
    const feePercent = Number(context?.settings?.serviceFeePercent || 0);
    const tax = round2((subtotal * taxPercent) / 100);
    const fee = round2((subtotal * feePercent) / 100);
    const total = round2(subtotal + tax + fee);
    const tickets = cart.reduce((sum, line) => sum + line.quantity, 0);
    const receivedValue = Number(received || 0);
    return {
      subtotal: round2(subtotal), taxAmount: tax, serviceFee: fee, total, tickets,
      change: method === 'cash' ? round2(Math.max(0, receivedValue - total)) : 0,
      short: method === 'cash' ? round2(Math.max(0, total - receivedValue)) : 0,
      taxPercent, feePercent,
    };
  }, [cart, types, remainingByType, context, method, received]);

  const shift = context?.shift || null;
  const canShift = Boolean(permissions.shift);

  const addToCart = (typeId) => {
    setResult(null);
    setCart((current) => {
      const existing = current.find((line) => line.ticketTypeId === typeId);
      if (existing) {
        return current.map((line) => (line.ticketTypeId === typeId ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, { ticketTypeId: typeId, quantity: 1 }];
    });
  };

  const setQuantity = (typeId, quantity) => {
    setResult(null);
    const value = Math.max(0, Math.min(50, Number(quantity) || 0));
    setCart((current) => (value === 0
      ? current.filter((line) => line.ticketTypeId !== typeId)
      : current.map((line) => (line.ticketTypeId === typeId ? { ...line, quantity: value } : line))));
  };

  const resetSale = useCallback(() => {
    setCart([]);
    setPromoCode('');
    setReceived('');
    setPaymentRef('');
    setVerified(false);
    setCustomerName('');
    setCustomerEmail('');
    setNotes('');
    setBatchId(0);
    setIdempotencyKey(newKey());
  }, []);

  const openShift = async () => {
    setBusy('shift');
    const payload = await posPost('open-shift', {
      attractionId, openingCash: Number(openingCash || 0),
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setOpeningCash('');
    refresh();
  };

  const submit = async () => {
    if (!cart.length || submitting) return;
    if (method === 'cash' && totals.short > 0) {
      setError(`Collect at least ${money(totals.total, currency)} in cash before confirming`);
      return;
    }
    setSubmitting(true);
    setError('');
    const payload = await posPost('pos-sale', {
      attractionId,
      visitDate,
      slotId: slots.length ? slotId : 0,
      items: cart,
      promoCode,
      paymentMethod: method,
      amountReceived: method === 'cash' ? Number(received || 0) : undefined,
      paymentRef,
      verified: verified && Boolean(paymentRef),
      customerName,
      customerEmail,
      batchId: batchId || undefined,
      notes,
      idempotencyKey,
    }, headers);
    setSubmitting(false);

    if (!payload.ok) {
      setError(payload.error || 'The sale could not be completed');
      return;
    }
    setResult(payload);
    setReceipt(payload.receipt || null);
    resetSale();
    refresh();
  };

  const confirmPending = async () => {
    if (!result?.order?.id) return;
    setBusy('confirm');
    const payload = await posPost('confirm-payment', {
      attractionId, id: result.order.id, paymentRef,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setResult((current) => ({ ...current, ...payload }));
    setReceipt(payload.receipt || receipt);
    setPaymentRef('');
    refresh();
  };

  const printTickets = async (tickets) => {
    if (!tickets?.length) return;
    setBusy('print');
    const list = tickets.map(normalizeTicket);
    const qrMap = await buildQrMap(list);
    const html = buildTicketSheetHtml({
      tickets: list,
      attraction: printAttraction(context),
      company: printCompany(context),
      layout: context?.settings?.printLayout || 'a4_4',
      paperSize: context?.settings?.paperSize || 'A4',
      terms: context?.settings?.ticketTerms || context?.attraction?.terms || '',
      qrMap,
      batchRef: result?.order?.booking_ref || '',
    });
    await printHtml(html, { title: 'Tickets' });
    setBusy('');
    // Printing is logged server-side and never changes stock or payment state.
    if (result?.tickets?.length) {
      posPost('print', {
        attractionId,
        layout: context?.settings?.printLayout || 'a4_4',
        ticketNumbers: list.map((ticket) => ticket.ticketNo),
      }, headers).then(() => refresh());
    }
  };

  const printReceipt = async (payload) => {
    const data = payload || receipt || viewReceipt;
    if (!data) return;
    setBusy('receipt');
    await printHtml(buildReceiptHtml({
      receipt: data,
      paperSize: context?.settings?.paperSize === 'A4' ? 'A4' : 'Thermal 80mm',
    }), { title: 'Receipt' });
    setBusy('');
  };

  const openReceipt = async (orderId) => {
    setBusy('receipt');
    const payload = await posPost('receipt', { attractionId, id: orderId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setViewReceipt(payload.receipt);
  };

  if (context?.settings?.salesPaused) {
    return (
      <Panel title="Point of sale" icon="ph-cash-register">
        <EmptyState
          icon="ph-pause-circle"
          title="Ticket sales are paused"
          message="Online and on-site sales are paused for this attraction. Resume sales in the ticketing settings first."
        />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 space-y-5">
        <Panel
          title="Choose tickets"
          icon="ph-ticket"
          subtitle={`Selling for ${formatDate(visitDate)} · availability is shared with online sales`}
          actions={(
            <input
              type="date"
              value={visitDate}
              min={todayISO()}
              onChange={(event) => setVisitDate(event.target.value || todayISO())}
              className={`${inputClass} w-[150px] py-1.5 text-xs`}
            />
          )}
        >
          {!types.length ? (
            <EmptyState
              icon="ph-ticket"
              title="No active ticket types"
              message="Create an active ticket type in Ticketing Management before selling at the counter."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {types.map((type) => {
                const live = remainingByType.get(Number(type.id));
                const remaining = live?.remaining ?? null;
                const soldOut = Boolean(live?.soldOut) || remaining === 0;
                const closed = Boolean(live?.closed);
                const price = live?.price ?? type.price;
                const inCart = cart.find((line) => line.ticketTypeId === type.id);
                return (
                  <div
                    key={type.id}
                    className={`rounded-2xl border p-3.5 ${soldOut || closed
                      ? 'border-slate-200 dark:border-slate-800 opacity-60'
                      : 'border-slate-200 dark:border-slate-800 hover:border-green-400'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white truncate">{type.name}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{type.category}</p>
                      </div>
                      <p className="text-sm font-black text-green-700 dark:text-green-400 whitespace-nowrap">
                        {money(price, currency)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-500">
                        {closed ? 'Closed' : remaining === null ? 'Unlimited' : `${remaining} left`}
                      </span>
                      {inCart ? (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => setQuantity(type.id, inCart.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 font-black">−</button>
                          <span className="w-8 text-center text-sm font-black text-slate-900 dark:text-white">{inCart.quantity}</span>
                          <button type="button" onClick={() => setQuantity(type.id, inCart.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-green-600 text-white font-black">+</button>
                        </div>
                      ) : (
                        <Button size="sm" variant="soft" icon="ph-plus" disabled={soldOut || closed}
                          onClick={() => addToCart(type.id)}>
                          Add
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {slots.length > 0 && (
            <div className="mt-4">
              <Field label="Entry time slot">
                <select value={slotId} onChange={(event) => setSlotId(Number(event.target.value))} className={inputClass}>
                  <option value={0}>Choose an entry time…</option>
                  {slots.map((slot) => (
                    <option key={slot.id} value={slot.id} disabled={slot.soldOut}>
                      {slot.label}{slot.remaining !== null ? ` · ${slot.remaining} left` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </Panel>

        {context?.batches?.length > 0 && (
          <Panel title="Sell from a printed batch" icon="ph-printer"
            subtitle="Optional: claim the tickets from a batch you already printed so its stock matches the sale.">
            <select value={batchId} onChange={(event) => setBatchId(Number(event.target.value))} className={inputClass}>
              <option value={0}>Issue new ticket numbers</option>
              {context.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchRef} · {batch.name} · {batch.availableForDate} unsold for {formatDate(visitDate)}
                </option>
              ))}
            </select>
          </Panel>
        )}
      </div>

      <div className="xl:col-span-2 space-y-5">
        {!shift && canShift && (
          <Panel title="Open your shift" icon="ph-safe"
            subtitle="Record the float in the till before taking cash.">
            <div className="flex flex-wrap items-end gap-2">
              <Field label={`Opening cash (${currency})`} className="flex-1 min-w-[130px]">
                <input type="number" min="0" step="0.01" value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)} className={inputClass} placeholder="0.00" />
              </Field>
              <Button icon="ph-play" onClick={openShift} disabled={busy === 'shift'}>Open shift</Button>
            </div>
          </Panel>
        )}

        {shift && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Expected in till" value={money(shift.expectedCashNow, currency)} icon="ph-safe" tone="emerald" />
            <StatCard label="Tickets this shift" value={shift.tickets} icon="ph-ticket" tone="sky" />
          </div>
        )}

        <Panel title="Payment" icon="ph-credit-card"
          actions={<Badge tone="slate">{totals.tickets} ticket(s)</Badge>}>
          <div className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal, currency)} />
            <Row label={`Tax (${totals.taxPercent}%)`} value={money(totals.taxAmount, currency)} />
            <Row label={`Service fee (${totals.feePercent}%)`} value={money(totals.serviceFee, currency)} />
            <div className="border-t border-slate-200 dark:border-slate-700 my-2" />
            <Row label="Total" value={money(totals.total, currency)} strong />
            <p className="text-[10px] text-slate-400">Final amounts are confirmed by the server when the sale is recorded.</p>
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Payment method">
              <select value={method} onChange={(event) => { setMethod(event.target.value); setVerified(false); }} className={inputClass}>
                {(context?.paymentMethods || []).map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
            </Field>

            {method === 'cash' && (
              <Field label={`Cash received (${currency})`} hint={totals.short > 0
                ? `Short by ${money(totals.short, currency)}`
                : `Change due ${money(totals.change, currency)}`}>
                <input type="number" min="0" step="0.01" value={received}
                  onChange={(event) => setReceived(event.target.value)} className={inputClass} placeholder="0.00" />
              </Field>
            )}

            {(method === 'card' || method === 'mobile_money') && (
              <>
                <Field label="Payment reference" hint="Only mark paid once the card terminal or mobile money confirmation shows success.">
                  <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)}
                    className={inputClass} placeholder="Terminal / transaction reference" />
                </Field>
                <label className="flex items-start gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-0.5" />
                  Payment verified — issue tickets now
                </label>
                {!verified && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                    Unverified sales are held as pending: tickets print but cannot grant admission until you confirm payment.
                  </p>
                )}
              </>
            )}

            {method === 'other' && (
              <Field label="Reference / note">
                <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)}
                  className={inputClass} placeholder="How was this paid?" />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Visitor name (optional)">
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)}
                  className={inputClass} placeholder="Walk-in guest" />
              </Field>
              <Field label="Visitor email (optional)">
                <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)}
                  className={inputClass} placeholder="For a digital receipt" />
              </Field>
            </div>

            <Field label="Promo code (optional)">
              <input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                className={inputClass} placeholder="WELCOME10" />
            </Field>

            <Button
              className="w-full"
              size="lg"
              icon={submitting ? 'ph-circle-notch' : 'ph-check-circle'}
              disabled={!cart.length || submitting || (method === 'cash' && totals.short > 0)}
              onClick={submit}
            >
              {submitting ? 'Recording sale…' : `Confirm sale · ${money(totals.total, currency)}`}
            </Button>
          </div>
        </Panel>

        <ErrorNote message={error} />

        {result && (
          <Panel title={result.pendingPayment ? 'Sale held for payment' : 'Sale complete'} icon="ph-receipt"
            actions={<Badge tone={result.pendingPayment ? 'amber' : 'emerald'}>{result.pendingPayment ? 'pending' : 'paid'}</Badge>}>
            <div className="space-y-2 text-sm">
              <Row label="Sale reference" value={result.order?.booking_ref || '—'} />
              <Row label="Receipt" value={result.receipt?.receiptNo || '—'} />
              <Row label="Tickets" value={(result.tickets || []).length} />
              <Row label="Total" value={money(result.order?.total || 0, result.order?.currency || currency)} strong />
            </div>
            {(result.tickets || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.tickets.map((ticket) => (
                  <span key={ticket.ticketNo} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {ticket.ticketNo}
                  </span>
                ))}
              </div>
            )}
            {result.pendingPayment && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <Field label="Verified payment reference" className="flex-1 min-w-[140px]">
                  <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} className={inputClass} />
                </Field>
                <Button icon="ph-check" onClick={confirmPending} disabled={busy === 'confirm' || !paymentRef}>
                  Confirm payment
                </Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon="ph-printer" disabled={busy === 'print' || !(result.tickets || []).length}
                onClick={() => printTickets(result.tickets)}>
                Print tickets
              </Button>
              <Button variant="soft" icon="ph-receipt" disabled={!receipt} onClick={() => printReceipt(receipt)}>
                Print receipt
              </Button>
              <Button variant="ghost" icon="ph-eye" disabled={busy === 'receipt'}
                onClick={() => openReceipt(result.order.id)}>
                View receipt
              </Button>
              <Button variant="ghost" onClick={() => { setResult(null); setReceipt(null); }}>New sale</Button>
            </div>
          </Panel>
        )}
      </div>

      <Modal open={Boolean(viewReceipt)} onClose={() => setViewReceipt(null)} title="Receipt" icon="ph-receipt" wide>
        {viewReceipt && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <Row label="Receipt" value={viewReceipt.receiptNo} />
              <Row label="Sale" value={viewReceipt.saleRef} />
              <Row label="Total" value={money(viewReceipt.total, viewReceipt.currency)} strong />
            </div>
            <div className="flex justify-end gap-2">
              <Button icon="ph-printer" onClick={() => printReceipt(viewReceipt)}>Print</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-xs font-bold ${strong ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      <span className={`${strong ? 'text-base font-black' : 'text-sm font-bold'} text-slate-900 dark:text-white`}>{value}</span>
    </div>
  );
}
