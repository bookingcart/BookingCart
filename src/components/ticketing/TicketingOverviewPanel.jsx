import { useCallback, useEffect, useState } from 'react';
import { ownerGet, formatDate, formatDateTime, money, todayISO, addDays } from '../../lib/ticketingClient.js';
import {
  Button, DateRange, EmptyState, ErrorNote, Field, inputClass, Loading, Panel,
  StatCard, StatusBadge, TableWrap, Td, Th,
} from './TicketingShared.jsx';

export default function TicketingOverviewPanel({ attractionId, headers, onNavigate }) {
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [types, setTypes] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    setError('');
    const [overview, typeData] = await Promise.all([
      ownerGet('overview', { attractionId, from: range.from, to: range.to, ticketTypeId }, headers),
      ownerGet('ticket-types', { attractionId }, headers),
    ]);
    if (overview.ok) setData(overview);
    else setError(overview.error || 'Could not load the overview');
    if (typeData.ok) setTypes(typeData.ticketTypes || []);
    setLoading(false);
  }, [attractionId, headers, range.from, range.to, ticketTypeId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Loading label="Loading ticketing overview…" />;
  if (error && !data) return <ErrorNote message={error} onRetry={load} />;

  const stats = data?.stats || {};
  const currency = data?.attraction?.currency || 'USD';
  const series = data?.series || [];
  const peak = Math.max(1, ...series.map((entry) => entry.revenue));

  return (
    <div className="space-y-5">
      <Panel
        title="Ticketing overview"
        icon="ph-chart-pie-slice"
        subtitle={data?.range ? `Showing ${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : ''}
        actions={<Button variant="soft" size="sm" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>}
      >
        <div className="flex flex-wrap items-end gap-3">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <Field label="Ticket type">
            <select value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)} className={`${inputClass} w-[190px]`}>
              <option value="">All ticket types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorNote message={error} onRetry={load} />
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tickets sold" value={stats.ticketsSold ?? 0} icon="ph-ticket" hint={`${stats.admissionsSold ?? 0} admissions`} />
        <StatCard label="Sold today" value={stats.ticketsToday ?? 0} icon="ph-calendar-check" tone="sky" hint="Paid tickets issued today" />
        <StatCard label="Ticket revenue" value={money(stats.revenue, currency)} icon="ph-currency-circle-dollar" tone="green" hint={`Net ${money(stats.netRevenue, currency)}`} />
        <StatCard label="Pending payments" value={money(stats.pendingPayments, currency)} icon="ph-hourglass-medium" tone="amber" hint={`${stats.pendingBookings ?? 0} order(s) awaiting payment`} />
        <StatCard label="Confirmed bookings" value={stats.confirmedBookings ?? 0} icon="ph-check-circle" tone="green" />
        <StatCard label="Visitors checked in" value={stats.visitorsCheckedIn ?? 0} icon="ph-user-check" tone="sky" hint="Admissions scanned at entry" />
        <StatCard label="Tickets remaining" value={stats.ticketsRemaining ?? 0} icon="ph-stack" tone="violet" hint={`${stats.ticketsReserved ?? 0} held in checkouts`} />
        <StatCard label="Cancelled / refunded" value={stats.cancelledBookings ?? 0} icon="ph-arrow-u-up-left" tone="rose" hint={money(stats.refunded, currency) + ' refunded'} />
      </div>

      <Panel title="Revenue trend" icon="ph-chart-bar" subtitle="Paid revenue per sale day in the selected range.">
        {!series.length ? (
          <EmptyState icon="ph-chart-bar" title="No sales in this range" message="Adjust the dates or publish a ticket type to start selling." />
        ) : (
          <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1">
            {series.map((entry) => (
              <div key={entry.day} className="group flex min-w-[14px] flex-1 flex-col items-center justify-end gap-1">
                <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                  {money(entry.revenue, currency)}
                </span>
                <div
                  className="w-full rounded-t bg-green-500/80 group-hover:bg-green-600 transition-all"
                  style={{ height: `${Math.max(3, Math.round((entry.revenue / peak) * 130))}px` }}
                  title={`${entry.day}: ${money(entry.revenue, currency)} · ${entry.tickets} tickets`}
                />
                <span className="text-[9px] font-semibold text-slate-400">{entry.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Recent ticket sales"
          icon="ph-receipt"
          actions={<Button variant="ghost" size="sm" icon="ph-arrow-right" onClick={() => onNavigate?.('sales')}>All sales</Button>}
        >
          {!data?.recentSales?.length ? (
            <EmptyState icon="ph-receipt" title="No sales yet" message="Sales appear here the moment a payment is confirmed." />
          ) : (
            <TableWrap>
              <table className="min-w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr><Th>Booking</Th><Th>Visitor</Th><Th>Visit</Th><Th>Total</Th><Th>Status</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <Td className="font-mono text-xs">{sale.bookingRef}</Td>
                      <Td>
                        <p className="font-bold text-slate-900 dark:text-white">{sale.customerName}</p>
                        <p className="text-[11px] text-slate-500">{sale.quantity} × {sale.ticketTypes || 'ticket'}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(sale.visitDate)}{sale.slotLabel ? ` · ${sale.slotLabel}` : ''}</Td>
                      <Td className="font-bold whitespace-nowrap">{money(sale.total, sale.currency || currency)}</Td>
                      <Td><StatusBadge status={sale.paymentStatus === 'paid' ? sale.status : sale.paymentStatus} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Upcoming visits" icon="ph-calendar-dots">
          {!data?.upcomingVisits?.length ? (
            <EmptyState icon="ph-calendar-blank" title="Nothing scheduled" message="Confirmed bookings with a future visit date show up here." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.upcomingVisits.map((visit) => (
                <li key={visit.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{visit.customerName}</p>
                    <p className="text-[11px] text-slate-500">{visit.bookingRef} · {visit.quantity} ticket(s)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black">{formatDate(visit.visitDate)}</p>
                    <p className="text-[11px] text-slate-500">
                      {visit.slotLabel || 'All day'} · {visit.admissionsUsed}/{visit.admissionsTotal} in
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent validations" icon="ph-qr-code" subtitle="The latest scans at the gate.">
        {!data?.recentValidations?.length ? (
          <EmptyState icon="ph-qr-code" title="No validations yet" message="Validation results from the QR desk will appear here." />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr><Th>Ticket</Th><Th>Result</Th><Th>Visitor</Th><Th>Staff</Th><Th>When</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentValidations.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="font-mono text-xs">{entry.ticketNumber}</Td>
                    <Td>
                      <span className={`text-xs font-black uppercase ${entry.result === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {entry.result === 'success' ? entry.action : (entry.reason || 'rejected').replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td>{entry.guestName || '—'}</Td>
                    <Td className="text-xs">{entry.staff || '—'}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(entry.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
