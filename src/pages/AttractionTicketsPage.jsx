import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { checkoutGet, checkoutPost, money, formatDate, todayISO } from '../lib/ticketingClient.js';

const inputClass =
  'w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

// Public booking page for attraction tickets: pick a date, an entry slot and
// quantities, review the server-calculated total, then pay through Stripe.
export default function AttractionTicketsPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const attractionId = params.get('attractionId') || params.get('attraction') || '';
  const canceled = params.get('canceled') === '1';
  const ref = params.get('ref') || '';

  const [date, setDate] = useState(todayISO());
  const [availability, setAvailability] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [slotId, setSlotId] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState('');
  const [quote, setQuote] = useState(null);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(canceled ? 'Payment was canceled — your seats were released. You can try again below.' : '');
  const [orderRef, setOrderRef] = useState(ref);

  useEffect(() => {
    if (user?.name || user?.email) {
      setContact((current) => ({
        name: current.name || user.name || '',
        email: current.email || user.email || '',
        phone: current.phone || user.phone || '',
      }));
    }
  }, [user]);

  const loadAvailability = useCallback(async () => {
    if (!attractionId) { setLoading(false); return; }
    setLoading(true);
    const payload = await checkoutGet('availability', { attractionId, date });
    if (payload.ok) { setAvailability(payload); setError(''); }
    else setError(payload.error || 'Could not load ticket availability');
    setLoading(false);
  }, [attractionId, date]);

  useEffect(() => { loadAvailability(); }, [loadAvailability]);

  // A returning booking reference restores the visit date for a retry.
  useEffect(() => {
    if (!ref || attractionId) return;
    (async () => {
      const payload = await checkoutGet('order', { ref });
      if (payload.ok && payload.order) {
        setOrderRef(ref);
        setDate(payload.order.visitDate);
      }
    })();
  }, [ref, attractionId]);

  const types = availability?.types || [];
  const activeTypes = useMemo(() => types.filter((type) => type.available), [types]);
  const slots = availability?.slots || [];
  const needsSlot = activeTypes.some((type) => type.slotRequired);
  const currency = availability?.pricing?.currency || 'USD';

  const items = useMemo(
    () => Object.entries(quantities)
      .map(([id, quantity]) => ({ ticketTypeId: Number(id), quantity: Number(quantity) }))
      .filter((item) => item.quantity > 0),
    [quantities]
  );

  const setQuantity = (type, value) => {
    const max = Math.min(
      Number(type.maxPerOrder || 10),
      typeof type.remaining === 'number' ? type.remaining : Number(type.maxPerOrder || 10)
    );
    const next = Math.max(0, Math.min(max, Number(value) || 0));
    setQuantities((current) => ({ ...current, [type.id]: next }));
  };

  // Totals always come from the server; the client only displays them.
  useEffect(() => {
    let active = true;
    if (!items.length || !attractionId) { setQuote(null); return undefined; }
    setQuoting(true);
    const timer = setTimeout(async () => {
      const payload = await checkoutPost('quote', {
        attractionId, visitDate: date, slotId: needsSlot ? slotId : 0, items, promoCode: promoApplied,
      });
      if (!active) return;
      if (payload.ok) { setQuote(payload.quote); setError(''); }
      else { setQuote(null); setError(payload.error || 'This selection is no longer available'); }
      setQuoting(false);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [attractionId, date, items, promoApplied, needsSlot, slotId]);

  const applyPromo = () => {
    if (!promoCode.trim()) { setPromoApplied(''); return; }
    setPromoApplied(promoCode.trim().toUpperCase());
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!items.length) { setError('Choose at least one ticket.'); return; }
    if (contact.name.trim().length < 2) { setError('Enter the lead visitor name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) { setError('Enter a valid email address.'); return; }
    if (needsSlot && !slotId) { setError('Choose an entry time slot.'); return; }

    setSubmitting(true);
    setError('');
    const payload = await checkoutPost('create-order', {
      attractionId,
      visitDate: date,
      slotId: needsSlot ? slotId : 0,
      items,
      promoCode: promoApplied,
      customerName: contact.name.trim(),
      customerEmail: contact.email.trim(),
      customerPhone: contact.phone.trim(),
    });
    setSubmitting(false);

    if (!payload.ok) { setError(payload.error || 'Could not start the payment'); return; }
    setOrderRef(payload.bookingRef);
    if (payload.payment?.url) { window.location.href = payload.payment.url; return; }
    setError('The payment page could not be opened. Please try again.');
  };

  if (!attractionId && !ref) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">No attraction selected</h1>
        <p className="mt-2 text-sm text-slate-500">Open the attraction you want to visit and choose “Book tickets”.</p>
        <Link to="/attractions/results" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white">
          <i className="ph ph-map-trifold" /> Browse attractions
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <Link to="/attractions/results" className="text-xs font-black uppercase tracking-wide text-slate-500 hover:text-green-600">
          <i className="ph ph-arrow-left inline mr-1" /> All attractions
        </Link>

        <header className="mt-4 overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          {availability?.attraction?.image && (
            <div className="h-40 sm:h-52 w-full overflow-hidden">
              <img src={availability.attraction.image} alt={availability.attraction.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-5 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              {availability?.attraction?.name || 'Attraction tickets'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {[availability?.attraction?.city, availability?.attraction?.country].filter(Boolean).join(', ')}
            </p>
            {availability?.salesPaused && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                <i className="ph ph-pause-circle" /> Ticket sales are paused right now.
              </p>
            )}
            {orderRef && (
              <p className="mt-3 text-xs font-bold text-slate-500">
                Booking reference <span className="font-mono text-slate-900 dark:text-white">{orderRef}</span>
              </p>
            )}
          </div>
        </header>

        {notice && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30 p-4 text-sm font-semibold text-sky-800 dark:text-sky-300">
            <i className="ph ph-info text-lg mt-0.5" />
            <p className="flex-1">{notice}</p>
            <button type="button" onClick={() => setNotice('')}><i className="ph ph-x" /></button>
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-4 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <i className="ph ph-warning-circle text-lg mt-0.5" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">1 · Choose a visit date</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Visit date">
                  <input
                    type="date"
                    className={`${inputClass} w-[190px]`}
                    value={date}
                    min={availability?.today || todayISO()}
                    max={availability?.maxDate || undefined}
                    onChange={(event) => { setDate(event.target.value); setSlotId(0); setQuantities({}); }}
                  />
                </Field>
                <p className="text-xs font-semibold text-slate-500">
                  {availability?.closed ? 'No tickets are on sale for this date.' : `${formatDate(date)} · ${activeTypes.length} ticket type(s) available`}
                </p>
              </div>
            </section>

            {slots.length > 0 && (
              <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  2 · Entry time {needsSlot ? '(required)' : '(optional)'}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!needsSlot && (
                    <button
                      type="button"
                      onClick={() => setSlotId(0)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold ${slotId === 0 ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      Any time
                    </button>
                  )}
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={slot.soldOut}
                      onClick={() => setSlotId(slot.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40 ${
                        slotId === slot.id ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {slot.label || slot.startTime}
                      {slot.startTime ? ` · ${slot.startTime}` : ''}
                      {typeof slot.remaining === 'number' ? ` · ${slot.remaining} left` : ''}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Choose your tickets</h2>
              {loading ? (
                <div className="py-10 text-center text-sm font-bold text-slate-500">Loading tickets…</div>
              ) : !types.length ? (
                <div className="py-10 text-center">
                  <p className="font-black text-slate-900 dark:text-white">No ticket types on sale</p>
                  <p className="mt-1 text-sm text-slate-500">The owner has not published tickets yet. Please check back later.</p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {types.map((type) => {
                    const selected = Number(quantities[type.id] || 0);
                    const max = Math.min(
                      Number(type.maxPerOrder || 10),
                      typeof type.remaining === 'number' ? type.remaining : Number(type.maxPerOrder || 10)
                    );
                    return (
                      <div key={type.id} className={`rounded-2xl border p-4 ${type.available ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-60'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 dark:text-white">{type.name}</p>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              {type.admissions} admission(s)
                              {type.minAge !== null || type.maxAge !== null ? ` · ages ${type.minAge ?? 0}–${type.maxAge ?? '∞'}` : ''}
                              {type.refundPolicy ? ` · ${String(type.refundPolicy).replace(/_/g, ' ')}` : ''}
                            </p>
                            {type.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{type.description}</p>}
                            {type.closed && <p className="mt-1 text-[11px] font-bold text-rose-600">Not on sale for this date</p>}
                            {type.soldOut && <p className="mt-1 text-[11px] font-bold text-amber-600">Sold out</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-green-600">{money(type.price, type.currency || currency)}</p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <button type="button" onClick={() => setQuantity(type, selected - 1)} disabled={!type.available || selected <= 0}
                                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 font-black disabled:opacity-40">−</button>
                              <span className="w-8 text-center font-black">{selected}</span>
                              <button type="button" onClick={() => setQuantity(type, selected + 1)} disabled={!type.available || selected >= max}
                                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 font-black disabled:opacity-40">+</button>
                            </div>
                            <p className="mt-1 text-[10px] font-bold text-slate-400">
                              {typeof type.remaining === 'number' ? `${type.remaining} left` : 'Available'} · max {type.maxPerOrder}/order
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <form onSubmit={submit} className="lg:sticky lg:top-6 h-fit rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Order summary</h2>

            <div className="space-y-1.5 text-sm">
              {(quote?.lines || []).map((line) => (
                <div key={line.ticketTypeId} className="flex justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-300">{line.quantity} × {line.name}</span>
                  <span className="font-bold">{money(line.lineTotal, quote.currency)}</span>
                </div>
              ))}
              {!items.length && <p className="text-xs font-semibold text-slate-400">Select tickets to see the total.</p>}
            </div>

            <div className="flex gap-2">
              <input className={`${inputClass} font-mono uppercase`} placeholder="Promo code" value={promoCode}
                onChange={(event) => setPromoCode(event.target.value.toUpperCase())} />
              <button type="button" onClick={applyPromo}
                className="shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-black text-white dark:bg-slate-700">Apply</button>
            </div>

            {quote && (
              <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3 text-sm">
                <Row label="Subtotal" value={money(quote.subtotal, quote.currency)} />
                {quote.discount > 0 && <Row label={`Discount${quote.promoCode ? ` (${quote.promoCode})` : ''}`} value={`− ${money(quote.discount, quote.currency)}`} />}
                <Row label={`Taxes (${availability?.pricing?.taxPercent ?? 0}%)`} value={money(quote.taxAmount, quote.currency)} />
                <Row label={`Service fee (${availability?.pricing?.serviceFeePercent ?? 0}%)`} value={money(quote.serviceFee, quote.currency)} />
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-base font-black">
                  <span>Total</span>
                  <span>{money(quote.total, quote.currency)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <Field label="Lead visitor name">
                <input className={inputClass} value={contact.name}
                  onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Email" hint="Tickets and the confirmation are sent here.">
                <input type="email" className={inputClass} value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} />
              </Field>
              <Field label="Phone" hint="Optional">
                <input className={inputClass} value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} />
              </Field>
            </div>

            <button
              type="submit"
              disabled={submitting || quoting || !items.length}
              className="w-full rounded-xl bg-green-600 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {submitting ? 'Opening secure payment…' : quoting ? 'Checking availability…' : 'Continue to payment'}
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Prices, taxes and availability are calculated on the server. Card details never touch BookingCart.
            </p>
            {availability?.pricing?.terms && (
              <p className="text-[11px] text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-2">{availability.pricing.terms}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
