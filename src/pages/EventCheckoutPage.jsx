import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

export default function EventCheckoutPage() {
  const { eventId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [event, setEvent] = useState(location.state?.event || null);
  const [loading, setLoading] = useState(!event);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState(location.state?.event?.ticketOptions?.[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    document.title = 'Event tickets | BookingCart';
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
  const total = (ticket?.price || 0) * quantity;
  const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: ticket?.currency || 'USD' }).format(value);

  async function submit(eventSubmit) {
    eventSubmit.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/event-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketId, quantity, guestName: guest.name, guestEmail: guest.email, guestPhone: guest.phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to reserve tickets');
      navigate(`/event-confirmation?ref=${encodeURIComponent(data.booking.bookingRef)}`, { state: { booking: data.booking } });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-slate-50 pt-32 text-center">Loading ticket options…</main>;
  if (!event || !event.ticketOptions?.length) return <main className="min-h-screen bg-slate-50 px-4 pt-32 text-center"><h1 className="text-2xl font-black">Tickets unavailable</h1><p className="mt-2 text-slate-600">{error || 'This event has no ticket options right now.'}</p><Link to="/?mode=attractions" className="mt-6 inline-block font-bold text-emerald-700">Back to events</Link></main>;

  return <main className="min-h-screen bg-slate-50 pb-16 pt-24 dark:bg-slate-950 dark:text-white"><div className="mx-auto max-w-5xl px-4 sm:px-6">
    <Link to={`/events/${eventId}`} state={{ event }} className="text-sm font-bold text-emerald-700">← Back to event</Link>
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 sm:p-8">
        <p className="text-sm font-bold text-emerald-700">Tickets</p><h1 className="mt-1 text-3xl font-black">Choose your admission</h1><p className="mt-2 text-slate-600 dark:text-slate-300">Nothing is confirmed until the reservation is recorded and payment is verified.</p>
        <fieldset className="mt-7 space-y-3"><legend className="mb-3 font-bold">Ticket type</legend>{event.ticketOptions.map((option) => <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${ticketId === option.id ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}><input type="radio" name="ticket" value={option.id} checked={ticketId === option.id} onChange={() => setTicketId(option.id)} className="mt-1" /><span className="flex-1"><span className="block font-bold">{option.name}</span><span className="mt-1 block text-sm text-slate-500">{option.description || option.type}</span></span><strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency: option.currency }).format(option.price)}</strong></label>)}</fieldset>
        <div className="mt-6"><label htmlFor="event-quantity" className="block text-sm font-bold">Quantity</label><select id="event-quantity" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="mt-2 h-11 w-28 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800">{[1,2,3,4,5,6,7,8,9,10].map((value) => <option key={value}>{value}</option>)}</select></div>
        <fieldset className="mt-8 grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-bold sm:col-span-2">Guest details</legend><label className="text-sm font-bold">Full name<input required value={guest.name} onChange={(e) => setGuest((current) => ({ ...current, name: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal dark:border-slate-700 dark:bg-slate-800" /></label><label className="text-sm font-bold">Email<input required type="email" value={guest.email} onChange={(e) => setGuest((current) => ({ ...current, email: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal dark:border-slate-700 dark:bg-slate-800" /></label><label className="text-sm font-bold sm:col-span-2">Phone <span className="font-normal text-slate-400">(optional)</span><input value={guest.phone} onChange={(e) => setGuest((current) => ({ ...current, phone: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 font-normal dark:border-slate-700 dark:bg-slate-800" /></label></fieldset>
        {error ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <button disabled={submitting || !ticketId} className="mt-7 w-full rounded-xl bg-emerald-600 px-5 py-3.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Creating reservation…' : 'Reserve and continue to payment'}</button>
      </form>
      <aside className="h-fit rounded-2xl bg-slate-900 p-6 text-white lg:sticky lg:top-24"><p className="text-sm text-emerald-400">Order summary</p><h2 className="mt-1 text-xl font-black">{event.name}</h2><p className="mt-2 text-sm text-slate-300">{[event.city, event.country].filter(Boolean).join(', ')}</p><div className="mt-6 space-y-3 border-t border-slate-700 pt-5 text-sm"><div className="flex justify-between"><span>{ticket?.name} × {quantity}</span><span>{money(total)}</span></div><div className="flex justify-between border-t border-slate-700 pt-3 text-lg font-black"><span>Total</span><span>{money(total)}</span></div></div><p className="mt-5 text-xs leading-5 text-slate-400">This step creates a pending reservation only. A ticket is issued after payment is verified.</p></aside>
    </div>
  </div></main>;
}
