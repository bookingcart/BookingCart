import { useCallback, useEffect, useState } from 'react';
import { clockLabel, money, operatorGet, shortDate, typeMeta } from '../../lib/transportClient.js';
import { Badge, Empty, ErrorNote, Loading, Panel, StatCard, Table, btn } from './ConsoleKit.jsx';

/** Day one view: what is leaving, what sold, and what still needs money collected. */
export default function OperatorOverviewTab({ operatorId, headers, can, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('overview', operatorId, {}, headers());
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load the overview'); return; }
    setError('');
    setData(result);
  }, [operatorId, headers]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Loading label="Loading your operation…" />;

  const stats = data?.stats || {};
  const currency = stats.currency || 'UGX';
  const departures = data?.departures || [];
  const recent = data?.recentBookings || [];

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="ph-bus" label="Departures today" value={stats.today_departures ?? 0} hint={`${stats.upcoming_departures ?? 0} upcoming`} />
        <StatCard icon="ph-users-three" label="Tickets sold" value={stats.tickets_sold ?? 0} hint="Confirmed bookings" tone="sky" />
        <StatCard icon="ph-wallet" label="Gross revenue" value={money(stats.gross_revenue ?? 0, currency)} hint={`${stats.counter_sales ?? 0} counter sales`} tone="violet" />
        <StatCard
          icon="ph-hourglass-medium"
          label="Pending payments"
          value={money(stats.pending_payments ?? 0, currency)}
          hint={`${stats.pending_count ?? 0} booking(s) to settle`}
          tone={Number(stats.pending_count || 0) > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Next departures"
          subtitle="The next seven days, with how full each vehicle is"
          actions={can('manage') && (
            <button type="button" className={btn.secondary} onClick={() => onNavigate('departures')}>
              <i className="ph ph-calendar-plus" aria-hidden="true" /> Schedule
            </button>
          )}
          padded={false}
        >
          {departures.length === 0 ? (
            <div className="p-4">
              <Empty
                icon="ph-calendar-x"
                title="Nothing scheduled yet"
                message="Add departures so passengers can find and book your journeys."
                action={can('manage') && (
                  <button type="button" className={btn.primary} onClick={() => onNavigate('departures')}>
                    <i className="ph ph-plus" aria-hidden="true" /> New departure
                  </button>
                )}
              />
            </div>
          ) : (
            <Table head={['When', 'Route', 'Vehicle', 'Seats', 'Revenue']}>
              {departures.slice(0, 8).map((departure) => {
                const meta = typeMeta(departure.transportType);
                const fill = departure.seatsTotal > 0 ? Math.round((departure.sold / departure.seatsTotal) * 100) : 0;
                return (
                  <tr key={departure.id} className="align-middle">
                    <td className="px-2 py-2">
                      <p className="font-black text-slate-900 dark:text-white">{clockLabel(departure.departTime)}</p>
                      <p className="text-[11px] text-slate-400">{shortDate(departure.travelDate)}</p>
                    </td>
                    <td className="px-2 py-2">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{departure.routeName}</p>
                      <p className="text-[11px] text-slate-400">
                        <i className={`ph ${meta.icon}`} aria-hidden="true" /> {meta.label}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{departure.vehicleName || '—'}</td>
                    <td className="px-2 py-2">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{departure.sold}/{departure.seatsTotal}</p>
                      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${fill >= 90 ? 'bg-rose-500' : fill >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, fill)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 font-bold text-slate-800 dark:text-slate-100">{money(departure.revenue, departure.currency)}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Sell a ticket" subtitle="The counter shares the website inventory">
            <div className="grid gap-2">
              <button type="button" className={btn.primary} onClick={() => onNavigate('pos')} disabled={!can('sell')}>
                <i className="ph ph-cash-register" aria-hidden="true" /> Open the counter
              </button>
              <button type="button" className={btn.secondary} onClick={() => onNavigate('bookings')}>
                <i className="ph ph-user-list" aria-hidden="true" /> Passenger manifest
              </button>
              <button type="button" className={btn.secondary} onClick={() => onNavigate('validate')}>
                <i className="ph ph-qr-code" aria-hidden="true" /> Scan boarding passes
              </button>
            </div>
            {!can('sell') && (
              <p className="mt-3 text-[11px] font-semibold text-slate-400">
                Your role cannot sell tickets. Ask the owner for the ticketing role.
              </p>
            )}
          </Panel>

          <Panel title="Latest bookings" padded={false}>
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-semibold text-slate-400">No bookings yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.slice(0, 6).map((order) => (
                  <li key={order.bookingRef} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-900 dark:text-white">{order.customerName}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        <span className="font-mono">{order.bookingRef}</span> · {order.routeName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black text-slate-900 dark:text-white">{money(order.total, order.currency)}</p>
                      <Badge status={order.paymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
