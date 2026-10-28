import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, posGet, posPost } from '../../lib/ticketingClient.js';
import {
  Badge, Button, EmptyState, ErrorNote, Field, Notice, Panel, StatusBadge, TableWrap, Td, Th, inputClass,
} from './TicketingShared.jsx';

const PERMISSION_LABELS = {
  sell: 'Sell tickets',
  print: 'Print tickets',
  reprint: 'Reprint tickets',
  void: 'Void unused tickets',
  refund: 'Issue approved refunds',
  reports: 'View reports',
  shift: 'Open / close own shift',
  payout: 'Record cash payouts',
  viewAllSales: 'View every cashier’s sales',
};

// Owners assign ticket-office rights here. A cashier is just a staff record with
// the `sell` permission; everything else is opt-in so selling never silently
// grants refunds or reporting.
export default function CashierManagementPanel({ attractionId, headers, refresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ email: '', name: '', role: 'scanner', permissions: {} });

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await posGet('cashiers', { attractionId }, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load cashiers'); return; }
    setData(payload);
    setError('');
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const toggle = (key) => {
    setForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: !current.permissions[key] },
    }));
  };

  const saveCashier = async () => {
    setBusy('cashier');
    const payload = await posPost('save-cashier', {
      attractionId,
      email: form.email,
      name: form.name,
      role: form.role,
      permissions: form.permissions,
    }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not save the cashier'); return; }
    setNotice(`${payload.staff.email} can now use the ticket office.`);
    setForm({ email: '', name: '', role: 'scanner', permissions: {} });
    load();
    refresh();
  };

  const editCashier = (staff) => {
    setForm({
      email: staff.email,
      name: staff.name || '',
      role: staff.role || 'scanner',
      permissions: { ...staff.permissions },
    });
  };

  const remove = async (staff) => {
    setBusy(`remove-${staff.id}`);
    const payload = await posPost('remove-cashier', { attractionId, id: staff.id }, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error); return; }
    setNotice(`${staff.email} no longer has ticket-office access.`);
    load();
    refresh();
  };

  const permissionKeys = data?.permissionKeys || Object.keys(PERMISSION_LABELS);

  return (
    <div className="space-y-5">
      <Panel
        title="Cashier management"
        icon="ph-users-three"
        subtitle="Grant ticket-office permissions to your staff. Cashiers only see the attractions they are assigned to."
        actions={<Badge tone="slate">{data ? data.staff.length + 1 : 0} account(s)</Badge>}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Owner</p>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{data?.owner?.email || '—'}</p>
            <Badge tone="violet">full access</Badge>
          </div>
        </div>

        <div className="mt-4">
          {loading && !data ? (
            <p className="py-6 text-center text-sm font-bold text-slate-400">Loading cashiers…</p>
          ) : !data?.staff?.length ? (
            <EmptyState
              icon="ph-users-three"
              title="No cashiers yet"
              message="Add the email your ticket-office staff sign in with, then choose what they are allowed to do."
            />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <Th>Cashier</Th>
                    <Th>Role</Th>
                    <Th>Permissions</Th>
                    <Th>Status</Th>
                    <Th>Added</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((staff) => (
                    <tr key={staff.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <Td>
                        <span className="block text-sm font-bold text-slate-900 dark:text-white">{staff.name || staff.email}</span>
                        <span className="block text-[11px] text-slate-500">{staff.email}</span>
                      </Td>
                      <Td><Badge tone={staff.role === 'manager' ? 'sky' : 'slate'}>{staff.role}</Badge></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(staff.permissions || {})
                            .filter(([, allowed]) => allowed)
                            .map(([key]) => <Badge key={key} tone="emerald">{key}</Badge>)}
                        </div>
                      </Td>
                      <Td><StatusBadge status={staff.status} /></Td>
                      <Td className="text-xs whitespace-nowrap">{formatDateTime(staff.createdAt)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => editCashier(staff)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(staff)} disabled={busy === `remove-${staff.id}`}>
                            Remove
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
      </Panel>

      <Panel title={form.email ? `Edit ${form.email}` : 'Add a cashier'} icon="ph-user-plus">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Staff email">
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className={inputClass} placeholder="cashier@example.com" />
          </Field>
          <Field label="Display name">
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className={inputClass} placeholder="Front desk — Amina" />
          </Field>
          <Field label="Role" hint="Managers can create batches; scanners can sell and validate.">
            <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              className={inputClass}>
              <option value="scanner">Scanner / cashier</option>
              <option value="manager">Manager</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {permissionKeys.map((key) => (
            <label key={key} className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={Boolean(form.permissions[key])} onChange={() => toggle(key)} className="mt-0.5" />
              {PERMISSION_LABELS[key] || key}
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon="ph-check" onClick={saveCashier} disabled={busy === 'cashier' || !form.email}>
            {form.email ? 'Save cashier' : 'Add cashier'}
          </Button>
          <Button variant="ghost" onClick={() => setForm({ email: '', name: '', role: 'scanner', permissions: {} })}>
            Clear
          </Button>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          Every grant, permission change and removal is written to the attraction audit log.
        </p>
      </Panel>
    </div>
  );
}
