import { useCallback, useEffect, useState } from 'react';
import {
  addDays, downloadPosSales, formatDate, formatDateTime, money, posPost, todayISO,
} from '../../lib/ticketingClient.js';
import {
  Badge, Button, DateRange, EmptyState, ErrorNote, Field, Modal, Notice, Panel, StatCard, StatusBadge,
  TableWrap, Td, Th, inputClass,
} from './TicketingShared.jsx';
import { buildQrMap, buildReceiptHtml, buildTicketSheetHtml, normalizeTicket, printHtml } from './PhysicalPrint.jsx';

const METHODS = [
  { value: '', label: 'All methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
  { value: 'complimentary', label: 'Complimentary' },
];

// Counter sales ledger: search, reprint, refund. Cashiers only see their own
// sales unless they hold the viewAllSales permission.
export default function PhysicalSalesHistoryPanel({ attractionId, headers, context, refresh }) {
  const currency = context?.attraction?.currency || 'USD';
  const permissions = context?.permissions || {};

  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [filters, setFilters] = useState({ search: '', paymentMethod: '', status: '', cashier: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await posPost('sales', {
      attractionId, ...range, ...filters, pageSize: 50,
    }, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load counter sales'); return; }
    setData(payload);
    setError('');
  }, [attractionId, headers, range, filters]);

  useEffect(() => { load(); }, [load]);

  const openReceipt = async (saleId) => {
    setBusy('receipt');
    const payload = await posPost('receipt', { attractionId, id: saleId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setDetail(payload.receipt);
  };

  const printReceipt = async (receipt) => {
    if (!receipt) return;
    await printHtml(buildReceiptHtml({
      receipt,
      paperSize: context?.settings?.paperSize === 'A4' ? 'A4' : 'Thermal 80mm',
    }), { title: 'Receipt' });
  };

  const reprintTickets = async (receipt) => {
    if (!(receipt?.tickets || []).length) return;
    setBusy('print');
    const tickets = receipt.tickets.map(normalizeTicket);
    const qrMap = await buildQrMap(tickets);
    const html = buildTicketSheetHtml({
      tickets,
      attraction: context?.attraction || {},
      layout: context?.settings?.printLayout || 'a4_4',
      paperSize: context?.settings?.paperSize || 'A4',
      terms: context?.attraction?.terms || '',
      qrMap,
      batchRef: receipt.saleRef,
    });
    const logged = await posPost('print', {
      attractionId,
      layout: context?.settings?.printLayout || 'a4_4',
      kind: 'reprint',
      ticketNumbers: tickets.map((ticket) => ticket.ticketNo),
    }, headers);
    setBusy('');
    if (!logged.ok) { setError(logged.error); return; }
    const ok = await printHtml(html, { title: 'Tickets' });
    setNotice(ok ? 'Reprinted — reprinting never grants extra admission.' : 'Printer unavailable. Try again.');
  };

  const submitRefund = async () => {
    if (!refunding) return;
    setBusy('refund');
    const payload = await posPost('refund-sale', {
      attractionId,
      id: refunding.id,
      amount: refundAmount === '' ? undefined : Number(refundAmount),
      reason,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'The refund was declined'); return; }
    setNotice(`Refunded ${money(payload.refunded ?? 0, refunding.currency || currency)}.`);
    setRefunding(null);
    setRefundAmount('');
    setReason('');
    load();
    refresh();
  };

  const exportCsv = async () => {
    try {
      await downloadPosSales({ attractionId, from: range.from, to: range.to, headers, filters });
    } catch (exportError) {
      setError(exportError.message);
    }
  };

  const totals = data?.totals || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Gross sales" value={money(totals.gross || 0, currency)} icon="ph-cash-register" tone="emerald" />
        <StatCard label="Refunded" value={money(totals.refunds || 0, currency)} icon="ph-arrow-u-up-left" tone="rose" />
        <StatCard label="Tickets sold" value={totals.tickets || 0} icon="ph-ticket" tone="sky" />
        <StatCard label="Sales recorded" value={data?.pagination?.total || 0} icon="ph-receipt" tone="violet" />
      </div>

      <Panel
        title="Sales history"
        icon="ph-receipt"
        subtitle={data?.scopedToSelf ? 'Showing only your own counter sales.' : 'Every counter sale for this attraction.'}
        actions={(
          <div className="flex flex-wrap items-end gap-2">
            <DateRange from={range.from} to={range.to} onChange={setRange} label="" />
            <Field label="Method">
              <select value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}
                className={`${inputClass} w-[140px] py-1.5 text-xs`}>
                {METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </Field>
            <Field label="Search">
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                className={`${inputClass} w-[170px] py-1.5 text-xs`} placeholder="Ref, receipt, ticket, visitor" />
            </Field>
            <Button size="sm" variant="soft" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            {permissions.reports && (
              <Button size="sm" variant="ghost" icon="ph-download-simple" onClick={exportCsv}>CSV</Button>
            )}
          </div>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        {loading && !data ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">Loading counter sales…</p>
        ) : !(data?.sales || []).length ? (
          <EmptyState
            icon="ph-receipt"
            title="No counter sales yet"
            message="Sales made at the ticket office appear here with their receipt and ticket numbers."
          />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>Sale</Th>
                  <Th>When</Th>
                  <Th>Cashier</Th>
                  <Th>Visitor</Th>
                  <Th>Tickets</Th>
                  <Th>Method</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {(data.sales || []).map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-100 dark:border-slate-800/60">
                    <Td>
                      <span className="block font-mono text-xs font-bold text-green-700 dark:text-green-400">{sale.saleRef}</span>
                      <span className="block text-[11px] text-slate-400">{sale.receiptNo || '—'}</span>
                    </Td>
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(sale.createdAt)}</Td>
                    <Td className="text-xs truncate max-w-[130px]">{sale.cashier || '—'}</Td>
                    <Td className="text-xs truncate max-w-[140px]">{sale.customerName || 'Walk-in'}</Td>
                    <Td className="text-xs">
                      <span className="font-bold">{sale.quantity}</span>
                      <span className="block text-[10px] text-slate-400 truncate max-w-[150px]">{sale.ticketTypes}</span>
                    </Td>
                    <Td><Badge tone="slate">{String(sale.paymentMethod || '').replace(/_/g, ' ')}</Badge></Td>
                    <Td className="font-bold whitespace-nowrap">{money(sale.total, sale.currency || currency)}</Td>
                    <Td>
                      <StatusBadge status={sale.status} />
                      {sale.refundAmount > 0 && <span className="block text-[10px] font-bold text-rose-500">−{money(sale.refundAmount, sale.currency)}</span>}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openReceipt(sale.id)} disabled={busy === 'receipt'}>Receipt</Button>
                        {permissions.refund && sale.status === 'confirmed' && (
                          <Button size="sm" variant="ghost" onClick={() => setRefunding(sale)}>Refund</Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-[11px] font-semibold text-slate-400">
          Range {formatDate(range.from)} – {formatDate(range.to)}. Refunds reverse the payment and make the affected tickets unusable.
        </p>
      </Panel>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `Receipt ${detail.receiptNo}` : 'Receipt'} icon="ph-receipt" wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <Info label="Sale" value={detail.saleRef} />
              <Info label="Cashier" value={detail.cashier?.name || detail.cashier?.email || '—'} />
              <Info label="Visit date" value={formatDate(detail.visitDate)} />
              <Info label="Method" value={String(detail.paymentMethod || '').replace(/_/g, ' ')} />
              <Info label="Received" value={money(detail.amountReceived, detail.currency)} />
              <Info label="Change" value={money(detail.changeGiven, detail.currency)} />
            </div>

            <TableWrap>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>Item</Th><Th>Qty</Th><Th>Unit</Th><Th>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items || []).map((item, index) => (
                    <tr key={`${item.ticketTypeId}-${index}`} className="border-b border-slate-100 dark:border-slate-800/60">
                      <Td>{item.name}</Td>
                      <Td>{item.quantity}</Td>
                      <Td>{money(item.unitPrice, detail.currency)}</Td>
                      <Td>{money(item.lineTotal, detail.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            {(detail.tickets || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tickets.map((ticket) => (
                  <span key={ticket.ticketNo} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                    {ticket.ticketNo}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
              <Button variant="soft" icon="ph-arrows-counter-clockwise" onClick={() => reprintTickets(detail)} disabled={busy === 'print'}>
                Reprint tickets
              </Button>
              <Button icon="ph-printer" onClick={() => printReceipt(detail)}>Print receipt</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(refunding)} onClose={() => setRefunding(null)} title="Refund a counter sale" icon="ph-arrow-u-up-left">
        {refunding && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Sale <span className="font-mono">{refunding.saleRef}</span> · {money(refunding.total, refunding.currency || currency)} ·
              {' '}{refunding.quantity} ticket(s)
            </p>
            <Field label={`Amount to refund (${refunding.currency || currency})`} hint="Leave blank to refund the full amount.">
              <input type="number" min="0" step="0.01" value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)} className={inputClass}
                placeholder={Number(refunding.total).toFixed(2)} />
            </Field>
            <Field label="Reason">
              <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}
                placeholder="Visitor left before entry" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRefunding(null)}>Cancel</Button>
              <Button variant="danger" icon="ph-arrow-u-up-left" onClick={submitRefund}
                disabled={busy === 'refund' || reason.trim().length < 3}>
                Refund
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value || '—'}</p>
    </div>
  );
}
