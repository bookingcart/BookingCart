import { useCallback, useEffect, useMemo, useState } from 'react';
import { posGet, posPost } from '../../lib/ticketingClient.js';
import { Button, ErrorNote, Field, Notice, Panel, inputClass } from '../ticketing/TicketingShared.jsx';
import { buildQrMap, buildTicketSheetHtml } from '../ticketing/PhysicalPrint.jsx';
import ArtworkUpload from '../ticketing/ArtworkUpload.jsx';

// Platform ticket artwork: the "Company Art work" panel that is stamped onto
// every ticket printed by any attraction. It is edited once here, not per
// client, so a change applies to the next ticket printed everywhere.

const EMPTY = {
  companyName: 'BookingCart',
  companyTagline: 'Compare. Book. Instant.',
  companyWebsite: 'www.bookingcart.online',
  artworkUrl: '',
  artworkFit: 'cover',
};

// A stand-in ticket so the artwork can be judged in place before saving.
const SAMPLE_TICKET = {
  ticketNo: 'BC-SAMPLE-0001',
  type: 'Ordinary',
  admissions: 1,
  visitDate: new Date().toISOString().slice(0, 10),
  slotLabel: '09:00',
  unitPrice: 20000,
  currency: 'UGX',
  reference: 'POS-SAMPLE',
};

const SAMPLE_ATTRACTION = {
  name: 'Sample attraction',
  city: 'Kampala',
  contact: '+256 700 000 000',
  artworkUrl: '',
  artworkFit: 'cover',
};

export default function TicketArtworkAdminPanel({ getToken }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrMap, setQrMap] = useState({});
  const [meta, setMeta] = useState(null);

  const headers = useMemo(() => {
    const token = getToken ? getToken() : '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await posGet('branding', {}, headers);
    setLoading(false);
    if (!payload.ok) { setError(payload.error || 'Could not load the ticket artwork'); return; }
    setForm({ ...EMPTY, ...payload.branding });
    setMeta(payload.branding);
    setError('');
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    buildQrMap([SAMPLE_TICKET]).then(setQrMap);
  }, []);

  const preview = useMemo(() => buildTicketSheetHtml({
    tickets: [SAMPLE_TICKET],
    attraction: SAMPLE_ATTRACTION,
    company: {
      companyName: form.companyName,
      companyTagline: form.companyTagline,
      companyWebsite: form.companyWebsite,
      artworkUrl: form.artworkUrl,
      artworkFit: form.artworkFit,
    },
    layout: 'a4_1',
    paperSize: 'A4',
    qrMap,
    title: 'Ticket artwork preview',
    preview: true,
  }), [form, qrMap]);

  const save = async () => {
    setBusy('save');
    const payload = await posPost('save-branding', form, headers);
    setBusy('');
    if (!payload.ok) { setError(payload.error || 'Could not save the ticket artwork'); return; }
    setForm({ ...EMPTY, ...payload.branding });
    setMeta(payload.branding);
    setNotice('Saved. Every ticket printed from now on carries this artwork.');
    setError('');
  };

  const revert = () => {
    if (!meta) return;
    setForm({ ...EMPTY, ...meta });
    setNotice('');
  };

  const dirty = meta && (
    form.companyName !== meta.companyName
    || form.companyTagline !== meta.companyTagline
    || form.companyWebsite !== meta.companyWebsite
    || form.artworkUrl !== meta.artworkUrl
    || form.artworkFit !== meta.artworkFit
  );

  return (
    <div className="space-y-5">
      <Panel
        title="Company artwork"
        icon="ph-palette"
        subtitle="This panel is printed on every ticket issued through BookingCart, above each client's own artwork space. Upload it once here."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <Button size="sm" variant="ghost" onClick={revert}>Discard</Button>}
            <Button icon={busy === 'save' ? 'ph-circle-notch' : 'ph-floppy-disk'} onClick={save} disabled={loading || busy !== ''}>
              {busy === 'save' ? 'Saving…' : 'Save artwork'}
            </Button>
          </div>
        )}
      >
        <ErrorNote message={error} onRetry={load} />
        <Notice onClose={() => setNotice('')}>{notice}</Notice>

        {loading ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">Loading artwork…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <Field
                label="Company artwork"
                hint="Printed in the green panel of every ticket. Landscape works best; PNG or JPEG up to 20 MB."
              >
                <ArtworkUpload
                  value={form.artworkUrl}
                  onChange={(url) => setForm((current) => ({ ...current, artworkUrl: url }))}
                  fit={form.artworkFit}
                  onFitChange={(fit) => setForm((current) => ({ ...current, artworkFit: fit }))}
                  headers={headers}
                  emptyLabel="No company artwork"
                  previewHeight="h-44"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Company name">
                  <input
                    value={form.companyName}
                    onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                    className={inputClass}
                    placeholder="BookingCart"
                  />
                </Field>
                <Field label="Website">
                  <input
                    value={form.companyWebsite}
                    onChange={(event) => setForm((current) => ({ ...current, companyWebsite: event.target.value }))}
                    className={inputClass}
                    placeholder="www.bookingcart.online"
                  />
                </Field>
                <Field label="Tagline" className="sm:col-span-2" hint="Sits under the company name, e.g. Compare. Book. Instant.">
                  <input
                    value={form.companyTagline}
                    onChange={(event) => setForm((current) => ({ ...current, companyTagline: event.target.value }))}
                    className={inputClass}
                    placeholder="Compare. Book. Instant."
                  />
                </Field>
              </div>
              <p className="text-[11px] font-semibold text-slate-400">
                {meta?.updatedBy
                  ? `Last changed by ${meta.updatedBy}${meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString()}` : ''}`
                  : 'Artwork has not been changed since setup.'}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">Every ticket will look like this</p>
              <iframe
                title="Ticket artwork preview"
                srcDoc={preview}
                className="w-full h-[420px] bg-white rounded-2xl border border-slate-200 dark:border-slate-700"
              />
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                The grey panel is the client's own artwork space — each attraction uploads its own from the ticket design settings.
              </p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
