import { useCallback, useEffect, useMemo, useState } from 'react';
import { cinemaGet, cinemaPost, money, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, Field, Notice, Pill, cx, inputCls } from './ui.jsx';

// Mirrors lib/cinema-layout.js: the highest priority active rule that matches a
// date wins, and its result is frozen onto the screening.
const SCOPES = [
  { id: 'all', label: 'Every screening', hint: 'A default multiplier or surcharge' },
  { id: 'weekday', label: 'Weekdays', hint: 'Cheaper Monday to Thursday, for example' },
  { id: 'weekend', label: 'Weekends', hint: 'Friday, Saturday and Sunday by default' },
  { id: 'date', label: 'Dates or holidays', hint: 'A holiday season, a festival, a school break' },
  { id: 'screening', label: 'One screening', hint: 'A premiere or a special event' },
];

const WEEKDAYS = [
  { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' }, { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' }, { id: 7, label: 'Sun' },
];

const EMPTY_RULE = {
  id: 0, name: '', scope: 'all', weekdays: [], dateFrom: '', dateTo: '', showtimeId: 0,
  adjustment: 'multiplier', value: 1, categoryPrices: {}, priority: 0, status: 'active',
};

function scopeLabel(rule) {
  if (rule.scope === 'screening') return rule.showtimeLabel || 'One screening';
  if (rule.scope === 'date') return [rule.dateFrom, rule.dateTo].filter(Boolean).join(' → ') || 'Dates';
  if (rule.scope === 'weekday' || rule.scope === 'weekend') {
    const days = rule.weekdays?.length ? rule.weekdays : [6, 7];
    return days.map((day) => WEEKDAYS.find((entry) => entry.id === day)?.label || day).join(' ');
  }
  return 'Every screening';
}

function adjustmentLabel(rule) {
  if (rule.adjustment === 'amount') return `${rule.value >= 0 ? '+' : ''}${rule.value} on every seat`;
  return `×${rule.value} on every seat`;
}

// ─── Seat type prices ────────────────────────────────────────────────────────

function SeatPricesCard({ attractionId, headers, seatTypes, currency, onChanged }) {
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const next = {};
    for (const type of seatTypes) next[type.slug] = type.defaultPrice === null ? '' : String(type.defaultPrice);
    setPrices(next);
  }, [seatTypes]);

  const dirty = useMemo(() => seatTypes.filter((type) => {
    const current = prices[type.slug];
    if (current === undefined) return false;
    const original = type.defaultPrice === null ? '' : String(type.defaultPrice);
    return String(current) !== original;
  }), [prices, seatTypes]);

  const save = async () => {
    setBusy(true);
    setError('');
    let failed = '';
    for (const type of dirty) {
      const raw = prices[type.slug];
      const payload = await cinemaPost('seat-type-save', {
        attractionId,
        seatType: { ...type, defaultPrice: raw === '' ? null : Number(raw) },
      }, headers);
      if (!payload.ok) { failed = payload.error || `Could not save ${type.name}`; break; }
    }
    setBusy(false);
    if (failed) { setError(failed); return; }
    setNotice(`Saved ${dirty.length} seat ${dirty.length === 1 ? 'price' : 'prices'}. Screenings already scheduled keep their frozen prices.`);
    onChanged();
  };

  return (
    <Card
      title="Seat prices"
      subtitle="The price of one seat of each type, before any weekday or holiday rule"
      icon="ph-tag"
      action={(
        <Button size="sm" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy || !dirty.length} onClick={save} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Saving…' : dirty.length ? `Save ${dirty.length}` : 'Saved'}
        </Button>
      )}
    >
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {seatTypes.map((type) => (
          <label key={type.slug} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <span className="flex items-center gap-1.5 text-[11px] font-black text-slate-900 dark:text-white">
              <span className="h-3 w-3 rounded-sm border" style={{ backgroundColor: `${type.color}55`, borderColor: type.color }} />
              {type.name}
              {type.bookingMode === 'group' && <Pill tone="sky">pair</Pill>}
            </span>
            <span className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="0.5"
                value={prices[type.slug] ?? ''}
                placeholder={`default ×${type.multiplier}`}
                onChange={(event) => setPrices((current) => ({ ...current, [type.slug]: event.target.value }))}
                className={cx(inputCls, 'py-1.5 text-xs')}
              />
              <span className="shrink-0 text-[10px] font-black uppercase text-slate-400">{currency}</span>
            </span>
            <span className="mt-1 block text-[10px] font-semibold text-slate-400">
              {type.defaultPrice === null
                ? 'Falls back to the hall base price ×' + type.multiplier
                : `Currently ${money(type.defaultPrice, currency)}`}
              {type.admissions > 1 ? ` · admits ${type.admissions}` : ''}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-3 text-[11px] font-medium text-slate-400">
        Leave a price blank to keep the multiplier. Seats can still carry an individual price from the layout editor,
        and that always wins.
      </p>
    </Card>
  );
}

// ─── Rules ───────────────────────────────────────────────────────────────────

function RuleForm({ initial, seatTypes, showtimes, busy, onCancel, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_RULE, ...initial });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const [category, setCategory] = useState({ slug: '', price: '' });

  const toggleDay = (day) => setForm((current) => {
    const days = new Set(current.weekdays || []);
    if (days.has(day)) days.delete(day); else days.add(day);
    return { ...current, weekdays: Array.from(days).sort() };
  });

  const addCategoryPrice = () => {
    if (!category.slug || category.price === '') return;
    setForm((current) => ({
      ...current,
      categoryPrices: { ...current.categoryPrices, [category.slug]: Number(category.price) },
    }));
    setCategory({ slug: '', price: '' });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, weekdays: form.scope === 'weekday' || form.scope === 'weekend' ? form.weekdays : [] });
      }}
      className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rule name" required hint="e.g. Weekend surcharge, Christmas week">
          <input required value={form.name} onChange={(event) => set('name', event.target.value)} className={inputCls} placeholder="Weekend surcharge" />
        </Field>
        <Field label="Applies to">
          <select value={form.scope} onChange={(event) => set('scope', event.target.value)} className={inputCls}>
            {SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
          </select>
        </Field>
      </div>

      {(form.scope === 'weekday' || form.scope === 'weekend') && (
        <Field label="Days" hint={form.scope === 'weekend' ? 'Leave empty to use Friday, Saturday and Sunday' : 'Pick the days this rule applies to'}>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-[10px] font-black',
                  (form.weekdays || []).includes(day.id)
                    ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                    : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {form.scope === 'date' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" required>
            <input type="date" required value={form.dateFrom} onChange={(event) => set('dateFrom', event.target.value)} className={inputCls} />
          </Field>
          <Field label="To" required>
            <input type="date" required value={form.dateTo} onChange={(event) => set('dateTo', event.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      {form.scope === 'screening' && (
        <Field label="Screening" required>
          <select value={form.showtimeId} onChange={(event) => set('showtimeId', Number(event.target.value))} className={inputCls}>
            <option value={0}>Choose a screening…</option>
            {showtimes.map((showtime) => (
              <option key={showtime.id} value={showtime.id}>
                {showtime.movieTitle} · {showtime.screenName} · {showtime.showDate} {showtime.startTime}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Adjustment">
          <select value={form.adjustment} onChange={(event) => set('adjustment', event.target.value)} className={inputCls}>
            <option value="multiplier">Multiply</option>
            <option value="amount">Add amount</option>
          </select>
        </Field>
        <Field label={form.adjustment === 'amount' ? 'Amount' : 'Multiplier'}>
          <input type="number" min="0" step="0.05" value={form.value} onChange={(event) => set('value', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Priority" hint="Higher wins">
          <input type="number" min="0" max="1000" value={form.priority} onChange={(event) => set('priority', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Paused</option>
          </select>
        </Field>
      </div>

      <Field label="Fixed price per seat type" hint="Optional. Overrides the adjustment for the types you list.">
        <div className="space-y-1.5">
          {Object.entries(form.categoryPrices || {}).map(([slug, value]) => (
            <div key={slug} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold dark:bg-slate-800/60">
              <span className="text-slate-600 dark:text-slate-300">{seatTypes.find((type) => type.slug === slug)?.name || slug}</span>
              <span className="flex items-center gap-2 tabular-nums text-slate-900 dark:text-white">
                {value}
                <button
                  type="button"
                  onClick={() => setForm((current) => {
                    const next = { ...current.categoryPrices };
                    delete next[slug];
                    return { ...current, categoryPrices: next };
                  })}
                  className="text-slate-400 hover:text-rose-500"
                  aria-label={`Remove ${slug} price`}
                >
                  <i className="ph ph-x" />
                </button>
              </span>
            </div>
          ))}
          <div className="flex gap-1.5">
            <select value={category.slug} onChange={(event) => setCategory((current) => ({ ...current, slug: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')}>
              <option value="">Seat type…</option>
              {seatTypes.map((type) => <option key={type.slug} value={type.slug}>{type.name}</option>)}
            </select>
            <input
              type="number"
              min="0"
              step="0.5"
              value={category.price}
              placeholder="Price"
              onChange={(event) => setCategory((current) => ({ ...current, price: event.target.value }))}
              className={cx(inputCls, 'w-28 py-1.5 text-xs')}
            />
            <Button size="sm" variant="ghost" onClick={addCategoryPrice}>Add</Button>
          </div>
        </div>
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          Save rule
        </Button>
      </div>
    </form>
  );
}

// ─── Snapshot preview ────────────────────────────────────────────────────────

function PricePreviewCard({ attractionId, headers, seatTypes, showtimes, currency }) {
  const [date, setDate] = useState(todayISO());
  const [basePrice, setBasePrice] = useState('');
  const [showtimeId, setShowtimeId] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  // Start from a real ticket price so the preview reads in the cinema's own money
  // instead of an arbitrary placeholder.
  useEffect(() => {
    if (basePrice !== '' || !showtimes.length) return;
    const priced = showtimes.find((showtime) => Number(showtime.basePrice) > 0);
    if (priced) setBasePrice(String(priced.basePrice));
  }, [basePrice, showtimes]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const payload = await cinemaPost('pricing-preview', {
        attractionId,
        date,
        basePrice: Number(basePrice) || 0,
        showtimeId: showtimeId || 0,
      }, headers);
      if (cancelled) return;
      if (!payload.ok) { setError(payload.error || 'Could not preview prices'); return; }
      setError('');
      setSnapshot(payload.snapshot);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attractionId, basePrice, date, headers, showtimeId]);

  return (
    <Card
      title="Preview a screening price"
      subtitle="Exactly what a seat costs on a chosen date, with the winning rule named"
      icon="ph-magnifying-glass"
    >
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputCls} />
        </Field>
        <Field label="Hall base price" hint="What a standard seat costs before seat types">
          <input type="number" min="0" step="0.5" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} className={inputCls} />
        </Field>
        <Field label="Screening" hint="Optional, for screening-only rules">
          <select
            value={showtimeId}
            onChange={(event) => {
              const id = Number(event.target.value);
              setShowtimeId(id);
              const chosen = showtimes.find((showtime) => showtime.id === id);
              if (Number(chosen?.basePrice) > 0) setBasePrice(String(chosen.basePrice));
            }}
            className={inputCls}
          >
            <option value={0}>Any screening</option>
            {showtimes.map((showtime) => (
              <option key={showtime.id} value={showtime.id}>{showtime.movieTitle} · {showtime.showDate} {showtime.startTime}</option>
            ))}
          </select>
        </Field>
      </div>

      {snapshot && (
        <div className="mt-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-black text-slate-500 dark:text-slate-400">
            {snapshot.ruleName ? (
              <><Pill tone="amber">rule</Pill> {snapshot.ruleName}</>
            ) : (
              <><Pill tone="slate">no rule</Pill> Base prices only</>
            )}
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {seatTypes.map((type) => {
              const price = snapshot.seatPrices?.[type.slug];
              return (
                <div key={type.slug} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
                    {type.name}
                  </span>
                  <span className="text-[11px] font-black tabular-nums text-slate-900 dark:text-white">
                    {price === undefined ? '—' : money(price, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] font-medium text-slate-400">
        When you schedule a screening these numbers are copied onto it. Editing a seat type or a rule afterwards never
        changes a screening that already exists.
      </p>
    </Card>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function CinemaPricingPanel({ attractionId, headers, currency = 'USD' }) {
  const [seatTypes, setSeatTypes] = useState([]);
  const [rules, setRules] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ruleRes, timeRes] = await Promise.all([
      cinemaGet('pricing-rules', { attractionId }, headers),
      cinemaGet('showtimes', { attractionId, from: todayISO() }, headers),
    ]);
    if (ruleRes.ok) {
      setRules(ruleRes.rules || []);
      setSeatTypes(ruleRes.seatTypes || []);
      setError('');
    } else setError(ruleRes.error || 'Could not load your prices');
    if (timeRes.ok) setShowtimes(timeRes.showtimes || []);
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const showtimeById = useMemo(() => new Map(showtimes.map((showtime) => [Number(showtime.id), showtime])), [showtimes]);
  const ruleRows = useMemo(() => rules.map((rule) => {
    const showtime = showtimeById.get(Number(rule.showtimeId));
    return {
      ...rule,
      showtimeLabel: showtime ? `${showtime.movieTitle} · ${showtime.showDate} ${showtime.startTime}` : '',
    };
  }), [rules, showtimeById]);

  const saveRule = async (values) => {
    setBusy(true);
    const payload = await cinemaPost('pricing-rule-save', {
      attractionId,
      rule: {
        ...values,
        value: Number(values.value),
        priority: Number(values.priority) || 0,
        showtimeId: Number(values.showtimeId) || 0,
      },
    }, headers);
    setBusy(false);
    if (!payload.ok) { setError(payload.error || 'Could not save this rule'); return; }
    setEditing(null);
    setError('');
    load();
  };

  const removeRule = async (rule) => {
    if (!window.confirm(`Delete the “${rule.name}” pricing rule?`)) return;
    const payload = await cinemaPost('pricing-rule-delete', { attractionId, ruleId: rule.id }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    load();
  };

  const toggleRule = async (rule) => {
    const payload = await cinemaPost('pricing-rule-save', {
      attractionId,
      rule: { ...rule, status: rule.status === 'active' ? 'inactive' : 'active' },
    }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    load();
  };

  if (loading) {
    return (
      <div className="grid gap-3">
        {[0, 1].map((key) => <div key={key} className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <SeatPricesCard
        attractionId={attractionId}
        headers={headers}
        seatTypes={seatTypes}
        currency={currency}
        onChanged={load}
      />

      <Card
        title="Pricing rules"
        subtitle="Weekends, holidays, premieres and one-off screenings, applied on top of seat prices"
        icon="ph-calendar-star"
        action={<Button size="sm" variant="ghost" icon="ph-plus" onClick={() => setEditing({ ...EMPTY_RULE })}>New rule</Button>}
      >
        {editing && (
          <div className="mb-4">
            <RuleForm
              initial={editing}
              seatTypes={seatTypes}
              showtimes={showtimes}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={saveRule}
            />
          </div>
        )}

        {ruleRows.length === 0 ? (
          <p className="text-xs font-semibold text-slate-400">
            No rules yet, so every screening uses the seat prices above. Add a weekend rule if Saturday nights should
            cost more than a Tuesday matinee.
          </p>
        ) : (
          <div className="space-y-2">
            {ruleRows.map((rule) => (
              <article key={rule.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-900 dark:text-white">
                      {rule.name}
                      <Pill tone={rule.status === 'active' ? 'green' : 'slate'}>{rule.status}</Pill>
                      {rule.priority > 0 && <Pill tone="sky">priority {rule.priority}</Pill>}
                    </h4>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {scopeLabel(rule)} · {adjustmentLabel(rule)}
                      {Object.keys(rule.categoryPrices || {}).length ? ` · ${Object.keys(rule.categoryPrices).length} fixed` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon="ph-pencil-simple" onClick={() => setEditing(rule)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={rule.status === 'active' ? 'ph-pause' : 'ph-play'} onClick={() => toggleRule(rule)}>
                      {rule.status === 'active' ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="danger" icon="ph-trash" onClick={() => removeRule(rule)}>Delete</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <PricePreviewCard
        attractionId={attractionId}
        headers={headers}
        seatTypes={seatTypes}
        showtimes={showtimes}
        currency={currency}
      />
    </div>
  );
}
