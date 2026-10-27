import { useCallback, useEffect, useState } from 'react';
import { ownerGet, ownerPost, formatDate } from '../../lib/ticketingClient.js';
import {
  Badge, Button, EmptyState, ErrorNote, Field, inputClass, Loading, Modal, Notice,
  Panel, StatusBadge, TableWrap, Td, Th,
} from './TicketingShared.jsx';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'UGX', 'KES', 'ZAR', 'AED', 'INR', 'CAD', 'AUD', 'JPY'];

const ROLE_HELP = {
  scanner: 'Can validate tickets at the gate and read the sales ledger.',
  manager: 'Can also edit ticket types, inventory, cancellations and refunds.',
  owner: 'Full access including settings, staff and promo codes.',
};

export default function TicketSettingsPanel({ attractionId, headers, role }) {
  const isOwner = role === 'owner';
  const [settings, setSettings] = useState(null);
  const [staff, setStaff] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const load = useCallback(async () => {
    if (!attractionId) return;
    setLoading(true);
    const [settingsRes, staffRes, promoRes] = await Promise.all([
      ownerGet('settings', { attractionId }, headers),
      ownerGet('staff', { attractionId }, headers),
      ownerGet('promos', { attractionId }, headers),
    ]);
    if (settingsRes.ok) setSettings(settingsRes.settings);
    else setError(settingsRes.error || 'Could not load ticket settings');
    if (staffRes.ok) setStaff(staffRes.staff || []);
    if (promoRes.ok) setPromos(promoRes.promos || []);
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const patch = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setNotice('');
    const payload = await ownerPost('save-settings', {
      attractionId,
      settings: {
        currency: settings.currency,
        tax_percent: Number(settings.tax_percent || 0),
        service_fee_percent: Number(settings.service_fee_percent || 0),
        advance_booking_days: Number(settings.advance_booking_days || 0),
        min_lead_hours: Number(settings.min_lead_hours || 0),
        cancellation_window_hours: Number(settings.cancellation_window_hours || 0),
        auto_confirm: settings.auto_confirm !== false,
        sales_paused: Boolean(settings.sales_paused),
        terms: settings.terms || '',
      },
    }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not save settings'); return; }
    setError('');
    setSettings(payload.settings);
    setNotice('Ticket settings saved.');
  };

  const removeStaff = async (member) => {
    const payload = await ownerPost('remove-staff', { attractionId, id: member.id }, headers);
    if (!payload.ok) { setError(payload.error || 'Could not revoke access'); return; }
    setNotice(`${member.email} no longer has access.`);
    load();
  };

  const removePromo = async (promo) => {
    const payload = await ownerPost('delete-promo', { attractionId, id: promo.id }, headers);
    if (!payload.ok) { setError(payload.error || 'Could not delete this promo'); return; }
    setNotice(`Promo ${promo.code} deleted.`);
    load();
  };

  if (loading && !settings) return <Loading label="Loading settings…" />;

  return (
    <div className="space-y-5">
      <Panel
        title="Ticket settings"
        icon="ph-gear"
        subtitle="Currency, taxes, fees, booking windows and the terms shown on every ticket."
        actions={isOwner ? (
          <Button size="sm" icon="ph-floppy-disk" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        ) : <Badge tone="amber">Owner access required</Badge>}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        {!settings ? <EmptyState icon="ph-gear" title="No settings" message="Save once to create the settings row." /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Currency" hint="Used for every price, payment and refund.">
              <select className={inputClass} value={settings.currency || 'USD'} disabled={!isOwner}
                onChange={(event) => patch('currency', event.target.value)}>
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Tax %" hint="Added to the ticket subtotal.">
              <input type="number" min="0" max="100" step="0.01" className={inputClass} disabled={!isOwner}
                value={settings.tax_percent ?? 0} onChange={(event) => patch('tax_percent', event.target.value)} />
            </Field>
            <Field label="Service fee %" hint="Platform fee, never refunded.">
              <input type="number" min="0" max="100" step="0.01" className={inputClass} disabled={!isOwner}
                value={settings.service_fee_percent ?? 0} onChange={(event) => patch('service_fee_percent', event.target.value)} />
            </Field>
            <Field label="Advance booking days" hint="How far ahead tickets can be sold.">
              <input type="number" min="1" max="730" className={inputClass} disabled={!isOwner}
                value={settings.advance_booking_days ?? 180} onChange={(event) => patch('advance_booking_days', event.target.value)} />
            </Field>
            <Field label="Minimum lead hours" hint="Stop sales this close to the entry time.">
              <input type="number" min="0" max="720" className={inputClass} disabled={!isOwner}
                value={settings.min_lead_hours ?? 0} onChange={(event) => patch('min_lead_hours', event.target.value)} />
            </Field>
            <Field label="Cancellation window (hours)" hint="Full refunds stop inside this window.">
              <input type="number" min="0" max="720" className={inputClass} disabled={!isOwner}
                value={settings.cancellation_window_hours ?? 24} onChange={(event) => patch('cancellation_window_hours', event.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 lg:col-span-1">
              <input type="checkbox" disabled={!isOwner} checked={settings.auto_confirm !== false}
                onChange={(event) => patch('auto_confirm', event.target.checked)} />
              Confirm bookings as soon as payment clears
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 lg:col-span-1">
              <input type="checkbox" disabled={!isOwner} checked={Boolean(settings.sales_paused)}
                onChange={(event) => patch('sales_paused', event.target.checked)} />
              Pause all ticket sales
            </label>
            <Field label="Terms & conditions" className="sm:col-span-2 lg:col-span-3"
              hint="Printed on every digital ticket and shown at checkout.">
              <textarea rows={4} className={inputClass} disabled={!isOwner}
                value={settings.terms || ''} onChange={(event) => patch('terms', event.target.value)} />
            </Field>
          </div>
        )}
      </Panel>

      <Panel
        title="Staff access"
        icon="ph-users-three"
        subtitle="Assigned staff can only work with this attraction's tickets."
        actions={isOwner ? <Button size="sm" icon="ph-user-plus" onClick={() => setStaffOpen(true)}>Add staff</Button> : null}
      >
        {!staff.length ? (
          <EmptyState icon="ph-users" title="No staff assigned"
            message="Add gate staff as scanners, or supervisors as managers." />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Added</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {staff.map((member) => (
                  <tr key={member.id}>
                    <Td className="font-semibold">{member.name || '—'}</Td>
                    <Td className="text-xs">{member.email}</Td>
                    <Td><Badge tone={member.role === 'owner' ? 'violet' : member.role === 'manager' ? 'sky' : 'slate'}>{member.role}</Badge></Td>
                    <Td><StatusBadge status={member.status} /></Td>
                    <Td className="text-xs whitespace-nowrap">{formatDate(member.created_at)}</Td>
                    <Td>
                      {isOwner && (
                        <Button size="sm" variant="ghost" icon="ph-trash" onClick={() => removeStaff(member)}>
                          Revoke
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          The attraction owner always has full access. {ROLE_HELP.manager}
        </p>
      </Panel>

      <Panel
        title="Promo codes"
        icon="ph-tag"
        subtitle="Apply percentage or fixed discounts at checkout."
        actions={isOwner ? <Button size="sm" icon="ph-plus" onClick={() => setPromoOpen(true)}>New promo</Button> : null}
      >
        {!promos.length ? (
          <EmptyState icon="ph-tag" title="No promo codes" message="Create a code to run a seasonal promotion." />
        ) : (
          <TableWrap>
            <table className="min-w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr><Th>Code</Th><Th>Discount</Th><Th>Used</Th><Th>Window</Th><Th>Status</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {promos.map((promo) => (
                  <tr key={promo.id}>
                    <Td className="font-mono text-xs font-bold">{promo.code}</Td>
                    <Td className="text-xs">
                      {Number(promo.percent_off) > 0 ? `${Number(promo.percent_off)}%` : ''}
                      {Number(promo.percent_off) > 0 && Number(promo.amount_off) > 0 ? ' + ' : ''}
                      {Number(promo.amount_off) > 0 ? `${promo.amount_off} off` : ''}
                    </Td>
                    <Td className="text-xs">{promo.redemptions || 0}{promo.max_redemptions ? ` / ${promo.max_redemptions}` : ''}</Td>
                    <Td className="text-xs whitespace-nowrap">
                      {promo.starts_at ? formatDate(promo.starts_at) : 'any'} – {promo.ends_at ? formatDate(promo.ends_at) : 'open'}
                    </Td>
                    <Td><StatusBadge status={promo.status} /></Td>
                    <Td>
                      {isOwner && (
                        <Button size="sm" variant="ghost" icon="ph-trash" onClick={() => removePromo(promo)}>Delete</Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      {staffOpen && (
        <StaffModal attractionId={attractionId} headers={headers}
          onClose={() => setStaffOpen(false)}
          onDone={(message) => { setStaffOpen(false); setNotice(message); load(); }} />
      )}
      {promoOpen && (
        <PromoModal attractionId={attractionId} headers={headers}
          onClose={() => setPromoOpen(false)}
          onDone={(message) => { setPromoOpen(false); setNotice(message); load(); }} />
      )}
    </div>
  );
}

function StaffModal({ attractionId, headers, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('scanner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    const payload = await ownerPost('save-staff', { attractionId, email, name, role }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not grant access'); return; }
    onDone(`${email} can now access ticketing as ${role}.`);
  };

  return (
    <Modal open onClose={onClose} title="Add ticketing staff" icon="ph-user-plus">
      <ErrorNote message={error} />
      <div className="space-y-3">
        <Field label="Work email">
          <input type="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)}
            placeholder="gate.staff@example.com" />
        </Field>
        <Field label="Name" hint="Shown on validation records.">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="scanner">Scanner — validate tickets only</option>
            <option value="manager">Manager — types, inventory, refunds</option>
            <option value="owner">Owner — full access</option>
          </select>
        </Field>
        <p className="text-[11px] text-slate-500">{ROLE_HELP[role]}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon="ph-check" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : 'Grant access'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PromoModal({ attractionId, headers, onClose, onDone }) {
  const [form, setForm] = useState({
    code: '', description: '', percentOff: '', amountOff: '', maxRedemptions: '', startsAt: '', endsAt: '', status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSaving(true);
    setError('');
    const payload = await ownerPost('save-promo', { attractionId, ...form }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not save this promo code'); return; }
    onDone(`Promo ${form.code.toUpperCase()} saved.`);
  };

  return (
    <Modal open onClose={onClose} title="New promo code" icon="ph-tag">
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code">
          <input className={`${inputClass} font-mono uppercase`} value={form.code}
            onChange={(event) => patch('code', event.target.value.toUpperCase())} placeholder="SUMMER25" />
        </Field>
        <Field label="Description">
          <input className={inputClass} value={form.description} onChange={(event) => patch('description', event.target.value)} />
        </Field>
        <Field label="Percent off">
          <input type="number" min="0" max="100" step="0.01" className={inputClass} value={form.percentOff}
            onChange={(event) => patch('percentOff', event.target.value)} />
        </Field>
        <Field label="Fixed amount off">
          <input type="number" min="0" step="0.01" className={inputClass} value={form.amountOff}
            onChange={(event) => patch('amountOff', event.target.value)} />
        </Field>
        <Field label="Max redemptions" hint="Leave blank for unlimited.">
          <input type="number" min="0" className={inputClass} value={form.maxRedemptions}
            onChange={(event) => patch('maxRedemptions', event.target.value)} />
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(event) => patch('status', event.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Starts">
          <input type="date" className={inputClass} value={form.startsAt} onChange={(event) => patch('startsAt', event.target.value)} />
        </Field>
        <Field label="Ends">
          <input type="date" className={inputClass} value={form.endsAt} onChange={(event) => patch('endsAt', event.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" icon="ph-check" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save promo'}
        </Button>
      </div>
    </Modal>
  );
}
