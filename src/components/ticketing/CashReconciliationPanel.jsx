import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, formatDateTime, money, posGet, posPost, todayISO } from '../../lib/ticketingClient.js';
import {
  Badge, Button, DateRange, EmptyState, ErrorNote, Field, Notice, Panel, StatCard, StatusBadge,
  TableWrap, Td, Th, inputClass,
} from './TicketingShared.jsx';

// Shift reconciliation. Cash is the only thing counted in the till: card and
// mobile money are reported separately and never folded into the cash balance.
export default function CashReconciliationPanel({ attractionId, headers, context, refresh }) {
  const currency = context?.attraction?.currency || 'USD';
  const permissions = context?.permissions || {};
  const shift = context?.shift || null;

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [payout, setPayout] = useState({ amount: '', reason: '', kind: 'payout' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState({ from: addDays(todayISO(), -30), to: todayISO() });

  const loadHistory = useCallback(async () => {
    if (!permissions.reports) return;
    const payload = await posGet('shifts', { attractionId, ...range }, headers);
    if (payload.ok) setHistory(payload);
  }, [attractionId, headers, range, permissions.reports]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const expected = shift?.expectedCashNow ?? 0;
  const difference = useMemo(() => {
    if (!shift || counted === '') return 0;
    return Math.round(((Number(counted) || 0) - expected + Number.EPSILON) * 100) / 100;
  }, [shift, counted, expected]);

  const closeShift = async () => {
    setBusy('close');
    const payload = await posPost('close-shift', {
      attractionId,
      shiftId: shift?.id,
      countedCash: counted === '' ? undefined : Number(counted),
      note,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not close the shift'); return; }
    setNotice(payload.discrepancy
      ? `Shift closed with a ${money(Math.abs(payload.shift.difference), currency)} discrepancy — recorded for review.`
      : 'Shift closed and balanced.');
    setCounted('');
    setNote('');
    refresh();
    loadHistory();
  };

  const recordMovement = async () => {
    setBusy('payout');
    const payload = await posPost('payout', {
      attractionId,
      shiftId: shift?.id,
      kind: payout.kind,
      amount: Number(payout.amount || 0),
      reason: payout.reason,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not record the cash movement'); return; }
    setNotice(`${payout.kind} of ${money(Number(payout.amount || 0), currency)} recorded.`);
    setPayout({ amount: '', reason: '', kind: 'payout' });
    refresh();
  };

  const shifts = history?.shifts || [];
  const totals = history?.totals || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Expected in till" value={money(expected, currency)} icon="ph-safe" tone="emerald" />
        <StatCard label="Cash sales" value={money(shift?.cashSales ?? 0, currency)} icon="ph-money" tone="sky" />
        <StatCard label="Tickets this shift" value={shift?.tickets ?? 0} icon="ph-ticket" tone="violet" />
        <StatCard
          label="Difference"
          value={counted === '' ? '—' : money(difference, currency)}
          icon="ph-scales"
          tone={Math.abs(difference) < 0.01 ? 'emerald' : 'rose'}
          hint={counted === '' ? 'Enter the counted cash' : Math.abs(difference) < 0.01 ? 'Balanced' : 'Needs a reason'}
        />
      </div>

      <ErrorNote message={error} />
      <Notice onClose={() => setNotice('')}>{notice}</Notice>

      {!shift ? (
        <Panel title="No open shift" icon="ph-safe">
          <EmptyState
            icon="ph-safe"
            title="Open a shift before taking cash"
            message="Open your shift from the Point of Sale tab so the till starts from a known opening balance."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel title="Shift breakdown" icon="ph-receipt"
            subtitle={`Opened ${formatDateTime(shift.openedAt)}${shift.cashierName ? ` by ${shift.cashierName}` : ''}`}>
            <div className="space-y-1.5 text-sm">
              <Row label="Opening cash" value={money(shift.openingCash, currency)} />
              <Row label="Cash ticket sales" value={money(shift.cashSales, currency)} />
              <Row label="Cash refunds" value={`− ${money(shift.cashRefunds, currency)}`} />
              <Row label="Cash payouts" value={`− ${money(shift.payouts, currency)}`} />
              <div className="border-t border-slate-200 dark:border-slate-700 my-2" />
              <Row label="Expected closing cash" value={money(expected, currency)} strong />
              <div className="border-t border-slate-200 dark:border-slate-700 my-2" />
              <Row label="Mobile money (not cash)" value={money(shift.mobileSales, currency)} />
              <Row label="Card (not cash)" value={money(shift.cardSales, currency)} />
              <Row label="Other" value={money(shift.otherSales, currency)} />
              <Row label="Total refunds" value={money(shift.refunds, currency)} />
              <Row label="Pending payments" value={shift.pendingSales ?? 0} />
            </div>
            <p className="mt-3 text-[11px] font-semibold text-slate-400">
              Expected = opening + cash received − cash refunds − authorised payouts. Non-cash payments are never counted as cash.
            </p>
          </Panel>

          <div className="space-y-5">
            {permissions.payout && (
              <Panel title="Record a cash movement" icon="ph-hand-coins"
                subtitle="Payouts, floats and corrections all require a reason.">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select value={payout.kind} onChange={(event) => setPayout((current) => ({ ...current, kind: event.target.value }))}
                      className={inputClass}>
                      <option value="payout">Cash payout</option>
                      <option value="float">Float top-up</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </Field>
                  <Field label={`Amount (${currency})`}>
                    <input type="number" min="0" step="0.01" value={payout.amount}
                      onChange={(event) => setPayout((current) => ({ ...current, amount: event.target.value }))}
                      className={inputClass} placeholder="0.00" />
                  </Field>
                  <Field label="Reason" className="col-span-2">
                    <input value={payout.reason} onChange={(event) => setPayout((current) => ({ ...current, reason: event.target.value }))}
                      className={inputClass} placeholder="Change run to the bank" />
                  </Field>
                </div>
                <Button className="mt-3" icon="ph-plus" onClick={recordMovement}
                  disabled={busy === 'payout' || !payout.amount || payout.reason.trim().length < 3}>
                  Record movement
                </Button>
              </Panel>
            )}

            <Panel title="Close this shift" icon="ph-flag-checkered"
              subtitle="Count the cash in the till and enter the total.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={`Cash counted (${currency})`}>
                  <input type="number" min="0" step="0.01" value={counted}
                    onChange={(event) => setCounted(event.target.value)} className={inputClass}
                    placeholder={expected.toFixed(2)} />
                </Field>
                <Field label="Note" hint="Required when the till does not balance.">
                  <input value={note} onChange={(event) => setNote(event.target.value)} className={inputClass}
                    placeholder="Short by 5 — passenger gave change from float" />
                </Field>
              </div>
              {counted !== '' && (
                <p className={`mt-2 text-xs font-bold ${Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {Math.abs(difference) < 0.01
                    ? 'The till balances.'
                    : `${difference > 0 ? 'Over' : 'Short'} by ${money(Math.abs(difference), currency)}${note.trim().length < 3 ? ' — add a reason to close.' : ''}`}
                </p>
              )}
              <Button className="mt-3" icon="ph-lock" variant="dark" onClick={closeShift}
                disabled={busy === 'close' || (Math.abs(difference) >= 0.01 && note.trim().length < 3)}>
                Close shift
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {permissions.reports && (
        <Panel
          title="Shift history"
          icon="ph-clock-counter-clockwise"
          actions={<DateRange from={range.from} to={range.to} onChange={setRange} label="" />}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Closed shifts" value={totals.closedShifts || 0} icon="ph-check-circle" tone="emerald" />
            <StatCard label="Open shifts" value={totals.openShifts || 0} icon="ph-play-circle" tone="amber" />
            <StatCard label="Net difference" value={money(totals.netDifference || 0, currency)} icon="ph-scales" tone="rose" />
            <StatCard label="Cash handled" value={money(totals.cashSales || 0, currency)} icon="ph-money" tone="sky" />
          </div>

          {!shifts.length ? (
            <EmptyState icon="ph-clock" title="No shifts in this period" message="Shifts appear here once a cashier opens one." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>Cashier</Th>
                    <Th>Opened</Th>
                    <Th>Closed</Th>
                    <Th>Opening</Th>
                    <Th>Expected</Th>
                    <Th>Counted</Th>
                    <Th>Difference</Th>
                    <Th>Status</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <Td>
                        <span className="block text-xs font-bold text-slate-900 dark:text-white">{entry.cashierName || entry.cashierEmail}</span>
                        <span className="block text-[10px] text-slate-400">{entry.cashierEmail}</span>
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{formatDateTime(entry.openedAt)}</Td>
                      <Td className="text-xs whitespace-nowrap">{entry.closedAt ? formatDateTime(entry.closedAt) : '—'}</Td>
                      <Td className="whitespace-nowrap">{money(entry.openingCash, currency)}</Td>
                      <Td className="whitespace-nowrap">{money(entry.expectedCash, currency)}</Td>
                      <Td className="whitespace-nowrap">{entry.status === 'closed' ? money(entry.countedCash, currency) : '—'}</Td>
                      <Td>
                        {entry.status === 'closed' ? (
                          <span className={`font-bold ${Math.abs(entry.difference) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {money(entry.difference, currency)}
                          </span>
                        ) : '—'}
                      </Td>
                      <Td>
                        <StatusBadge status={entry.status} />
                        {entry.pendingSales > 0 && <Badge tone="amber">{entry.pendingSales} pending</Badge>}
                      </Td>
                      <Td className="text-[11px] text-slate-500 max-w-[180px] truncate">{entry.closeNote || entry.openNote || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-xs font-bold ${strong ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      <span className={`${strong ? 'text-base font-black' : 'text-sm font-bold'} text-slate-900 dark:text-white`}>{value}</span>
    </div>
  );
}
