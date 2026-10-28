import { useEffect, useMemo, useState } from 'react';
import { posPost } from '../../lib/ticketingClient.js';
import { Button, ErrorNote, Field, Loading, Notice, Panel, inputClass } from './TicketingShared.jsx';
import { LAYOUTS, PAPER_SIZES, buildQrMap, buildTicketSheetHtml } from './PhysicalPrint.jsx';
import ArtworkUpload from './ArtworkUpload.jsx';

// The attraction's own ticket design. The centrepiece is the artwork upload for
// the large "client" panel that prints beside BookingCart's fixed company panel,
// so a preview of a real ticket sits next to it — the artwork is only obvious
// once you can see where it lands.

const SAMPLE_TICKET_NO = 'BC-SAMPLE-0001';

function fromContext(context) {
  const settings = context?.settings || {};
  return {
    posEnabled: settings.posEnabled !== false,
    printLayout: settings.printLayout || 'a4_4',
    paperSize: settings.paperSize || 'A4',
    ticketLogoUrl: settings.ticketLogoUrl || '',
    ticketContact: settings.ticketContact || '',
    ticketTerms: settings.ticketTerms || '',
    receiptHeader: settings.receiptHeader || '',
    receiptFooter: settings.receiptFooter || '',
    ticketArtworkUrl: settings.ticketArtworkUrl || '',
    ticketArtworkFit: settings.ticketArtworkFit || 'cover',
  };
}

export default function TicketDesignPanel({ attractionId, headers, context, refresh }) {
  const [settings, setSettings] = useState(() => (context?.settings ? fromContext(context) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrMap, setQrMap] = useState({});

  // Reload the form when the attraction changes, but never while the owner is
  // mid-edit: the context also refreshes after every sale.
  useEffect(() => {
    if (context?.settings) setSettings((current) => current || fromContext(context));
  }, [context]);

  const sample = useMemo(() => {
    const type = (context?.types || [])[0] || {};
    return {
      ticketNo: SAMPLE_TICKET_NO,
      type: type.name || 'Ordinary',
      admissions: Number(type.admissions || 1),
      visitDate: context?.visitDate || '',
      unitPrice: Number(type.price || 0) || 20000,
      currency: type.currency || context?.attraction?.currency || 'USD',
      reference: 'SAMPLE',
    };
  }, [context]);

  useEffect(() => { buildQrMap([sample]).then(setQrMap); }, [sample]);

  // Built from the unsaved form so an upload shows up in the preview instantly.
  const preview = useMemo(() => {
    if (!settings) return '';
    return buildTicketSheetHtml({
      tickets: [sample],
      attraction: {
        name: context?.attraction?.name || 'Your attraction',
        city: context?.attraction?.city || '',
        contact: settings.ticketContact,
        logoUrl: settings.ticketLogoUrl,
        artworkUrl: settings.ticketArtworkUrl,
        artworkFit: settings.ticketArtworkFit,
      },
      company: context?.company || {},
      layout: 'a4_1',
      paperSize: settings.paperSize || 'A4',
      terms: settings.ticketTerms,
      qrMap,
      title: 'Ticket design preview',
      preview: true,
    });
  }, [settings, sample, context, qrMap]);

  const save = async () => {
    setSaving(true);
    const payload = await posPost('save-settings', { attractionId, ...settings }, headers);
    setSaving(false);
    if (!payload.ok) { setError(payload.error || 'Could not save the ticket design'); return; }
    if (payload.settings) setSettings((current) => ({ ...current, ...payload.settings }));
    setError('');
    setNotice('Ticket design and receipt settings saved.');
    refresh();
  };

  const patch = (values) => setSettings((current) => ({ ...current, ...values }));

  if (!settings) return <Loading label="Loading the ticket design…" />;

  return (
    <Panel
      title="Ticket design & receipt"
      icon="ph-palette"
      subtitle="Your artwork and ticket wording. Every ticket also carries BookingCart's green company panel, which is set by the platform."
      actions={<Button icon="ph-floppy-disk" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save design'}</Button>}
    >
      <ErrorNote message={error} />
      <Notice onClose={() => setNotice('')}>{notice}</Notice>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Your artwork space"
            hint="Upload the artwork clients see in the large right-hand panel of every ticket. A landscape image (roughly 3:2) fits best."
            className="sm:col-span-2"
          >
            <ArtworkUpload
              value={settings.ticketArtworkUrl}
              onChange={(url) => patch({ ticketArtworkUrl: url })}
              fit={settings.ticketArtworkFit}
              onFitChange={(fit) => patch({ ticketArtworkFit: fit })}
              headers={headers}
              emptyLabel="Clients art work space"
              hint="PNG, JPEG or WebP up to 20 MB."
            />
          </Field>
          <Field label="Attraction logo URL" hint="Printed next to the venue name on each ticket.">
            <input value={settings.ticketLogoUrl} onChange={(event) => patch({ ticketLogoUrl: event.target.value })}
              className={inputClass} placeholder="https://…/logo.png" />
          </Field>
          <Field label="Contact details">
            <input value={settings.ticketContact} onChange={(event) => patch({ ticketContact: event.target.value })}
              className={inputClass} placeholder="+256 … · gate@attraction.com" />
          </Field>
          <Field label="Ticket design">
            <select value={settings.printLayout} onChange={(event) => patch({ printLayout: event.target.value })} className={inputClass}>
              {Object.entries(LAYOUTS).map(([key, layout]) => (
                <option key={key} value={key}>{layout.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Paper size">
            <select value={settings.paperSize} onChange={(event) => patch({ paperSize: event.target.value })} className={inputClass}>
              {PAPER_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </Field>
          <Field label="Terms and conditions" className="sm:col-span-2">
            <textarea rows={3} value={settings.ticketTerms} onChange={(event) => patch({ ticketTerms: event.target.value })}
              className={inputClass} placeholder="Valid for the dated entry only. Non-transferable." />
          </Field>
          <Field label="Receipt header">
            <input value={settings.receiptHeader} onChange={(event) => patch({ receiptHeader: event.target.value })}
              className={inputClass} placeholder="Ticket office · Gate 1" />
          </Field>
          <Field label="Receipt footer">
            <input value={settings.receiptFooter} onChange={(event) => patch({ receiptFooter: event.target.value })}
              className={inputClass} placeholder="Thank you for visiting." />
          </Field>
          <label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={settings.posEnabled}
              onChange={(event) => patch({ posEnabled: event.target.checked })} className="mt-0.5" />
            Point of sale enabled for this attraction
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Every ticket will look like this</p>
          <iframe
            title="Ticket design preview"
            srcDoc={preview}
            className="mt-2 w-full h-[360px] bg-white rounded-xl border border-slate-200 dark:border-slate-700"
          />
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            Your artwork is the large panel on the right. The QR stub and the green BookingCart panel are fixed.
          </p>
        </div>
      </div>
    </Panel>
  );
}
