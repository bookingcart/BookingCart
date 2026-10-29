import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TicketValidationPanel from '../components/TicketValidationPanel.jsx';
import { TRANSPORT_TYPES, transportGet, transportPost } from '../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Note, Panel, btn, inputCls,
} from '../components/transport/ConsoleKit.jsx';
import OperatorOverviewTab from '../components/transport/OperatorOverviewTab.jsx';
import OperatorRoutesTab from '../components/transport/OperatorRoutesTab.jsx';
import OperatorDeparturesTab from '../components/transport/OperatorDeparturesTab.jsx';
import OperatorFleetTab from '../components/transport/OperatorFleetTab.jsx';
import OperatorBookingsTab from '../components/transport/OperatorBookingsTab.jsx';
import OperatorPosTab from '../components/transport/OperatorPosTab.jsx';
import OperatorReportsTab from '../components/transport/OperatorReportsTab.jsx';
import OperatorStaffTab from '../components/transport/OperatorStaffTab.jsx';
import OperatorSettingsTab from '../components/transport/OperatorSettingsTab.jsx';

// Mirrors the capability sets the API enforces in lib/transport-ops.js. Hiding a
// tab is a courtesy — the server is what actually refuses the request.
const ROLE_CAPS = {
  owner: ['read', 'manage', 'sell', 'board', 'refund', 'staff', 'settings'],
  manager: ['read', 'manage', 'sell', 'board', 'refund', 'staff'],
  ticketing: ['read', 'sell', 'refund'],
  boarding: ['read', 'board'],
  agent: ['read', 'sell'],
};

const MENU = [
  { id: 'overview', label: 'Overview', icon: 'ph-squares-four', cap: 'read' },
  { id: 'routes', label: 'Routes & stops', icon: 'ph-path', cap: 'read' },
  { id: 'departures', label: 'Departures', icon: 'ph-calendar-dots', cap: 'read' },
  { id: 'fleet', label: 'Vehicles & seats', icon: 'ph-bus', cap: 'read' },
  { id: 'bookings', label: 'Bookings', icon: 'ph-receipt', cap: 'read' },
  { id: 'pos', label: 'Counter sales', icon: 'ph-cash-register', cap: 'sell' },
  { id: 'validate', label: 'Board tickets', icon: 'ph-qr-code', cap: 'board' },
  { id: 'reports', label: 'Reports', icon: 'ph-chart-line-up', cap: 'read' },
  { id: 'staff', label: 'Team', icon: 'ph-users-three', cap: 'staff' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear', cap: 'settings' },
];

const STORAGE_KEY = 'bc_transport_operator';

const emptyApplication = {
  name: '', description: '', website: '', phone: '', email: '',
  transportTypes: ['bus'],
};

export default function TransportDashboardPage() {
  const { user, authHeaders } = useAuth();
  const navigate = useNavigate();
  const { tab } = useParams();

  const [operators, setOperators] = useState([]);
  const [operatorId, setOperatorId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // authHeaders() builds a fresh object, so memoise it once for stable deps.
  const headers = useMemo(() => authHeaders(), [authHeaders]);

  const activeTab = MENU.some((entry) => entry.id === tab) ? tab : 'overview';

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const result = await transportGet('my-operators', {}, headers);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load your transport company'); return; }
    setError('');
    const list = result.operators || [];
    setOperators(list);
    if (!list.length) { setOperatorId(0); return; }
    const remembered = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
    setOperatorId((current) => {
      const match = list.find((entry) => entry.id === remembered)
        || list.find((entry) => entry.id === current)
        || list[0];
      return match.id;
    });
  }, [user, headers]);

  useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) navigate('/auth?redirect=/transport/dashboard', { replace: true });
  }, [user, navigate]);

  const operator = operators.find((entry) => entry.id === operatorId) || null;
  const role = operator?.role || 'owner';
  const can = useCallback((cap) => (ROLE_CAPS[role] || []).includes(cap), [role]);

  const switchOperator = (id) => {
    setOperatorId(Number(id));
    window.localStorage.setItem(STORAGE_KEY, String(id));
  };

  const goTab = (id) => {
    setMenuOpen(false);
    navigate(`/transport/dashboard/${id}`);
  };

  if (!user) return null;

  if (loading && !operators.length) {
    return <div className="min-h-[60vh]"><Loading label="Opening your transport console…" /></div>;
  }

  // ── Failed load: never mistake an outage for "you have no company" ─────────
  if (!operators.length && error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Panel title="Could not open your operator console" subtitle="Your company is still there — this request failed">
          <ErrorNote message={error} />
          <div className="mt-3">
            <button type="button" className={btn.primary} onClick={load}>
              <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Try again
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  // ── First run: apply to become a transport operator ────────────────────────
  if (!operators.length) {
    return (
      <ApplicationForm
        headers={headers}
        defaultEmail={user.email || ''}
        error={error}
        onApplied={load}
      />
    );
  }

  const visibleMenu = MENU.filter((entry) => can(entry.cap));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto flex max-w-[1500px] flex-col md:flex-row">
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white p-4 transition-transform dark:border-slate-800 dark:bg-slate-900
          md:sticky md:top-0 md:h-screen md:translate-x-0
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="mb-6 hidden items-center gap-3 md:flex">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-lg text-white shadow-sm">
              <i className="ph ph-steering-wheel" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black leading-none text-slate-900 dark:text-white">Transport Portal</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">Operator console</p>
            </div>
          </div>

          {operators.length > 1 && (
            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Company</span>
              <select value={operatorId} onChange={(event) => switchOperator(event.target.value)} className={inputCls}>
                {operators.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </label>
          )}

          <nav className="space-y-1">
            {visibleMenu.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => goTab(entry.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-xs font-black transition-colors ${
                  activeTab === entry.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <i className={`ph ${entry.icon} text-base`} aria-hidden="true" />
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{user.email}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">{role}</p>
            <button type="button" className={`${btn.ghost} mt-2`} onClick={() => navigate('/transport/bookings')}>
              <i className="ph ph-ticket" aria-hidden="true" /> My own trips
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 md:hidden dark:border-slate-700 dark:bg-slate-900"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Toggle menu"
              >
                <i className="ph ph-list" aria-hidden="true" />
              </button>
              <div>
                <h1 className="text-lg font-black text-slate-900 dark:text-white sm:text-2xl">{operator?.name}</h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <Badge status={operator?.status} />
                  {(operator?.transportTypes || []).map((type) => {
                    const meta = TRANSPORT_TYPES.find((entry) => entry.key === type);
                    return meta ? (
                      <span key={type} className="inline-flex items-center gap-1">
                        <i className={`ph ${meta.icon}`} aria-hidden="true" /> {meta.label}
                      </span>
                    ) : null;
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn.secondary} onClick={load}>
                <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Refresh
              </button>
              <button type="button" className={btn.primary} onClick={() => navigate('/transport')}>
                <i className="ph ph-magnifying-glass" aria-hidden="true" /> View storefront
              </button>
            </div>
          </header>

          <ErrorNote message={error} />

          {operator?.status === 'pending' && (
            <div className="mb-4">
              <Note tone="amber">
                Your company is waiting for platform approval. You can set up routes, vehicles and departures now —
                selling opens as soon as an administrator approves you.
              </Note>
            </div>
          )}

          <div className="mt-3">
            {activeTab === 'overview' && (
              <OperatorOverviewTab operatorId={operatorId} headers={authHeaders} can={can} onNavigate={goTab} />
            )}
            {activeTab === 'routes' && <OperatorRoutesTab operatorId={operatorId} headers={authHeaders} can={can} />}
            {activeTab === 'departures' && <OperatorDeparturesTab operatorId={operatorId} headers={authHeaders} can={can} />}
            {activeTab === 'fleet' && <OperatorFleetTab operatorId={operatorId} headers={authHeaders} can={can} />}
            {activeTab === 'bookings' && <OperatorBookingsTab operatorId={operatorId} headers={authHeaders} can={can} />}
            {activeTab === 'pos' && (
              <OperatorPosTab
                operatorId={operatorId}
                headers={authHeaders}
                operator={operator}
                role={role}
                staffName={user.name || user.email || ''}
              />
            )}
            {activeTab === 'validate' && (
              <Panel title="Board tickets" subtitle="Scan a QR code or type the ticket number — one scan per passenger">
                <TicketValidationPanel operatorType="transport" />
              </Panel>
            )}
            {activeTab === 'reports' && <OperatorReportsTab operatorId={operatorId} headers={authHeaders} />}
            {activeTab === 'staff' && <OperatorStaffTab operatorId={operatorId} headers={authHeaders} can={can} />}
            {activeTab === 'settings' && <OperatorSettingsTab operatorId={operatorId} headers={authHeaders} can={can} />}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Shown to a signed-in user who does not own or work for a transport company yet. */
function ApplicationForm({ headers, defaultEmail, error, onApplied }) {
  const [form, setForm] = useState({ ...emptyApplication, email: defaultEmail });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');

  const toggleType = (key) => {
    setForm((current) => {
      const has = current.transportTypes.includes(key);
      const next = has ? current.transportTypes.filter((entry) => entry !== key) : [...current.transportTypes, key];
      return { ...current, transportTypes: next.length ? next : [key] };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setFailure('');
    if (!form.name.trim()) { setFailure('Enter your company name.'); return; }
    setSaving(true);
    const result = await transportPost('apply', {
      name: form.name,
      transportTypes: form.transportTypes,
      description: form.description,
      website: form.website,
      contact: { phone: form.phone, email: form.email },
    }, headers);
    setSaving(false);
    if (!result.ok) { setFailure(result.error || 'Could not submit your application'); return; }
    await onApplied();
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-lg">
            <i className="ph ph-steering-wheel" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-2xl font-black text-slate-900 dark:text-white">Start selling transport tickets</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Register your bus company, ferry service or rail operator. You can build routes and schedules
            straight away — sales open once the platform approves you.
          </p>
        </div>

        <Panel title="Company application">
          <form className="space-y-3" onSubmit={submit}>
            <ErrorNote message={failure || error} />
            <Field label="Company name" required>
              <input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} className={inputCls} placeholder="Nile Coach Lines" />
            </Field>

            <div>
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                What do you operate?
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                {TRANSPORT_TYPES.map((meta) => {
                  const active = form.transportTypes.includes(meta.key);
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      onClick={() => toggleType(meta.key)}
                      className={`rounded-xl border p-3 text-left text-xs font-black transition-colors ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <i className={`ph ${meta.icon} mb-1 block text-base`} aria-hidden="true" />
                      {meta.label}
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{meta.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="About your company">
              <textarea value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} rows={3} className={inputCls} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact phone">
                <input value={form.phone} onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))} className={inputCls} />
              </Field>
              <Field label="Contact email">
                <input type="email" value={form.email} onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))} className={inputCls} />
              </Field>
              <Field label="Website" className="sm:col-span-2">
                <input value={form.website} onChange={(event) => setForm((f) => ({ ...f, website: event.target.value }))} className={inputCls} placeholder="https://…" />
              </Field>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" className={btn.primary} disabled={saving}>
                {saving ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-paper-plane-tilt" aria-hidden="true" />}
                Submit application
              </button>
            </div>
          </form>
        </Panel>

        <div className="mt-4">
          <Empty
            icon="ph-info"
            title="Already working for an operator?"
            message="Ask the company owner to add your email under Team — you will see their console here."
          />
        </div>
      </div>
    </div>
  );
}
