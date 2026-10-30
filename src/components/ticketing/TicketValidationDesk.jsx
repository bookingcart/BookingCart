import { useCallback, useEffect, useState } from 'react';
import TicketScanner from './TicketScanner.jsx';
import { useHardwareScanner } from '../../hooks/useHardwareScanner.js';
import { salesGet, salesPost, formatDate, formatDateTime } from '../../lib/ticketingClient.js';
import {
  Button, EmptyState, ErrorNote, Field, inputClass, Loading, Notice, Panel, TableWrap, Td, Th,
} from './TicketingShared.jsx';

const OUTCOMES = {
  valid: {
    tone: 'emerald', icon: 'ph-check-circle',
    title: 'Valid ticket', panel: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  already_used: {
    tone: 'amber', icon: 'ph-arrow-counter-clockwise',
    title: 'Already used', panel: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-300',
  },
  not_yet_valid: {
    tone: 'sky', icon: 'ph-clock',
    title: 'Not valid yet', panel: 'border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30',
    text: 'text-sky-800 dark:text-sky-300',
  },
};

const REJECTED_LOOK = {
  tone: 'rose', icon: 'ph-x-circle', title: 'Admission rejected',
  panel: 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30',
  text: 'text-rose-800 dark:text-rose-300',
};

export default function TicketValidationDesk({ attractionId, headers }) {
  const [ticket, setTicket] = useState('');
  const [admissions, setAdmissions] = useState(1);
  const [checking, setChecking] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(true);

  const loadScans = useCallback(async () => {
    if (!attractionId) return;
    setLoadingScans(true);
    const data = await salesGet('scans', { attractionId, pageSize: 12 }, headers);
    if (data.ok) setScans(data.scans || []);
    setLoadingScans(false);
  }, [attractionId, headers]);

  useEffect(() => { loadScans(); }, [loadScans]);

  const run = async (action, rawTicket) => {
    const value = String(rawTicket ?? ticket).trim();
    if (!value) { setError('Scan a QR code or type a ticket number first.'); return; }

    if (action === 'admit') setAdmitting(true); else setChecking(true);
    setError('');
    setNotice('');
    const data = await salesPost(action, {
      attractionId,
      ticket: value,
      admissions: action === 'admit' ? admissions : undefined,
    }, headers);
    if (action === 'admit') setAdmitting(false); else setChecking(false);

    if (data.httpStatus === 401 || data.httpStatus === 403) {
      setError(data.error || 'You do not have permission to validate tickets.');
      return;
    }
    if (!data.outcome && data.error) { setError(data.error); return; }

    setResult(data);
    setTicket(data.ticketNumber || value);
    if (action === 'admit' && data.outcome === 'valid') {
      setNotice(data.message || 'Admissions recorded.');
      setAdmissions(1);
      loadScans();
    }
  };

  const onScan = (decoded) => {
    setTicket(decoded);
    run('validate', decoded);
  };

  // A USB or Bluetooth scanner gun types the code and presses Enter. Handling it
  // here means the clerk can leave the page untouched at the gate.
  useHardwareScanner((decoded) => {
    setTicket(decoded);
    run('validate', decoded);
  });

  const look = result
    ? (OUTCOMES[result.outcome] || REJECTED_LOOK)
    : null;

  return (
    <div className="space-y-5">
      <Panel
        title="Entry validation"
        icon="ph-qr-code"
        subtitle="Scan the digital ticket or type its number. Every check is verified on the server and logged."
      >
        <ErrorNote message={error} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Ticket number or QR payload">
              <input
                type="text"
                value={ticket}
                onChange={(event) => setTicket(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') run('validate'); }}
                placeholder="AT-XXXXXXXXXX"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Admissions" hint="Group tickets can admit fewer visitors at a time.">
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, result?.admissionsRemaining || 20)}
                  value={admissions}
                  onChange={(event) => setAdmissions(Math.max(1, Number(event.target.value) || 1))}
                  className={`${inputClass} w-24`}
                />
              </Field>
              <Button icon="ph-magnifying-glass" onClick={() => run('validate')} disabled={checking}>
                {checking ? 'Checking…' : 'Check ticket'}
              </Button>
              <Button
                variant="dark"
                icon="ph-user-check"
                onClick={() => run('admit')}
                disabled={admitting || !result || result.outcome !== 'valid'}
              >
                {admitting ? 'Recording…' : 'Admit'}
              </Button>
            </div>
          </div>

          <TicketScanner onScan={onScan} elementId="ticketing-qr-reader" />
        </div>

        {result && (
          <div className={`mt-5 rounded-2xl border p-5 ${look.panel}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl text-white ${result.outcome === 'valid' ? 'bg-emerald-500' : result.outcome === 'already_used' ? 'bg-amber-500' : result.outcome === 'not_yet_valid' ? 'bg-sky-500' : 'bg-rose-500'}`}>
                <i className={`ph ${look.icon}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-lg font-black ${look.text}`}>{look.title}</h3>
                  <span className="rounded-full bg-white/70 dark:bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                    {String(result.outcome || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <p className={`mt-1 text-sm font-semibold ${look.text}`}>{result.message}</p>

                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ticket</dt>
                    <dd className="font-mono font-bold">{result.ticketNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Booking</dt>
                    <dd className="font-mono font-bold">{result.bookingRef || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Visitor</dt>
                    <dd className="font-semibold">{result.holderName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ticket type</dt>
                    <dd className="font-semibold">{result.ticketTypeName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Visit date</dt>
                    <dd className="font-semibold">{formatDate(result.visitDate)}{result.slotLabel ? ` · ${result.slotLabel}` : ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Admissions</dt>
                    <dd className="font-semibold">
                      Used {result.admissionsUsed ?? '—'} of {result.admissionsTotal ?? '—'}
                      {typeof result.admissionsRemaining === 'number' ? ` · ${result.admissionsRemaining} left` : ''}
                    </dd>
                  </div>
                  {result.window?.enforced && (
                    <div className="sm:col-span-2">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Permitted entry window</dt>
                      <dd className="font-semibold">
                        {formatDateTime(result.window.from)} – {formatDateTime(result.window.until)}
                      </dd>
                    </div>
                  )}
                  {result.outcome === 'not_yet_valid' && result.permittedFrom && (
                    <div className="sm:col-span-2">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Entry opens</dt>
                      <dd className="font-semibold">{formatDateTime(result.permittedFrom)}</dd>
                    </div>
                  )}
                  {result.previous && (
                    <div className="sm:col-span-2 rounded-xl bg-white/70 dark:bg-black/30 p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Previous admission</dt>
                      <dd className="font-semibold">
                        {formatDateTime(result.previous.at)} · {result.previous.staff || 'staff'}
                        {result.previous.admissions ? ` · ${result.previous.admissions} admission(s)` : ''}
                      </dd>
                    </div>
                  )}
                </dl>

                {result.outcome === 'already_used' && (
                  <p className="mt-3 text-xs font-bold">Do not admit this visitor again. Show them the previous admission details above.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Recent validations" icon="ph-list-checks" subtitle="The last scans recorded at this attraction.">
        {loadingScans ? (
          <Loading label="Loading scans…" />
        ) : !scans.length ? (
          <EmptyState icon="ph-qr-code" title="No scans yet" message="Validated tickets will appear here with the staff member and timestamp." />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <Th>Ticket</Th>
                  <Th>Result</Th>
                  <Th>Visitor</Th>
                  <Th>Staff</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {scans.map((scan, index) => (
                  <tr key={`${scan.ticketNumber}-${scan.createdAt}-${index}`}>
                    <Td className="font-mono text-xs">{scan.ticketNumber}</Td>
                    <Td>
                      <span className={`text-xs font-black uppercase ${scan.result === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {scan.result === 'success' ? scan.action : (scan.reason || 'rejected').replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td>{scan.guestName || '—'}</Td>
                    <Td className="text-xs">{scan.staff || '—'}</Td>
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(scan.createdAt)}</Td>
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
