import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime, operatorGet, operatorPost } from '../../lib/transportClient.js';
import {
  Badge, ErrorNote, Field, Loading, Modal, Note, Panel, Table, btn, inputCls,
} from './ConsoleKit.jsx';

const ROLES = [
  { key: 'manager', label: 'Manager', hint: 'Everything except company settings' },
  { key: 'ticketing', label: 'Ticketing staff', hint: 'Sell, settle and refund' },
  { key: 'boarding', label: 'Boarding staff', hint: 'Scan and admit tickets only' },
  { key: 'agent', label: 'Ticket agent', hint: 'Sell tickets only' },
];

const emptyForm = { email: '', name: '', role: 'agent', status: 'active' };

/** Staff accounts. The owner is always listed first and can never be removed. */
export default function OperatorStaffTab({ operatorId, headers, can }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => headers(), [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('staff', operatorId, {}, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load the team'); return; }
    setError('');
    setStaff(result.staff || []);
  }, [operatorId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const result = await operatorPost('staff-save', operatorId, { staff: form }, authHeaders);
    setSaving(false);
    if (!result.ok) { setError(result.error || 'Could not save that staff member'); return; }
    setOpen(false);
    setStaff(result.staff || []);
    setNote(`${form.email} saved as ${form.role}.`);
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.email} from ${member.name || 'the team'}?`)) return;
    const result = await operatorPost('staff-remove', operatorId, { staffId: member.id }, authHeaders);
    if (!result.ok) { setError(result.error || 'Could not remove that staff member'); return; }
    setStaff(result.staff || []);
    setNote(`${member.email} removed.`);
  };

  if (!can('staff')) {
    return <Note tone="amber">Only the owner and managers can manage staff accounts.</Note>;
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {note && <Note>{note}</Note>}

      <Panel
        title="Team & permissions"
        subtitle="Every role is enforced on the server, not just hidden in the interface"
        actions={(
          <button type="button" className={btn.primary} onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <i className="ph ph-user-plus" aria-hidden="true" /> Invite staff
          </button>
        )}
        padded={false}
      >
        {loading ? (
          <Loading />
        ) : (
          <Table head={['Member', 'Role', 'Status', 'Added', '']}>
            {staff.map((member) => (
              <tr key={member.id || member.email}>
                <td className="px-2 py-2.5">
                  <p className="font-black text-slate-900 dark:text-white">{member.name || member.email.split('@')[0]}</p>
                  <p className="text-[11px] text-slate-400">{member.email}</p>
                </td>
                <td className="px-2 py-2.5 text-slate-600 dark:text-slate-300">{member.roleLabel || member.role}</td>
                <td className="px-2 py-2.5">
                  <Badge status={member.status} />
                  {member.owner && <span className="ml-1 text-[10px] font-black uppercase text-emerald-600">Owner</span>}
                </td>
                <td className="px-2 py-2.5 text-[11px] text-slate-400">{member.createdAt ? formatDateTime(member.createdAt) : '—'}</td>
                <td className="px-2 py-2.5 text-right">
                  {!member.owner && (
                    <button type="button" className={btn.ghost} onClick={() => remove(member)}>
                      <i className="ph ph-user-minus" aria-hidden="true" /> Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a staff member">
        <form className="space-y-3" onSubmit={save}>
          <Field label="Email" required hint="They sign in with this email — no invitation link needed">
            <input type="email" value={form.email} onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))} className={inputCls} />
          </Field>
          <Field label="Name">
            <input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} className={inputCls} />
          </Field>
          <Field label="Role" required>
            <select value={form.role} onChange={(event) => setForm((f) => ({ ...f, role: event.target.value }))} className={inputCls}>
              {ROLES.map((role) => <option key={role.key} value={role.key}>{role.label} — {role.hint}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(event) => setForm((f) => ({ ...f, status: event.target.value }))} className={inputCls}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-check" aria-hidden="true" />}
              Save member
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
