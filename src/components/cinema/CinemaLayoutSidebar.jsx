import { useMemo, useState } from 'react';
import { Button, Field, Notice, Pill, cx, inputCls } from './ui.jsx';
import {
  addRow, patchSeats, removeRow, removeSeats, renumberSelection, renameRow, rowIds, rowsOf, toInt,
} from './layoutModel.js';

const TABS = [
  { id: 'seats', label: 'Seats', icon: 'ph-armchair' },
  { id: 'hall', label: 'Hall', icon: 'ph-buildings' },
  { id: 'versions', label: 'Versions', icon: 'ph-clock-counter-clockwise' },
  { id: 'templates', label: 'Templates', icon: 'ph-copy' },
];

function suggestAisleColumn(doc) {
  const counts = new Map();
  for (const seat of doc.seats) counts.set(seat.x, (counts.get(seat.x) || 0) + 1);
  let best = Math.max(2, Math.round(doc.cols / 2));
  let bestCount = Number.POSITIVE_INFINITY;
  for (let x = 2; x < doc.cols; x += 1) {
    const count = counts.get(x) || 0;
    if (count < bestCount) { best = x; bestCount = count; }
  }
  return best;
}

export default function LayoutSidebar({
  doc, seatTypes, currency, selected, activeType, onChange, onSelect,
  issues, serverIssues, versions, templates, name, onName,
  onRestore, onApplyTemplate, onSaveTemplate, onPublish, busy, tab, onTab,
  selectedSeats, stats, draftId, publishedId,
}) {
  const rows = useMemo(() => rowsOf(doc), [doc]);
  const [rowForm, setRowForm] = useState(() => ({
    label: '',
    // Default to the hall's widest row so a new row matches the auditorium.
    count: rowsOf(doc).reduce((widest, row) => Math.max(widest, row.seats.length), 10),
    category: '',
  }));
  const [bulk, setBulk] = useState({ price: '', start: 1, step: 1, row: '' });
  const [aisleForm, setAisleForm] = useState({ fromX: '', width: 1, fromY: 1, toY: '', label: '' });
  const [entranceForm, setEntranceForm] = useState({ side: 'left', offset: 50, label: 'Door' });
  const [sectionForm, setSectionForm] = useState({ name: '', color: '#0ea5e9', rows: '' });
  const [templateName, setTemplateName] = useState('');

  const selectedType = selected.length === 1
    ? seatTypes.find((type) => type.slug === selectedSeats[0]?.category)
    : null;
  const errors = issues?.errors || [];
  const warnings = issues?.warnings || [];
  const lastY = doc.seats.length ? Math.max(...doc.seats.map((seat) => seat.y)) : 1;

  const applyToSelection = (patch) => onChange(patchSeats(doc, selected, patch));
  const rowOfSelected = selectedSeats[0]?.row || '';

  return (
    <aside className="flex min-w-0 flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onTab(entry.id)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-black',
              tab === entry.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
            )}
          >
            <i className={cx('ph', entry.icon)} /> {entry.label}
          </button>
        ))}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1.5">
          {errors.length > 0 && (
            <Notice tone="error">
              <p className="font-black">{errors.length} problem{errors.length === 1 ? '' : 's'} block publishing</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 font-semibold">
                {errors.slice(0, 5).map((entry) => <li key={entry}>{entry}</li>)}
                {errors.length > 5 && <li>…and {errors.length - 5} more</li>}
              </ul>
            </Notice>
          )}
          {warnings.length > 0 && (
            <Notice tone="warning">
              <ul className="list-disc space-y-0.5 pl-4 font-semibold">
                {warnings.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </Notice>
          )}
        </div>
      )}

      {serverIssues?.errors?.length > 0 && (
        <Notice tone="error">
          <p className="font-black">The server rejected this layout</p>
          <p className="mt-0.5 font-semibold">{serverIssues.errors[0]}</p>
        </Notice>
      )}

      <div className="max-h-[calc(62vh+120px)] space-y-3 overflow-y-auto pr-1">
        {tab === 'seats' && (
          <>
            <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Selection
                <span className="tabular-nums text-slate-400">{selected.length}</span>
              </h4>

              {selected.length === 0 ? (
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-400">
                  Click a seat, shift-click for more, or drag a box over a block. Everything you change can be undone.
                </p>
              ) : (
                <div className="mt-2 space-y-2.5">
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Seat type</p>
                    <div className="flex flex-wrap gap-1">
                      {seatTypes.map((type) => (
                        <button
                          key={type.slug}
                          type="button"
                          onClick={() => applyToSelection({ category: type.slug, status: 'available' })}
                          className={cx(
                            'inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-black',
                            selectedSeats.every((seat) => seat.category === type.slug)
                              ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                          )}
                        >
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
                          {type.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <Button size="sm" variant="ghost" icon="ph-prohibit" onClick={() => applyToSelection({ status: 'blocked' })}>Block</Button>
                    <Button size="sm" variant="ghost" icon="ph-check-circle" onClick={() => applyToSelection({ status: 'available' })}>Unblock</Button>
                  </div>

                  <div className="flex items-end gap-1.5">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Price override</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={bulk.price}
                        onChange={(event) => setBulk((current) => ({ ...current, price: event.target.value }))}
                        placeholder="type default"
                        className={cx(inputCls, 'py-1.5 text-xs')}
                      />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { applyToSelection({ priceOverride: bulk.price === '' ? null : Number(bulk.price) }); setBulk((c) => ({ ...c, price: '' })); }}>
                      Apply
                    </Button>
                  </div>

                  <div className="flex items-end gap-1.5">
                    <div className="w-16">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Start</label>
                      <input type="number" min="1" value={bulk.start} onChange={(event) => setBulk((current) => ({ ...current, start: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                    </div>
                    <div className="w-16">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Step</label>
                      <input type="number" min="1" value={bulk.step} onChange={(event) => setBulk((current) => ({ ...current, step: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                    </div>
                    <Button size="sm" variant="ghost" icon="ph-list-numbers" className="flex-1" onClick={() => onChange(renumberSelection(doc, selected, bulk.start, bulk.step))}>
                      Renumber
                    </Button>
                  </div>

                  {selected.length === 1 && (
                    <div className="space-y-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Row</label>
                          <input
                            value={selectedSeats[0].row}
                            onChange={(event) => onChange(patchSeats(doc, selected, { row: event.target.value.toUpperCase().slice(0, 4) }))}
                            className={cx(inputCls, 'py-1.5 text-xs')}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Seat no.</label>
                          <input
                            type="number"
                            min="1"
                            value={selectedSeats[0].number}
                            onChange={(event) => onChange(patchSeats(doc, selected, { number: Math.max(1, toInt(event.target.value, 1)) }))}
                            className={cx(inputCls, 'py-1.5 text-xs')}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Printed label (optional)</label>
                        <input
                          value={selectedSeats[0].label}
                          placeholder={`${selectedSeats[0].row}${selectedSeats[0].number}`}
                          onChange={(event) => onChange(patchSeats(doc, selected, { label: event.target.value.slice(0, 24) }))}
                          className={cx(inputCls, 'py-1.5 text-xs')}
                        />
                      </div>
                      {selectedType && (
                        <p className="text-[10px] font-semibold text-slate-400">
                          {selectedType.name} · {selectedType.bookingMode === 'group' ? `sold as a group of ${selectedType.groupSize}` : selectedType.splitAllowed ? 'sold whole or split' : 'sold individually'}
                          {selectedType.admissions > 1 ? ` · admits ${selectedType.admissions}` : ''}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" icon="ph-rows" onClick={() => onSelect(Array.from(new Set(selectedSeats.map((seat) => seat.row))).flatMap((label) => rowIds(doc, label)))}>
                      Whole row
                    </Button>
                    <Button size="sm" variant="danger" icon="ph-trash" onClick={() => { onChange(removeSeats(doc, selected)); onSelect([]); }}>Delete</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Rows</h4>
              <div className="mt-2 space-y-1">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                    <button type="button" onClick={() => onSelect(rowIds(doc, row.label))} className="w-7 text-left text-[11px] font-black text-slate-700 dark:text-slate-200">
                      {row.label}
                    </button>
                    <span className="flex-1 text-[10px] font-semibold text-slate-400">{row.seats.length} seats</span>
                    <button
                      type="button"
                      title="Rename row"
                      onClick={() => {
                        const next = window.prompt(`Rename row ${row.label}`, row.label);
                        if (next) onChange(renameRow(doc, row.label, next));
                      }}
                      className="text-slate-400 hover:text-green-600"
                    >
                      <i className="ph ph-pencil-simple" />
                    </button>
                    <button
                      type="button"
                      title="Delete row"
                      onClick={() => { if (window.confirm(`Delete row ${row.label} and its ${row.seats.length} seats?`)) onChange(removeRow(doc, row.label)); }}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <i className="ph ph-trash" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 space-y-1.5 rounded-xl border border-dashed border-slate-300 p-2 dark:border-slate-600">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Add a row</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    placeholder={`Row ${rows.length ? '' : 'A'}`}
                    value={rowForm.label}
                    onChange={(event) => setRowForm((current) => ({ ...current, label: event.target.value.toUpperCase().slice(0, 4) }))}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={rowForm.count}
                    onChange={(event) => setRowForm((current) => ({ ...current, count: event.target.value }))}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                </div>
                <select
                  value={rowForm.category || activeType}
                  onChange={(event) => setRowForm((current) => ({ ...current, category: event.target.value }))}
                  className={cx(inputCls, 'py-1.5 text-xs')}
                >
                  {seatTypes.map((type) => <option key={type.slug} value={type.slug}>{type.name}</option>)}
                </select>
                <Button
                  size="sm"
                  icon="ph-plus"
                  className="w-full"
                  onClick={() => {
                    onChange(addRow(doc, { label: rowForm.label, count: toInt(rowForm.count, 10) || 10, category: rowForm.category || activeType }));
                    setRowForm({ label: '', count: rowForm.count, category: rowForm.category });
                  }}
                >
                  Add row at {lastY + 1}
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Seat types in this hall</h4>
              <ul className="mt-1.5 space-y-1">
                {seatTypes.filter((type) => stats.byCategory[type.slug]).map((type) => (
                  <li key={type.slug} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
                    <span className="flex-1">{type.name}</span>
                    <span className="tabular-nums">{stats.byCategory[type.slug]}</span>
                    <span className="tabular-nums text-slate-400">{type.defaultPrice !== null ? `${currency} ${type.defaultPrice}` : `${Math.round((type.multiplier || 1) * 100)}%`}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {tab === 'hall' && (
          <>
            <section className="space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Layout</h4>
              <Field label="Layout name">
                <input value={name} onChange={(event) => onName(event.target.value.slice(0, 80))} className={cx(inputCls, 'py-1.5 text-xs')} />
              </Field>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="Screen position">
                  <select
                    value={doc.screen.position}
                    onChange={(event) => onChange({ ...doc, screen: { ...doc.screen, position: event.target.value } })}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  >
                    <option value="top">Top of hall</option>
                    <option value="bottom">Bottom of hall</option>
                  </select>
                </Field>
                <Field label="Screen width %">
                  <input
                    type="number" min="20" max="100" value={doc.screen.width}
                    onChange={(event) => onChange({ ...doc, screen: { ...doc.screen, width: toInt(event.target.value, 70) } })}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                </Field>
              </div>
              <Field label="Screen label">
                <input
                  value={doc.screen.label}
                  placeholder="SCREEN 1"
                  onChange={(event) => onChange({ ...doc, screen: { ...doc.screen, label: event.target.value.slice(0, 40) } })}
                  className={cx(inputCls, 'py-1.5 text-xs')}
                />
              </Field>
              <div className="grid grid-cols-3 gap-1.5">
                <Field label="Columns">
                  <input
                    type="number" min="4" max="60" value={doc.cols}
                    onChange={(event) => onChange({ ...doc, cols: Math.min(60, Math.max(4, toInt(event.target.value, doc.cols))) })}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                </Field>
                <Field label="Seat gap">
                  <input
                    type="number" min="0" max="24" value={doc.spacing.seat}
                    onChange={(event) => onChange({ ...doc, spacing: { ...doc.spacing, seat: toInt(event.target.value, 4) } })}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                </Field>
                <Field label="Row gap">
                  <input
                    type="number" min="0" max="40" value={doc.spacing.row}
                    onChange={(event) => onChange({ ...doc, spacing: { ...doc.spacing, row: toInt(event.target.value, 10) } })}
                    className={cx(inputCls, 'py-1.5 text-xs')}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-1.5 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Aisles</h4>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Left', x: Math.max(1, Math.min(...doc.seats.map((seat) => seat.x), doc.cols) - 1) },
                  { label: 'Centre', x: suggestAisleColumn(doc) },
                  { label: 'Right', x: Math.min(doc.cols, Math.max(0, ...doc.seats.map((seat) => seat.x)) + 1) },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange({
                      ...doc,
                      aisles: [...doc.aisles, {
                        id: `aisle-${Date.now()}-${preset.label}`, fromX: preset.x, width: 1, fromY: 1,
                        toY: Math.max(1, lastY), label: `${preset.label} aisle`,
                      }],
                    })}
                  >
                    + {preset.label}
                  </Button>
                ))}
              </div>
              {doc.aisles.map((aisle) => (
                <div key={aisle.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <i className="ph ph-arrows-vertical text-sky-500" />
                  <span className="flex-1">{aisle.label || `Column ${aisle.fromX}`} · x{aisle.fromX} w{aisle.width} · rows {aisle.fromY}–{aisle.toY}</span>
                  <button type="button" onClick={() => onChange({ ...doc, aisles: doc.aisles.filter((entry) => entry.id !== aisle.id) })} className="text-slate-400 hover:text-rose-500">
                    <i className="ph ph-x" />
                  </button>
                </div>
              ))}
              <details className="rounded-xl border border-dashed border-slate-300 p-2 dark:border-slate-600">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-400">Custom aisle</summary>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <input placeholder="From column" value={aisleForm.fromX} onChange={(event) => setAisleForm((c) => ({ ...c, fromX: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                  <input placeholder="Width" value={aisleForm.width} onChange={(event) => setAisleForm((c) => ({ ...c, width: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                  <input placeholder="From row" value={aisleForm.fromY} onChange={(event) => setAisleForm((c) => ({ ...c, fromY: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                  <input placeholder="To row" value={aisleForm.toY} onChange={(event) => setAisleForm((c) => ({ ...c, toY: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                  <input placeholder="Label" value={aisleForm.label} onChange={(event) => setAisleForm((c) => ({ ...c, label: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="ph-plus"
                    onClick={() => onChange({
                      ...doc,
                      aisles: [...doc.aisles, {
                        id: `aisle-${Date.now()}`,
                        fromX: toInt(aisleForm.fromX, 2),
                        width: Math.max(1, toInt(aisleForm.width, 1)),
                        fromY: Math.max(1, toInt(aisleForm.fromY, 1)),
                        toY: Math.max(1, toInt(aisleForm.toY, lastY)),
                        label: aisleForm.label,
                      }],
                    })}
                  >
                    Add
                  </Button>
                </div>
              </details>
            </section>

            <section className="space-y-1.5 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Entrances & exits</h4>
              {doc.entrances.map((entrance) => (
                <div key={entrance.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <i className="ph ph-door-open text-emerald-500" />
                  <span className="flex-1">{entrance.label} · {entrance.side}</span>
                  <button type="button" onClick={() => onChange({ ...doc, entrances: doc.entrances.filter((entry) => entry.id !== entrance.id) })} className="text-slate-400 hover:text-rose-500">
                    <i className="ph ph-x" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <select value={entranceForm.side} onChange={(event) => setEntranceForm((c) => ({ ...c, side: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                <input placeholder="Label" value={entranceForm.label} onChange={(event) => setEntranceForm((c) => ({ ...c, label: event.target.value }))} className={cx(inputCls, 'py-1.5 text-xs')} />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ph-plus"
                  onClick={() => onChange({
                    ...doc,
                    entrances: [...doc.entrances, {
                      id: `entrance-${Date.now()}`, side: entranceForm.side, offset: 50,
                      label: entranceForm.label || 'Door',
                    }],
                  })}
                >
                  Add
                </Button>
              </div>
            </section>

            <section className="space-y-1.5 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Sections</h4>
              {doc.sections.map((section) => (
                <div key={section.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: section.color || '#94a3b8' }} />
                  <span className="flex-1">{section.name} · rows {section.rows.join(', ') || '—'}</span>
                  <button type="button" onClick={() => onChange({ ...doc, sections: doc.sections.filter((entry) => entry.id !== section.id) })} className="text-slate-400 hover:text-rose-500">
                    <i className="ph ph-x" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-1.5">
                <input
                  placeholder="Section name"
                  value={sectionForm.name}
                  onChange={(event) => setSectionForm((c) => ({ ...c, name: event.target.value }))}
                  className={cx(inputCls, 'py-1.5 text-xs')}
                />
                <input
                  type="color"
                  value={sectionForm.color}
                  onChange={(event) => setSectionForm((c) => ({ ...c, color: event.target.value }))}
                  className="h-8 w-9 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                  aria-label="Section colour"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ph-plus"
                  onClick={() => {
                    const chosenRows = Array.from(new Set(selectedSeats.map((seat) => seat.row)));
                    if (!chosenRows.length) return;
                    onChange({
                      ...doc,
                      sections: [...doc.sections, {
                        id: `section-${Date.now()}`,
                        name: sectionForm.name || `Section ${doc.sections.length + 1}`,
                        color: sectionForm.color,
                        rows: chosenRows,
                      }],
                    });
                    setSectionForm({ name: '', color: sectionForm.color, rows: '' });
                  }}
                >
                  From selection
                </Button>
              </div>
              {rowOfSelected && (
                <p className="text-[10px] font-semibold text-slate-400">Rows in selection: {Array.from(new Set(selectedSeats.map((seat) => seat.row))).join(', ')}</p>
              )}
            </section>
          </>
        )}

        {tab === 'versions' && (
          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold leading-relaxed text-slate-400">
              Publishing creates a new live version. Screenings already scheduled keep their own seats, so sold
              tickets never move.
            </p>
            <Button
              size="sm"
              icon="ph-rocket-launch"
              className="w-full"
              disabled={Boolean(busy)}
              onClick={onPublish}
            >
              Publish current draft
            </Button>
            {versions.length === 0 && <p className="text-[11px] font-semibold text-slate-400">No versions yet — save a draft first.</p>}
            {versions.map((version) => (
              <div key={version.id} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-800 dark:text-white">v{version.version}</span>
                  <Pill tone={version.status === 'published' ? 'green' : version.status === 'draft' ? 'amber' : 'slate'}>{version.status}</Pill>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  {version.capacity} seats · {version.name || 'Untitled'}
                  {version.publishedAt ? ` · ${new Date(version.publishedAt).toLocaleDateString('en-GB')}` : ''}
                </p>
                {version.id === draftId && <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-amber-600">Editing this draft</p>}
                {version.id === publishedId && <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-green-600">Live for new screenings</p>}
                {version.status !== 'draft' && (
                  <Button size="sm" variant="ghost" icon="ph-arrow-counter-clockwise" className="mt-1.5 w-full" disabled={Boolean(busy)} onClick={() => onRestore(version.id)}>
                    Restore into a draft
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}

        {tab === 'templates' && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold leading-relaxed text-slate-400">
              Templates are starting points. Loading one replaces the canvas, and nothing goes live until you publish.
            </p>
            <div className="space-y-1">
              {(templates.builtIn || []).map((template) => (
                <button
                  key={template.kind}
                  type="button"
                  onClick={() => onApplyTemplate(template.document, template.name)}
                  className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-left hover:border-green-500 hover:bg-green-50/50 dark:border-slate-700 dark:hover:bg-green-950/20"
                >
                  <span className="block text-[11px] font-black text-slate-800 dark:text-white">{template.name}</span>
                  <span className="block text-[10px] font-semibold text-slate-400">{template.description}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 p-2 dark:border-slate-600">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Save this layout</p>
              <input
                placeholder="Template name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className={cx(inputCls, 'mt-1 py-1.5 text-xs')}
              />
              <Button size="sm" variant="ghost" icon="ph-floppy-disk" className="mt-1.5 w-full" disabled={busy === 'template'} onClick={() => onSaveTemplate(templateName)}>
                Save as template
              </Button>
            </div>

            {(templates.saved || []).length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Your templates</p>
                {templates.saved.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onApplyTemplate(template.document, template.name)}
                    className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-left hover:border-green-500 dark:border-slate-700"
                  >
                    <span className="block text-[11px] font-black text-slate-800 dark:text-white">{template.name}</span>
                    <span className="block text-[10px] font-semibold text-slate-400">{template.capacity} seats</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
