import { useCallback, useEffect, useMemo, useState } from 'react';
import { ownerGet, posGet, todayISO } from '../../lib/ticketingClient.js';
import { Badge, Button, ErrorNote, Loading, Modal, Notice, Panel } from './TicketingShared.jsx';
import ImportListingsPrompt, { ImportListingsList } from './ImportListingsPrompt.jsx';
import PosTerminalPanel from './PosTerminalPanel.jsx';
import PhysicalBatchCreatePanel from './PhysicalBatchCreatePanel.jsx';
import PhysicalPrintPanel from './PhysicalPrintPanel.jsx';
import PhysicalInventoryPanel from './PhysicalInventoryPanel.jsx';
import TicketDesignPanel from './TicketDesignPanel.jsx';
import PhysicalSalesHistoryPanel from './PhysicalSalesHistoryPanel.jsx';
import CashierManagementPanel from './CashierManagementPanel.jsx';
import CashReconciliationPanel from './CashReconciliationPanel.jsx';
import PhysicalReportsPanel from './PhysicalReportsPanel.jsx';

const SECTIONS = [
  { id: 'pos', label: 'Point of Sale', icon: 'ph-cash-register', permission: 'sell' },
  { id: 'create', label: 'Create Physical Tickets', icon: 'ph-ticket', permission: 'print' },
  { id: 'print', label: 'Print Ticket Batches', icon: 'ph-printer', permission: 'print' },
  { id: 'design', label: 'Ticket Design', icon: 'ph-palette', permission: 'print' },
  { id: 'inventory', label: 'Physical Ticket Inventory', icon: 'ph-stack', permission: 'print' },
  { id: 'history', label: 'Sales History', icon: 'ph-receipt', permission: 'sell' },
  { id: 'cashiers', label: 'Cashier Management', icon: 'ph-users-three', roleOnly: 'owner' },
  { id: 'reconcile', label: 'Cash Reconciliation', icon: 'ph-scales', permission: 'shift' },
  { id: 'reports', label: 'Physical Ticket Reports', icon: 'ph-chart-line-up', permission: 'reports' },
];

function readParam(key) {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(key) || '';
}

function writeParams(section, attractionId) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('section', section);
  if (attractionId) params.set('attraction', String(attractionId));
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
}

const ROLE_RANK = { scanner: 1, manager: 2, owner: 3 };

export function sectionAllowed(item, context) {
  if (!context) return false;
  if (item.roleOnly) return ROLE_RANK[context.role] >= ROLE_RANK[item.roleOnly];
  return Boolean(context.permissions?.[item.permission]);
}

// Shell for the physical ticket office. It owns the attraction + visit-date
// context and reloads it after every sale, print, void or shift change so the
// POS and the inventory screens never disagree.
export default function PhysicalSalesWorkspace({ headers, initialSection = '' }) {
  const [attractions, setAttractions] = useState([]);
  const [attractionId, setAttractionId] = useState('');
  const [visitDate, setVisitDate] = useState(todayISO());
  const [section, setSection] = useState(initialSection || readParam('section') || 'pos');
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const loadAttractions = useCallback(async () => {
    setLoading(true);
    const payload = await ownerGet('attractions', {}, headers);
    if (!payload.ok) {
      setError(payload.error || 'Could not load your attractions');
      setLoading(false);
      return;
    }
    const list = payload.attractions || [];
    setAttractions(list);
    setError('');
    const requested = readParam('attraction');
    const match = list.find((item) => String(item.id) === String(requested));
    setAttractionId((current) => {
      if (current) return current;
      if (match) return String(match.id);
      return list.length ? String(list[0].id) : '';
    });
    setLoading(false);
  }, [headers]);

  useEffect(() => { loadAttractions(); }, [loadAttractions]);

  const loadContext = useCallback(async ({ silent = false } = {}) => {
    if (!attractionId) return;
    if (silent) setRefreshing(true);
    const payload = await posGet('context', { attractionId, visitDate }, headers);
    setRefreshing(false);
    if (!payload.ok) {
      setContext(null);
      setError(payload.error || 'Could not open the ticket office');
      return;
    }
    setContext(payload);
    setError('');
  }, [attractionId, visitDate, headers]);

  useEffect(() => { loadContext(); }, [loadContext]);

  useEffect(() => { writeParams(section, attractionId); }, [section, attractionId]);

  const current = useMemo(
    () => attractions.find((item) => String(item.id) === String(attractionId)) || null,
    [attractions, attractionId]
  );

  const visible = useMemo(
    () => SECTIONS.filter((item) => sectionAllowed(item, context)),
    [context]
  );

  // Keep the active tab inside the caller's permissions.
  useEffect(() => {
    if (!context) return;
    if (!visible.some((item) => item.id === section)) {
      setSection(visible.length ? visible[0].id : 'pos');
    }
  }, [context, visible, section]);

  const refresh = useCallback(() => loadContext({ silent: true }), [loadContext]);
  const panelProps = { attractionId, headers, context, refresh, visitDate, setVisitDate, onNavigate: setSection };

  if (loading) return <Loading label="Opening the ticket office…" />;
  if (error && !context) return <ErrorNote message={error} onRetry={() => { loadAttractions(); loadContext(); }} />;
  if (!attractions.length) {
    return (
      <Panel title="Physical ticket sales" icon="ph-cash-register">
        <ImportListingsPrompt
          headers={headers}
          contextLabel="the ticket office"
          onImported={loadAttractions}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i className="ph ph-cash-register text-green-600" /> Physical ticket sales
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Print batches, sell at the gate and reconcile the till — on the same inventory as online sales.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {context && (
              <Badge tone={context.role === 'owner' ? 'violet' : context.role === 'manager' ? 'sky' : 'slate'}>
                {context.role} access
              </Badge>
            )}
            <select
              value={attractionId}
              onChange={(event) => setAttractionId(event.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {attractions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}{item.city ? ` · ${item.city}` : ''}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Visit date
              <input
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value || todayISO())}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
              />
            </label>
            <Button variant="soft" size="sm" icon={refreshing ? 'ph-circle-notch' : 'ph-arrows-clockwise'} onClick={refresh} disabled={refreshing}>
              Refresh
            </Button>
            {context?.role === 'owner' && (
              <Button variant="soft" size="sm" icon="ph-download-simple" onClick={() => setImportOpen(true)}>
                Import listing
              </Button>
            )}
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1.5">
          {visible.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  active
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <i className={`ph ${item.icon}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        {!visible.length && (
          <p className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-400">
            Your account has no ticket-office permissions yet. Ask the owner to grant them in Cashier Management.
          </p>
        )}
      </div>

      {error && <Notice tone="rose" onClose={() => setError('')}>{error}</Notice>}

      {context && context.attraction && !context.settings.posEnabled && (
        <Notice tone="rose">
          Point of sale is switched off for {current?.name || 'this attraction'}. Ticket-office owners can re-enable it in the
          physical ticket settings.
        </Notice>
      )}

      {!context ? (
        <Loading label="Loading ticket office…" />
      ) : (
        <>
          {section === 'pos' && <PosTerminalPanel {...panelProps} />}
          {section === 'create' && <PhysicalBatchCreatePanel {...panelProps} />}
          {section === 'print' && <PhysicalPrintPanel {...panelProps} />}
          {section === 'design' && <TicketDesignPanel {...panelProps} />}
          {section === 'inventory' && <PhysicalInventoryPanel {...panelProps} />}
          {section === 'history' && <PhysicalSalesHistoryPanel {...panelProps} />}
          {section === 'cashiers' && <CashierManagementPanel {...panelProps} />}
          {section === 'reconcile' && <CashReconciliationPanel {...panelProps} />}
          {section === 'reports' && <PhysicalReportsPanel {...panelProps} />}
        </>
      )}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import a saved listing" icon="ph-download-simple" wide>
        <ImportListingsList
          headers={headers}
          contextLabel="the ticket office"
          onImported={loadAttractions}
        />
      </Modal>
    </div>
  );
}
