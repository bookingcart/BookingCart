import { useCallback, useEffect, useMemo, useState } from 'react';
import { money, operatorGet, operatorPost, transportGet, typeMeta } from '../../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Modal, Panel, Table, btn, inputCls,
} from './ConsoleKit.jsx';

// Stop kind per transport type — the same mapping lib/transport uses, so the
// picker offers terminals for buses, stations for trains and ports for boats.
const STOP_KIND = { bus: 'terminal', train: 'station', boat: 'port' };
const TYPES = ['bus', 'train', 'boat'];

const emptyForm = {
  routeId: 0,
  transportType: 'bus',
  name: '',
  code: '',
  originId: '',
  destinationId: '',
  durationMinutes: '',
  distanceKm: '',
  basePrice: '',
  currency: 'UGX',
  classes: 'standard:1',
  amenities: '',
  luggageAllowance: '',
  cancellationPolicy: '',
  status: 'draft',
  stops: [],
};

/** "standard:1, business:1.5" ⇄ [{code,name,multiplier}] */
function parseClasses(text) {
  return String(text || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, multiplier] = entry.split(':');
      const key = code.trim().toLowerCase();
      return { code: key, name: key.charAt(0).toUpperCase() + key.slice(1), multiplier: Number(multiplier) > 0 ? Number(multiplier) : 1 };
    });
}

function classesToText(classes) {
  const list = Array.isArray(classes) && classes.length ? classes : [{ code: 'standard', multiplier: 1 }];
  return list.map((entry) => `${entry.code}:${entry.multiplier}`).join(', ');
}

export default function OperatorRoutesTab({ operatorId, headers, can }) {
  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('routes', operatorId, { includeArchived: true }, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load routes'); return; }
    setError('');
    setRoutes(result.routes || []);
  }, [operatorId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  // The stop picker only offers the kind of place this transport actually stops at.
  useEffect(() => {
    let live = true;
    transportGet('locations', { type: form.transportType, limit: 50 }).then((result) => {
      if (live && result.ok) setLocations(result.locations || []);
    });
    return () => { live = false; };
  }, [form.transportType]);

  const locationLabel = useMemo(() => {
    const map = new Map(locations.map((entry) => [String(entry.id), entry.label || entry.name]));
    return (id) => map.get(String(id)) || '—';
  }, [locations]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const setType = (transportType) => {
    setForm((current) => ({ ...current, transportType, originId: '', destinationId: '', stops: [] }));
  };

  const startNew = () => {
    setForm(emptyForm);
    setFormError('');
    setOpen(true);
  };

  const edit = async (route) => {
    setFormError('');
    const detail = await operatorGet('route', operatorId, { routeId: route.id }, authHeaders);
    if (!detail.ok) { setError(detail.error || 'Could not open that route'); return; }
    const stops = (detail.stops || []).map((stop) => ({
      locationId: String(stop.locationId),
      minutesFromOrigin: String(stop.minutesFromOrigin),
    }));
    setForm({
      routeId: route.id,
      transportType: route.transportType,
      name: route.name,
      code: route.code || '',
      originId: String(route.originId),
      destinationId: String(route.destinationId),
      durationMinutes: String(route.durationMinutes || ''),
      distanceKm: route.distanceKm === null ? '' : String(route.distanceKm),
      basePrice: String(route.basePrice ?? ''),
      currency: route.currency || 'UGX',
      classes: classesToText(route.classes),
      amenities: (route.amenities || []).join(', '),
      luggageAllowance: route.luggageAllowance || '',
      cancellationPolicy: route.cancellationPolicy || '',
      status: route.status || 'draft',
      stops: stops.length ? stops : [],
    });
    setOpen(true);
  };

  const setEnd = (which, value) => {
    setForm((current) => {
      const next = { ...current, [which]: value };
      const stops = [...(current.stops || [])];
      if (stops.length < 2) {
        next.stops = [
          { locationId: which === 'originId' ? value : current.originId, minutesFromOrigin: '0' },
          { locationId: which === 'destinationId' ? value : current.destinationId, minutesFromOrigin: current.durationMinutes || '0' },
        ];
      } else {
        const index = which === 'originId' ? 0 : stops.length - 1;
        stops[index] = { ...stops[index], locationId: value };
        next.stops = stops;
      }
      return next;
    });
  };

  const addStop = () => {
    setForm((current) => {
      const stops = [...current.stops];
      if (stops.length < 2) return current;
      stops.splice(stops.length - 1, 0, { locationId: '', minutesFromOrigin: '' });
      return { ...current, stops };
    });
  };

  const setStop = (index, key, value) => {
    setForm((current) => {
      const stops = current.stops.map((stop, position) => (position === index ? { ...stop, [key]: value } : stop));
      return { ...current, stops };
    });
  };

  const removeStop = (index) => {
    setForm((current) => ({ ...current, stops: current.stops.filter((_, position) => position !== index) }));
  };

  const save = async (event) => {
    event.preventDefault();
    setFormError('');
    const stops = (form.stops || [])
      .map((stop, index) => ({
        locationId: Number(stop.locationId) || 0,
        minutesFromOrigin: Number(stop.minutesFromOrigin) || 0,
        kind: index === 0 || index === form.stops.length - 1 ? 'endpoint' : 'stop',
      }))
      .filter((stop) => stop.locationId);

    setSaving(true);
    const result = await operatorPost('route-save', operatorId, {
      route: {
        routeId: form.routeId || undefined,
        transportType: form.transportType,
        name: form.name,
        code: form.code,
        originId: Number(form.originId) || 0,
        destinationId: Number(form.destinationId) || 0,
        durationMinutes: Number(form.durationMinutes) || 0,
        distanceKm: form.distanceKm === '' ? null : Number(form.distanceKm),
        basePrice: Number(form.basePrice) || 0,
        currency: form.currency,
        classes: parseClasses(form.classes),
        amenities: form.amenities.split(',').map((entry) => entry.trim()).filter(Boolean),
        luggageAllowance: form.luggageAllowance,
        cancellationPolicy: form.cancellationPolicy,
        status: form.status,
        stops,
      },
    }, authHeaders);
    setSaving(false);
    if (!result.ok) { setFormError(result.error || 'Could not save the route'); return; }
    setOpen(false);
    await load();
  };

  const changeStatus = async (route, status) => {
    const result = await operatorPost('route-status', operatorId, { routeId: route.id, status }, authHeaders);
    if (!result.ok) { setError(result.error || 'Could not update the route'); return; }
    setError('');
    await load();
  };

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Panel
        title="Routes & timetables"
        subtitle="A published route is searchable by passengers the moment it has a departure"
        actions={can('manage') && (
          <button type="button" className={btn.primary} onClick={startNew}>
            <i className="ph ph-plus" aria-hidden="true" /> New route
          </button>
        )}
        padded={false}
      >
        {loading ? (
          <Loading />
        ) : routes.length === 0 ? (
          <div className="p-4">
            <Empty
              icon="ph-map-trifold"
              title="No routes yet"
              message="Create a route with its stops and fares, then schedule departures on it."
              action={can('manage') && (
                <button type="button" className={btn.primary} onClick={startNew}>
                  <i className="ph ph-plus" aria-hidden="true" /> New route
                </button>
              )}
            />
          </div>
        ) : (
          <Table head={['Route', 'Type', 'Journey', 'Stops', 'From', 'Departures', 'Status', '']}>
            {routes.map((route) => {
              const meta = typeMeta(route.transportType);
              return (
                <tr key={route.id} className="align-middle">
                  <td className="px-2 py-2.5">
                    <p className="font-black text-slate-900 dark:text-white">{route.name}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{route.code || '—'}</p>
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                    <i className={`ph ${meta.icon} mr-1`} aria-hidden="true" /> {meta.label}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                    {route.originName} → {route.destinationName}
                  </td>
                  <td className="px-2 py-2.5 font-bold text-slate-700 dark:text-slate-200">{route.stops}</td>
                  <td className="px-2 py-2.5 font-bold text-slate-800 dark:text-white">{money(route.basePrice, route.currency)}</td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">{route.departures}</td>
                  <td className="px-2 py-2.5"><Badge status={route.status} /></td>
                  <td className="px-2 py-2.5">
                    {can('manage') && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" className={btn.ghost} onClick={() => edit(route)}>
                          <i className="ph ph-pencil-simple" aria-hidden="true" /> Edit
                        </button>
                        {route.status !== 'published' && (
                          <button type="button" className={btn.ghost} onClick={() => changeStatus(route, 'published')}>
                            <i className="ph ph-rocket-launch" aria-hidden="true" /> Publish
                          </button>
                        )}
                        {route.status === 'published' && (
                          <button type="button" className={btn.ghost} onClick={() => changeStatus(route, 'draft')}>
                            <i className="ph ph-eye-slash" aria-hidden="true" /> Unpublish
                          </button>
                        )}
                        {route.status !== 'archived' && (
                          <button
                            type="button"
                            className={btn.ghost}
                            onClick={() => changeStatus(route, 'archived')}
                          >
                            <i className="ph ph-archive" aria-hidden="true" /> Archive
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

      <Modal open={open} onClose={() => setOpen(false)} title={form.routeId ? 'Edit route' : 'New route'} wide>
        <form className="space-y-3" onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Transport" required>
              <select value={form.transportType} onChange={(event) => setType(event.target.value)} className={inputCls}>
                {TYPES.map((key) => <option key={key} value={key}>{typeMeta(key).label}</option>)}
              </select>
            </Field>
            <Field label="Route name" required className="sm:col-span-2">
              <input value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Kampala – Gulu Express" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Route code" hint="Printed on tickets, e.g. NC-101">
              <input value={form.code} onChange={(event) => set('code', event.target.value)} className={inputCls} />
            </Field>
            <Field label={`${typeMeta(form.transportType).stopLabel} (from)`} required>
              <select value={form.originId} onChange={(event) => setEnd('originId', event.target.value)} className={inputCls}>
                <option value="">Choose…</option>
                {locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.label || entry.name}</option>)}
              </select>
            </Field>
            <Field label={`${typeMeta(form.transportType).stopLabel} (to)`} required>
              <select value={form.destinationId} onChange={(event) => setEnd('destinationId', event.target.value)} className={inputCls}>
                <option value="">Choose…</option>
                {locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.label || entry.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Duration (min)" required>
              <input type="number" min="1" value={form.durationMinutes} onChange={(event) => set('durationMinutes', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Distance (km)">
              <input type="number" min="0" step="0.1" value={form.distanceKm} onChange={(event) => set('distanceKm', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Base fare" required>
              <input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => set('basePrice', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Currency">
              <input value={form.currency} onChange={(event) => set('currency', event.target.value.toUpperCase())} maxLength={3} className={inputCls} />
            </Field>
          </div>

          <Field label="Fare classes" hint="code:multiplier, e.g. standard:1, business:1.6, sleeper:1.3">
            <input value={form.classes} onChange={(event) => set('classes', event.target.value)} className={inputCls} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amenities" hint="Comma separated — Wi-Fi, A/C, USB power">
              <input value={form.amenities} onChange={(event) => set('amenities', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Luggage allowance">
              <input value={form.luggageAllowance} onChange={(event) => set('luggageAllowance', event.target.value)} className={inputCls} placeholder="2 × 23 kg" />
            </Field>
          </div>

          <Field label="Cancellation policy">
            <textarea rows={2} value={form.cancellationPolicy} onChange={(event) => set('cancellationPolicy', event.target.value)} className={inputCls} />
          </Field>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Stops</p>
              <button type="button" className={btn.ghost} onClick={addStop}>
                <i className="ph ph-plus" aria-hidden="true" /> Add stop
              </button>
            </div>
            <div className="space-y-2">
              {(form.stops || []).map((stop, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <select
                      value={stop.locationId}
                      onChange={(event) => setStop(index, 'locationId', event.target.value)}
                      className={inputCls}
                      disabled={index === 0 || index === form.stops.length - 1}
                    >
                      <option value="">{locationLabel(stop.locationId)}</option>
                      {locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.label || entry.name}</option>)}
                    </select>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={stop.minutesFromOrigin}
                    onChange={(event) => setStop(index, 'minutesFromOrigin', event.target.value)}
                    className={`${inputCls} w-28`}
                    aria-label="Minutes from origin"
                    placeholder="min"
                    disabled={index === 0}
                  />
                  <button
                    type="button"
                    className={`${btn.secondary} px-2`}
                    onClick={() => removeStop(index)}
                    disabled={index === 0 || index === form.stops.length - 1}
                    aria-label="Remove stop"
                  >
                    <i className="ph ph-trash" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-400">
              The first row is always the origin and the last the destination. Stop times must increase.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
                <option value="draft">Draft — hidden from search</option>
                <option value="published">Published — bookable</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>

          <ErrorNote message={formError} />

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-check" aria-hidden="true" />}
              Save route
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
