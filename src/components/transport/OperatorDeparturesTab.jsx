import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays, clockLabel, money, operatorGet, operatorPost, shortDate, todayISO, typeMeta,
} from '../../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Modal, Panel, Table, btn, inputCls,
} from './ConsoleKit.jsx';

const STATUSES = ['scheduled', 'cancelled', 'completed'];

const emptyForm = {
  departureId: 0,
  routeId: '',
  vehicleId: '',
  travelDate: todayISO(),
  departTime: '08:00',
  arriveTime: '',
  seatsTotal: '',
  basePrice: '',
  boardingCutoffMinutes: 15,
  salesCloseMinutes: 0,
  notes: '',
  status: 'scheduled',
};

/** Add or change the repeated runs of a route. */
export default function OperatorDeparturesTab({ operatorId, headers, can }) {
  const [rows, setRows] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filters, setFilters] = useState({ from: todayISO(), to: addDays(todayISO(), 30), status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const [departures, routeList, vehicleList] = await Promise.all([
      operatorGet('departures', operatorId, { from: filters.from, to: filters.to, status: filters.status }, authHeaders),
      operatorGet('routes', operatorId, {}, authHeaders),
      operatorGet('vehicles', operatorId, {}, authHeaders),
    ]);
    setLoading(false);
    if (!departures.ok) { setError(departures.error || 'Could not load departures'); return; }
    setError('');
    setRows(departures.departures || []);
    if (routeList.ok) setRoutes(routeList.routes || []);
    if (vehicleList.ok) setVehicles(vehicleList.vehicles || []);
  }, [operatorId, authHeaders, filters.from, filters.to, filters.status]);

  useEffect(() => { load(); }, [load]);

  const routeOptions = useMemo(
    () => routes.filter((route) => route.status !== 'archived'),
    [routes]
  );

  const vehicleOptions = useMemo(() => {
    const route = routeOptions.find((entry) => String(entry.id) === String(form.routeId));
    if (!route) return vehicles.filter((vehicle) => vehicle.status === 'active');
    return vehicles.filter((vehicle) => vehicle.status === 'active' && vehicle.transportType === route.transportType);
  }, [vehicles, routeOptions, form.routeId]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startNew = () => {
    setForm({ ...emptyForm, travelDate: filters.from || todayISO() });
    setFormError('');
    setOpen(true);
  };

  const edit = (departure) => {
    setForm({
      departureId: departure.id,
      routeId: String(departure.routeId),
      vehicleId: String(departure.vehicleId),
      travelDate: departure.travelDate,
      departTime: departure.departTime,
      arriveTime: departure.arriveTime || '',
      seatsTotal: String(departure.seatsTotal),
      basePrice: String(departure.basePrice ?? ''),
      boardingCutoffMinutes: departure.boardingCutoffMinutes,
      salesCloseMinutes: departure.salesCloseMinutes,
      notes: departure.notes || '',
      status: departure.status,
    });
    setFormError('');
    setOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const result = await operatorPost('departure-save', operatorId, {
      departure: {
        departureId: form.departureId || undefined,
        routeId: Number(form.routeId) || 0,
        vehicleId: Number(form.vehicleId) || 0,
        travelDate: form.travelDate,
        departTime: form.departTime,
        arriveTime: form.arriveTime,
        seatsTotal: Number(form.seatsTotal) || 0,
        basePrice: form.basePrice === '' ? undefined : Number(form.basePrice),
        boardingCutoffMinutes: Number(form.boardingCutoffMinutes) || 0,
        salesCloseMinutes: Number(form.salesCloseMinutes) || 0,
        notes: form.notes,
        status: form.status,
      },
    }, authHeaders);
    setSaving(false);
    if (!result.ok) { setFormError(result.error || 'Could not save the departure'); return; }
    setOpen(false);
    await load();
  };

  const cancel = async (departure) => {
    const reason = window.prompt(`Cancel ${departure.routeName} on ${departure.travelDate}? Passengers are refunded and notified. Reason:`, 'Departure cancelled by the operator');
    if (reason === null) return;
    const result = await operatorPost('departure-cancel', operatorId, { departureId: departure.id, reason }, authHeaders);
    if (!result.ok) { setError(result.error || 'Could not cancel the departure'); return; }
    setError('');
    await load();
  };

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Panel
        title="Departures"
        subtitle="Every scheduled run, its load factor and the money it has taken"
        actions={can('manage') && (
          <button type="button" className={btn.primary} onClick={startNew} disabled={routeOptions.length === 0}>
            <i className="ph ph-plus" aria-hidden="true" /> New departure
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
              <option value="">All</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <button type="button" className={`${btn.secondary} mb-0.5`} onClick={load}>
            <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Refresh
          </button>
        </div>

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <div className="p-4">
            <Empty
              icon="ph-calendar-blank"
              title="No departures in this window"
              message={routeOptions.length === 0
                ? 'Create a route first — a departure always runs on a route with a vehicle.'
                : 'Pick a wider date range or schedule a new run.'}
            />
          </div>
        ) : (
          <Table head={['When', 'Route', 'Vehicle', 'Load', 'Fare', 'Revenue', 'Status', '']}>
            {rows.map((departure) => {
              const fill = departure.seatsTotal > 0 ? Math.round((departure.sold / departure.seatsTotal) * 100) : 0;
              const meta = typeMeta(departure.transportType);
              return (
                <tr key={departure.id} className="align-middle">
                  <td className="px-2 py-2.5">
                    <p className="font-black text-slate-900 dark:text-white">{clockLabel(departure.departTime)}</p>
                    <p className="text-[11px] text-slate-400">{shortDate(departure.travelDate)} → {clockLabel(departure.arriveTime)}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{departure.routeName}</p>
                    <p className="text-[11px] text-slate-400"><i className={`ph ${meta.icon}`} aria-hidden="true" /> {meta.label}</p>
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                    {departure.vehicleName || '—'}
                    <p className="text-[11px] text-slate-400">{departure.seating === 'capacity' ? 'Capacity' : 'Assigned seats'}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{departure.sold}/{departure.seatsTotal}</p>
                    <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${fill >= 90 ? 'bg-rose-500' : fill >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, fill)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 font-bold text-slate-800 dark:text-white">{money(departure.basePrice, departure.currency)}</td>
                  <td className="px-2 py-2.5 font-bold text-slate-800 dark:text-white">{money(departure.revenue, departure.currency)}</td>
                  <td className="px-2 py-2.5"><Badge status={departure.status} /></td>
                  <td className="px-2 py-2.5">
                    {can('manage') && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" className={btn.ghost} onClick={() => edit(departure)}>
                          <i className="ph ph-pencil-simple" aria-hidden="true" /> Edit
                        </button>
                        {departure.status === 'scheduled' && (
                          <button type="button" className={btn.ghost} onClick={() => cancel(departure)}>
                            <i className="ph ph-x-circle" aria-hidden="true" /> Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={form.departureId ? 'Edit departure' : 'New departure'} wide>
        <form className="space-y-3" onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Route" required>
              <select value={form.routeId} onChange={(event) => setForm((current) => ({ ...current, routeId: event.target.value, vehicleId: '' }))} className={inputCls}>
                <option value="">Choose a route…</option>
                {routeOptions.map((route) => (
                  <option key={route.id} value={route.id}>{route.code ? `${route.code} · ` : ''}{route.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Vehicle" required hint={form.routeId && vehicleOptions.length === 0 ? 'No active vehicle of this transport type yet' : ''}>
              <select value={form.vehicleId} onChange={(event) => set('vehicleId', event.target.value)} className={inputCls}>
                <option value="">Choose a vehicle…</option>
                {vehicleOptions.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} · {vehicle.seatCount || vehicle.capacity} seats
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Travel date" required>
              <input type="date" value={form.travelDate} onChange={(event) => set('travelDate', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Departs" required>
              <input type="time" value={form.departTime} onChange={(event) => set('departTime', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Arrives" hint="Leave blank to use the route duration">
              <input type="time" value={form.arriveTime} onChange={(event) => set('arriveTime', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Seats on sale" hint="Blank uses the vehicle capacity">
              <input type="number" min="1" value={form.seatsTotal} onChange={(event) => set('seatsTotal', event.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Fare override" hint="Blank uses the route fare">
              <input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => set('basePrice', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Boarding closes (min)">
              <input type="number" min="0" value={form.boardingCutoffMinutes} onChange={(event) => set('boardingCutoffMinutes', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Sales close (min before)">
              <input type="number" min="0" value={form.salesCloseMinutes} onChange={(event) => set('salesCloseMinutes', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Internal note" hint="Shown to your staff only unless the departure is cancelled">
            <input value={form.notes} onChange={(event) => set('notes', event.target.value)} className={inputCls} />
          </Field>

          <ErrorNote message={formError} />

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-check" aria-hidden="true" />}
              Save departure
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
