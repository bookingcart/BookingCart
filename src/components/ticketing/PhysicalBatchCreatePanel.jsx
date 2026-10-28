import { useMemo, useState } from 'react';
import { addDays, formatDate, money, posPost, todayISO } from '../../lib/ticketingClient.js';
import { Button, EmptyState, ErrorNote, Field, Notice, Panel, inputClass } from './TicketingShared.jsx';
import { LAYOUTS } from './PhysicalPrint.jsx';

// Create printed stock. Generating tickets does NOT sell them: every ticket is
// stored in status "available" and only becomes valid admission when a POS sale
// claims it. Capacity is checked again at sale time, so a batch larger than the
// remaining capacity can still be printed but not oversold.
export default function PhysicalBatchCreatePanel({ attractionId, headers, context, refresh, visitDate, setVisitDate }) {
  const currency = context?.attraction?.currency || 'USD';
  const types = context?.types || [];

  const [ticketTypeId, setTicketTypeId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [validTo, setValidTo] = useState('');
  const [slotId, setSlotId] = useState(0);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(context?.settings?.printLayout || 'a4_4');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const selected = useMemo(
    () => types.find((type) => String(type.id) === String(ticketTypeId)) || null,
    [types, ticketTypeId]
  );
  const live = useMemo(
    () => (context?.availability?.types || []).find((type) => String(type.id) === String(ticketTypeId)) || null,
    [context, ticketTypeId]
  );

  const submit = async () => {
    if (!selected) { setError('Choose a ticket type for this batch'); return; }
    setBusy(true);
    setError('');
    const payload = await posPost('create-batch', {
      attractionId,
      ticketTypeId: Number(selected.id),
      quantity: Number(quantity || 0),
      visitDate,
      validTo: validTo || undefined,
      slotId: selected.slotRequired ? slotId : 0,
      name,
      template,
      notes,
    }, headers);
    setBusy(false);
    if (!payload.ok) { setError(payload.error || 'The batch could not be created'); return; }
    setCreated(payload);
    setName('');
    setNotes('');
    refresh();
  };

  if (!types.length) {
    return (
      <Panel title="Create physical tickets" icon="ph-ticket">
        <EmptyState
          icon="ph-ticket"
          title="No active ticket types"
          message="Add an active ticket type first — physical batches inherit its price, category and admissions."
        />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2">
        <Panel
          title="Create a ticket batch"
          icon="ph-ticket"
          subtitle="Generate uniquely numbered, printable tickets. Nothing is sold until a cashier completes a sale."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ticket type">
              <select value={ticketTypeId} onChange={(event) => { setTicketTypeId(event.target.value); setSlotId(0); }} className={inputClass}>
                <option value="">Choose a ticket type…</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} · {money(type.price, type.currency || currency)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Visit date">
              <input type="date" value={visitDate} min={todayISO()}
                onChange={(event) => setVisitDate(event.target.value || todayISO())} className={inputClass} />
            </Field>

            <Field label="Number of tickets" hint={context ? `Batch limit ${context.maxBatchQuantity}` : undefined}>
              <input type="number" min="1" max={context?.maxBatchQuantity || 500} value={quantity}
                onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
            </Field>

            <Field label="Expiry date (optional)" hint="Leave blank when the ticket is only valid on the visit date.">
              <input type="date" value={validTo} min={visitDate}
                onChange={(event) => setValidTo(event.target.value)} className={inputClass} />
            </Field>

            {selected?.slotRequired && (
              <Field label="Entry time slot" hint="Required by this ticket type.">
                <select value={slotId} onChange={(event) => setSlotId(Number(event.target.value))} className={inputClass}>
                  <option value={0}>Choose an entry time…</option>
                  {(selected.slots || []).map((slot) => (
                    <option key={slot.id} value={slot.id}>{slot.label}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Batch name / reference" hint="Defaults to the ticket type and visit date.">
              <input value={name} onChange={(event) => setName(event.target.value)}
                className={inputClass} placeholder="Gate 1 — morning shift" />
            </Field>

            <Field label="Ticket design">
              <select value={template} onChange={(event) => setTemplate(event.target.value)} className={inputClass}>
                {Object.entries(LAYOUTS).map(([key, layout]) => (
                  <option key={key} value={key}>{layout.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Notes (optional)" className="sm:col-span-2">
              <input value={notes} onChange={(event) => setNotes(event.target.value)}
                className={inputClass} placeholder="Who asked for this batch, where it is stored…" />
            </Field>
          </div>

          {selected && (
            <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300 space-y-1">
              <p>
                <span className="font-black text-slate-900 dark:text-white">{selected.name}</span> · {selected.category} ·{' '}
                {money(live?.price ?? selected.price, currency)} · {selected.admissions} admission(s) per ticket
              </p>
              <p>
                Capacity left for {formatDate(visitDate)}:{' '}
                {live?.remaining === null || live?.remaining === undefined ? 'unlimited' : `${live.remaining} ticket(s)`}
                {live?.closed ? ' · sales closed on this date' : ''}
              </p>
              <p className="text-slate-400">
                Tickets expire {formatDate(validTo || visitDate)}. You can void unused tickets at any time from the inventory tab.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button icon={busy ? 'ph-circle-notch' : 'ph-sparkle'} onClick={submit} disabled={busy || !selected}>
              {busy ? 'Generating…' : `Generate ${Number(quantity) > 0 ? Number(quantity) : ''} ticket(s)`}
            </Button>
            <Button variant="ghost" onClick={() => setVisitDate(addDays(todayISO(), 1))}>Tomorrow</Button>
          </div>
        </Panel>

        <div className="mt-4"><ErrorNote message={error} /></div>
      </div>

      <div className="space-y-4">
        {created?.warning && <Notice tone="rose">{created.warning}</Notice>}
        {created?.batch && (
          <Panel title="Batch created" icon="ph-check-circle">
            <div className="space-y-2 text-sm">
              <Line label="Batch" value={created.batch.batchRef} />
              <Line label="Name" value={created.batch.name} />
              <Line label="Type" value={created.batch.ticketTypeName} />
              <Line label="Quantity" value={created.batch.quantity} />
              <Line label="Visit" value={formatDate(created.batch.visitDate)} />
              <Line label="Unit price" value={money(created.batch.unitPrice, created.batch.currency)} />
            </div>
            <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Not sold yet. Print the batch, then sell tickets from it at the counter.
            </p>
          </Panel>
        )}

        <Panel title="How batches work" icon="ph-info">
          <ul className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300 list-disc pl-4">
            <li>Every ticket gets a unique number and a signed QR code, generated on the server.</li>
            <li>Printing is recorded for the audit trail but never counts as a sale.</li>
            <li>Selling from a batch reuses those exact ticket numbers — no duplicate admissions.</li>
            <li>A batch with sold or used tickets can be archived, never deleted.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-900 dark:text-white text-right">{value}</span>
    </div>
  );
}
