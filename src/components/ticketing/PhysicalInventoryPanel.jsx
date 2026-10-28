import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime, money, posGet, posPost } from '../../lib/ticketingClient.js';
import {
  Badge, Button, EmptyState, ErrorNote, Field, Modal, Notice, Panel, StatCard, StatusBadge,
  TableWrap, Td, Th, inputClass,
} from './TicketingShared.jsx';

// Every batch and its ticket lifecycle. Generated, printed, sold, used, voided
// and expired are separate counters on purpose: printing never counts as a sale.
export default function PhysicalInventoryPanel({ attractionId, headers, context, refresh, onNavigate }) {
  const currency = context?.attraction?.currency || 'USD';
  const permissions = context?.permissions || {};
  const canManage = Boolean(permissions.void);

  const [filters, setFilters] = useState({ status: '', search: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await posGet('batches', { attractionId, ...filters, pageSize: 50 }, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load batches'); return; }
    setData(payload);
    setError('');
  }, [attractionId, headers, filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (batchId) => {
    setBusy('detail');
    const payload = await posGet('batch', { attractionId, id: batchId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setDetail(payload);
  };

  const changeStatus = async (batchId, action) => {
    setBusy(action);
    const payload = await posPost(action, { attractionId, batchId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`Batch ${action.replace('-batch', '')}d.`);
    if (detail) openDetail(batchId);
    load();
    refresh();
  };

  const remove = async (batchId) => {
    setBusy('delete-batch');
    const payload = await posPost('delete-batch', { attractionId, batchId }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setNotice('Batch deleted.');
    setDetail(null);
    load();
    refresh();
  };

  const voidUnsold = async () => {
    if (!voiding) return;
    setBusy('void');
    const payload = await posPost('void-tickets', {
      attractionId, batchId: voiding.id, reason,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`${payload.voided} unsold ticket(s) voided.`);
    setVoiding(null);
    setReason('');
    load();
    refresh();
  };

  const totals = data?.totals || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Generated" value={totals.generated || 0} icon="ph-ticket" tone="violet" />
        <StatCard label="Printed" value={totals.printed || 0} icon="ph-printer" tone="sky" />
        <StatCard label="Sold" value={totals.sold || 0} icon="ph-shopping-cart" tone="green" />
        <StatCard label="Unsold stock" value={totals.available || 0} icon="ph-stack" tone="amber" />
        <StatCard label="Voided" value={totals.voided || 0} icon="ph-prohibit" tone="rose" />
      </div>

      <Panel
        title="Physical ticket inventory"
        icon="ph-stack"
        actions={(
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Status">
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                className={`${inputClass} w-[130px] py-1.5 text-xs`}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Search">
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                className={`${inputClass} w-[170px] py-1.5 text-xs`} placeholder="Batch ref or name" />
            </Field>
            <Button size="sm" variant="soft" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            <Button size="sm" icon="ph-plus" onClick={() => onNavigate?.('create')}>New batch</Button>
          </div>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        {loading && !data ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">Loading batches…</p>
        ) : !(data?.batches || []).length ? (
          <EmptyState
            icon="ph-stack"
            title="No physical ticket batches yet"
            message="Create a batch to generate uniquely numbered, printable tickets."
            action={<Button icon="ph-plus" onClick={() => onNavigate?.('create')}>Create a batch</Button>}
          />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <Th>Batch</Th>
                  <Th>Type</Th>
                  <Th>Visit</Th>
                  <Th>Generated</Th>
                  <Th>Printed</Th>
                  <Th>Sold</Th>
                  <Th>Unsold</Th>
                  <Th>Voided</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {(data.batches || []).map((batch) => (
                  <tr key={batch.id} className="border-b border-slate-100 dark:border-slate-800/60">
                    <Td>
                      <button type="button" onClick={() => openDetail(batch.id)} className="text-left">
                        <span className="block font-mono text-xs font-bold text-green-700 dark:text-green-400">{batch.batchRef}</span>
                        <span className="block text-[11px] text-slate-500 truncate max-w-[180px]">{batch.name}</span>
                      </button>
                    </Td>
                    <Td className="text-xs">{batch.ticketTypeName}</Td>
                    <Td className="text-xs whitespace-nowrap">{formatDate(batch.visitDate)}</Td>
                    <Td>{batch.generated}</Td>
                    <Td>{batch.printed}</Td>
                    <Td className="font-bold text-green-700 dark:text-green-400">{batch.sold}</Td>
                    <Td>{batch.unsold}</Td>
                    <Td>{batch.voided}</Td>
                    <Td>
                      <StatusBadge status={batch.status} />
                      {batch.stale && <Badge tone="amber">past</Badge>}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(batch.id)}>Open</Button>
                        {canManage && batch.unsold > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setVoiding(batch)}>Void unsold</Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `Batch ${detail.batch.batchRef}` : 'Batch'} icon="ph-stack" wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
              <Info label="Name" value={detail.batch.name} />
              <Info label="Type" value={detail.batch.ticketTypeName} />
              <Info label="Visit date" value={formatDate(detail.batch.visitDate)} />
              <Info label="Expires" value={detail.batch.validTo ? formatDate(detail.batch.validTo) : formatDate(detail.batch.visitDate)} />
              <Info label="Unit price" value={money(detail.batch.unitPrice, detail.batch.currency || currency)} />
              <Info label="Admissions" value={detail.batch.admissions} />
              <Info label="Created" value={formatDateTime(detail.batch.createdAt)} />
              <Info label="Created by" value={detail.batch.createdBy || '—'} />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <Chip label="Generated" value={detail.batch.generated} />
              <Chip label="Printed" value={detail.batch.printed} />
              <Chip label="Sold" value={detail.batch.sold} />
              <Chip label="Used" value={detail.batch.used} />
              <Chip label="Unsold" value={detail.batch.unsold} />
              <Chip label="Voided" value={detail.batch.voided} />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr><Th>Ticket</Th><Th>Status</Th><Th>Prints</Th><Th>Admissions used</Th></tr>
                </thead>
                <tbody>
                  {detail.tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <Td><span className="font-mono">{ticket.ticketNo}</span></Td>
                      <Td><StatusBadge status={ticket.status} /></Td>
                      <Td>{ticket.printedCount}</Td>
                      <Td>{ticket.admissionsUsed}/{ticket.admissions}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { setDetail(null); onNavigate?.('print'); }}>Print this batch</Button>
              {canManage && (
                <>
                  <Button variant="soft" onClick={() => changeStatus(detail.batch.id, detail.batch.status === 'closed' ? 'reopen-batch' : 'close-batch')}
                    disabled={busy !== ''}>
                    {detail.batch.status === 'closed' ? 'Reopen' : 'Close batch'}
                  </Button>
                  <Button variant="soft" onClick={() => changeStatus(detail.batch.id, 'archive-batch')} disabled={busy !== ''}>
                    Archive
                  </Button>
                  {detail.batch.sold === 0 && detail.batch.used === 0 && (
                    <Button variant="danger" onClick={() => remove(detail.batch.id)} disabled={busy !== ''}>Delete</Button>
                  )}
                </>
              )}
            </div>
            {detail.batch.sold > 0 && (
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                This batch has sold or used tickets, so it can only be archived — deleting it would erase the sales history.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="Void unsold tickets" icon="ph-prohibit">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Voiding makes the remaining unsold tickets in <span className="font-mono">{voiding?.batchRef}</span> unusable.
          Sold and used tickets are never affected. A reason is required for the audit log.
        </p>
        <div className="mt-4">
          <Field label="Reason">
            <input value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}
              placeholder="Damaged during printing" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setVoiding(null)}>Cancel</Button>
          <Button variant="danger" icon="ph-prohibit" onClick={voidUnsold} disabled={busy === 'void' || reason.trim().length < 3}>
            Void {voiding?.unsold} ticket(s)
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value || '—'}</p>
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-1.5 text-center">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
