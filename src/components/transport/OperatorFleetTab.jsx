import { useCallback, useEffect, useMemo, useState } from 'react';
import { operatorGet, operatorPost, typeMeta } from '../../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Modal, Note, Panel, Table, btn, inputCls,
} from './ConsoleKit.jsx';

const PATTERNS = {
  '2+2': ['A', 'B', 'C', 'D'],
  '2+1': ['A', 'B', 'C'],
  '1+1': ['A', 'B'],
  '1+2': ['A', 'B', 'C'],
};

const emptyVehicle = {
  vehicleId: 0,
  transportType: 'bus',
  name: '',
  registration: '',
  capacity: 40,
  seating: 'assigned',
  seatClass: 'standard',
  status: 'active',
};

/** Vehicles and their permanent seat maps. One vehicle keeps one layout. */
export default function OperatorFleetTab({ operatorId, headers, can }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyVehicle);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [layoutVehicle, setLayoutVehicle] = useState(null);
  const [seats, setSeats] = useState([]);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [generator, setGenerator] = useState({ rows: 10, pattern: '2+2', carriage: '', category: 'standard', kind: 'seat' });

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('vehicles', operatorId, {}, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load the fleet'); return; }
    setError('');
    setVehicles(result.vehicles || []);
  }, [operatorId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startNew = () => {
    setForm(emptyVehicle);
    setFormError('');
    setOpen(true);
  };

  const edit = (vehicle) => {
    setForm({
      vehicleId: vehicle.id,
      transportType: vehicle.transportType,
      name: vehicle.name,
      registration: vehicle.registration || '',
      capacity: vehicle.capacity || 1,
      seating: vehicle.seating,
      seatClass: vehicle.seatClass || 'standard',
      status: vehicle.status || 'active',
    });
    setFormError('');
    setOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const result = await operatorPost('vehicle-save', operatorId, { vehicle: form }, authHeaders);
    setSaving(false);
    if (!result.ok) { setFormError(result.error || 'Could not save the vehicle'); return; }
    setOpen(false);
    setNote(`${form.name} saved.`);
    await load();
  };

  const openLayout = async (vehicle) => {
    setLayoutVehicle(vehicle);
    setSeats([]);
    setError('');
    setNote('');
    setLayoutLoading(true);
    const result = await operatorGet('vehicle-seats', operatorId, { vehicleId: vehicle.id }, authHeaders);
    setLayoutLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load the seat map'); return; }
    setSeats(result.seats || []);
    setGenerator((current) => ({ ...current, category: vehicle.seatClass || 'standard' }));
  };

  const generate = () => {
    const rows = Math.max(1, Math.min(60, Number(generator.rows) || 1));
    const letters = PATTERNS[generator.pattern] || PATTERNS['2+2'];
    const half = generator.pattern === '2+2' || generator.pattern === '1+2' ? 2 : 1;
    const next = [];
    let seatNo = 1;
    for (let row = 1; row <= rows; row += 1) {
      letters.forEach((letter, index) => {
        next.push({
          carriage: generator.carriage,
          rowLabel: String(row),
          seatNo,
          seatKey: `${row}${letter}`,
          category: generator.category || 'standard',
          kind: generator.kind === 'berth' ? 'berth' : 'seat',
          x: index >= half ? index + 1 : index,
          y: row,
          status: 'available',
        });
        seatNo += 1;
      });
    }
    setSeats(next);
  };

  const saveLayout = async () => {
    if (!layoutVehicle) return;
    setSaving(true);
    const result = await operatorPost('seat-layout-save', operatorId, {
      vehicleId: layoutVehicle.id,
      seats: seats.map((seat) => ({
        carriage: seat.carriage,
        rowLabel: seat.rowLabel,
        seatNo: seat.seatNo,
        seatKey: seat.seatKey,
        category: seat.category,
        kind: seat.kind,
        x: seat.x,
        y: seat.y,
        priceOverride: seat.priceOverride,
        status: seat.status,
      })),
    }, authHeaders);
    setSaving(false);
    if (!result.ok) { setError(result.error || 'Could not save the layout'); return; }
    setNote(`${layoutVehicle.name}: ${result.seats.length} seats saved.`);
    setLayoutVehicle(null);
    setSeats([]);
    await load();
  };

  const previewRows = useMemo(() => {
    const byRow = new Map();
    for (const seat of seats) {
      const key = `${seat.carriage || ''}|${seat.rowLabel}`;
      if (!byRow.has(key)) byRow.set(key, { carriage: seat.carriage || '', rowLabel: seat.rowLabel, seats: [] });
      byRow.get(key).seats.push(seat);
    }
    return [...byRow.values()].map((row) => ({
      ...row,
      seats: [...row.seats].sort((a, b) => Number(a.x) - Number(b.x)),
    }));
  }, [seats]);

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {note && <Note>{note}</Note>}

      <Panel
        title="Vehicles"
        subtitle="Coaches, ferries and trains, with the seat map each one runs"
        actions={can('manage') && (
          <button type="button" className={btn.primary} onClick={startNew}>
            <i className="ph ph-plus" aria-hidden="true" /> Add vehicle
          </button>
        )}
        padded={false}
      >
        {loading ? (
          <Loading />
        ) : vehicles.length === 0 ? (
          <div className="p-4">
            <Empty
              icon="ph-truck"
              title="No vehicles yet"
              message="A vehicle carries the seat map. Capacity-only vehicles (boats) sell by head count."
              action={can('manage') && (
                <button type="button" className={btn.primary} onClick={startNew}>
                  <i className="ph ph-plus" aria-hidden="true" /> Add vehicle
                </button>
              )}
            />
          </div>
        ) : (
          <Table head={['Vehicle', 'Type', 'Seating', 'Capacity', 'Seats drawn', 'Departures', 'Status', '']}>
            {vehicles.map((vehicle) => {
              const meta = typeMeta(vehicle.transportType);
              return (
                <tr key={vehicle.id} className="align-middle">
                  <td className="px-2 py-2.5">
                    <p className="font-black text-slate-900 dark:text-white">{vehicle.name}</p>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">{vehicle.registration || 'No plate'}</p>
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                    <i className={`ph ${meta.icon} mr-1`} aria-hidden="true" /> {meta.label}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">
                    {vehicle.seating === 'capacity' ? 'Capacity only' : 'Assigned seats'}
                    <p className="text-[11px] text-slate-400">{vehicle.seatClass}</p>
                  </td>
                  <td className="px-2 py-2.5 font-bold text-slate-800 dark:text-white">{vehicle.capacity}</td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">{vehicle.seatCount || '—'}</td>
                  <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">{vehicle.departures}</td>
                  <td className="px-2 py-2.5"><Badge status={vehicle.status} /></td>
                  <td className="px-2 py-2.5">
                    {can('manage') && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" className={btn.ghost} onClick={() => edit(vehicle)}>
                          <i className="ph ph-pencil-simple" aria-hidden="true" /> Edit
                        </button>
                        {vehicle.seating === 'assigned' && (
                          <button type="button" className={btn.ghost} onClick={() => openLayout(vehicle)}>
                            <i className="ph ph-grid-four" aria-hidden="true" /> Seat map
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

      <Modal open={open} onClose={() => setOpen(false)} title={form.vehicleId ? 'Edit vehicle' : 'Add vehicle'}>
        <form className="space-y-3" onSubmit={save}>
          <Field label="Name" required>
            <input value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Scania Coach 1" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Transport type" required>
              <select value={form.transportType} onChange={(event) => set('transportType', event.target.value)} className={inputCls}>
                {['bus', 'train', 'boat'].map((key) => <option key={key} value={key}>{typeMeta(key).label}</option>)}
              </select>
            </Field>
            <Field label="Registration / hull number">
              <input value={form.registration} onChange={(event) => set('registration', event.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Seating model" required>
              <select value={form.seating} onChange={(event) => set('seating', event.target.value)} className={inputCls}>
                <option value="assigned">Assigned seats (bus, train)</option>
                <option value="capacity">Capacity only (boat, ferry)</option>
              </select>
            </Field>
            <Field label="Capacity" hint="Overwritten by the seat map when you draw one">
              <input type="number" min="1" value={form.capacity} onChange={(event) => set('capacity', event.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default fare class">
              <input value={form.seatClass} onChange={(event) => set('seatClass', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <ErrorNote message={formError} />

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-check" aria-hidden="true" />}
              Save vehicle
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(layoutVehicle)} onClose={() => setLayoutVehicle(null)} title={`Seat map · ${layoutVehicle?.name || ''}`} wide>
        {layoutLoading ? (
          <Loading label="Loading the seat map…" />
        ) : (
          <div className="space-y-3">
            <Note tone="amber">
              Saving replaces the whole layout. It is blocked while any seat is sold or held on a live departure.
            </Note>

            <div className="grid gap-2 sm:grid-cols-5">
              <Field label="Rows">
                <input type="number" min="1" max="60" value={generator.rows} onChange={(event) => setGenerator((g) => ({ ...g, rows: event.target.value }))} className={inputCls} />
              </Field>
              <Field label="Pattern">
                <select value={generator.pattern} onChange={(event) => setGenerator((g) => ({ ...g, pattern: event.target.value }))} className={inputCls}>
                  {Object.keys(PATTERNS).map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </Field>
              <Field label="Carriage">
                <input value={generator.carriage} onChange={(event) => setGenerator((g) => ({ ...g, carriage: event.target.value }))} className={inputCls} placeholder="Coach A" />
              </Field>
              <Field label="Class">
                <input value={generator.category} onChange={(event) => setGenerator((g) => ({ ...g, category: event.target.value }))} className={inputCls} />
              </Field>
              <Field label="Seat kind">
                <select value={generator.kind} onChange={(event) => setGenerator((g) => ({ ...g, kind: event.target.value }))} className={inputCls}>
                  <option value="seat">Seat</option>
                  <option value="berth">Berth</option>
                </select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn.secondary} onClick={generate}>
                <i className="ph ph-magic-wand" aria-hidden="true" /> Generate {Number(generator.rows) * (PATTERNS[generator.pattern]?.length || 4)} seats
              </button>
              <span className="text-[11px] font-bold text-slate-400">{seats.length} seats in the map</span>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              {previewRows.length === 0 ? (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">Generate a layout to see the grid.</p>
              ) : (
                <div className="space-y-1.5">
                  {previewRows.map((row) => (
                    <div key={`${row.carriage}-${row.rowLabel}`} className="flex items-center gap-1.5">
                      <span className="w-6 shrink-0 text-right text-[10px] font-black text-slate-400">{row.rowLabel}</span>
                      {row.seats.map((seat, index) => (
                        <span key={seat.seatKey} className="flex items-center">
                          {index > 0 && Number(seat.x) - Number(row.seats[index - 1].x) > 1 && <span className="w-3" />}
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-black ${
                              seat.kind === 'berth'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                            }`}
                            title={`${seat.seatKey} · ${seat.category}`}
                          >
                            {seat.seatKey.replace(/^\d+/, '')}
                          </span>
                        </span>
                      ))}
                      {row.carriage && <span className="ml-2 text-[10px] font-bold text-slate-400">{row.carriage}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setLayoutVehicle(null)}>Close</button>
              <button type="button" className={btn.primary} onClick={saveLayout} disabled={saving || seats.length === 0}>
                {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-floppy-disk" aria-hidden="true" />}
                Save seat map
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
