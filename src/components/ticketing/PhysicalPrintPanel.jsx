import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatDateTime, money, posGet, posPost } from '../../lib/ticketingClient.js';
import { Badge, Button, EmptyState, ErrorNote, Field, Notice, Panel, StatusBadge, Th, Td, TableWrap, inputClass } from './TicketingShared.jsx';
import {
  LAYOUTS, PAPER_SIZES, PrintPreview, buildQrMap, buildTicketSheetHtml, downloadHtml, normalizeTicket, printHtml,
} from './PhysicalPrint.jsx';

// Print a batch (or a single ticket). Printing writes an audit row and bumps a
// print counter, nothing else — stock, payment and admission state are untouched,
// so a reprint can never create extra admission rights.
export default function PhysicalPrintPanel({ attractionId, headers, context, refresh }) {
  const currency = context?.attraction?.currency || 'USD';
  const batches = context?.batches || [];

  const [batchId, setBatchId] = useState('');
  const [batch, setBatch] = useState(null);
  const [selected, setSelected] = useState([]);
  const [layout, setLayout] = useState(context?.settings?.printLayout || 'a4_4');
  const [paperSize, setPaperSize] = useState(context?.settings?.paperSize || 'A4');
  const [margin, setMargin] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');

  const loadBatch = useCallback(async (id) => {
    if (!id) { setBatch(null); setSelected([]); return; }
    setLoading(true);
    const payload = await posGet('batch', { attractionId, id }, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load the batch'); return; }
    setBatch(payload);
    setSelected(payload.tickets.filter((ticket) => ticket.status === 'available' || ticket.status === 'valid').map((ticket) => ticket.ticketNo));
    setError('');
  }, [attractionId, headers]);

  useEffect(() => { loadBatch(batchId); }, [batchId, loadBatch]);

  const printable = useMemo(
    () => (batch?.tickets || []).filter((ticket) => selected.includes(ticket.ticketNo)),
    [batch, selected]
  );

  const pages = useMemo(() => {
    const perPage = LAYOUTS[layout]?.perPage || 1;
    return Math.max(1, Math.ceil(printable.length / perPage));
  }, [layout, printable]);

  const toggle = (ticketNo) => {
    setSelected((current) => (current.includes(ticketNo)
      ? current.filter((entry) => entry !== ticketNo)
      : [...current, ticketNo]));
  };

  const sheetHtml = useCallback(async () => {
    const tickets = printable.map((ticket) => normalizeTicket({
      ...ticket,
      type: ticket.ticketTypeName || batch?.batch?.ticketTypeName,
      reference: batch?.batch?.batchRef,
      unitPrice: ticket.unitPrice ?? batch?.batch?.unitPrice,
      currency: batch?.batch?.currency || currency,
    }));
    const qrMap = await buildQrMap(tickets);
    return buildTicketSheetHtml({
      tickets,
      attraction: {
        ...(context?.attraction || {}),
        logoUrl: context?.settings?.ticketLogoUrl || '',
        contact: context?.settings?.ticketContact || '',
      },
      layout,
      paperSize,
      margin: Number(margin || 10),
      terms: context?.settings?.ticketTerms || '',
      qrMap,
      batchRef: batch?.batch?.batchRef || '',
      title: `Tickets ${batch?.batch?.batchRef || ''}`.trim(),
    });
  }, [printable, batch, context, layout, paperSize, margin, currency]);

  const runPrint = async (kind) => {
    if (!printable.length) { setError('Select at least one ticket to print'); return; }
    setBusy(kind);
    setError('');
    // Record the print first: if the printer fails the audit trail still shows
    // the attempt, and the same tickets can simply be printed again.
    const logged = await posPost('print', {
      attractionId,
      batchId: batch?.batch?.id,
      layout,
      kind,
      copies: 1,
      ticketNumbers: printable.map((ticket) => ticket.ticketNo),
    }, headers);
    if (!logged.ok) { setBusy(''); setError(logged.error || 'Could not record the print job'); return; }
    const html = await sheetHtml();
    setPreview(html);
    const printed = await printHtml(html, { title: 'Tickets' });
    setBusy('');
    if (!printed) setError('The printer is unavailable. The tickets were not changed — try printing again.');
    else setNotice(`${logged.kind === 'reprint' ? 'Reprinted' : 'Printed'} ${logged.printed} ticket(s). Printing does not sell tickets.`);
    loadBatch(batch?.batch?.id);
    refresh();
  };

  const download = async () => {
    if (!printable.length) return;
    const html = await sheetHtml();
    downloadHtml(html, `tickets-${batch?.batch?.batchRef || 'batch'}.html`);
  };

  if (!batches.length) {
    return (
      <Panel title="Print ticket batches" icon="ph-printer">
        <EmptyState
          icon="ph-printer"
          title="No batches to print"
          message="Create a physical ticket batch first — then print it here in A4, A5 or thermal layouts."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Print ticket batches"
        icon="ph-printer"
        subtitle="Choose a batch, pick the tickets and print. Reprinting is logged and never issues new admissions."
        actions={<Badge tone="slate">{printable.length} selected · {pages} page(s)</Badge>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Batch" className="lg:col-span-2">
            <select value={batchId} onChange={(event) => setBatchId(event.target.value)} className={inputClass}>
              <option value="">Choose a batch…</option>
              {batches.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.batchRef} · {entry.name} · {formatDate(entry.visitDate)} · {entry.availableForDate} unsold
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ticket design">
            <select value={layout} onChange={(event) => setLayout(event.target.value)} className={inputClass}>
              {Object.entries(LAYOUTS).map(([key, entry]) => (
                <option key={key} value={key}>{entry.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Paper size">
            <select value={paperSize} onChange={(event) => setPaperSize(event.target.value)} className={inputClass}>
              {PAPER_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </Field>
          <Field label="Margin (mm)">
            <input type="number" min="0" max="30" value={margin}
              onChange={(event) => setMargin(event.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={busy === 'print' ? 'ph-circle-notch' : 'ph-printer'} onClick={() => runPrint('print')}
            disabled={busy !== '' || !printable.length}>
            {busy === 'print' ? 'Printing…' : 'Print tickets'}
          </Button>
          <Button variant="soft" icon="ph-arrows-counter-clockwise" onClick={() => runPrint('reprint')}
            disabled={busy !== '' || !printable.length}>
            {busy === 'reprint' ? 'Reprinting…' : 'Reprint'}
          </Button>
          <Button variant="soft" icon="ph-file-pdf" onClick={() => runPrint('print')} disabled={busy !== '' || !printable.length}>
            Save as PDF
          </Button>
          <Button variant="ghost" icon="ph-download-simple" onClick={download} disabled={!printable.length}>
            Download sheet
          </Button>
          <Button variant="ghost" icon="ph-eye" onClick={async () => setPreview(await sheetHtml())} disabled={!printable.length}>
            Preview
          </Button>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          "Save as PDF" opens the browser print dialog — choose “Save as PDF” as the destination for a downloadable ticket sheet.
        </p>

        <ErrorNote message={error} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>
      </Panel>

      {batch && (
        <Panel
          title={`Batch ${batch.batch.batchRef}`}
          icon="ph-stack"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={batch.batch.status} />
              <Button size="sm" variant="ghost" onClick={() => setSelected(batch.tickets.filter((t) => t.status === 'available' || t.status === 'valid').map((t) => t.ticketNo))}>
                Select printable
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(batch.tickets.map((t) => t.ticketNo))}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          )}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
            <Info label="Type" value={batch.batch.ticketTypeName} />
            <Info label="Visit" value={formatDate(batch.batch.visitDate)} />
            <Info label="Unit price" value={money(batch.batch.unitPrice, batch.batch.currency || currency)} />
            <Info label="Printed" value={`${batch.batch.printed} of ${batch.batch.generated}`} />
          </div>

          <div className="mt-4">
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>&nbsp;</Th>
                    <Th>Ticket number</Th>
                    <Th>Status</Th>
                    <Th>Prints</Th>
                    <Th>Last printed</Th>
                  </tr>
                </thead>
                <tbody>
                  {batch.tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <Td>
                        <input type="checkbox" checked={selected.includes(ticket.ticketNo)} onChange={() => toggle(ticket.ticketNo)} />
                      </Td>
                      <Td><span className="font-mono text-xs">{ticket.ticketNo}</span></Td>
                      <Td><StatusBadge status={ticket.status} /></Td>
                      <Td>{ticket.printedCount}</Td>
                      <Td className="text-xs text-slate-500">{ticket.lastPrintedAt ? formatDateTime(ticket.lastPrintedAt) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {loading && <p className="mt-3 text-xs font-bold text-slate-400">Loading tickets…</p>}
          </div>

          {batch.prints?.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Print history</p>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {batch.prints.slice(0, 10).map((entry, index) => (
                  <li key={`${entry.ticketNo}-${index}`} className="flex flex-wrap items-center gap-2">
                    <Badge tone={entry.kind === 'reprint' ? 'amber' : 'sky'}>{entry.kind}</Badge>
                    <span className="font-mono">{entry.ticketNo || 'batch'}</span>
                    <span className="text-slate-400">{entry.actor}</span>
                    <span className="text-slate-400">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <PrintPreview open={Boolean(preview)} onClose={() => setPreview('')} html={preview} title="Ticket sheet preview">
        <Button variant="ghost" onClick={() => setPreview('')}>Close</Button>
        <Button icon="ph-printer" onClick={() => printHtml(preview, { title: 'Tickets' })}>Print</Button>
      </PrintPreview>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{value || '—'}</p>
    </div>
  );
}
