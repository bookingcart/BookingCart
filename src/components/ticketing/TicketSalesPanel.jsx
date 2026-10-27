import { useCallback, useEffect, useMemo, useState } from 'react';
import SaleDetailModal from './SaleDetailModal.jsx';
import {
  salesGet, salesPost, checkoutGet, money, formatDate, formatDateTime, todayISO, addDays,
} from '../../lib/ticketingClient.js';
import {
  Button, EmptyState, ErrorNote, Field, inputClass, Loading, Modal, Notice, Panel,
  StatusBadge, TableWrap, Td, Th,
} from './TicketingShared.jsx';

const SORTS = [
  ['created_at', 'Purchase date'],
  ['visit_date', 'Visit date'],
  ['total', 'Total'],
  ['customer_name', 'Visitor'],
  ['status', 'Booking status'],
];

const BLANK_FILTERS = {
  search: '',
  status: '',
  paymentStatus: '',
  ticketTypeId: '',
  from: addDays(todayISO(), -30),
  to: todayISO(),
  visitFrom: '',
  visitTo: '',
  sort: 'created_at',
  direction: 'desc',
  page: 1,
  pageSize: 25,
};

export default function TicketSalesPanel({ attractionId, headers, currency, role }) {
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);

  const canManage = role === 'manager' || role === 'owner';

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    const payload = await salesGet('sales', { attractionId, ...filters }, headers);
    if (payload.ok) { setData(payload); setError(''); } else setError(payload.error || 'Could not load ticket sales');
    setLoading(false);
  }, [attractionId, headers, filters]);

  useEffect(() => { load(); }, [load]);

  const patch = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  const toggleSort = (key) => setFilters((current) => ({
    ...current,
    sort: key,
    direction: current.sort === key && current.direction === 'desc' ? 'asc' : 'desc',
    page: 1,
  }));

  const submitSearch = (event) => {
    event.preventDefault();
    patch('search', search);
  };

  const summary = useMemo(() => data?.totals || { revenue: 0, pending: 0, refunded: 0, tickets: 0 }, [data]);
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };

  const refresh = () => load();

  return (
    <div className="space-y-5">
      <Panel
        title="Ticket sales & bookings"
        icon="ph-receipt"
        subtitle={`${pagination.total} booking(s) · ${money(summary.revenue, currency)} collected · ${money(summary.pending, currency)} pending`}
        actions={(
          <>
            {canManage && (
              <Button variant="soft" size="sm" icon="ph-user-plus" onClick={() => setManualOpen(true)}>
                Manual admission
              </Button>
            )}
            <Button variant="soft" size="sm" icon="ph-arrows-clockwise" onClick={refresh}>Refresh</Button>
          </>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        <form onSubmit={submitSearch} className="grid gap-3 lg:grid-cols-4">
          <Field label="Search" className="lg:col-span-2">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Booking ref, visitor name, email or ticket number"
              />
              <Button size="sm" icon="ph-magnifying-glass" type="submit">Find</Button>
            </div>
          </Field>
          <Field label="Booking status">
            <select className={inputClass} value={filters.status} onChange={(event) => patch('status', event.target.value)}>
              <option value="">All bookings</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending_payment">Pending payment</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">Partially refunded</option>
              <option value="expired">Expired</option>
            </select>
          </Field>
          <Field label="Payment status">
            <select className={inputClass} value={filters.paymentStatus} onChange={(event) => patch('paymentStatus', event.target.value)}>
              <option value="">Any payment</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">Partially refunded</option>
            </select>
          </Field>
          <Field label="Purchase from">
            <input type="date" className={inputClass} value={filters.from}
              onChange={(event) => patch('from', event.target.value)} />
          </Field>
          <Field label="Purchase to">
            <input type="date" className={inputClass} value={filters.to}
              onChange={(event) => patch('to', event.target.value)} />
          </Field>
          <Field label="Visit from">
            <input type="date" className={inputClass} value={filters.visitFrom}
              onChange={(event) => patch('visitFrom', event.target.value)} />
          </Field>
          <Field label="Visit to">
            <input type="date" className={inputClass} value={filters.visitTo}
              onChange={(event) => patch('visitTo', event.target.value)} />
          </Field>
          <Field label="Sort by">
            <select className={inputClass} value={filters.sort} onChange={(event) => patch('sort', event.target.value)}>
              {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <select className={inputClass} value={filters.direction} onChange={(event) => patch('direction', event.target.value)}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </Field>
          <Field label="Rows">
            <select className={inputClass} value={filters.pageSize} onChange={(event) => patch('pageSize', Number(event.target.value))}>
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
            </select>
          </Field>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip label="Gross" value={money(summary.revenue, currency)} tone="emerald" />
          <Chip label="Pending" value={money(summary.pending, currency)} tone="amber" />
          <Chip label="Refunded" value={money(summary.refunded, currency)} tone="rose" />
          <Chip label="Tickets" value={String(summary.tickets)} tone="sky" />
        </div>
      </Panel>

      <Panel title="Sales ledger" icon="ph-list-magnifying-glass">
        {loading && !data ? <Loading label="Loading sales…" /> : !data?.sales?.length ? (
          <EmptyState icon="ph-receipt" title="No bookings match these filters"
            message="Try a wider date range or clear the search term." />
        ) : (
          <>
            <TableWrap>
              <table className="min-w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <Th>Booking</Th>
                    <Th>Ticket numbers</Th>
                    <Th>Visitor</Th>
                    <Th>Type</Th>
                    <Th>Qty</Th>
                    <Th>Visit</Th>
                    <Th>Entry</Th>
                    <Th>Total</Th>
                    <Th>Payment</Th>
                    <Th>Booking</Th>
                    <Th>Validation</Th>
                    <Th>Purchased</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <Td className="font-mono text-xs font-bold whitespace-nowrap">{sale.bookingRef}</Td>
                      <Td className="font-mono text-[11px] text-slate-500 max-w-[180px] truncate" >
                        {sale.ticketNumbers || '—'}
                      </Td>
                      <Td>
                        <p className="font-bold text-slate-900 dark:text-white">{sale.customerName || '—'}</p>
                        <p className="text-[11px] text-slate-500">{sale.customerEmail || '—'}</p>
                      </Td>
                      <Td className="text-xs max-w-[160px]">{sale.ticketTypes || '—'}</Td>
                      <Td className="font-bold">{sale.quantity}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(sale.visitDate)}</Td>
                      <Td className="text-xs whitespace-nowrap">{sale.slotLabel || 'All day'}</Td>
                      <Td className="font-bold whitespace-nowrap">{money(sale.total, sale.currency || currency)}</Td>
                      <Td><StatusBadge status={sale.paymentStatus} /></Td>
                      <Td><StatusBadge status={sale.status} /></Td>
                      <Td><StatusBadge status={sale.validationStatus} /></Td>
                      <Td className="whitespace-nowrap text-xs">{formatDateTime(sale.createdAt)}</Td>
                      <Td>
                        <Button size="sm" variant="ghost" icon="ph-arrow-right" onClick={() => setSelectedId(sale.id)}>
                          View
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
              <span>Page {pagination.page} of {pagination.pages} · {pagination.total} booking(s)</span>
              <div className="flex gap-2">
                <Button variant="soft" size="sm" icon="ph-caret-left" disabled={pagination.page <= 1}
                  onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button>
                <Button variant="soft" size="sm" icon="ph-caret-right" disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      {selectedId && (
        <SaleDetailModal
          attractionId={attractionId}
          headers={headers}
          orderId={selectedId}
          role={role}
          onClose={() => setSelectedId(null)}
          onChanged={() => { load(); setNotice('Booking updated.'); }}
        />
      )}

      {manualOpen && (
        <ManualAdmissionModal
          attractionId={attractionId}
          headers={headers}
          currency={currency}
          onClose={() => setManualOpen(false)}
          onDone={(message) => { setManualOpen(false); setNotice(message); load(); }}
        />
      )}
    </div>
  );
}

function Chip({ label, value, tone }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
    sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
  };
  return (
    <span className={`inline-flex items-baseline gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${tones[tone] || tones.sky}`}>
      <span className="uppercase tracking-wide text-[10px] opacity-70">{label}</span>
      {value}
    </span>
  );
}

function ManualAdmissionModal({ attractionId, headers, currency, onClose, onDone }) {
  const [visitDate, setVisitDate] = useState(todayISO());
  const [slotId, setSlotId] = useState(0);
  const [slots, setSlots] = useState([]);
  const [available, setAvailable] = useState([]);
  const [customerName, setCustomerName] = useState('Walk-in guest');
  const [customerEmail, setCustomerEmail] = useState('');
  const [reason, setReason] = useState('Complimentary admission approved at the gate');
  const [quantities, setQuantities] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const payload = await checkoutGet('availability', { attractionId, date: visitDate });
      if (!active) return;
      if (payload.ok) {
        setAvailable(payload.types || []);
        setSlots(payload.slots || []);
      }
    })();
    return () => { active = false; };
  }, [attractionId, visitDate]);

  const setQuantity = (id, value) => setQuantities((current) => ({
    ...current,
    [id]: Math.max(0, Math.min(50, Number(value) || 0)),
  }));

  const chosen = available
    .map((type) => ({ type, quantity: Number(quantities[type.id] || 0) }))
    .filter((entry) => entry.quantity > 0);

  const admissions = chosen.reduce((sum, entry) => sum + entry.quantity * (entry.type.admissions || 1), 0);

  const submit = async () => {
    if (!chosen.length) { setError('Choose at least one ticket type and quantity.'); return; }
    setSaving(true);
    setError('');
    const payload = await salesPost('manual-admission', {
      attractionId,
      visitDate,
      slotId: slotId || 0,
      customerName,
      customerEmail,
      reason,
      items: chosen.map((entry) => ({ ticketTypeId: entry.type.id, quantity: entry.quantity })),
    }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not record this admission'); return; }
    onDone(`Manual admission recorded — ${payload.tickets?.length || 0} ticket(s) issued.`);
  };

  return (
    <Modal open onClose={onClose} wide icon="ph-user-plus" title="Record manual or complimentary admission">
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Visit date">
          <input type="date" className={inputClass} value={visitDate}
            onChange={(event) => { setVisitDate(event.target.value); setQuantities({}); }} />
        </Field>
        <Field label="Entry time slot" hint={slots.length ? 'Slots configured for this date.' : 'No time slots for this date.'}>
          <select className={inputClass} value={slotId} onChange={(event) => setSlotId(Number(event.target.value))}>
            <option value={0}>All day</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label || slot.startTime}{slot.startTime ? ` · ${slot.startTime}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visitor name">
          <input className={inputClass} value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
        </Field>
        <Field label="Visitor email" hint="Optional — an email sends the digital ticket.">
          <input className={inputClass} type="email" value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)} placeholder="guest@example.com" />
        </Field>
        <Field label="Reason / notes" className="sm:col-span-2">
          <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Ticket types</h4>
        {!available.length ? (
          <p className="text-sm text-slate-500 font-semibold">No ticket types are published for this date.</p>
        ) : (
          <div className="space-y-2">
            {available.map((type) => (
              <div key={type.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{type.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {money(type.price, type.currency || currency)} · {type.admissions} admission(s) ·
                    {typeof type.remaining === 'number' ? ` ${type.remaining} left` : ' unlimited'}
                  </p>
                </div>
                <input
                  type="number"
                  min="0"
                  max={Math.min(type.maxPerOrder || 50, typeof type.remaining === 'number' ? type.remaining : 50)}
                  value={quantities[type.id] || 0}
                  onChange={(event) => setQuantity(type.id, event.target.value)}
                  className={`${inputClass} w-20 text-center`}
                  disabled={!type.available}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          {admissions} admission(s) · complimentary (no charge)
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon="ph-check" disabled={saving} onClick={submit}>
            {saving ? 'Recording…' : 'Record admission'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
