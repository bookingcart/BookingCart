import { useCallback, useEffect, useState } from 'react';
import { addDays, cinemaGet, downloadCinemaReport, money, shortDate, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, Notice, StatTile, cx, inputCls } from './ui.jsx';

const TABS = [
  { id: 'movies', label: 'By movie', icon: 'ph-film-slate' },
  { id: 'showtimes', label: 'By screening', icon: 'ph-calendar-blank' },
  { id: 'category', label: 'By seat category', icon: 'ph-armchair' },
  { id: 'channel', label: 'By channel', icon: 'ph-storefront' },
];

function Table({ columns, rows, emptyLabel }) {
  if (!rows.length) {
    return <p className="py-8 text-center text-xs font-semibold text-slate-400">{emptyLabel}</p>;
  }
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
            {columns.map((column) => (
              <th key={column.key} className={cx('px-5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400', column.align === 'right' && 'text-right')}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              {columns.map((column) => (
                <td key={column.key} className={cx('px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300', column.align === 'right' && 'text-right tabular-nums', column.strong && 'font-black text-slate-900 dark:text-white')}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CinemaReportsPanel({ attractionId, headers, currency = 'USD' }) {
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('movies');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('reports', { attractionId, from: range.from, to: range.to }, headers);
    if (payload.ok) { setReport(payload.report); setError(''); }
    else setError(payload.error || 'Could not build the report');
    setLoading(false);
  }, [attractionId, headers, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    setExporting(true);
    try {
      await downloadCinemaReport({ attractionId, report: tab, from: range.from, to: range.to, headers });
    } catch (downloadError) {
      setError(downloadError.message || 'Export failed');
    }
    setExporting(false);
  };

  if (loading && !report) {
    return <div className="h-56 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }

  const revenue = (report?.byMovie || []).reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const seatsSold = (report?.byMovie || []).reduce((sum, row) => sum + Number(row.seats || 0), 0);
  const bookings = (report?.byMovie || []).reduce((sum, row) => sum + Number(row.bookings || 0), 0);
  const scanRate = report?.attendance?.ticketsIssued
    ? Math.round((report.attendance.ticketsScanned / report.attendance.ticketsIssued) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <Card bodyClass="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">From</span>
            <input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className={cx(inputCls, 'w-auto py-2')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">To</span>
            <input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className={cx(inputCls, 'w-auto py-2')} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setRange({ from: todayISO(), to: todayISO() })}>Today</Button>
            <Button size="sm" variant="ghost" onClick={() => setRange({ from: addDays(todayISO(), -6), to: todayISO() })}>7 days</Button>
            <Button size="sm" variant="ghost" onClick={() => setRange({ from: addDays(todayISO(), -29), to: todayISO() })}>30 days</Button>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            <Button size="sm" icon={exporting ? 'ph-circle-notch' : 'ph-download-simple'} onClick={download} disabled={exporting} className={exporting ? '[&>i]:animate-spin' : ''}>
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue" value={money(revenue, currency)} hint="Paid bookings in range" icon="ph-currency-circle-dollar" tone="green" />
        <StatTile label="Seats sold" value={seatsSold} hint={`${bookings} bookings`} icon="ph-armchair" tone="sky" />
        <StatTile label="Tickets issued" value={report?.attendance?.ticketsIssued || 0} hint={`${report?.attendance?.admissions || 0} admissions`} icon="ph-ticket" />
        <StatTile label="Scanned at door" value={`${scanRate}%`} hint={`${report?.attendance?.ticketsScanned || 0} admitted`} icon="ph-qr-code" tone={scanRate > 0 ? 'green' : 'slate'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black transition-colors',
              tab === entry.id ? 'bg-green-600 text-white shadow-sm shadow-green-600/25' : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            )}
          >
            <i className={cx('ph', entry.icon)} /> {entry.label}
          </button>
        ))}
      </div>

      <Card bodyClass="px-0 py-2">
        {tab === 'movies' && (
          <Table
            emptyLabel="No paid bookings in this range yet."
            columns={[
              { key: 'movie', label: 'Movie', strong: true, render: (row) => row.movie || '—' },
              { key: 'bookings', label: 'Bookings', align: 'right' },
              { key: 'seats', label: 'Seats', align: 'right' },
              { key: 'revenue', label: `Revenue (${currency})`, align: 'right', render: (row) => money(row.revenue, currency) },
            ]}
            rows={report?.byMovie || []}
          />
        )}

        {tab === 'showtimes' && (
          <Table
            emptyLabel="No screenings with sales in this range."
            columns={[
              { key: 'movie', label: 'Movie', strong: true, render: (row) => row.movie || '—' },
              { key: 'showDate', label: 'Date', render: (row) => shortDate(row.showDate) },
              { key: 'slotLabel', label: 'Time' },
              { key: 'seats', label: 'Seats', align: 'right' },
              { key: 'revenue', label: `Revenue (${currency})`, align: 'right', render: (row) => money(row.revenue, currency) },
            ]}
            rows={report?.byShowtime || []}
          />
        )}

        {tab === 'category' && (
          <Table
            emptyLabel="No tickets issued in this range."
            columns={[
              { key: 'label', label: 'Seat category', strong: true },
              { key: 'tickets', label: 'Tickets', align: 'right' },
              { key: 'revenue', label: `Revenue (${currency})`, align: 'right', render: (row) => money(row.revenue, currency) },
            ]}
            rows={report?.byCategory || []}
          />
        )}

        {tab === 'channel' && (
          <Table
            emptyLabel="No paid bookings in this range."
            columns={[
              { key: 'channel', label: 'Channel', strong: true, render: (row) => (row.channel === 'pos' ? 'Box office' : 'Online') },
              { key: 'bookings', label: 'Bookings', align: 'right' },
              { key: 'revenue', label: `Revenue (${currency})`, align: 'right', render: (row) => money(row.revenue, currency) },
            ]}
            rows={report?.channels || []}
          />
        )}
      </Card>

      <p className="px-1 text-[11px] font-medium text-slate-400">
        “Seats sold” counts paid reservations; “Scanned at door” counts admissions actually validated, so the two
        deliberately differ before the doors open.
      </p>
    </div>
  );
}
