import { useCallback, useEffect, useMemo, useState } from 'react';
import { ownerGet, ownerPost, money } from '../../lib/ticketingClient.js';
import {
  Badge, Button, EmptyState, ErrorNote, Field, inputClass, Loading, Modal,
  Notice, Panel, StatusBadge,
} from './TicketingShared.jsx';

const CATEGORY_OPTIONS = [
  ['adult', 'Adult'], ['child', 'Child'], ['student', 'Student'], ['family', 'Family package'],
  ['group', 'Group'], ['vip', 'VIP'], ['resident', 'Resident'], ['international', 'International visitor'],
  ['guided', 'Guided tour'], ['event', 'Special event'],
];

const REFUND_OPTIONS = [
  ['flexible', 'Flexible — full refund before the visit'],
  ['moderate', 'Moderate — full refund outside the window'],
  ['non_refundable', 'Non-refundable'],
];

const BLANK_FORM = {
  id: null,
  name: '',
  description: '',
  category: 'adult',
  visitorCategory: '',
  price: '',
  currency: 'USD',
  minAge: '',
  maxAge: '',
  admissions: 1,
  capacityTotal: 0,
  dailyCapacity: 0,
  minPerOrder: 1,
  maxPerOrder: 10,
  salesStart: '',
  salesEnd: '',
  validFrom: '',
  validTo: '',
  requiresDate: true,
  slotRequired: false,
  refundPolicy: 'moderate',
  refundWindowHours: 24,
  cancellationFeePercent: 0,
  imageUrl: '',
  terms: '',
  status: 'active',
  sortOrder: 0,
  slots: [],
};

function toForm(type) {
  if (!type) return { ...BLANK_FORM };
  return {
    id: type.id,
    name: type.name || '',
    description: type.description || '',
    category: type.category || 'adult',
    visitorCategory: type.visitorCategory || '',
    price: type.price ?? '',
    currency: type.currency || 'USD',
    minAge: type.minAge ?? '',
    maxAge: type.maxAge ?? '',
    admissions: type.admissions ?? 1,
    capacityTotal: type.capacityTotal ?? 0,
    dailyCapacity: type.dailyCapacity ?? 0,
    minPerOrder: type.minPerOrder ?? 1,
    maxPerOrder: type.maxPerOrder ?? 10,
    salesStart: type.salesStart ? String(type.salesStart).slice(0, 10) : '',
    salesEnd: type.salesEnd ? String(type.salesEnd).slice(0, 10) : '',
    validFrom: type.validFrom ? String(type.validFrom).slice(0, 10) : '',
    validTo: type.validTo ? String(type.validTo).slice(0, 10) : '',
    requiresDate: type.requiresDate !== false,
    slotRequired: Boolean(type.slotRequired),
    refundPolicy: type.refundPolicy || 'moderate',
    refundWindowHours: type.refundWindowHours ?? 24,
    cancellationFeePercent: type.cancellationFeePercent ?? 0,
    imageUrl: type.imageUrl || '',
    terms: type.terms || '',
    status: type.status || 'active',
    sortOrder: type.sortOrder ?? 0,
    slots: (type.slots || []).map((slot) => ({
      label: slot.label || '', startTime: slot.startTime || '', endTime: slot.endTime || '', capacity: slot.capacity || 0,
    })),
  };
}

export default function TicketTypesPanel({ attractionId, headers, currency, canManage }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    const data = await ownerGet('ticket-types', { attractionId, includeArchived: showArchived ? '1' : '' }, headers);
    if (data.ok) { setTypes(data.ticketTypes || []); setError(''); }
    else setError(data.error || 'Could not load ticket types');
    setLoading(false);
  }, [attractionId, headers, showArchived]);

  useEffect(() => { load(); }, [load]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startCreate = () => {
    setForm({ ...BLANK_FORM, currency: currency || 'USD', slots: [] });
    setFormError('');
    setOpen(true);
  };

  const startEdit = (type) => {
    setForm(toForm(type));
    setFormError('');
    setOpen(true);
  };

  const addSlot = () => patch('slots', [
    ...form.slots,
    { label: '', startTime: '', endTime: '', capacity: 0 },
  ]);

  const updateSlot = (index, key, value) => {
    patch('slots', form.slots.map((slot, position) => (position === index ? { ...slot, [key]: value } : slot)));
  };

  const removeSlot = (index) => patch('slots', form.slots.filter((_, position) => position !== index));

  const save = async () => {
    setSaving(true);
    setFormError('');
    const payload = {
      ...form,
      price: form.price === '' ? '' : Number(form.price),
      minAge: form.minAge === '' ? null : Number(form.minAge),
      maxAge: form.maxAge === '' ? null : Number(form.maxAge),
      salesStart: form.salesStart || null,
      salesEnd: form.salesEnd || null,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      slots: form.slotRequired ? form.slots : [],
    };
    const data = await ownerPost('save-ticket-type', {
      attractionId, id: form.id || undefined, ticketType: payload,
    }, headers);
    setSaving(false);
    if (!data.ok) { setFormError(data.error || 'Could not save this ticket type'); return; }
    setOpen(false);
    setNotice(form.id ? 'Ticket type updated.' : 'Ticket type created.');
    load();
  };

  const changeStatus = async (type, status) => {
    setBusyId(type.id);
    const data = await ownerPost('set-ticket-type-status', { attractionId, id: type.id, status }, headers);
    setBusyId(null);
    if (!data.ok) { setError(data.error || 'Could not change the status'); return; }
    setNotice(status === 'archived' ? 'Ticket type archived.' : status === 'active' ? 'Ticket type published.' : 'Ticket type deactivated.');
    load();
  };

  const duplicate = async (type) => {
    setBusyId(type.id);
    const data = await ownerPost('duplicate-ticket-type', { attractionId, id: type.id }, headers);
    setBusyId(null);
    if (!data.ok) { setError(data.error || 'Could not duplicate this ticket type'); return; }
    setNotice('Ticket type duplicated as an inactive draft.');
    load();
  };

  const stats = useMemo(() => ({
    active: types.filter((type) => type.status === 'active').length,
    inactive: types.filter((type) => type.status === 'inactive').length,
    lowest: types.length ? Math.min(...types.map((type) => Number(type.price) || 0)) : 0,
  }), [types]);

  return (
    <div className="space-y-5">
      <Panel
        title="Ticket types & pricing"
        icon="ph-ticket"
        subtitle={`${stats.active} live · ${stats.inactive} paused · from ${money(stats.lowest, currency)}`}
        actions={(
          <>
            <Button variant="soft" size="sm" icon={showArchived ? 'ph-eye-slash' : 'ph-archive'}
              onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
            {canManage && <Button size="sm" icon="ph-plus" onClick={startCreate}>New ticket type</Button>}
          </>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        {loading ? (
          <Loading label="Loading ticket types…" />
        ) : !types.length ? (
          <EmptyState
            icon="ph-ticket"
            title="No ticket types yet"
            message="Create your first ticket type to start selling. Adult, child, family and group tickets can all live side by side."
            action={canManage ? <Button icon="ph-plus" onClick={startCreate}>Create ticket type</Button> : null}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {types.map((type) => (
              <article key={type.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 dark:text-white truncate">{type.name}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-0.5">
                      {(CATEGORY_OPTIONS.find(([value]) => value === type.category) || [type.category, type.category])[1]}
                      {type.visitorCategory ? ` · ${type.visitorCategory}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={type.status} />
                </div>

                <p className="mt-2 text-2xl font-black text-green-600">{money(type.price, type.currency || currency)}</p>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {type.admissions} admission(s) per ticket
                  {type.minAge !== null || type.maxAge !== null
                    ? ` · ages ${type.minAge ?? 0}–${type.maxAge ?? '∞'}`
                    : ''}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1">
                    {type.dailyCapacity > 0 ? `${type.dailyCapacity}/day` : 'No daily cap'}
                  </span>
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1">
                    {type.capacityTotal > 0 ? `${type.capacityTotal} total` : 'No total cap'}
                  </span>
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1">
                    Max {type.maxPerOrder}/order
                  </span>
                  <span className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1">
                    {type.slotRequired ? `${type.slots?.length || 0} time slot(s)` : 'No time slots'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={type.refundPolicy === 'non_refundable' ? 'rose' : 'emerald'}>
                    {String(type.refundPolicy || '').replace(/_/g, ' ')}
                  </Badge>
                  {type.salesStart && <Badge tone="slate">from {String(type.salesStart).slice(0, 10)}</Badge>}
                  {type.validTo && <Badge tone="slate">until {String(type.validTo).slice(0, 10)}</Badge>}
                </div>

                {canManage && (
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-200 dark:border-slate-700 pt-3 mt-auto">
                    <Button size="sm" variant="soft" icon="ph-pencil-simple" onClick={() => startEdit(type)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon="ph-copy" disabled={busyId === type.id} onClick={() => duplicate(type)}>Duplicate</Button>
                    {type.status === 'active' && (
                      <Button size="sm" variant="ghost" icon="ph-pause" disabled={busyId === type.id} onClick={() => changeStatus(type, 'inactive')}>Deactivate</Button>
                    )}
                    {type.status === 'inactive' && (
                      <Button size="sm" variant="ghost" icon="ph-play" disabled={busyId === type.id} onClick={() => changeStatus(type, 'active')}>Publish</Button>
                    )}
                    {type.status !== 'archived' && (
                      <Button size="sm" variant="ghost" icon="ph-archive" disabled={busyId === type.id} onClick={() => changeStatus(type, 'archived')}>Archive</Button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit ticket type' : 'New ticket type'} wide>
        <ErrorNote message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ticket name" className="sm:col-span-2">
            <input className={inputClass} value={form.name} onChange={(event) => patch('name', event.target.value)} placeholder="Adult admission" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className={inputClass} rows={2} value={form.description} onChange={(event) => patch('description', event.target.value)} placeholder="What the ticket includes" />
          </Field>
          <Field label="Category">
            <select className={inputClass} value={form.category} onChange={(event) => patch('category', event.target.value)}>
              {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Eligible visitor" hint="e.g. Adults 18+, Students with ID">
            <input className={inputClass} value={form.visitorCategory} onChange={(event) => patch('visitorCategory', event.target.value)} />
          </Field>
          <Field label="Price">
            <input type="number" min="0" step="0.01" className={inputClass} value={form.price} onChange={(event) => patch('price', event.target.value)} />
          </Field>
          <Field label="Currency">
            <input className={`${inputClass} uppercase`} maxLength={3} value={form.currency} onChange={(event) => patch('currency', event.target.value.toUpperCase())} />
          </Field>
          <Field label="Min age">
            <input type="number" min="0" max="120" className={inputClass} value={form.minAge} onChange={(event) => patch('minAge', event.target.value)} />
          </Field>
          <Field label="Max age">
            <input type="number" min="0" max="120" className={inputClass} value={form.maxAge} onChange={(event) => patch('maxAge', event.target.value)} />
          </Field>
          <Field label="Admissions per ticket" hint="Family ticket = 4, group ticket = 10…">
            <input type="number" min="1" max="200" className={inputClass} value={form.admissions} onChange={(event) => patch('admissions', event.target.value)} />
          </Field>
          <Field label="Total sales limit" hint="0 = unlimited">
            <input type="number" min="0" className={inputClass} value={form.capacityTotal} onChange={(event) => patch('capacityTotal', event.target.value)} />
          </Field>
          <Field label="Daily capacity" hint="0 = unlimited">
            <input type="number" min="0" className={inputClass} value={form.dailyCapacity} onChange={(event) => patch('dailyCapacity', event.target.value)} />
          </Field>
          <Field label="Max per order">
            <input type="number" min="1" max="50" className={inputClass} value={form.maxPerOrder} onChange={(event) => patch('maxPerOrder', event.target.value)} />
          </Field>
          <Field label="Min per order">
            <input type="number" min="1" max="50" className={inputClass} value={form.minPerOrder} onChange={(event) => patch('minPerOrder', event.target.value)} />
          </Field>
          <Field label="Sort order" hint="Lower numbers show first">
            <input type="number" className={inputClass} value={form.sortOrder} onChange={(event) => patch('sortOrder', event.target.value)} />
          </Field>
          <Field label="Sales start">
            <input type="date" className={inputClass} value={form.salesStart} onChange={(event) => patch('salesStart', event.target.value)} />
          </Field>
          <Field label="Sales end">
            <input type="date" className={inputClass} value={form.salesEnd} onChange={(event) => patch('salesEnd', event.target.value)} />
          </Field>
          <Field label="Valid from">
            <input type="date" className={inputClass} value={form.validFrom} onChange={(event) => patch('validFrom', event.target.value)} />
          </Field>
          <Field label="Valid to">
            <input type="date" className={inputClass} value={form.validTo} onChange={(event) => patch('validTo', event.target.value)} />
          </Field>
          <Field label="Refund policy" className="sm:col-span-2">
            <select className={inputClass} value={form.refundPolicy} onChange={(event) => patch('refundPolicy', event.target.value)}>
              {REFUND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Cancellation window (hours)">
            <input type="number" min="0" max="720" className={inputClass} value={form.refundWindowHours} onChange={(event) => patch('refundWindowHours', event.target.value)} />
          </Field>
          <Field label="Late cancellation fee (%)">
            <input type="number" min="0" max="100" step="0.5" className={inputClass} value={form.cancellationFeePercent} onChange={(event) => patch('cancellationFeePercent', event.target.value)} />
          </Field>
          <Field label="Ticket image URL" className="sm:col-span-2">
            <input className={inputClass} value={form.imageUrl} onChange={(event) => patch('imageUrl', event.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Terms & conditions" className="sm:col-span-2">
            <textarea className={inputClass} rows={2} value={form.terms} onChange={(event) => patch('terms', event.target.value)} />
          </Field>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.requiresDate} onChange={(event) => patch('requiresDate', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-green-600" />
            Requires a visit date
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.slotRequired} onChange={(event) => patch('slotRequired', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-green-600" />
            Requires an entry time slot
          </label>
        </div>

        {form.slotRequired && (
          <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 dark:text-white">Entry time slots</h4>
              <Button size="sm" variant="soft" icon="ph-plus" onClick={addSlot}>Add slot</Button>
            </div>
            {!form.slots.length && <p className="mt-2 text-xs text-slate-500">Add at least one slot so visitors can pick an entry time.</p>}
            <div className="mt-3 space-y-2">
              {form.slots.map((slot, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input className={`${inputClass} sm:col-span-2`} placeholder="Label (09:00 – 11:00)" value={slot.label} onChange={(event) => updateSlot(index, 'label', event.target.value)} />
                  <input type="time" className={inputClass} value={slot.startTime} onChange={(event) => updateSlot(index, 'startTime', event.target.value)} />
                  <input type="time" className={inputClass} value={slot.endTime} onChange={(event) => updateSlot(index, 'endTime', event.target.value)} />
                  <div className="flex gap-2">
                    <input type="number" min="0" className={inputClass} placeholder="Cap" value={slot.capacity} onChange={(event) => updateSlot(index, 'capacity', event.target.value)} />
                    <button type="button" onClick={() => removeSlot(index)} className="shrink-0 rounded-xl px-2 text-rose-500 hover:bg-rose-50">
                      <i className="ph ph-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
          <Button variant="soft" onClick={() => setOpen(false)}>Cancel</Button>
          <Button icon="ph-check" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save ticket type'}</Button>
        </div>
      </Modal>
    </div>
  );
}
