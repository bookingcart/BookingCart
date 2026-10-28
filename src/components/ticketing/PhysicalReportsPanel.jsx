import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, downloadPosSales, formatDate, money, posGet, todayISO } from '../../lib/ticketingClient.js';
import {
  Badge, Button, DateRange, EmptyState, ErrorNote, Field, Panel, StatCard, TableWrap, Td, Th, inputClass,
} from './TicketingShared.jsx';

const CHANNELS = [
  { value: '', label: 'All channels' },
  { value: 'pos', label: 'Physical (ticket office)' },
  { value: 'online', label: 'Online' },
];

// Physical + online reporting on one screen, because they share one inventory.
// Generated, printed, sold and used tickets are reported as four separate
// numbers — they are different events and must never be added together.
export default function PhysicalReportsPanel({ attractionId, headers, context }) {
  const currency = context?.attraction?.currency || 'USD';

  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [filters, setFilters] = useState({ channel: '', paymentMethod: '', ticketTypeId: '', batchId: '', cashier: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await posGet('reports', { attractionId, ...range, ...filters }, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load reports'); return; }
    setData(payload);
    setError('');
  }, [attractionId, headers, range, filters]);

  useEffect(() => { load(); }, [load]);

  const channelTotals = useMemo(() => {
    const map = { online: { tickets: 0, gross: 0, refunds: 0 }, physical: { tickets: 0, gross: 0, refunds: 0 } };
    for (const row of data?.byChannel || []) {
      const key = row.channel === 'online' ? 'online' : 'physical';
      map[key].tickets += row.tickets;
      map[key].gross += row.gross;
      map[key].refunds += row.refunds;
    }
    return map;
  }, [data]);

  const states = data?.ticketStates || {};
  const shifts = data?.shifts || {};
  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily || []).map((row) => row.gross)),
    [data]
  );

  const exportCsv = async () => {
    try {
      await downloadPosSales({ attractionId, from: range.from, to: range.to, headers, filters });
    } catch (exportError) {
      setError(exportError.message);
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="Physical ticket reports"
        icon="ph-chart-line-up"
        subtitle="Both channels, one set of capacity rules. Printed does not mean sold, and sold does not mean admitted."
        actions={<Badge tone="slate">{formatDate(range.from)} – {formatDate(range.to)}</Badge>}
      >
        <div className="flex flex-wrap items-end gap-2">
          <DateRange from={range.from} to={range.to} onChange={setRange} label="" />
          <Field label="Channel">
            <select value={filters.channel} onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value }))}
              className={`${inputClass} w-[170px] py-1.5 text-xs`}>
              {CHANNELS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </Field>
          <Field label="Ticket type">
            <select value={filters.ticketTypeId} onChange={(event) => setFilters((current) => ({ ...current, ticketTypeId: event.target.value }))}
              className={`${inputClass} w-[170px] py-1.5 text-xs`}>
              <option value="">All types</option>
              {(context?.types || []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </Field>
          <Field label="Payment method">
            <select value={filters.paymentMethod} onChange={(event) => setFilters((current) => ({ ...current, paymentMethod: event.target.value }))}
              className={`${inputClass} w-[150px] py-1.5 text-xs`}>
              <option value="">All methods</option>
              {(context?.paymentMethods || []).map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </Field>
          <Field label="Batch">
            <select value={filters.batchId} onChange={(event) => setFilters((current) => ({ ...current, batchId: event.target.value }))}
              className={`${inputClass} w-[170px] py-1.5 text-xs`}>
              <option value="">All batches</option>
              {(context?.batches || []).map((batch) => <option key={batch.id} value={batch.id}>{batch.batchRef}</option>)}
            </select>
          </Field>
          <Field label="Cashier">
            <input value={filters.cashier} onChange={(event) => setFilters((current) => ({ ...current, cashier: event.target.value }))}
              className={`${inputClass} w-[170px] py-1.5 text-xs`} placeholder="cashier@example.com" />
          </Field>
          <Button size="sm" variant="soft" icon="ph-arrows-clockwise" onClick={load}>Apply</Button>
          <Button size="sm" variant="ghost" icon="ph-download-simple" onClick={exportCsv}>CSV</Button>
        </div>
      </Panel>

      <ErrorNote message={error} onRetry={load} />

      {loading && !data ? (
        <p className="py-10 text-center text-sm font-bold text-slate-400">Building reports…</p>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Physical tickets sold" value={channelTotals.physical.tickets}
              hint={money(channelTotals.physical.gross, currency)} icon="ph-storefront" tone="emerald" />
            <StatCard label="Online tickets sold" value={channelTotals.online.tickets}
              hint={money(channelTotals.online.gross, currency)} icon="ph-globe" tone="sky" />
            <StatCard label="Admissions recorded" value={states.admissions || 0}
              hint={`${states.used || 0} ticket(s) entered`} icon="ph-door-open" tone="violet" />
            <StatCard label="Unsold inventory" value={states.unsold || 0}
              hint={`${states.expired || 0} expired · ${states.voided || 0} voided`} icon="ph-stack" tone="amber" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Generated" value={states.generated || 0} icon="ph-ticket" tone="slate" />
            <StatCard label="Printed" value={states.printed || 0} icon="ph-printer" tone="sky" />
            <StatCard label="Sold" value={states.sold || 0} icon="ph-shopping-cart" tone="green" />
            <StatCard label="Used" value={states.used || 0} icon="ph-check-fat" tone="violet" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel title="Revenue by channel" icon="ph-chart-bar">
              {!(data.byChannel || []).length ? (
                <EmptyState icon="ph-chart-bar" title="No sales in this period" message="Adjust the date range or filters." />
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <Th>Channel</Th><Th>Tickets</Th><Th>Gross</Th><Th>Refunds</Th><Th>Fees</Th><Th>Net</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byChannel.map((row) => (
                        <tr key={row.channel} className="border-b border-slate-100 dark:border-slate-800/60">
                          <Td><Badge tone={row.channel === 'online' ? 'sky' : 'emerald'}>{row.channel}</Badge></Td>
                          <Td>{row.tickets}</Td>
                          <Td className="whitespace-nowrap">{money(row.gross, currency)}</Td>
                          <Td className="whitespace-nowrap text-rose-600">{money(row.refunds, currency)}</Td>
                          <Td className="whitespace-nowrap">{money(row.fees, currency)}</Td>
                          <Td className="whitespace-nowrap font-bold">{money(row.net, currency)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Panel>

            <Panel title="Revenue by ticket category" icon="ph-tag">
              {!(data.byCategory || []).length ? (
                <EmptyState icon="ph-tag" title="No categories sold" message="Categories come from your ticket types." />
              ) : (
                <div className="space-y-2">
                  {data.byCategory.map((row) => (
                    <Bar key={row.category} label={row.category} value={money(row.gross, currency)}
                      count={`${row.tickets} ticket(s)`}
                      ratio={row.gross / Math.max(1, ...data.byCategory.map((entry) => entry.gross))} />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Payment methods" icon="ph-credit-card">
              {!(data.byPaymentMethod || []).length ? (
                <EmptyState icon="ph-credit-card" title="No payments recorded" message="Nothing was taken in this period." />
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <Th>Method</Th><Th>Sales</Th><Th>Tickets</Th><Th>Gross</Th><Th>Refunds</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPaymentMethod.map((row) => (
                        <tr key={row.method} className="border-b border-slate-100 dark:border-slate-800/60">
                          <Td><Badge tone="slate">{String(row.method).replace(/_/g, ' ')}</Badge></Td>
                          <Td>{row.sales}</Td>
                          <Td>{row.tickets}</Td>
                          <Td className="whitespace-nowrap">{money(row.gross, currency)}</Td>
                          <Td className="whitespace-nowrap text-rose-600">{money(row.refunds, currency)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Panel>

            <Panel title="Cashier performance" icon="ph-users-three"
              actions={(
                <div className="flex gap-1.5">
                  <Badge tone={shifts.discrepancies ? 'rose' : 'emerald'}>
                    {shifts.discrepancies || 0} discrepancy
                  </Badge>
                  <Badge tone="slate">{shifts.closed || 0} shifts closed</Badge>
                </div>
              )}
            >
              {!(data.byCashier || []).length ? (
                <EmptyState icon="ph-users-three" title="No cashier activity" message="Counter sales are attributed to the cashier who took them." />
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <Th>Cashier</Th><Th>Sales</Th><Th>Tickets</Th><Th>Gross</Th><Th>Of which cash</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCashier.map((row) => (
                        <tr key={row.cashier} className="border-b border-slate-100 dark:border-slate-800/60">
                          <Td className="text-xs truncate max-w-[180px]">{row.cashier}</Td>
                          <Td>{row.sales}</Td>
                          <Td>{row.tickets}</Td>
                          <Td className="whitespace-nowrap">{money(row.gross, currency)}</Td>
                          <Td className="whitespace-nowrap">{money(row.cash, currency)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <p className="mt-3 text-[11px] font-semibold text-slate-400">
                Net cash differences across closed shifts: {money(shifts.netDifference || 0, currency)}
              </p>
            </Panel>
          </div>

          <Panel title="Daily revenue" icon="ph-calendar">
            {!(data.daily || []).length ? (
              <EmptyState icon="ph-calendar" title="No daily activity" message="Pick a wider date range to see the trend." />
            ) : (
              <div className="space-y-1.5">
                {data.daily.map((row) => (
                  <div key={`${row.day}-${row.channel}`} className="flex items-center gap-3">
                    <span className="w-24 text-[11px] font-bold text-slate-500 whitespace-nowrap">{formatDate(row.day)}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.channel === 'online' ? 'bg-sky-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.max(2, (row.gross / maxDaily) * 100)}%` }}
                      />
                    </div>
                    <span className="w-28 text-right text-[11px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {money(row.gross, currency)}
                    </span>
                    <span className="w-20 text-right text-[10px] text-slate-400 whitespace-nowrap">{row.tickets} tickets</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Batch performance" icon="ph-stack"
            subtitle="Generated ≠ printed ≠ sold ≠ used. Only sold tickets were paid for.">
            {!(data.batches || []).length ? (
              <EmptyState icon="ph-stack" title="No batches yet" message="Create a batch to start tracking printed stock." />
            ) : (
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <Th>Batch</Th><Th>Visit</Th><Th>Status</Th><Th>Generated</Th><Th>Printed</Th>
                      <Th>Sold</Th><Th>Unsold</Th><Th>Voided</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.batches.map((batch) => (
                      <tr key={batch.id} className="border-b border-slate-100 dark:border-slate-800/60">
                        <Td>
                          <span className="block font-mono text-xs font-bold text-green-700 dark:text-green-400">{batch.batchRef}</span>
                          <span className="block text-[11px] text-slate-500 truncate max-w-[170px]">{batch.name}</span>
                        </Td>
                        <Td className="text-xs whitespace-nowrap">{formatDate(batch.visitDate)}</Td>
                        <Td><Badge tone={batch.status === 'archived' ? 'slate' : batch.status === 'closed' ? 'amber' : 'emerald'}>{batch.status}</Badge></Td>
                        <Td>{batch.generated}</Td>
                        <Td>{batch.printed}</Td>
                        <Td className="font-bold text-emerald-600">{batch.sold}</Td>
                        <Td>{batch.available}</Td>
                        <Td>{batch.voided}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Bar({ label, value, count, ratio }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.max(2, Math.min(1, ratio || 0) * 100)}%` }} />
      </div>
      <span className="w-28 text-right text-[11px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{value}</span>
      <span className="w-20 text-right text-[10px] text-slate-400 whitespace-nowrap">{count}</span>
    </div>
  );
}
