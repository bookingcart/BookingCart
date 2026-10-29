import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays, downloadTransportReport, formatDateTime, money, operatorGet, shortDate, todayISO, typeMeta,
} from '../../lib/transportClient.js';
import {
  Empty, ErrorNote, Field, Loading, Note, Panel, StatCard, Table, btn, inputCls,
} from './ConsoleKit.jsx';

const ACTIONS = {
  route_create: 'Route created',
  route_update: 'Route updated',
  route_status: 'Route status changed',
  vehicle_create: 'Vehicle added',
  vehicle_update: 'Vehicle updated',
  seat_layout_save: 'Seat map saved',
  departure_create: 'Departure scheduled',
  departure_update: 'Departure updated',
  departure_cancel: 'Departure cancelled',
  booking_settle: 'Booking settled',
  booking_refund: 'Booking refunded',
  pos_sale: 'Counter sale',
  staff_save: 'Staff saved',
  staff_remove: 'Staff removed',
  settings_save: 'Settings saved',
};

/** Revenue, route performance, occupancy and the audit trail in one place. */
export default function OperatorReportsTab({ operatorId, headers }) {
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('report', operatorId, { from: range.from, to: range.to }, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not build the report'); return; }
    setError('');
    setData(result);
  }, [operatorId, authHeaders, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadTransportReport({ operatorId, report: 'bookings', from: range.from, to: range.to, headers: authHeaders });
    } catch (failure) {
      setError(failure.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary || {};
  const currency = data?.currency || 'UGX';
  const maxDay = Math.max(1, ...(data?.byDay || []).map((entry) => Number(entry.revenue || 0)));

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Panel
        title="Reports"
        subtitle="Revenue, refunds and how full your vehicles actually run"
        actions={(
          <>
            <button type="button" className={btn.secondary} onClick={load}>
              <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Refresh
            </button>
            <button type="button" className={btn.primary} onClick={exportCsv} disabled={exporting}>
              {exporting ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-download-simple" aria-hidden="true" />}
              Export CSV
            </button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From">
            <input type="date" value={range.from} onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={range.to} onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))} className={inputCls} />
          </Field>
          <div className="flex items-end gap-2">
            {[['7 days', 7], ['30 days', 30], ['90 days', 90]].map(([label, days]) => (
              <button
                key={label}
                type="button"
                className={btn.secondary}
                onClick={() => setRange({ from: addDays(todayISO(), -days), to: todayISO() })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {loading && !data ? (
        <Loading label="Crunching the numbers…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="ph-ticket" label="Bookings" value={summary.bookings ?? 0} hint={`${summary.tickets ?? 0} passengers`} />
            <StatCard icon="ph-wallet" label="Gross" value={money(summary.gross ?? 0, currency)} hint="Travel dates in range" tone="violet" />
            <StatCard icon="ph-arrow-u-up-left" label="Refunds" value={money(summary.refunds ?? 0, currency)} hint={`${summary.cancelled ?? 0} cancelled`} tone="rose" />
            <StatCard icon="ph-scales" label="Net" value={money(summary.net ?? 0, currency)} hint={`${summary.pending ?? 0} awaiting payment`} tone="sky" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Revenue by route" padded={false}>
              {(data?.byRoute || []).length === 0 ? (
                <p className="px-4 py-6 text-center text-xs font-semibold text-slate-400">No confirmed bookings in this range.</p>
              ) : (
                <Table head={['Route', 'Type', 'Tickets', 'Revenue']}>
                  {data.byRoute.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-2 py-2 font-bold text-slate-800 dark:text-slate-100">{entry.name}</td>
                      <td className="px-2 py-2 text-slate-500 dark:text-slate-400">
                        <i className={`ph ${typeMeta(entry.transport_type).icon} mr-1`} aria-hidden="true" />
                        {typeMeta(entry.transport_type).label}
                      </td>
                      <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{entry.tickets}</td>
                      <td className="px-2 py-2 font-black text-slate-900 dark:text-white">{money(entry.revenue, currency)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            <Panel title="Revenue by day">
              {(data?.byDay || []).length === 0 ? (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">Nothing sold yet in this range.</p>
              ) : (
                <div className="space-y-2">
                  {data.byDay.map((entry) => (
                    <div key={entry.date} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[11px] font-bold text-slate-400">{shortDate(entry.date)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, Math.round((Number(entry.revenue) / maxDay) * 100))}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-[11px] font-black text-slate-700 dark:text-slate-200">{money(entry.revenue, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Channels" subtitle="Website vs counter">
              <ul className="space-y-2 text-xs">
                {(['online', 'pos']).map((channel) => {
                  const entry = (data?.byChannel || []).find((row) => row.channel === channel) || { bookings: 0, revenue: 0 };
                  return (
                    <li key={channel} className="flex items-center justify-between">
                      <span className="font-bold text-slate-600 dark:text-slate-300">
                        <i className={`ph ${channel === 'pos' ? 'ph-cash-register' : 'ph-globe'} mr-1`} aria-hidden="true" />
                        {channel === 'pos' ? 'Counter' : 'Online'}
                      </span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {money(entry.revenue, currency)} <span className="font-semibold text-slate-400">· {entry.bookings}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                {(data?.byType || []).map((entry) => (
                  <div key={entry.transport_type} className="flex items-center justify-between py-0.5">
                    <span className="font-bold text-slate-600 dark:text-slate-300">{typeMeta(entry.transport_type).label}</span>
                    <span className="font-black text-slate-900 dark:text-white">{money(entry.revenue, currency)}</span>
                  </div>
                ))}
                {(data?.byType || []).length === 0 && <p className="font-semibold text-slate-400">No sales yet.</p>}
              </div>
            </Panel>

            <Panel title="Occupancy" subtitle="Scheduled departures in range" padded={false}>
              {(data?.occupancy || []).length === 0 ? (
                <p className="px-4 py-6 text-center text-xs font-semibold text-slate-400">No scheduled departures.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.occupancy.slice(0, 12).map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{entry.route_name}</p>
                        <p className="text-[11px] text-slate-400">{shortDate(entry.date)} · {entry.depart_time}</p>
                      </div>
                      <div className="w-16 shrink-0">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${entry.occupancy >= 90 ? 'bg-rose-500' : entry.occupancy >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, entry.occupancy)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] font-black text-slate-700 dark:text-slate-200">{entry.occupancy}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Audit trail" subtitle="Who did what, newest first" padded={false}>
              {(data?.recentAudit || []).length === 0 ? (
                <p className="px-4 py-6 text-center text-xs font-semibold text-slate-400">Nothing logged yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentAudit.map((entry) => (
                    <li key={entry.id} className="px-4 py-2">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {ACTIONS[entry.action] || entry.action}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {entry.actor_email || 'system'} · {formatDateTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {summary.failedPayments > 0 && (
            <Note tone="rose">{summary.failedPayments} payment(s) failed in this range — check the bookings list.</Note>
          )}

          {(data?.byDay || []).length === 0 && (
            <Empty icon="ph-chart-line-up" title="Quiet period" message="No bookings have travel dates inside this range yet." />
          )}
        </>
      )}
    </div>
  );
}
