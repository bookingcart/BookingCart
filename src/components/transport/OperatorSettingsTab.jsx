import { useCallback, useEffect, useMemo, useState } from 'react';
import { operatorGet, operatorPost } from '../../lib/transportClient.js';
import {
  Badge, ErrorNote, Field, Loading, Note, Panel, btn, inputCls,
} from './ConsoleKit.jsx';

const NUMBERS = [
  { key: 'serviceFeePercent', label: 'Service fee %', min: 0, max: 30, hint: 'Added to every online booking' },
  { key: 'taxPercent', label: 'Tax %', min: 0, max: 50, hint: 'Shown as a separate line on the ticket' },
  { key: 'refundWindowHours', label: 'Refund window (hours)', min: 0, max: 720, hint: '0 means refunds are always available' },
  { key: 'cancellationFeePercent', label: 'Cancellation fee %', min: 0, max: 100, hint: 'Withheld from the refund' },
  { key: 'boardingCutoffMinutes', label: 'Boarding cutoff (minutes)', min: 0, max: 240, hint: 'Default for new departures' },
  { key: 'salesCloseMinutes', label: 'Sales close (minutes before)', min: 0, max: 1440, hint: '0 sells right up to departure' },
  { key: 'holdMinutes', label: 'Seat hold (minutes)', min: 3, max: 120, hint: 'How long an unpaid reservation keeps its seats' },
];

/** Company profile, policies and the numbers that drive fares and refunds. */
export default function OperatorSettingsTab({ operatorId, headers, can }) {
  const [operator, setOperator] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('settings', operatorId, {}, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load your settings'); return; }
    setError('');
    setOperator(result.operator);
    setForm({
      description: result.operator.description || '',
      logoUrl: result.operator.logoUrl || '',
      website: result.operator.website || '',
      phone: result.operator.contact?.phone || '',
      email: result.operator.contact?.email || '',
      address: result.operator.contact?.address || '',
      luggagePolicy: result.operator.policies?.luggage || '',
      cancellationPolicy: result.operator.policies?.cancellation || '',
      childPolicy: result.operator.policies?.children || '',
      ...result.operator.settings,
    });
  }, [operatorId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNote('');
    const result = await operatorPost('settings-save', operatorId, {
      settings: {
        description: form.description,
        logoUrl: form.logoUrl,
        website: form.website,
        contact: { phone: form.phone, email: form.email, address: form.address },
        policies: { luggage: form.luggagePolicy, cancellation: form.cancellationPolicy, children: form.childPolicy },
        serviceFeePercent: form.serviceFeePercent,
        taxPercent: form.taxPercent,
        refundWindowHours: form.refundWindowHours,
        cancellationFeePercent: form.cancellationFeePercent,
        boardingCutoffMinutes: form.boardingCutoffMinutes,
        salesCloseMinutes: form.salesCloseMinutes,
        holdMinutes: form.holdMinutes,
        allowOnline: form.allowOnline,
        allowPayAtCounter: form.allowPayAtCounter,
      },
    }, authHeaders);
    setSaving(false);
    if (!result.ok) { setError(result.error || 'Could not save those settings'); return; }
    setError('');
    setOperator(result.operator);
    setNote('Settings saved. New bookings use these numbers immediately.');
  };

  if (loading || !form) return <Loading label="Loading your company profile…" />;

  if (!can('settings')) {
    return (
      <div className="space-y-4">
        <Note tone="amber">Only the owner can change company settings. You can still see them here.</Note>
        <Panel title={operator?.name} subtitle="Company profile">
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            {[
              ['Status', operator?.status],
              ['Owner', operator?.ownerEmail],
              ['Website', operator?.website || '—'],
              ['Phone', operator?.contact?.phone || '—'],
              ['Commission', `${operator?.commissionPercent || 0}%`],
              ['Seat hold', `${operator?.holdMinutes || 0} minutes`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-1 dark:border-slate-800">
                <dt className="font-bold text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="font-black text-slate-800 dark:text-slate-100">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <ErrorNote message={error} />
      {note && <Note>{note}</Note>}

      <Panel
        title={operator?.name || 'Company profile'}
        subtitle={operator?.status === 'approved' ? 'Approved and selling' : 'Waiting for platform approval'}
        actions={<Badge status={operator?.status} />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo URL" className="sm:col-span-2" hint="Square images look best on tickets">
            <input value={form.logoUrl} onChange={update('logoUrl')} className={inputCls} placeholder="https://…" />
          </Field>
          <Field label="About your company" className="sm:col-span-2" hint="Shown on your public operator page">
            <textarea value={form.description} onChange={update('description')} rows={3} className={inputCls} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={update('website')} className={inputCls} placeholder="https://…" />
          </Field>
          <Field label="Support phone">
            <input value={form.phone} onChange={update('phone')} className={inputCls} />
          </Field>
          <Field label="Support email">
            <input type="email" value={form.email} onChange={update('email')} className={inputCls} />
          </Field>
          <Field label="Office address">
            <input value={form.address} onChange={update('address')} className={inputCls} />
          </Field>
        </div>
      </Panel>

      <Panel title="Pricing & refunds" subtitle="Applied on the server, so the website and the counter always agree">
        <div className="grid gap-3 sm:grid-cols-3">
          {NUMBERS.map((entry) => (
            <Field key={entry.key} label={entry.label} hint={entry.hint}>
              <input
                type="number"
                min={entry.min}
                max={entry.max}
                step="0.5"
                value={form[entry.key] ?? 0}
                onChange={update(entry.key)}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
            <input type="checkbox" checked={form.allowOnline === true} onChange={update('allowOnline')} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>
              <span className="block font-black text-slate-800 dark:text-slate-100">Sell on the website</span>
              <span className="text-slate-500 dark:text-slate-400">Turn off to pause online sales without touching departures.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
            <input type="checkbox" checked={form.allowPayAtCounter === true} onChange={update('allowPayAtCounter')} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>
              <span className="block font-black text-slate-800 dark:text-slate-100">Counter sales</span>
              <span className="text-slate-500 dark:text-slate-400">Ticketing staff can sell seats at the station.</span>
            </span>
          </label>
        </div>
      </Panel>

      <Panel title="Policies" subtitle="Shown to customers before they pay">
        <div className="space-y-3">
          <Field label="Luggage allowance">
            <textarea value={form.luggagePolicy} onChange={update('luggagePolicy')} rows={2} className={inputCls} placeholder="2 bags up to 25kg total…" />
          </Field>
          <Field label="Cancellation policy">
            <textarea value={form.cancellationPolicy} onChange={update('cancellationPolicy')} rows={2} className={inputCls} />
          </Field>
          <Field label="Children & infants">
            <textarea value={form.childPolicy} onChange={update('childPolicy')} rows={2} className={inputCls} />
          </Field>
        </div>
      </Panel>

      <div className="flex justify-end">
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-floppy-disk" aria-hidden="true" />}
          Save settings
        </button>
      </div>
    </form>
  );
}
