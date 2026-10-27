import { useCallback, useEffect, useMemo, useState } from 'react';
import { ownerGet, ownerPost, checkoutGet, money, formatDate, todayISO, addDays } from '../../lib/ticketingClient.js';
import {
  Badge, Button, EmptyState, ErrorNote, Field, inputClass, Loading, Notice, Panel,
  StatusBadge, TableWrap, Td, Th,
} from './TicketingShared.jsx';

export default function TicketInventoryPanel({ attractionId, headers, currency, onNavigate }) {
  const [range, setRange] = useState({ from: todayISO(), to: addDays(todayISO(), 30) });
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState({});
  const [ruleForm, setRuleForm] = useState({ ticketTypeId: '', kind: 'capacity', capacity: '', price: '', note: '' });

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    const [inventory, availability] = await Promise.all([
      ownerGet('inventory', { attractionId, from: range.from, to: range.to }, headers),
      checkoutGet('availability', { attractionId, date }),
    ]);
    if (inventory.ok) { setData(inventory); setError(''); }
    else setError(inventory.error || 'Could not load inventory');
    setLive(availability.ok ? availability : null);
    setLoading(false);
  }, [attractionId, headers, range.from, range.to, date]);

  useEffect(() => { load(); }, [load]);

  const types = data?.types || [];
  const settings = data?.settings || {};

  const slotLabels = useMemo(() => {
    const labels = new Map();
    for (const type of types) {
      for (const slot of type.slots || []) labels.set(slot.id, slot.label || slot.startTime || `Slot ${slot.id}`);
    }
    return labels;
  }, [types]);

  const dayRows = useMemo(() => {
    const rows = new Map();
    for (const row of data?.inventory || []) {
      if (row.date !== date || row.slotId !== 0) continue;
      rows.set(row.ticketTypeId, row);
    }
    return rows;
  }, [data, date]);

  const slotRows = useMemo(
    () => (data?.inventory || []).filter((row) => row.date === date && row.slotId > 0),
    [data, date]
  );

  const draftFor = (typeId, key, fallback) => (drafts[`${typeId}:${key}`] ?? fallback ?? '');

  const setDraft = (typeId, key, value) => setDrafts((current) => ({ ...current, [`${typeId}:${key}`]: value }));

  const run = async (label, action, payload) => {
    setBusy(label);
    setNotice('');
    const result = await ownerPost(action, { attractionId, ...payload }, headers);
    setBusy('');
    if (!result.ok) { setError(result.error || 'That change was rejected'); return false; }
    setError('');
    await load();
    return true;
  };

  const applyCapacity = async (type) => {
    const value = draftFor(type.id, 'capacity', dayRows.get(type.id)?.capacity ?? type.dailyCapacity ?? 0);
    const ok = await run(`cap-${type.id}`, 'save-inventory', {
      date, ticketTypeId: type.id, kind: 'capacity', capacity: value,
    });
    if (ok) setNotice(`Daily capacity for ${type.name} set to ${value}.`);
  };

  const applyPrice = async (type) => {
    const value = draftFor(type.id, 'price', '');
    const ok = await run(`price-${type.id}`, 'save-inventory', {
      date, ticketTypeId: type.id, kind: 'price', price: value,
    });
    if (ok) setNotice(`Special price for ${type.name} applied to ${formatDate(date)}.`);
  };

  const toggleBlackout = async (type, close) => {
    const ok = await run(`blackout-${type.id}`, 'save-inventory', {
      date, ticketTypeId: type.id, kind: 'blackout', closed: close,
      note: close ? 'Sales closed by the owner' : 'Sales reopened',
    });
    if (ok) setNotice(close ? `${type.name} sales closed on ${formatDate(date)}.` : `${type.name} sales reopened on ${formatDate(date)}.`);
  };

  const saveRule = async () => {
    const ok = await run('rule', 'save-inventory', {
      date,
      ticketTypeId: ruleForm.ticketTypeId || 0,
      kind: ruleForm.kind,
      capacity: ruleForm.capacity,
      price: ruleForm.price,
      closed: ruleForm.kind === 'blackout' ? true : undefined,
      note: ruleForm.note,
    });
    if (ok) setNotice('Inventory rule saved.');
  };

  const removeRule = async (rule) => {
    const ok = await run(`rule-del-${rule.id}`, 'clear-inventory-rule', { id: rule.id });
    if (ok) setNotice('Rule removed.');
  };

  const toggleSales = async () => {
    const ok = await run('pause', 'pause-sales', { paused: !settings.salesPaused });
    if (ok) setNotice(settings.salesPaused ? 'Ticket sales resumed.' : 'Ticket sales paused for this attraction.');
  };

  if (loading && !data) return <Loading label="Loading inventory…" />;

  return (
    <div className="space-y-5">
      <Panel
        title="Inventory & availability"
        icon="ph-stack"
        subtitle="Set capacities, close dates, apply special prices and watch live availability."
        actions={(
          <>
            <Button variant="soft" size="sm" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            <Button
              variant={settings.salesPaused ? 'primary' : 'danger'}
              size="sm"
              icon={settings.salesPaused ? 'ph-play' : 'ph-pause'}
              disabled={busy === 'pause'}
              onClick={toggleSales}
            >
              {settings.salesPaused ? 'Resume sales' : 'Pause sales'}
            </Button>
          </>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={settings.salesPaused ? 'paused' : 'active'} />
          <Badge tone="slate">Advance booking: {settings.advanceBookingDays} day(s)</Badge>
          <Badge tone="slate">Minimum lead: {settings.minLeadHours} hour(s)</Badge>
          <Button variant="ghost" size="sm" icon="ph-gear" onClick={() => onNavigate?.('settings')}>
            Booking settings
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Inventory date">
            <input type="date" className={`${inputClass} w-[170px]`} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Rules range from">
            <input type="date" className={`${inputClass} w-[160px]`} value={range.from}
              onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} />
          </Field>
          <Field label="Rules range to">
            <input type="date" className={`${inputClass} w-[160px]`} value={range.to}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} />
          </Field>
        </div>
      </Panel>

      <Panel title={`Availability on ${formatDate(date)}`} icon="ph-calendar-check">
        {!types.length ? (
          <EmptyState icon="ph-ticket" title="No ticket types yet"
            message="Create a ticket type first — capacities are tracked per ticket type and date."
            action={<Button size="sm" icon="ph-plus" onClick={() => onNavigate?.('types')}>Ticket types</Button>} />
        ) : (
          <div className="space-y-3">
            {types.map((type) => {
              const row = dayRows.get(type.id);
              const capacity = row ? row.capacity : (type.dailyCapacity || 0);
              const sold = row ? row.sold : 0;
              const reserved = row ? row.reserved : 0;
              const remaining = capacity > 0 ? Math.max(0, capacity - sold - reserved) : null;
              const liveType = (live?.types || []).find((entry) => entry.id === type.id);
              const typeSlots = slotRows.filter((slot) => slot.ticketTypeId === type.id);

              return (
                <div key={type.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-slate-900 dark:text-white">{type.name}</h3>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {money(type.price, type.currency || currency)} · {type.admissions} admission(s)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={type.status} />
                      {liveType?.closed && <Badge tone="rose">closed online</Badge>}
                      {liveType?.soldOut && <Badge tone="amber">sold out</Badge>}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Capacity" value={capacity > 0 ? capacity : 'Unlimited'} />
                    <Metric label="Sold" value={sold} />
                    <Metric label="Reserved" value={reserved} />
                    <Metric label="Available" value={remaining === null ? 'Unlimited' : remaining} tone="emerald" />
                  </div>

                  {typeSlots.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {typeSlots.map((slot) => (
                        <div key={`${slot.ticketTypeId}-${slot.slotId}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-[11px] font-bold">
                          <span className="text-slate-500">{slotLabels.get(slot.slotId) || `Slot ${slot.slotId}`}</span>
                          <span>{slot.sold} sold · {slot.reserved} held · {slot.available} available of {slot.capacity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Field label="Day capacity">
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min="0"
                          className={`${inputClass} w-28`}
                          value={draftFor(type.id, 'capacity', capacity)}
                          onChange={(event) => setDraft(type.id, 'capacity', event.target.value)}
                        />
                        <Button size="sm" variant="soft" icon="ph-check" disabled={busy === `cap-${type.id}`}
                          onClick={() => applyCapacity(type)}>Apply</Button>
                      </div>
                    </Field>
                    <Field label="Special price">
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(type.price)}
                          className={`${inputClass} w-28`}
                          value={draftFor(type.id, 'price', '')}
                          onChange={(event) => setDraft(type.id, 'price', event.target.value)}
                        />
                        <Button size="sm" variant="soft" icon="ph-tag" disabled={busy === `price-${type.id}`}
                          onClick={() => applyPrice(type)}>Apply</Button>
                      </div>
                    </Field>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="soft" icon="ph-prohibit" disabled={busy === `blackout-${type.id}`}
                        onClick={() => toggleBlackout(type, true)}>Block date</Button>
                      <Button size="sm" variant="ghost" icon="ph-arrow-counter-clockwise"
                        onClick={() => toggleBlackout(type, false)}>Reopen</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Add an inventory rule" icon="ph-sliders-horizontal"
        subtitle="Apply a capacity override, a date-specific price or a blackout to the whole attraction or a single ticket type.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Ticket type">
            <select className={inputClass} value={ruleForm.ticketTypeId}
              onChange={(event) => setRuleForm((current) => ({ ...current, ticketTypeId: event.target.value }))}>
              <option value="">Whole attraction</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </Field>
          <Field label="Rule">
            <select className={inputClass} value={ruleForm.kind}
              onChange={(event) => setRuleForm((current) => ({ ...current, kind: event.target.value }))}>
              <option value="capacity">Capacity override</option>
              <option value="price">Special price</option>
              <option value="blackout">Block date</option>
            </select>
          </Field>
          <Field label="Capacity">
            <input type="number" min="0" className={inputClass} value={ruleForm.capacity}
              onChange={(event) => setRuleForm((current) => ({ ...current, capacity: event.target.value }))} />
          </Field>
          <Field label="Price">
            <input type="number" min="0" step="0.01" className={inputClass} value={ruleForm.price}
              onChange={(event) => setRuleForm((current) => ({ ...current, price: event.target.value }))} />
          </Field>
          <Field label="Note">
            <input className={inputClass} value={ruleForm.note} placeholder="Public holiday"
              onChange={(event) => setRuleForm((current) => ({ ...current, note: event.target.value }))} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" icon="ph-plus" disabled={busy === 'rule'} onClick={saveRule}>
            Apply to {formatDate(date)}
          </Button>
        </div>
      </Panel>

      <Panel title="Calendar rules" icon="ph-calendar-dots"
        subtitle={`${data?.calendar?.length || 0} rule(s) between ${formatDate(range.from)} and ${formatDate(range.to)}`}>
        {!data?.calendar?.length ? (
          <EmptyState icon="ph-calendar-blank" title="No overrides"
            message="Capacities and prices come from each ticket type until you add a rule here." />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr><Th>Date</Th><Th>Scope</Th><Th>Rule</Th><Th>Value</Th><Th>Note</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.calendar.map((rule) => (
                  <tr key={rule.id}>
                    <Td className="whitespace-nowrap text-xs font-bold">{formatDate(rule.date)}</Td>
                    <Td className="text-xs">
                      {rule.ticketTypeId ? (types.find((type) => type.id === rule.ticketTypeId)?.name || `#${rule.ticketTypeId}`) : 'Whole attraction'}
                    </Td>
                    <Td><StatusBadge status={rule.kind} /></Td>
                    <Td className="text-xs font-semibold">
                      {rule.kind === 'price' ? money(rule.price, currency)
                        : rule.kind === 'blackout' ? (rule.closed ? 'Sales closed' : 'Sales open')
                          : (rule.capacity ?? '—')}
                    </Td>
                    <Td className="text-xs text-slate-500">{rule.note || '—'}</Td>
                    <Td>
                      <Button size="sm" variant="ghost" icon="ph-trash" onClick={() => removeRule(rule)}>Remove</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-600',
  };
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-black leading-tight ${tones[tone] || tones.slate}`}>{value}</p>
    </div>
  );
}
