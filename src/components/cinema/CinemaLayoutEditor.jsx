import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cinemaGet, cinemaPost, money } from '../../lib/cinemaClient.js';
import { Button, Notice, Pill, cx } from './ui.jsx';
import LayoutSidebar from './CinemaLayoutSidebar.jsx';
import {
  addRow, addSeat, gridDoc, issuesOf, mirrorSeats, moveSeats, normalizeDoc, patchSeats, priceLabel,
  removeSeats, rotateSeats, rowsOf, statsOf,
} from './layoutModel.js';

const CELL = 30;
const LABEL_W = 26;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;

function ScreenBar({ position, width, label, screenName }) {
  return (
    <div
      className={cx('pointer-events-none absolute left-0 flex justify-center', position === 'bottom' ? 'bottom-1' : 'top-1')}
      style={{ width: '100%' }}
    >
      <div className="w-full" style={{ maxWidth: `${width}%` }}>
        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-slate-200 via-slate-400 to-slate-200 dark:from-slate-700 dark:via-slate-500 dark:to-slate-700" />
        <p className="mt-1 text-center text-[9px] font-black uppercase tracking-[0.35em] text-slate-400">
          {label || screenName || 'Screen'}
        </p>
      </div>
    </div>
  );
}

function EntranceChips({ entrances }) {
  if (!entrances?.length) return null;
  const sides = { left: [], right: [], top: [], bottom: [] };
  for (const entrance of entrances) sides[entrance.side]?.push(entrance);
  const chip = (entrance) => (
    <span
      key={entrance.id}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-emerald-400 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      <i className="ph ph-door-open" /> {entrance.label}
    </span>
  );
  return (
    <>
      <div className="absolute left-0 top-0 flex h-full flex-col justify-around">{sides.left.map(chip)}</div>
      <div className="absolute right-0 top-0 flex h-full flex-col justify-around">{sides.right.map(chip)}</div>
      <div className="absolute left-0 top-0 flex w-full justify-around">{sides.top.map(chip)}</div>
      <div className="absolute bottom-0 left-0 flex w-full justify-around">{sides.bottom.map(chip)}</div>
    </>
  );
}

function CustomerPreview({ doc, seatTypes, currency, screenName, onClose }) {
  const rows = rowsOf(doc);
  const cellW = CELL + doc.spacing.seat;
  const cellH = CELL + doc.spacing.row;
  const stageW = LABEL_W + doc.cols * cellW + LABEL_W;
  const stageH = rows.length ? (Math.max(...doc.seats.map((seat) => seat.y)) + 1) * cellH : 120;

  return (
    <div className="rounded-3xl border-2 border-emerald-500/40 bg-white p-4 dark:border-emerald-500/30 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white">Customer preview</h4>
          <p className="text-[11px] font-semibold text-slate-400">
            Exactly what a customer sees once this layout is published. Nothing is live yet.
          </p>
        </div>
        <Button variant="ghost" size="sm" icon="ph-x" onClick={onClose}>Close preview</Button>
      </div>

      <div className="relative overflow-auto rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/40">
        <div className="relative mx-auto" style={{ width: stageW, height: stageH + 34, paddingTop: 22, paddingBottom: 22 }}>
          <ScreenBar position={doc.screen.position} width={doc.screen.width} label={doc.screen.label} screenName={screenName} />
          {rows.map((row) => (
            <span
              key={`label-${row.label}`}
              className="absolute text-[10px] font-black text-slate-400"
              style={{ left: 0, top: (row.y - 1) * cellH + 22 }}
            >
              {row.label}
            </span>
          ))}
          {doc.seats.map((seat) => {
            const type = seatTypes.find((entry) => entry.slug === seat.category);
            const price = priceLabel(seat, seatTypes);
            const blocked = seat.status !== 'available';
            return (
              <div
                key={seat.id}
                title={`${seat.row}${seat.number} · ${type?.name || seat.category}${price !== null ? ` · ${money(price, currency)}` : ''}`}
                className={cx(
                  'absolute flex items-center justify-center rounded-md border text-[9px] font-black',
                  blocked && 'border-dashed border-slate-300 text-slate-300 dark:border-slate-600 dark:text-slate-600'
                )}
                style={{
                  left: LABEL_W + (seat.x - 1) * cellW,
                  top: (seat.y - 1) * cellH + 22,
                  width: CELL,
                  height: CELL,
                  backgroundColor: blocked ? 'transparent' : `${type?.color || '#94a3b8'}22`,
                  borderColor: blocked ? undefined : type?.color || '#94a3b8',
                  color: blocked ? undefined : type?.color || '#475569',
                }}
              >
                {type?.accessible ? <i className="ph ph-wheelchair" /> : seat.number}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {seatTypes.filter((type) => doc.seats.some((seat) => seat.category === type.slug)).map((type) => (
          <span key={type.slug} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span className="h-3 w-3 rounded border" style={{ borderColor: type.color, backgroundColor: `${type.color}44` }} />
            {type.name}
            {type.defaultPrice !== null ? ` · ${money(type.defaultPrice, currency)}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CinemaLayoutEditor({ attractionId, headers, screen, currency = 'USD', onClose, onSaved }) {
  const [editor, setEditor] = useState(() => ({ history: [gridDoc({ rows: 6, perRow: 10 })], index: 0 }));
  const [selected, setSelected] = useState([]);
  const [seatTypes, setSeatTypes] = useState([]);
  const [versions, setVersions] = useState([]);
  const [templates, setTemplates] = useState({ builtIn: [], saved: [] });
  const [draftId, setDraftId] = useState(0);
  const [publishedId, setPublishedId] = useState(0);
  const [name, setName] = useState(`${screen.name} layout`);
  const [tool, setTool] = useState('select');
  const [activeType, setActiveType] = useState('standard');
  const [zoom, setZoom] = useState(0.9);
  const [tab, setTab] = useState('seats');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [serverIssues, setServerIssues] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragDelta, setDragDelta] = useState({ dx: 0, dy: 0 });
  const [marquee, setMarquee] = useState(null);

  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const doc = editor.history[editor.index];
  const cellW = CELL + doc.spacing.seat;
  const cellH = CELL + doc.spacing.row;
  const rows = useMemo(() => rowsOf(doc), [doc]);
  const stats = useMemo(() => statsOf(doc), [doc]);
  const issues = useMemo(() => issuesOf(doc, seatTypes), [doc, seatTypes]);
  const rowCount = doc.seats.length ? Math.max(...doc.seats.map((seat) => seat.y)) : 6;
  const stageW = LABEL_W + doc.cols * cellW + LABEL_W;
  const stageH = (rowCount + 1) * cellH;

  const commit = useCallback((next) => {
    setEditor((current) => {
      const history = [...current.history.slice(0, current.index + 1), next];
      return { history: history.slice(-60), index: Math.min(history.length - 1, 59) };
    });
    setServerIssues(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('screen-layout', { attractionId, screenId: screen.id }, headers);
    setLoading(false);
    if (!payload.ok) {
      setError(payload.error || 'Could not load this auditorium layout');
      return;
    }
    const types = payload.seatTypes || [];
    setSeatTypes(types);
    setVersions(payload.versions || []);
    setPublishedId(Number(payload.published?.id || 0));
    setDraftId(Number(payload.draft?.id || 0));
    if (payload.draft?.name) setName(payload.draft.name);
    setTemplates({ builtIn: payload.templates || [], saved: [] });
    const source = payload.draft?.document || payload.published?.document;
    const initial = source && Array.isArray(source.seats) && source.seats.length
      ? normalizeDoc(source)
      : gridDoc({ rows: screen.rowCount || 6, perRow: screen.seatsPerRow || 10, cols: Math.max(14, (screen.seatsPerRow || 10) + 4) });
    setEditor({ history: [initial], index: 0 });
    setSelected([]);
    setError('');

    const saved = await cinemaGet('layout-templates', { attractionId }, headers);
    if (saved.ok) setTemplates({ builtIn: saved.builtIn || payload.templates || [], saved: saved.saved || [] });
  }, [attractionId, headers, screen.id, screen.rowCount, screen.seatsPerRow]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // A seat that was deleted must not stay in the selection.
    setSelected((current) => {
      const ids = new Set(doc.seats.map((seat) => seat.id));
      const next = current.filter((id) => ids.has(id));
      return next.length === current.length ? current : next;
    });
  }, [doc]);

  const activeTypeMeta = seatTypes.find((type) => type.slug === activeType) || seatTypes[0];

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const selectedSeats = useMemo(() => doc.seats.filter((seat) => selectedIds.has(seat.id)), [doc, selectedIds]);

  // ─── Pointer interactions ──────────────────────────────────────────────────

  const cellFromPointer = useCallback((event) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return { x: 1, y: 1 };
    const x = Math.floor((event.clientX - box.left - LABEL_W * zoom) / (cellW * zoom)) + 1;
    const y = Math.floor((event.clientY - box.top) / (cellH * zoom)) + 1;
    return {
      x: Math.min(doc.cols, Math.max(1, x)),
      y: Math.max(1, y),
    };
  }, [cellH, cellW, doc.cols, zoom]);

  const applyType = useCallback((seat) => {
    if (!activeTypeMeta) return;
    commit(patchSeats(doc, [seat.id], { category: activeTypeMeta.slug, status: 'available' }));
  }, [activeTypeMeta, commit, doc]);

  const toggleBlocked = useCallback((seat) => {
    commit(patchSeats(doc, [seat.id], { status: seat.status === 'available' ? 'blocked' : 'available' }));
  }, [commit, doc]);

  const onSeatPointerDown = (event, seat) => {
    event.stopPropagation();
    if (tool === 'paint') { applyType(seat); return; }
    if (tool === 'block') { toggleBlocked(seat); return; }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    let next = selected;
    if (additive) {
      next = selected.includes(seat.id) ? selected.filter((id) => id !== seat.id) : [...selected, seat.id];
    } else if (!selected.includes(seat.id)) {
      next = [seat.id];
    }
    setSelected(next);
    dragRef.current = { mode: 'move', ids: next, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
    setDragDelta({ dx: 0, dy: 0 });
  };

  const onStagePointerDown = (event) => {
    if (event.target !== event.currentTarget) return;
    const cell = cellFromPointer(event);
    if (tool === 'paint') return;
    if (!event.shiftKey) setSelected([]);
    dragRef.current = { mode: 'marquee', startX: event.clientX, startY: event.clientY, cell, shiftKey: event.shiftKey };
    setMarquee({ from: cell, to: cell });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onStagePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'move') {
      drag.dx = Math.round((event.clientX - drag.startX) / (cellW * zoom));
      drag.dy = Math.round((event.clientY - drag.startY) / (cellH * zoom));
      setDragDelta({ dx: drag.dx, dy: drag.dy });
      return;
    }
    const cell = cellFromPointer(event);
    setMarquee((current) => (current ? { ...current, to: cell } : current));
  };

  const onStagePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragDelta({ dx: 0, dy: 0 });
    if (!drag) return;

    if (drag.mode === 'move') {
      if (drag.dx || drag.dy) commit(moveSeats(doc, drag.ids, drag.dx, drag.dy));
      return;
    }
    if (drag.mode === 'marquee' && marquee) {
      const x1 = Math.min(marquee.from.x, marquee.to.x);
      const x2 = Math.max(marquee.from.x, marquee.to.x);
      const y1 = Math.min(marquee.from.y, marquee.to.y);
      const y2 = Math.max(marquee.from.y, marquee.to.y);
      const caught = doc.seats
        .filter((seat) => seat.x >= x1 && seat.x <= x2 && seat.y >= y1 && seat.y <= y2)
        .map((seat) => seat.id);
      if (caught.length) setSelected((current) => (drag.shiftKey ? Array.from(new Set([...current, ...caught])) : caught));
      setMarquee(null);
    }
  };

  const paintEnter = (seat) => {
    if (tool !== 'paint' || !dragRef.current) return;
    applyType(seat);
  };

  // ─── Save / publish ────────────────────────────────────────────────────────

  const saveDraft = async ({ quiet = false } = {}) => {
    setBusy('draft');
    const payload = await cinemaPost('layout-save', {
      attractionId,
      screenId: screen.id,
      versionId: draftId,
      document: doc,
      name,
    }, headers);
    setBusy('');
    if (!payload.ok) {
      setError(payload.error || 'Could not save the draft');
      setServerIssues(payload.validation || null);
      return 0;
    }
    setDraftId(Number(payload.version.id));
    setVersions((current) => {
      const rest = current.filter((entry) => entry.id !== payload.version.id);
      return [payload.version, ...rest].sort((a, b) => b.version - a.version);
    });
    setServerIssues(payload.validation || null);
    setError('');
    if (!quiet) setNotice(`Draft v${payload.version.version} saved. Customers still see the published layout.`);
    return payload.version.id;
  };

  const publish = async () => {
    if (issues.errors.length) {
      setError(`Fix ${issues.errors.length} problem${issues.errors.length === 1 ? '' : 's'} before publishing.`);
      setTab('seats');
      return;
    }
    setBusy('publish');
    const versionId = draftId || await saveDraft({ quiet: true });
    if (!versionId) { setBusy(''); return; }
    const payload = await cinemaPost('layout-publish', { attractionId, screenId: screen.id, versionId }, headers);
    setBusy('');
    if (!payload.ok) {
      setError(payload.error || 'Could not publish this layout');
      setServerIssues(payload.validation || null);
      return;
    }
    setPublishedId(Number(payload.version.id));
    setVersions((current) => current.map((entry) => (
      entry.id === payload.version.id
        ? payload.version
        : entry.status === 'published' ? { ...entry, status: 'archived' } : entry
    )));
    setError('');
    setServerIssues(payload.validation || null);
    setNotice(`Layout v${payload.version.version} published — ${payload.validation?.capacity ?? stats.saleable} seats are now on sale for new screenings.`);
    onSaved?.();
  };

  const restore = async (versionId) => {
    setBusy('restore');
    const payload = await cinemaPost('layout-restore', { attractionId, screenId: screen.id, versionId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not restore that version'); return; }
    setEditor((current) => ({ history: [...current.history, normalizeDoc(payload.version.document)], index: current.history.length }));
    setDraftId(Number(payload.version.id));
    setSelected([]);
    setNotice(`Restored v${payload.restoredFrom} into draft v${payload.version.version}. Publish it to put it live.`);
  };

  const applyTemplate = (document, label) => {
    setEditor((current) => ({ history: [...current.history, normalizeDoc(document)], index: current.history.length }));
    setSelected([]);
    setNotice(`${label} loaded as a starting point. Publish to apply it.`);
  };

  const saveTemplate = async (label) => {
    setBusy('template');
    const payload = await cinemaPost('template-save', {
      attractionId,
      name: String(label || '').trim() || `${screen.name} · ${new Date().toLocaleDateString('en-GB')}`,
      document: doc,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not save the template'); return; }
    setTemplates((current) => ({ ...current, saved: [payload.template, ...current.saved] }));
    setNotice('Saved as a reusable template.');
  };

  const undo = () => setEditor((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  const redo = () => setEditor((current) => ({ ...current, index: Math.min(current.history.length - 1, current.index + 1) }));

  const fit = () => {
    const box = stageRef.current?.parentElement?.getBoundingClientRect();
    if (!box?.width) return;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(((box.width - 24) / stageW).toFixed(2)))));
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }

  const tools = [
    { id: 'select', label: 'Select & drag', icon: 'ph-cursor' },
    { id: 'paint', label: `Paint ${activeTypeMeta?.name || 'type'}`, icon: 'ph-paint-brush' },
    { id: 'block', label: 'Block seat', icon: 'ph-prohibit' },
  ];

  return (
    <div className="space-y-3">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1">
          {tools.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTool(entry.id)}
              title={entry.label}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black',
                tool === entry.id
                  ? 'bg-green-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              <i className={cx('ph', entry.icon)} /> <span className="hidden sm:inline">{entry.label}</span>
            </button>
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button type="button" onClick={undo} disabled={editor.index === 0} title="Undo" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800">
          <i className="ph ph-arrow-u-up-left" />
        </button>
        <button type="button" onClick={redo} disabled={editor.index >= editor.history.length - 1} title="Redo" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800">
          <i className="ph ph-arrow-u-up-right" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - 0.1).toFixed(2))))} title="Zoom out" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <i className="ph ph-minus" />
        </button>
        <span className="w-9 text-center text-[11px] font-black tabular-nums text-slate-500 dark:text-slate-400">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + 0.1).toFixed(2))))} title="Zoom in" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <i className="ph ph-plus" />
        </button>
        <button type="button" onClick={fit} className="rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Fit
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {draftId ? <Pill tone="amber">Draft v{versions.find((entry) => entry.id === draftId)?.version || ''}</Pill> : <Pill tone="slate">New layout</Pill>}
          {publishedId ? <Pill tone="green">Live</Pill> : null}
          <Button size="sm" variant="ghost" icon="ph-eye" onClick={() => setPreviewOpen((value) => !value)}>
            {previewOpen ? 'Hide preview' : 'Preview'}
          </Button>
          <Button size="sm" variant="ghost" icon={busy === 'draft' ? 'ph-circle-notch' : 'ph-floppy-disk'} disabled={Boolean(busy)} className={busy === 'draft' ? '[&>i]:animate-spin' : ''} onClick={() => saveDraft()}>
            Save draft
          </Button>
          <Button size="sm" icon={busy === 'publish' ? 'ph-circle-notch' : 'ph-rocket-launch'} disabled={Boolean(busy)} className={busy === 'publish' ? '[&>i]:animate-spin' : ''} onClick={publish}>
            Publish
          </Button>
          <Button size="sm" variant="ghost" icon="ph-x" onClick={onClose}>Close</Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          {/* Legend + quick actions */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-1">
              {seatTypes.map((type) => (
                <button
                  key={type.slug}
                  type="button"
                  onClick={() => { setActiveType(type.slug); setTool('paint'); }}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black transition',
                    activeType === type.slug
                      ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: type.color }} />
                  {type.name}
                </button>
              ))}
            </div>
            <p className="ml-auto text-[10px] font-bold text-slate-400">
              {stats.total} seats · {stats.rows} rows · {stats.saleable} saleable · {stats.blocked} blocked
            </p>
          </div>

          {/* Canvas */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="max-h-[62vh] overflow-auto rounded-2xl bg-white p-3 dark:bg-slate-900">
              <div style={{ width: stageW * zoom, height: stageH * zoom }}>
                <div
                  ref={stageRef}
                  role="application"
                  aria-label="Auditorium layout canvas"
                  onPointerDown={onStagePointerDown}
                  onPointerMove={onStagePointerMove}
                  onPointerUp={onStagePointerUp}
                  onPointerLeave={onStagePointerUp}
                  className="relative touch-none select-none"
                  style={{
                    width: stageW,
                    height: stageH,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.28) 1px, transparent 1px)',
                    backgroundSize: `${cellW}px ${cellH}px`,
                    backgroundPosition: `${LABEL_W}px 0px`,
                  }}
                >
                  <ScreenBar position={doc.screen.position} width={doc.screen.width} label={doc.screen.label} screenName={screen.name} />

                  {/* Aisles */}
                  {doc.aisles.map((aisle) => (
                    <div
                      key={aisle.id}
                      className="pointer-events-none absolute rounded-md border border-dashed border-sky-300 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-950/30"
                      style={{
                        left: LABEL_W + (aisle.fromX - 1) * cellW - doc.spacing.seat / 2,
                        top: (aisle.fromY - 1) * cellH + 14,
                        width: aisle.width * cellW,
                        height: (aisle.toY - aisle.fromY + 1) * cellH - 14,
                      }}
                    >
                      {aisle.label && (
                        <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[8px] font-black uppercase tracking-wide text-sky-500">
                          {aisle.label}
                        </span>
                      )}
                    </div>
                  ))}

                  <EntranceChips entrances={doc.entrances} />

                  {/* Row labels */}
                  {rows.map((row) => (
                    <div
                      key={`label-${row.label}`}
                      className="absolute -translate-y-1/2 text-[10px] font-black text-slate-400"
                      style={{ left: 0, top: (row.y - 1) * cellH + CELL / 2 + 14, width: LABEL_W - 6, textAlign: 'right' }}
                    >
                      {row.label}
                    </div>
                  ))}

                  {/* Seats */}
                  {doc.seats.map((seat) => {
                    const type = seatTypes.find((entry) => entry.slug === seat.category);
                    const isSelected = selectedIds.has(seat.id);
                    const isMoving = isSelected && (dragDelta.dx || dragDelta.dy);
                    const blocked = seat.status !== 'available';
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        onPointerDown={(event) => onSeatPointerDown(event, seat)}
                        onPointerEnter={() => paintEnter(seat)}
                        title={`${seat.row}${seat.number} · ${type?.name || seat.category}${seat.status !== 'available' ? ' · blocked' : ''}`}
                        className={cx(
                          'absolute flex items-center justify-center rounded-md border-2 text-[9px] font-black leading-none transition-[transform,box-shadow]',
                          isSelected && 'z-10 shadow-lg ring-2 ring-green-500 ring-offset-1 dark:ring-offset-slate-900',
                          blocked ? 'border-dashed' : 'hover:-translate-y-0.5'
                        )}
                        style={{
                          left: LABEL_W + (seat.x - 1) * cellW + (isMoving ? dragDelta.dx * cellW : 0),
                          top: (seat.y - 1) * cellH + 14 + (isMoving ? dragDelta.dy * cellH : 0),
                          width: CELL,
                          height: CELL,
                          backgroundColor: blocked ? 'transparent' : `${type?.color || '#94a3b8'}33`,
                          borderColor: blocked ? '#cbd5e1' : type?.color || '#94a3b8',
                          color: blocked ? '#94a3b8' : '#0f172a',
                          opacity: blocked ? 0.6 : 1,
                        }}
                      >
                        {type?.accessible ? <i className="ph ph-wheelchair text-[11px]" /> : seat.number}
                      </button>
                    );
                  })}

                  {/* Marquee */}
                  {marquee && (
                    <div
                      className="pointer-events-none absolute border-2 border-green-500 bg-green-500/10"
                      style={{
                        left: LABEL_W + (Math.min(marquee.from.x, marquee.to.x) - 1) * cellW,
                        top: (Math.min(marquee.from.y, marquee.to.y) - 1) * cellH + 14,
                        width: (Math.abs(marquee.to.x - marquee.from.x) + 1) * cellW,
                        height: (Math.abs(marquee.to.y - marquee.from.y) + 1) * cellH,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                icon="ph-rows"
                onClick={() => commit(addRow(doc, { category: activeType }))}
              >
                Add row
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="ph-plus-square"
                onClick={() => {
                  const anchor = selectedSeats[0] || doc.seats[doc.seats.length - 1];
                  const row = anchor?.row || 'A';
                  const y = anchor?.y || 1;
                  const inRow = doc.seats.filter((seat) => seat.row === row);
                  const x = Math.min(doc.cols, inRow.length ? Math.max(...inRow.map((seat) => seat.x)) + 1 : 1);
                  commit(addSeat(doc, { row, x, y, category: activeType }));
                }}
              >
                Add seat
              </Button>
              <Button size="sm" variant="ghost" icon="ph-arrows-out-line-horizontal" disabled={!selected.length} onClick={() => commit(mirrorSeats(doc, selected))}>
                Mirror
              </Button>
              <Button size="sm" variant="ghost" icon="ph-arrow-clockwise" disabled={!selected.length} onClick={() => commit(rotateSeats(doc, selected))}>
                Rotate 90°
              </Button>
              <Button size="sm" variant="danger" icon="ph-trash" disabled={!selected.length} onClick={() => { commit(removeSeats(doc, selected)); setSelected([]); }}>
                Delete {selected.length || ''}
              </Button>
              <p className="ml-auto text-[10px] font-semibold text-slate-400">
                Drag seats to move · shift-click or drag a box to select several · paint applies the active type
              </p>
            </div>
          </div>

          {previewOpen && (
            <CustomerPreview
              doc={doc}
              seatTypes={seatTypes}
              currency={currency}
              screenName={screen.name}
              onClose={() => setPreviewOpen(false)}
            />
          )}
        </div>

        <LayoutSidebar
          doc={doc}
          seatTypes={seatTypes}
          currency={currency}
          selected={selected}
          activeType={activeType}
          onActiveType={setActiveType}
          onChange={commit}
          onSelect={setSelected}
          issues={issues}
          serverIssues={serverIssues}
          versions={versions}
          draftId={draftId}
          publishedId={publishedId}
          templates={templates}
          name={name}
          onName={setName}
          onRestore={restore}
          onApplyTemplate={applyTemplate}
          onSaveTemplate={saveTemplate}
          onPublish={publish}
          busy={busy}
          tab={tab}
          onTab={setTab}
          selectedSeats={selectedSeats}
          stats={stats}
        />
      </div>
    </div>
  );
}
