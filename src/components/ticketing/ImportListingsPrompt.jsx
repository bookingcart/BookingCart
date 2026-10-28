import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, ErrorNote, Loading, Notice, StatusBadge } from './TicketingShared.jsx';

// Shown instead of a bare "no attractions" message. Listings made with the
// "List your event or attraction" wizard live in a different table from the one
// the ticket office reads, so an owner who has already typed everything in is
// told nothing and sees an empty screen. This explains which account is signed
// in, lists the drafts it found, and imports one in a single click.

async function fetchListings(headers) {
  let response;
  try {
    response = await fetch('/api/attraction-profiles?action=event-listings', { headers });
  } catch {
    return { ok: false, error: 'Could not reach the server — check your connection and retry' };
  }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || `Could not load your listings (${response.status})` };
  }
  return data;
}

// `variant="inline"` drops the big heading so the same list can live in a modal
// once at least one attraction exists and the empty state is gone.
export function ImportListingsList(props) {
  return <ImportListingsPrompt {...props} variant="inline" />;
}

export default function ImportListingsPrompt({ headers, onImported, contextLabel = 'ticketing', variant = 'empty' }) {
  const navigate = useNavigate();
  const inline = variant === 'inline';
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [signedInAs, setSignedInAs] = useState('');
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState(0);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await fetchListings(headers);
    setLoading(false);
    if (!payload.ok) {
      setError(payload.error);
      return;
    }
    setError('');
    setSignedInAs(payload.signedInAs || '');
    setListings(payload.listings || []);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  async function importListing(listing) {
    setImportingId(listing.id);
    setError('');
    setNotice('');
    let response;
    try {
      response = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'import-event', eventId: listing.id }),
      });
    } catch {
      setImportingId(0);
      setError('Could not reach the server — check your connection and retry');
      return;
    }
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    setImportingId(0);

    if (!response.ok || !data.ok) {
      setError(data.error || 'That listing could not be imported');
      return;
    }

    setNotice(
      `${data.attraction?.name || listing.name} is now in ${contextLabel}` +
      ` with ${data.ticketTypes?.length || 0} ticket option${(data.ticketTypes?.length || 0) === 1 ? '' : 's'}.`
    );
    await load();
    if (onImported) onImported();
  }

  return (
    <div className={inline ? '' : 'text-center py-10 px-2'}>
      {!inline && (
        <>
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center text-2xl">
            <i className="ph ph-link-simple-horizontal" />
          </div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Your listings are saved under a different form</h3>
        </>
      )}
      <p className={`${inline ? '' : 'mt-1.5'} text-sm text-slate-500 dark:text-slate-400 max-w-lg ${inline ? '' : 'mx-auto'}`}>
        Anything you created with “List your event or attraction” has to be imported once before
        ticket types, inventory and the till can attach to it. Nothing is lost — importing copies the
        details and ticket prices across.
      </p>
      {signedInAs && (
        <p className={`${inline ? 'mt-1.5' : 'mt-2'} text-[11px] font-semibold text-slate-400`}>
          Signed in as <span className="font-black text-slate-500 dark:text-slate-300">{signedInAs}</span> — listings are matched on this address.
        </p>
      )}

      <div className={`${inline ? 'mt-3' : 'mt-5 max-w-2xl mx-auto'} text-left space-y-3`}>
        <ErrorNote message={error} onRetry={load} />
        <Notice tone="emerald" onClose={() => setNotice('')}>{notice}</Notice>

        {loading && <Loading label="Looking for your listings…" />}

        {!loading && !error && listings.length === 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 text-center">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              No saved listings were found on this account.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              If you listed with a different email, sign in with that email. Otherwise create a listing now.
            </p>
            <Button className="mt-4" icon="ph-plus" onClick={() => navigate('/list-your-event')}>
              List an event or attraction
            </Button>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <>
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Found {listings.length} listing{listings.length === 1 ? '' : 's'} on this account
            </p>
            {listings.map((listing) => {
              const busy = importingId === listing.id;
              const imported = Boolean(listing.importedAttractionId);
              const place = [listing.city, listing.country].filter(Boolean).join(', ');
              return (
                <div
                  key={listing.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-black text-slate-900 dark:text-white">{listing.name}</p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {[listing.eventType, place].filter(Boolean).join(' · ') || 'No location given'}
                      {' · '}
                      {listing.ticketCount || 0} ticket option{listing.ticketCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <StatusBadge status={listing.status} />
                  {imported ? (
                    <Badge tone="emerald">In {contextLabel}</Badge>
                  ) : (
                    <Button size="sm" icon="ph-download-simple" disabled={busy} onClick={() => importListing(listing)}>
                      {busy ? 'Importing…' : 'Import & enable ticketing'}
                    </Button>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-slate-400 text-center pt-1">
              Imported listings start as <span className="font-bold">pending</span> review — you can still price,
              print and sell tickets for them straight away.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
