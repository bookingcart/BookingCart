import { useCallback, useEffect, useState } from 'react';
import { cinemaGet, cinemaPost, money } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Field, Notice, Pill, cx, inputCls } from './ui.jsx';
import CinemaLayoutEditor from './CinemaLayoutEditor.jsx';

const SCREEN_TYPES = ['standard', 'imax', '3d', 'vip', 'dolby', '4dx'];
const HALL_KINDS = [
  { id: 'standard', label: 'Standard hall' },
  { id: 'vip', label: 'VIP lounge' },
  { id: 'recliner', label: 'Recliner hall' },
  { id: 'imax', label: 'IMAX' },
  { id: 'dolby', label: 'Dolby' },
  { id: '3d', label: '3D' },
  { id: '4dx', label: '4DX' },
  { id: 'screen', label: 'Screening room' },
];
const BASE_CATEGORIES = ['standard', 'premium', 'vip', 'couple', 'recliner', 'wheelchair', 'companion'];
const ICONS = ['ph-armchair', 'ph-crown', 'ph-bed', 'ph-couch', 'ph-heart', 'ph-wheelchair', 'ph-users', 'ph-star'];

const EMPTY_SCREEN = { id: 0, name: '', screenType: 'standard', hallKind: 'standard', rowCount: 8, seatsPerRow: 12, status: 'active' };
const EMPTY_TYPE = {
  id: 0, name: '', slug: '', color: '#94a3b8', icon: 'ph-armchair', baseCategory: 'standard',
  defaultPrice: '', multiplier: 1, admissions: 1, bookingMode: 'single', groupSize: 1,
  splitAllowed: false, accessible: false, companionRequired: false, instructions: '', status: 'active',
};

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
          hallKind: form.hallKind,
          rowCount: Number(form.rowCount) || 1,
          seatsPerRow: Number(form.seatsPerRow) || 1,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Auditorium name or number" required hint="e.g. Hall 1, Screen 2, IMAX A, VIP Lounge">
          <input required value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Hall 1" />
        </Field>
        <Field label="Hall kind" hint="Shown to customers next to the time">
          <select value={form.hallKind} onChange={(event) => set('hallKind', event.target.value)} className={inputCls}>
            {HALL_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Projection format">
          <select value={form.screenType} onChange={(event) => set('screenType', event.target.value)} className={inputCls}>
            {SCREEN_TYPES.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="Status" hint="Inactive halls cannot be scheduled">
          <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Starting grid" hint="Rows × seats, only for a brand-new hall">
          <div className="flex gap-2">
            <input type="number" min="1" max="30" value={form.rowCount} onChange={(event) => set('rowCount', event.target.value)} className={inputCls} />
            <input type="number" min="1" max="40" value={form.seatsPerRow} onChange={(event) => set('seatsPerRow', event.target.value)} className={inputCls} />
          </div>
        </Field>
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        The starting grid is only a first draft. Open the layout editor afterwards to drag seats, carve aisles, add
        VIP/recliner/couples blocks and set accessible spaces. Capacity always comes from the published layout.
      </p>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Saving…' : 'Save auditorium'}
        </Button>
      </div>
    </form>
  );
}

function SeatTypeForm({ initial, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_TYPE, ...initial });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          defaultPrice: form.defaultPrice === '' ? null : Number(form.defaultPrice),
          multiplier: Number(form.multiplier) || 1,
          admissions: Number(form.admissions) || 1,
          groupSize: Number(form.groupSize) || 1,
        });
      }}
      className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name" required hint="Customers see this on the seat map">
          <input required value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Premium" />
        </Field>
        <Field label="Booking behaviour" hint="Base rules the platform always understands">
          <select value={form.baseCategory} onChange={(event) => set('baseCategory', event.target.value)} className={inputCls}>
            {BASE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Colour">
          <input type="color" value={form.color} onChange={(event) => set('color', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800" />
        </Field>
        <Field label="Icon">
          <select value={form.icon} onChange={(event) => set('icon', event.target.value)} className={inputCls}>
            {ICONS.map((icon) => <option key={icon} value={icon}>{icon.replace('ph-', '')}</option>)}
          </select>
        </Field>
        <Field label="Default price" hint={`Leave blank to use the hall base price`}>
          <input type="number" min="0" step="0.5" value={form.defaultPrice} onChange={(event) => set('defaultPrice', event.target.value)} className={inputCls} placeholder="e.g. 15000" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Base multiplier" hint="Used when no default price">
          <input type="number" min="0" max="20" step="0.05" value={form.multiplier} onChange={(event) => set('multiplier', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Admits" hint="People per seat">
          <input type="number" min="1" max="10" value={form.admissions} onChange={(event) => set('admissions', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Sold as">
          <select value={form.bookingMode} onChange={(event) => set('bookingMode', event.target.value)} className={inputCls}>
            <option value="single">Individually</option>
            <option value="group">As a group</option>
          </select>
        </Field>
      </div>

      {form.bookingMode === 'group' && (
        <Field label="Group size" hint="e.g. 2 for a loveseat">
          <input type="number" min="1" max="12" value={form.groupSize} onChange={(event) => set('groupSize', event.target.value)} className={inputCls} />
        </Field>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[
          { key: 'splitAllowed', label: 'Can be sold in split positions' },
          { key: 'accessible', label: 'Accessible space' },
          { key: 'companionRequired', label: 'Needs a companion seat' },
        ].map((option) => (
          <label key={option.key} className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(form[option.key])}
              onChange={(event) => set(option.key, event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600/30"
            />
            {option.label}
          </label>
        ))}
      </div>

      <Field label="Booking instructions" hint="Shown when a customer picks this seat">
        <input value={form.instructions} onChange={(event) => set('instructions', event.target.value)} className={inputCls} placeholder="e.g. Recliner includes a blanket" />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          Save seat type
        </Button>
      </div>
    </form>
  );
}

function SeatTypesCard({ attractionId, headers, seatTypes, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (values) => {
    setBusy(true);
    const payload = await cinemaPost('seat-type-save', { attractionId, seatType: values }, headers);
    setBusy(false);
    if (!payload.ok) { setError(payload.error || 'Could not save this seat type'); return; }
    setEditing(null);
    setError('');
    onChanged();
  };

  const remove = async (type) => {
    if (!window.confirm(`Delete the ${type.name} seat type?`)) return;
    const payload = await cinemaPost('seat-type-delete', { attractionId, slug: type.slug }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    setError('');
    onChanged();
  };

  return (
    <Card
      title="Seat types"
      subtitle="What you paint with in the editor: colours, prices and booking rules"
      icon="ph-palette"
      action={<Button size="sm" variant="ghost" icon="ph-plus" onClick={() => setEditing({ ...EMPTY_TYPE })}>New type</Button>}
    >
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      {editing && (
        <div className="mb-4">
          <SeatTypeForm
            initial={editing}
            busy={busy}
            error=""
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {seatTypes.map((type) => (
          <article key={type.slug} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-4 w-4 shrink-0 rounded-md border" style={{ backgroundColor: `${type.color}55`, borderColor: type.color }} />
              <div className="min-w-0 flex-1">
                <h4 className="flex flex-wrap items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                  {type.name}
                  {type.status === 'inactive' && <Pill tone="slate">off</Pill>}
                </h4>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {type.baseCategory}
                  {type.admissions > 1 ? ` · admits ${type.admissions}` : ''}
                  {type.bookingMode === 'group' ? ` · group of ${type.groupSize}` : ''}
                  {type.splitAllowed ? ' · splittable' : ''}
                </p>
                <p className="mt-0.5 text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">
                  {type.defaultPrice !== null && type.defaultPrice !== undefined
                    ? money(type.defaultPrice, '')
                    : `×${type.multiplier}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setEditing(type)} title="Edit" className="rounded-md p-1 text-slate-400 hover:text-green-600">
                  <i className="ph ph-pencil-simple" />
                </button>
                <button type="button" onClick={() => remove(type)} title="Delete" className="rounded-md p-1 text-slate-400 hover:text-rose-500">
                  <i className="ph ph-trash" />
                </button>
              </div>
            </div>
            {type.instructions && <p className="mt-1.5 text-[10px] font-semibold text-slate-400">{type.instructions}</p>}
          </article>
        ))}
      </div>
    </Card>
  );
}

export default function CinemaScreensPanel({ attractionId, headers, currency = 'USD' }) {
  const [screens, setScreens] = useState([]);
  const [seatTypes, setSeatTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [editorFor, setEditorFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [screenRes, typeRes] = await Promise.all([
      cinemaGet('screens', { attractionId }, headers),
      cinemaGet('seat-types', { attractionId }, headers),
    ]);
    if (screenRes.ok) { setScreens(screenRes.screens || []); setError(''); }
    else setError(screenRes.error || 'Could not load auditoriums');
    if (typeRes.ok) setSeatTypes(typeRes.seatTypes || []);
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const saveScreen = async (values) => {
    setSaving(true);
    const payload = await cinemaPost('screen-save', { attractionId, screen: values }, headers);
    setSaving(false);
    if (!payload.ok) { setFormError(payload.error || 'Could not save the auditorium'); return; }
    setFormError('');
    setEditing(null);
    setNotice(`${payload.screen.name} saved.`);
    load();
  };

  const removeScreen = async (screen) => {
    if (!window.confirm(`Delete ${screen.name}? Its layout versions are removed too.`)) return;
    const payload = await cinemaPost('screen-delete', { attractionId, screenId: screen.id }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`${screen.name} deleted.`);
    load();
  };

  const duplicate = async (screen) => {
    const targetName = window.prompt('Name for the new auditorium', `${screen.name} copy`);
    if (!targetName) return;
    const payload = await cinemaPost('layout-duplicate', {
      attractionId, sourceScreenId: screen.id, targetName,
    }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`${targetName} created from ${screen.name}. Open its layout to adjust it.`);
    load();
  };

  const toggleStatus = async (screen) => {
    const payload = await cinemaPost('screen-save', {
      attractionId,
      screen: {
        id: screen.id, name: screen.name, screenType: screen.screenType, hallKind: screen.hallKind,
        rowCount: screen.rowCount, seatsPerRow: screen.seatsPerRow,
        status: screen.status === 'active' ? 'inactive' : 'active',
      },
    }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    load();
  };

  if (editorFor) {
    return (
      <Card
        title={`Layout editor · ${editorFor.name}`}
        subtitle="Drag seats, carve aisles, paint seat types and publish when the hall is ready"
        icon="ph-pencil-ruler"
        action={<Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={() => { setEditorFor(null); load(); }}>Auditoriums</Button>}
        bodyClass="p-3"
      >
        <CinemaLayoutEditor
          attractionId={attractionId}
          headers={headers}
          screen={editorFor}
          currency={currency}
          onClose={() => { setEditorFor(null); load(); }}
          onSaved={load}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      {editing ? (
        <Card title={editing.id ? `Edit ${editing.name}` : 'Add an auditorium'} icon="ph-monitor-play">
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
            {screens.length} {screens.length === 1 ? 'auditorium' : 'auditoriums'} · {screens.reduce((sum, screen) => sum + Number(screen.capacity || screen.seatCount || 0), 0)} seats installed
          </p>
          <Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_SCREEN })}>Add auditorium</Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((key) => <div key={key} className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : screens.length === 0 && !editing ? (
        <EmptyState
          icon="ph-monitor-play"
          title="No auditoriums yet"
          message="Create your first hall, then paint its seating layout. Screenings cannot be scheduled until a hall has a published layout."
          action={<Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_SCREEN })}>Add your first auditorium</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((screen) => (
            <article key={screen.id} className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                    {screen.name}
                    <Pill tone={screen.status === 'active' ? 'green' : 'slate'}>{screen.status}</Pill>
                    {screen.draftVersions > 0 && <Pill tone="amber">{screen.draftVersions} draft</Pill>}
                  </h4>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {HALL_KINDS.find((kind) => kind.id === (screen.hallKind || 'standard'))?.label || screen.screenType}
                    {screen.layoutVersion ? ` · layout v${screen.layoutVersion}` : ' · no layout published'}
                  </p>
                </div>
                <span className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-center dark:bg-slate-800">
                  <span className="block text-[9px] font-black uppercase text-slate-400">Capacity</span>
                  <span className="block text-sm font-black tabular-nums text-slate-900 dark:text-white">{screen.capacity || screen.seatCount || 0}</span>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="dark" icon="ph-pencil-ruler" onClick={() => setEditorFor(screen)}>Open editor</Button>
                <Button size="sm" variant="ghost" icon="ph-copy" onClick={() => duplicate(screen)}>Duplicate</Button>
                <Button size="sm" variant="ghost" icon="ph-pencil-simple" onClick={() => { setEditing({ ...screen }); setFormError(''); }}>Details</Button>
                <Button size="sm" variant="ghost" icon={screen.status === 'active' ? 'ph-pause' : 'ph-play'} onClick={() => toggleStatus(screen)}>
                  {screen.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button size="sm" variant="danger" icon="ph-trash" onClick={() => removeScreen(screen)}>Delete</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <SeatTypesCard attractionId={attractionId} headers={headers} seatTypes={seatTypes} onChanged={load} />

      <p className="px-1 text-[11px] font-medium text-slate-400">
        Publishing a new layout only affects screenings scheduled afterwards. Screenings that already sold seats keep
        the exact layout they were sold on, so no ticket ever moves.
      </p>
    </div>
  );
}
