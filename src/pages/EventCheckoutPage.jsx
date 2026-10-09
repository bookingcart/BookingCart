import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function EventCheckoutPage() {
  const { eventId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [event, setEvent] = useState(location.state?.event || null);
  const [loading, setLoading] = useState(!event);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState(location.state?.ticketId || location.state?.event?.ticketOptions?.[0]?.id || '');
  const [quantity, setQuantity] = useState(location.state?.quantity || 1);
  const [guest, setGuest] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [paymentMethod, setPaymentMethod] = useState('card');

  // Keep guest details updated when user object finishes loading
  useEffect(() => {
    if (user?.email) {
      setGuest((curr) => ({
        name: curr.name || user.name || '',
        email: curr.email || user.email || '',
        phone: curr.phone || user.phone || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    document.title = 'Event Checkout | BookingCart';
  }, []);

  useEffect(() => {
    if (event) return;
    const controller = new AbortController();
    fetch(`/api/attractions/local_event/${encodeURIComponent(eventId)}`, { signal: controller.signal })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || 'Event unavailable');
        setEvent(data.attraction);
        setTicketId(data.attraction.ticketOptions?.[0]?.id || '');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [event, eventId]);

  const ticket = useMemo(() => event?.ticketOptions?.find((option) => option.id === ticketId), [event, ticketId]);
  const unitPrice = ticket?.price || 0;
  const total = unitPrice * quantity;
  const currency = ticket?.currency || 'USD';

  const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);

  async function submit(eventSubmit) {
    eventSubmit.preventDefault();
    setError('');

    if (!user && !isAuthenticated) {
      setError('You must be signed in to purchase tickets. Redirecting to sign in…');
      setTimeout(() => {
        navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      }, 1200);
      return;
    }

    if (!guest.name.trim() || !guest.email.trim()) {
      setError('Please provide your full name and valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Check if Stripe checkout is selected & available
      if (paymentMethod === 'card') {
        try {
          const stripeRes = await fetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountCents: Math.round(total * 100),
              currency: currency.toLowerCase(),
              description: `Tickets for ${event?.name || 'Event'} (${quantity}x ${ticket?.name || 'Admission'})`,
              bookingRef: `EVT-${Date.now()}`,
              customerEmail: guest.email,
              paymentPurpose: 'event-ticket',
              successPath: `/event-confirmation`,
              cancelPath: `/events/${eventId}/checkout`,
            }),
          });
          const stripeData = await stripeRes.json();
          if (stripeData.ok && stripeData.url) {
            // Also reserve booking
            await fetch('/api/event-bookings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventId,
                ticketId,
                quantity,
                guestName: guest.name,
                guestEmail: guest.email,
                guestPhone: guest.phone,
                paymentMethod: 'stripe',
                autoConfirm: true,
              }),
            });
            window.location.href = stripeData.url;
            return;
          }
        } catch {
          // Fall through to direct booking if Stripe session creation is unconfigured
        }
      }

      // 2. Direct confirmation booking (Instant / Mobile Money / Express Card fallback)
      const response = await fetch('/api/event-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ticketId,
          quantity,
          guestName: guest.name,
          guestEmail: guest.email,
          guestPhone: guest.phone,
          paymentMethod,
          autoConfirm: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to issue tickets');
      navigate(`/event-confirmation?ref=${encodeURIComponent(data.booking.bookingRef)}`, { state: { booking: data.booking } });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center pt-24 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-semibold text-sm">Preparing ticket options…</p>
        </div>
      </main>
    );
  }

  if (!event || !event.ticketOptions?.length) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 pt-32 text-center text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <i className="ph ph-warning text-5xl text-amber-400 mb-3 block" />
          <h1 className="text-2xl font-black">Tickets Unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error || 'This event currently has no open ticket options.'}</p>
          <Link to="/events" className="mt-6 inline-block font-bold text-emerald-400 hover:underline">
            ← Browse Other Events
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-24 pt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Top Back Nav & Title */}
        <div className="flex items-center justify-between py-4">
          <Link to={`/events/${eventId}`} state={{ event }} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-emerald-400 transition-colors">
            <i className="ph ph-arrow-left" /> Back to Event
          </Link>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Secure Checkout
          </span>
        </div>

        {/* Stepper Progress Bar */}
        <div className="my-6 grid grid-cols-3 gap-2 border-b border-slate-800 pb-6 text-center text-xs font-bold">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black">1</span>
            <span>Select Ticket</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black">2</span>
            <span>Guest & Payment</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-black">3</span>
            <span>E-Ticket</span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Checkout Form */}
          <form onSubmit={submit} className="space-y-6">
            {!isAuthenticated && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                    <i className="ph ph-lock-key" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Sign In Required</h3>
                    <p className="text-xs text-slate-300">You must be logged in to complete ticket bookings and view your issued tickets in My Bookings.</p>
                  </div>
                </div>
                <Link
                  to={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shrink-0 transition-colors text-center"
                >
                  Sign In / Register
                </Link>
              </div>
            )}

            {/* Step 1: Ticket Options */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-ticket text-emerald-400 text-2xl" /> Choose Ticket Type
                </h2>
                <span className="text-xs font-bold text-slate-400">Select standard admission</span>
              </div>

              <div className="space-y-3">
                {event.ticketOptions.map((option) => {
                  const isSelected = ticketId === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-5 transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-950/40'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="ticket"
                          value={option.id}
                          checked={isSelected}
                          onChange={() => setTicketId(option.id)}
                          className="mt-1 accent-emerald-500 h-4 w-4"
                        />
                        <div>
                          <span className="block font-extrabold text-white text-base">{option.name}</span>
                          <span className="mt-1 block text-xs text-slate-400">{option.description || option.type}</span>
                        </div>
                      </div>
                      <span className="text-lg font-black text-emerald-400 shrink-0">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: option.currency || currency }).format(option.price)}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Quantity */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <label htmlFor="event-quantity" className="block text-sm font-bold text-slate-200">
                    Number of Guests / Tickets
                  </label>
                  <p className="text-xs text-slate-400">Max 10 tickets per order</p>
                </div>
                <select
                  id="event-quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="h-11 w-28 rounded-xl border border-slate-800 bg-slate-950 px-3 font-bold text-white focus:border-emerald-500 outline-none text-center"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                    <option key={val} value={val}>
                      {val} {val === 1 ? 'ticket' : 'tickets'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 2: Guest Details */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-user text-emerald-400 text-2xl" /> Ticket Holder Details
                </h2>
                <p className="text-xs text-slate-400 mt-1">Your e-ticket and QR pass will be sent to this email address.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Full Name *
                  <input
                    required
                    value={guest.name}
                    onChange={(e) => setGuest((curr) => ({ ...curr, name: e.target.value }))}
                    placeholder="e.g. Sarah Jenkins"
                    className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-normal text-white focus:border-emerald-500 outline-none"
                  />
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Email Address *
                  <input
                    required
                    type="email"
                    value={guest.email}
                    onChange={(e) => setGuest((curr) => ({ ...curr, email: e.target.value }))}
                    placeholder="sarah@example.com"
                    className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-normal text-white focus:border-emerald-500 outline-none"
                  />
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 sm:col-span-2">
                  Phone Number <span className="font-normal text-slate-500">(Optional for SMS alerts)</span>
                  <input
                    type="tel"
                    value={guest.phone}
                    onChange={(e) => setGuest((curr) => ({ ...curr, phone: e.target.value }))}
                    placeholder="+256 700 000 000"
                    className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-normal text-white focus:border-emerald-500 outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Step 3: Payment Method Selection */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <i className="ph ph-credit-card text-emerald-400 text-2xl" /> Payment Method
                </h2>
                <p className="text-xs text-slate-400 mt-1">Select how you want to complete your ticket purchase.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { id: 'card', name: 'Credit / Debit Card', icon: 'ph-credit-card', desc: 'Stripe Gateway' },
                  { id: 'mobile_money', name: 'Mobile Money', icon: 'ph-device-mobile', desc: 'MTN / Airtel Pay' },
                  { id: 'instant', name: 'Instant Express', icon: 'ph-lightning', desc: 'Direct E-Ticket' },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                      paymentMethod === pm.id
                        ? 'bg-emerald-950/50 border-emerald-500 shadow-md shadow-emerald-950'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <i className={`ph ${pm.icon} text-2xl ${paymentMethod === pm.id ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div>
                      <span className="block font-bold text-sm text-white">{pm.name}</span>
                      <span className="block text-xs text-slate-400">{pm.desc}</span>
                    </div>
                  </button>
                ))}
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm font-semibold text-rose-400 flex items-center gap-2">
                  <i className="ph ph-warning text-lg shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                disabled={submitting || !ticketId}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-lg rounded-xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
              >
                {submitting ? (
                  <>
                    <i className="ph ph-spinner-gap animate-spin text-xl" /> Processing Ticket Order…
                  </>
                ) : (
                  <>
                    <i className="ph ph-lock-key text-xl" /> Pay {money(total)} & Issue Tickets
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Right Column: Order Summary Sidebar */}
          <div>
            <aside className="sticky top-28 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">Order Summary</span>

                <div>
                  <h3 className="text-xl font-black text-white">{event.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <i className="ph ph-map-pin text-emerald-400" />
                    {[event.city, event.country].filter(Boolean).join(', ') || 'Venue Location'}
                  </p>
                </div>

                <div className="space-y-3 border-t border-slate-800 pt-4 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>{ticket?.name || 'Admission'} × {quantity}</span>
                    <span className="font-semibold">{money(total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Booking & Service Fee</span>
                    <span className="font-semibold text-emerald-400">Included</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-3 text-lg font-black text-white">
                    <span>Total Due</span>
                    <span className="text-emerald-400">{money(total)}</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-950 p-4 border border-slate-800 text-xs space-y-2 text-slate-400">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <i className="ph ph-check-circle text-emerald-400" /> Direct Confirmation
                  </div>
                  <p>Your tickets are reserved instantly and valid for gate entry with mobile QR scanner validation.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

