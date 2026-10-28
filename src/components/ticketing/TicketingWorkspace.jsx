import { useCallback, useEffect, useMemo, useState } from 'react';
import { ownerGet } from '../../lib/ticketingClient.js';
import { Badge, Button, ErrorNote, Loading, Modal, Panel } from './TicketingShared.jsx';
import ImportListingsPrompt, { ImportListingsList } from './ImportListingsPrompt.jsx';
import TicketingOverviewPanel from './TicketingOverviewPanel.jsx';
import TicketTypesPanel from './TicketTypesPanel.jsx';
import TicketSalesPanel from './TicketSalesPanel.jsx';
import TicketInventoryPanel from './TicketInventoryPanel.jsx';
import TicketValidationDesk from './TicketValidationDesk.jsx';
import TicketReportsPanel from './TicketReportsPanel.jsx';
import TicketSettingsPanel from './TicketSettingsPanel.jsx';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'ph-chart-pie-slice' },
  { id: 'types', label: 'Ticket Types & Pricing', icon: 'ph-ticket' },
  { id: 'sales', label: 'Sales & Bookings', icon: 'ph-receipt' },
  { id: 'inventory', label: 'Inventory', icon: 'ph-stack' },
  { id: 'validation', label: 'QR Validation', icon: 'ph-qr-code' },
  { id: 'reports', label: 'Reports', icon: 'ph-chart-line-up' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
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
  else params.delete('attraction');
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
}

// Shell for the ticketing console that lives inside the attraction dashboard.
// Each section is a standalone panel so they can also be deep-linked from
// notifications (`?section=sales`).
export default function TicketingWorkspace({ headers, initialSection = '' }) {
  const [attractions, setAttractions] = useState([]);
  const [attractionId, setAttractionId] = useState('');
  const [section, setSection] = useState(initialSection || readParam('section') || 'overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
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

  useEffect(() => { load(); }, [load]);

  useEffect(() => { writeParams(section, attractionId); }, [section, attractionId]);

  const current = useMemo(
    () => attractions.find((item) => String(item.id) === String(attractionId)) || null,
    [attractions, attractionId]
  );
  const role = current?.role || 'scanner';
  const currency = current?.currency || 'USD';

  if (loading) return <Loading label="Opening the ticketing console…" />;
  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!attractions.length) {
    return (
      <Panel title="Ticketing management" icon="ph-ticket">
        <ImportListingsPrompt
          headers={headers}
          contextLabel="ticketing"
          onImported={load}
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
              <i className="ph ph-ticket text-green-600" /> Ticketing management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Publish ticket types, control inventory, validate entry and reconcile every sale.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={role === 'owner' ? 'violet' : role === 'manager' ? 'sky' : 'slate'}>{role} access</Badge>
            <select
              value={attractionId}
              onChange={(event) => setAttractionId(event.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {attractions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}{item.city ? ` · ${item.city}` : ''}</option>
              ))}
            </select>
            <Button variant="soft" size="sm" icon="ph-arrows-clockwise" onClick={load}>Refresh</Button>
            {role === 'owner' && (
              <Button variant="soft" size="sm" icon="ph-download-simple" onClick={() => setImportOpen(true)}>
                Import listing
              </Button>
            )}
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1.5">
          {SECTIONS.map((item) => {
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
      </div>

      {!attractionId ? null : (
        <>
          {section === 'overview' && (
            <TicketingOverviewPanel attractionId={attractionId} headers={headers} onNavigate={setSection} />
          )}
          {section === 'types' && (
            <TicketTypesPanel
              attractionId={attractionId}
              headers={headers}
              currency={currency}
              canManage={role === 'manager' || role === 'owner'}
            />
          )}
          {section === 'sales' && (
            <TicketSalesPanel attractionId={attractionId} headers={headers} currency={currency} role={role} />
          )}
          {section === 'inventory' && (
            <TicketInventoryPanel
              attractionId={attractionId}
              headers={headers}
              currency={currency}
              onNavigate={setSection}
            />
          )}
          {section === 'validation' && <TicketValidationDesk attractionId={attractionId} headers={headers} />}
          {section === 'reports' && (
            <TicketReportsPanel
              attractionId={attractionId}
              headers={headers}
              currency={currency}
              canExport={role === 'manager' || role === 'owner'}
            />
          )}
          {section === 'settings' && (
            <TicketSettingsPanel attractionId={attractionId} headers={headers} role={role} />
          )}
        </>
      )}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import a saved listing" icon="ph-download-simple" wide>
        <ImportListingsList headers={headers} contextLabel="ticketing" onImported={load} />
      </Modal>
    </div>
  );
}
