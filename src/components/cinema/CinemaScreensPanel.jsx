import { useCallback, useEffect, useMemo, useState } from 'react';
import { cinemaGet, cinemaPost } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Field, Notice, Pill, cx, inputCls } from './ui.jsx';

const SCREEN_TYPES = ['standard', 'imax', '3d', 'vip', 'dolby', '4dx'];
const CATEGORY_CYCLE = ['standard', 'premium', 'vip', 'couple', 'recliner', 'wheelchair', 'companion'];
const CATEGORY_STYLE = {
  standard: 'bg-white border-slate-300 text-slate-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300',
  premium: 'bg-sky-100 border-sky-400 text-sky-700 dark:bg-sky-950 dark:border-sky-600 dark:text-sky-300',
  vip: 'bg-violet-100 border-violet-400 text-violet-700 dark:bg-violet-950 dark:border-violet-600 dark:text-violet-300',
  couple: 'bg-rose-100 border-rose-400 text-rose-700 dark:bg-rose-950 dark:border-rose-600 dark:text-rose-300',
  recliner: 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-950 dark:border-amber-600 dark:text-amber-300',
  wheelchair: 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-950 dark:border-blue-600 dark:text-blue-300',
  companion: 'bg-teal-100 border-teal-400 text-teal-700 dark:bg-teal-950 dark:border-teal-600 dark:text-teal-300',
};
const CATEGORY_LABEL = {
  standard: 'Standard', premium: 'Premium', vip: 'VIP', couple: 'Couple',
  recliner: 'Recliner', wheelchair: 'Wheelchair', companion: 'Companion',
};

const EMPTY_SCREEN = { id: 0, name: '', screenType: 'standard', rowCount: 8, seatsPerRow: 12, status: 'active' };

function buildLayout(rowCount, seatsPerRow, existing) {
  if (Array.isArray(existing) && existing.length) {
    const byRow = new Map();
    for (const seat of existing) {
      if (!byRow.has(seat.row)) byRow.set(seat.row, []);
      byRow.get(seat.row).push({
        number: seat.number,
        x: seat.x || seat.number,
        category: seat.category || 'standard',
        status: seat.status === 'blocked' || seat.status === 'out_of_service' ? 'blocked' : 'available',
      });
    }
    return Array.from(byRow.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, seats]) => ({ label, seats: seats.sort((a, b) => a.number - b.number) }));
  }

  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    const label = String.fromCharCode(65 + r);
    const seats = [];
    for (let s = 1; s <= seatsPerRow; s += 1) {
      seats.push({ number: s, x: s, category: 'standard', status: 'available' });
    }
    rows.push({ label, seats });
  }
  return rows;
}

function ScreenForm({ initial, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_SCREEN, ...initial });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          id: form.id,
          name: form.name.trim(),
          screenType: form.screenType,
          rowCount: Number(form.rowCount) || 1,
          seatsPerRow: Number(form.seatsPerRow) || 1,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Screen name" required hint="e.g. Screen 1, IMAX A, VIP Lounge">
          <input required value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Screen 1" />
        </Field>
        <Field label="Screen type">
          <select value={form.screenType} onChange={(event) => set('screenType', event.target.value)} className={inputCls}>
            {SCREEN_TYPES.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rows" hint="A, B, C …">
          <input type="number" min="1" max="30" value={form.rowCount} onChange={(event) => set('rowCount', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Seats per row">
          <input type="number" min="1" max="40" value={form.seatsPerRow} onChange={(event) => set('seatsPerRow', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Status" hint="Inactive screens cannot be scheduled">
          <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>

      {!form.id && (
        <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Rows and seats are only a starting grid — you can move seats, block them and mix categories in the layout editor afterwards.
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Saving…' : 'Save screen'}
        </Button>
      </div>
    </form>
  );
}

function SeatLayoutEditor({ screen, headers, onDone }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('category');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('seats', { attractionId: screen.attractionId, screenId: screen.id }, headers);
    if (payload.ok) {
      setRows(buildLayout(screen.rowCount, screen.seatsPerRow, payload.seats));
      setError('');
    } else {
      setError(payload.error || 'Could not load the seat layout');
    }
    setLoading(false);
  }, [headers, screen.attractionId, screen.id, screen.rowCount, screen.seatsPerRow]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const totals = { seats: 0, blocked: 0 };
    const byCategory = {};
    for (const row of rows) {
      for (const seat of row.seats) {
        totals.seats += 1;
        if (seat.status === 'blocked') { totals.blocked += 1; continue; }
        byCategory[seat.category] = (byCategory[seat.category] || 0) + 1;
      }
    }
    return { ...totals, byCategory };
  }, [rows]);

  const maxX = Math.max(1, ...rows.flatMap((row) => row.seats.map((seat) => seat.x || seat.number)));

  const updateSeat = (rowLabel, index) => {
    setRows((current) => current.map((row) => {
      if (row.label !== rowLabel) return row;
      return {
        ...row,
        seats: row.seats.map((seat, seatIndex) => {
          if (seatIndex !== index) return seat;
          if (mode === 'block') {
            return { ...seat, status: seat.status === 'blocked' ? 'available' : 'blocked' };
          }
          const next = CATEGORY_CYCLE[(CATEGORY_CYCLE.indexOf(seat.category) + 1) % CATEGORY_CYCLE.length];
          return { ...seat, category: next, status: 'available' };
        }),
      };
    }));
  };

  const applyRow = (rowLabel, category) => {
    setRows((current) => current.map((row) => (
      row.label === rowLabel
        ? { ...row, seats: row.seats.map((seat) => ({ ...seat, category, status: 'available' })) }
        : row
    )));
  };

  const save = async () => {
    setBusy(true);
    const payload = await cinemaPost('seats-save', {
      attractionId: screen.attractionId,
      screenId: screen.id,
      seats: rows.flatMap((row, rowIndex) => row.seats.map((seat) => ({
        row: row.label,
        number: seat.number,
        x: seat.x || seat.number,
        y: rowIndex + 1,
        category: seat.category,
        status: seat.status,
      }))),
    }, headers);
    setBusy(false);
    if (!payload.ok) { setError(payload.error || 'Could not save the layout'); return; }
    onDone?.();
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMode('category')}
            className={cx('rounded-xl px-3 py-1.5 text-[11px] font-black', mode === 'category' ? 'bg-green-600 text-white' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}
          >
            <i className="ph ph-armchair mr-1" /> Tap to change category
          </button>
          <button
            type="button"
            onClick={() => setMode('block')}
            className={cx('rounded-xl px-3 py-1.5 text-[11px] font-black', mode === 'block' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}
          >
            <i className="ph ph-prohibit mr-1" /> Tap to block
          </button>
        </div>
        <p className="text-[11px] font-bold text-slate-400">
          {counts.seats} seats · {counts.blocked} blocked
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        {rows.map((row) => (
          <div key={row.label} className="mb-1.5 flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-[10px] font-black text-slate-400">{row.label}</span>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${maxX}, minmax(0, 30px))` }}>
              {row.seats.map((seat, index) => (
                <button
                  key={`${row.label}-${seat.number}`}
                  type="button"
                  onClick={() => updateSeat(row.label, index)}
                  title={`${row.label}${seat.number} · ${seat.status === 'blocked' ? 'blocked' : CATEGORY_LABEL[seat.category]}`}
                  style={{ gridColumn: `${seat.x || seat.number} / span 1` }}
                  className={cx(
                    'flex h-[30px] items-center justify-center rounded-md rounded-t-lg border-2 text-[9px] font-black transition-transform hover:-translate-y-0.5',
                    seat.status === 'blocked'
                      ? 'border-dashed border-slate-300 bg-slate-100 text-slate-300 line-through dark:border-slate-600 dark:bg-slate-800 dark:text-slate-600'
                      : CATEGORY_STYLE[seat.category]
                  )}
                >
                  {seat.number}
                </button>
              ))}
            </div>
            <div className="ml-1 flex shrink-0 gap-0.5">
              {['standard', 'premium', 'vip'].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => applyRow(row.label, category)}
                  title={`Whole row → ${CATEGORY_LABEL[category]}`}
                  className={cx('h-[22px] w-[22px] rounded border-2', CATEGORY_STYLE[category])}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {CATEGORY_CYCLE.map((category) => (
          <span key={category} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span className={cx('h-3 w-3 rounded-t-md rounded-b-sm border-2', CATEGORY_STYLE[category])} />
            {CATEGORY_LABEL[category]} {counts.byCategory[category] ? `· ${counts.byCategory[category]}` : ''}
          </span>
        ))}
      </div>

      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Back to screens</Button>
        <Button icon={busy ? 'ph-circle-notch' : 'ph-floppy-disk'} onClick={save} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Saving layout…' : 'Save seat layout'}
        </Button>
      </div>
    </div>
  );
}

export default function CinemaScreensPanel({ attractionId, headers, currency = 'USD' }) {
  const [screens, setScreens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [layoutFor, setLayoutFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('screens', { attractionId }, headers);
    if (payload.ok) { setScreens(payload.screens || []); setError(''); }
    else setError(payload.error || 'Could not load screens');
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const saveScreen = async (values) => {
    setSaving(true);
    const payload = await cinemaPost('screen-save', { attractionId, screen: values }, headers);
    setSaving(false);
    if (!payload.ok) { setFormError(payload.error || 'Could not save the screen'); return; }
    setFormError('');
    setEditing(null);
    setNotice(`${payload.screen.name} saved.`);
    load();
  };

  const removeScreen = async (screen) => {
    if (!window.confirm(`Delete ${screen.name}? This also removes its seat layout.`)) return;
    const payload = await cinemaPost('screen-delete', { attractionId, screenId: screen.id }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`${screen.name} deleted.`);
    load();
  };

  const toggleStatus = async (screen) => {
    const payload = await cinemaPost('screen-save', {
      attractionId,
      screen: {
        id: screen.id, name: screen.name, screenType: screen.screenType,
        rowCount: screen.rowCount, seatsPerRow: screen.seatsPerRow,
        status: screen.status === 'active' ? 'inactive' : 'active',
      },
    }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    load();
  };

  if (layoutFor) {
    return (
      <Card
        title={`Seat layout · ${layoutFor.name}`}
        subtitle="Mix categories, block broken seats and set accessible spaces. The grid mirrors what customers see."
        icon="ph-grid-four"
        action={<Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={() => setLayoutFor(null)}>Screens</Button>}
      >
        <SeatLayoutEditor
          screen={{ ...layoutFor, attractionId }}
          headers={headers}
          onDone={() => { setLayoutFor(null); setNotice('Seat layout saved.'); load(); }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      {editing ? (
        <Card title={editing.id ? `Edit ${editing.name}` : 'Add a screen'} icon="ph-monitor-play">
          <ScreenForm
            initial={editing}
            busy={saving}
            error={formError}
            onCancel={() => { setEditing(null); setFormError(''); }}
            onSave={saveScreen}
          />
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {screens.length} {screens.length === 1 ? 'screen' : 'screens'} · {screens.reduce((sum, s) => sum + (s.seatCount || 0), 0)} seats
          </p>
          <Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_SCREEN })}>Add screen</Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((key) => <div key={key} className="h-32 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : screens.length === 0 && !editing ? (
        <EmptyState
          icon="ph-monitor-play"
          title="No screens yet"
          message="Add your first screen, then paint its seat layout. Showtimes cannot be scheduled until a screen has seats."
          action={<Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_SCREEN })}>Add your first screen</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((screen) => (
            <article key={screen.id} className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                    {screen.name}
                    <Pill tone={screen.status === 'active' ? 'green' : 'slate'}>{screen.status}</Pill>
                  </h4>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {screen.screenType} · {screen.rowCount} rows × {screen.seatsPerRow}
                  </p>
                </div>
                <span className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-center dark:bg-slate-800">
                  <span className="block text-[9px] font-black uppercase text-slate-400">Seats</span>
                  <span className="block text-sm font-black tabular-nums text-slate-900 dark:text-white">{screen.seatCount || 0}</span>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="dark" icon="ph-grid-four" onClick={() => setLayoutFor(screen)}>Seat layout</Button>
                <Button size="sm" variant="ghost" icon="ph-pencil" onClick={() => { setEditing(screen); setFormError(''); }}>Edit</Button>
                <Button size="sm" variant="ghost" icon={screen.status === 'active' ? 'ph-pause' : 'ph-play'} onClick={() => toggleStatus(screen)}>
                  {screen.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button size="sm" variant="danger" icon="ph-trash" onClick={() => removeScreen(screen)}>Delete</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] font-medium text-slate-400">
        Ticket base prices live on each showtime; the per-category multipliers are set in Cinema settings.
      </p>
    </div>
  );
}
