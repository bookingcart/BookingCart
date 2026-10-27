import { useCallback, useEffect, useMemo, useState } from 'react';
import { ownerGet, downloadReport, money, formatDate, todayISO, addDays } from '../../lib/ticketingClient.js';
import {
  Button, DateRange, EmptyState, ErrorNote, Loading, Notice, Panel, StatCard,
  TableWrap, Td, Th,
} from './TicketingShared.jsx';

const EXPORTS = [
  ['daily', 'Daily sales'],
  ['ticket-type', 'By ticket type'],
  ['slot', 'By entry slot'],
  ['promo', 'By promo code'],
  ['admissions', 'By visit date'],
];

export default function TicketReportsPanel({ attractionId, headers, currency, canExport }) {
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    const payload = await ownerGet('reports', { attractionId, from: range.from, to: range.to }, headers);
    if (payload.ok) { setData(payload); setError(''); } else setError(payload.error || 'Could not load reports');
    setLoading(false);
  }, [attractionId, headers, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const days = data?.byDay || [];
    const gross = days.reduce((sum, row) => sum + row.gross, 0);
    const refunds = days.reduce((sum, row) => sum + row.refunds, 0);
    const fees = days.reduce((sum, row) => sum + row.fees, 0);
    const taxes = days.reduce((sum, row) => sum + row.taxes, 0);
    const tickets = days.reduce((sum, row) => sum + row.tickets, 0);
    return { gross, refunds, fees, taxes, tickets, net: gross - refunds - fees };
  }, [data]);

  const exportCsv = async (report) => {
    setBusy(report);
    setNotice('');
    try {
      await downloadReport({ attractionId, report, from: range.from, to: range.to, headers });
      setNotice('Report exported as CSV.');
    } catch (err) {
      setError(err.message || 'Could not export this report');
    }
    setBusy('');
  };

  if (loading && !data) return <Loading label="Building reports…" />;

  const admissionsRows = data?.admissionsByVisitDate || [];
  const peakAdmissions = Math.max(1, ...admissionsRows.map((row) => row.admissions));

  return (
    <div className="space-y-5">
      <Panel
        title="Ticket reports"
        icon="ph-chart-line-up"
        subtitle={data?.range ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : ''}
        actions={(
          <>
            <Button variant="soft" size="sm" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            {canExport && EXPORTS.map(([key, label]) => (
              <Button key={key} variant="ghost" size="sm" icon="ph-download-simple"
                disabled={busy === key} onClick={() => exportCsv(key)}>
                {busy === key ? 'Exporting…' : label}
              </Button>
            ))}
          </>
        )}
      >
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <div className="mt-3">
          <ErrorNote message={error} onRetry={load} />
          <Notice onClose={() => setNotice('')}>{notice}</Notice>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross sales" value={money(totals.gross, currency)} icon="ph-currency-circle-dollar" />
        <StatCard label="Net revenue" value={money(totals.net, currency)} icon="ph-trend-up" tone="green" hint="Gross − refunds − fees" />
        <StatCard label="Refunds" value={money(totals.refunds, currency)} icon="ph-arrow-u-up-left" tone="rose" />
        <StatCard label="Tickets sold" value={totals.tickets} icon="ph-ticket" tone="sky" />
        <StatCard label="Service fees" value={money(totals.fees, currency)} icon="ph-receipt" tone="amber" />
        <StatCard label="Taxes" value={money(totals.taxes, currency)} icon="ph-percent" tone="violet" />
        <StatCard label="Cancellation rate" value={`${data?.cancellations?.rate ?? 0}%`} icon="ph-x-circle" tone="rose"
          hint={`${data?.cancellations?.cancelled ?? 0} of ${data?.cancellations?.total ?? 0} bookings`} />
        <StatCard label="Unused tickets" value={data?.unusedTickets?.tickets ?? 0} icon="ph-hourglass-medium" tone="amber"
          hint={`${data?.unusedTickets?.admissions ?? 0} unused admissions`} />
      </div>

      <ReportTable
        title="Sales by ticket type"
        icon="ph-ticket"
        rows={data?.byTicketType || []}
        empty="No paid sales in this range."
        columns={[
          ['Ticket type', (row) => row.label],
          ['Tickets', (row) => row.tickets],
          ['Admissions', (row) => row.admissions],
          ['Gross', (row) => money(row.gross, currency)],
        ]}
      />

      <ReportTable
        title="Sales by day"
        icon="ph-calendar"
        rows={data?.byDay || []}
        empty="No sales in this range."
        columns={[
          ['Date', (row) => formatDate(row.label)],
          ['Tickets', (row) => row.tickets],
          ['Gross', (row) => money(row.gross, currency)],
          ['Refunds', (row) => money(row.refunds, currency)],
          ['Fees', (row) => money(row.fees, currency)],
          ['Taxes', (row) => money(row.taxes, currency)],
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportTable
          title="Sales by entry slot"
          icon="ph-clock"
          rows={data?.bySlot || []}
          empty="No slot sales in this range."
          columns={[
            ['Entry time', (row) => row.label],
            ['Tickets', (row) => row.tickets],
            ['Gross', (row) => money(row.gross, currency)],
          ]}
        />
        <ReportTable
          title="Promotional performance"
          icon="ph-tag"
          rows={data?.promos || []}
          empty="No promo codes used in this range."
          columns={[
            ['Code', (row) => row.label],
            ['Orders', (row) => row.orders],
            ['Discount', (row) => money(row.discount, currency)],
            ['Revenue', (row) => money(row.revenue, currency)],
          ]}
        />
      </div>

      <Panel title="Admissions by visit date" icon="ph-user-check"
        subtitle="Admissions sold against the number actually checked in.">
        {!admissionsRows.length ? (
          <EmptyState icon="ph-user-check" title="No admissions yet" message="Issue tickets for visit dates in this range." />
        ) : (
          <div className="space-y-2">
            {admissionsRows.map((row) => {
              const percent = Math.round((row.checkedIn / Math.max(1, row.admissions)) * 100);
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-bold text-slate-500">{formatDate(row.label)}</span>
                  <div className="h-4 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/80"
                      style={{ width: `${Math.max(2, Math.round((row.admissions / peakAdmissions) * 100))}%` }}
                    />
                  </div>
                  <span className="w-40 shrink-0 text-right text-[11px] font-bold text-slate-500">
                    {row.checkedIn}/{row.admissions} in ({percent}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ReportTable({ title, icon, rows, columns, empty }) {
  return (
    <Panel title={title} icon={icon}>
      {!rows.length ? (
        <EmptyState icon={icon} title="Nothing to show" message={empty} />
      ) : (
        <TableWrap>
          <table className="min-w-full">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>{columns.map(([label]) => <Th key={label}>{label}</Th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  {columns.map(([label, render], position) => (
                    <Td key={label} className={position === 0 ? 'font-semibold' : 'font-bold'}>{render(row)}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Panel>
  );
}
