import { useCallback, useEffect, useState } from 'react';
import { cinemaGet, cinemaPost } from '../../lib/cinemaClient.js';
import { Button, Card, Field, Notice, cx, inputCls } from './ui.jsx';

const CATEGORIES = [
  { id: 'standard', label: 'Standard' },
  { id: 'premium', label: 'Premium' },
  { id: 'vip', label: 'VIP' },
  { id: 'couple', label: 'Couple' },
  { id: 'recliner', label: 'Recliner' },
  { id: 'wheelchair', label: 'Wheelchair space' },
  { id: 'companion', label: 'Companion' },
];

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3.5 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" />
      <span>
        <span className="block text-xs font-black text-slate-800 dark:text-slate-100">{label}</span>
        <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{hint}</span>
      </span>
    </label>
  );
}

export default function CinemaSettingsPanel({ attractionId, headers, onSaved, onOpenVenueSettings }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('settings', { attractionId }, headers);
    if (payload.ok) { setSettings(payload.settings); setError(''); }
    else setError(payload.error || 'Could not load the cinema settings');
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const setPrice = (category, value) => setSettings((current) => ({
    ...current,
    categoryPrices: { ...current.categoryPrices, [category]: value },
  }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = await cinemaPost('settings-save', { attractionId, settings }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not save the settings'); return; }
    setSettings(payload.settings);
    setError('');
    setNotice('Cinema settings saved.');
    onSaved?.();
  };

  if (loading) return <div className="h-56 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  if (!settings) return <Notice tone="error">{error || 'Settings unavailable'}</Notice>;

  return (
    <form onSubmit={save} className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <Card title="Seat holds & fees" subtitle="Applied to every new booking at this cinema" icon="ph-sliders-horizontal">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Hold length (minutes)" hint="How long seats stay locked while a customer pays (3–30)">
            <input type="number" min="3" max="30" value={settings.holdMinutes} onChange={(event) => set('holdMinutes', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Booking fee (%)" hint="Added on top of the seat subtotal">
            <input type="number" min="0" max="30" step="0.1" value={settings.serviceFeePercent} onChange={(event) => set('serviceFeePercent', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Tax (%)" hint="Applied to seats + booking fee">
            <input type="number" min="0" max="50" step="0.1" value={settings.taxPercent} onChange={(event) => set('taxPercent', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Refund window (hours)" hint="0 disables self-service refunds">
            <input type="number" min="0" max="720" value={settings.refundWindowHours} onChange={(event) => set('refundWindowHours', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Cancellation fee (%)" hint="Deducted from a refund">
            <input type="number" min="0" max="100" step="0.1" value={settings.cancellationFeePercent} onChange={(event) => set('cancellationFeePercent', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Cleaning buffer (minutes)" hint="Blocked between two screenings on one screen">
            <input type="number" min="0" max="90" value={settings.cleaningMinutes} onChange={(event) => set('cleaningMinutes', event.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle
            checked={Boolean(settings.allowOnline)}
            onChange={(value) => set('allowOnline', value)}
            label="Online card payments"
            hint="Customers can pay by card on the website. Turn off to accept only box-office payment."
          />
          <Toggle
            checked={Boolean(settings.allowPayAtVenue)}
            onChange={(value) => set('allowPayAtVenue', value)}
            label="Reserve & pay at the box office"
            hint="Seats are held until the hold expires, then released automatically."
          />
        </div>
      </Card>

      <Card title="Seat category multipliers" subtitle="Multiplied by each showtime’s base price; individual seats can still be overridden" icon="ph-armchair">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <label key={category.id} className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{category.label}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.05"
                  value={settings.categoryPrices?.[category.id] ?? 1}
                  onChange={(event) => setPrice(category.id, event.target.value)}
                  className={cx(inputCls, 'py-2')}
                />
                <span className="text-[11px] font-black text-slate-400">×</span>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Couple seats admit two people. Wheelchair spaces and companions are priced independently so an accessible
          booking never costs more than a standard seat.
        </p>
      </Card>

      <Card title="Venue details" subtitle="Address, amenities, opening hours and photos live on the attraction profile" icon="ph-storefront">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Customers see those details on your public cinema page. Update them in Profile Settings so the cinema listing
          and the attraction listing never drift apart.
        </p>
        <div className="mt-3">
          <Button variant="ghost" icon="ph-arrow-square-out" onClick={onOpenVenueSettings}>Open Profile Settings</Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" icon={saving ? 'ph-circle-notch' : 'ph-floppy-disk'} disabled={saving} className={saving ? '[&>i]:animate-spin' : ''}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
