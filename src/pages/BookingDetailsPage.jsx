import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';

function money(value, currency = 'USD') {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number.isFinite(n) ? n : 0);
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (['confirmed', 'issued', 'paid'].includes(s)) return 'bg-green-50 text-green-700 border-green-200';
  if (['cancelled', 'canceled', 'failed'].includes(s)) return 'bg-red-50 text-red-600 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function extractSegments(booking) {
  const flight = booking?.flight || {};
  if (Array.isArray(flight.segments) && flight.segments.length) return flight.segments;
  if (Array.isArray(flight.slices)) return flight.slices.flatMap((slice) => slice.segments || []);
  return [];
}

export default function BookingDetailsPage() {
  const { ref: refParam } = useParams();
  const [searchParams] = useSearchParams();
  const bookingRef = refParam || searchParams.get('ref') || searchParams.get('id') || '';
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(!!bookingRef);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Booking Details | BookingCart'; }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBooking() {
      if (!bookingRef) {
        setLoading(false);
        setError('Missing booking reference.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const resp = await fetch(`/api/bookings?ref=${encodeURIComponent(bookingRef)}`);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) throw new Error(data.error || 'Booking not found');
        if (!cancelled) setBooking(data.booking);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Booking not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadBooking();
    return () => { cancelled = true; };
  }, [bookingRef]);

  const segments = useMemo(() => extractSegments(booking), [booking]);
  const passengers = Array.isArray(booking?.passengers) ? booking.passengers : [];
  const currency = booking?.flight?.currency || booking?.payment?.currency || 'USD';

  if (loading) {
    return (
      <>
        <main className="max-w-5xl mx-auto px-4 py-10">
          <div className="h-8 w-56 bg-slate-100 rounded animate-pulse mb-6" />
          <div className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
        </main>
        <FlightFooter />
      </>
    );
  }

  if (error || !booking) {
    return (
      <>
        <main className="max-w-3xl mx-auto px-4 py-14">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <i className="ph ph-airplane-tilt text-3xl text-slate-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Booking not found</h1>
            <p className="text-sm text-slate-500 mt-2">{error || 'We could not find a booking with that reference.'}</p>
            <Link to="/my-bookings" className="btn-primary inline-flex mt-6">Back to My Bookings</Link>
          </div>
        </main>
        <FlightFooter />
      </>
    );
  }

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-6">
          <Link to="/my-bookings" className="hover:text-green-600">My Bookings</Link>
          <i className="ph ph-caret-right text-slate-300" />
          <span className="text-slate-700 font-semibold">{booking.ref}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <section className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-bold capitalize ${statusClass(booking.status)}`}>
                    <i className="ph ph-circle" /> {booking.status || 'new'}
                  </span>
                  <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{booking.route || 'Flight booking'}</h1>
                  <p className="text-sm text-slate-500 mt-1">{booking.dates || 'Dates unavailable'}</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Booking number</div>
                  <div className="text-sm font-extrabold text-slate-800 font-mono">{booking.ref}</div>
                  {booking.duffelBookingReference && (
                    <div className="mt-2 text-xs text-slate-500">Airline ref: {booking.duffelBookingReference}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="font-extrabold text-slate-900 mb-4">Flight details</h2>
              {segments.length ? (
                <div className="space-y-4">
                  {segments.map((seg, index) => (
                    <div key={`${seg.id || index}`} className="flex gap-4 items-start border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                      <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                        <i className="ph ph-airplane-tilt text-green-600 text-lg" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <strong className="text-slate-900">{seg.departCode || seg.departAirport || seg.origin?.iata_code || '--'}</strong>
                          <span className="text-slate-400">→</span>
                          <strong className="text-slate-900">{seg.arriveCode || seg.arriveAirport || seg.destination?.iata_code || '--'}</strong>
                          <span className="text-sm text-slate-500">{seg.departTime || seg.departing_at || ''} {seg.arriveTime ? `- ${seg.arriveTime}` : ''}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {seg.airlineName || seg.airline || seg.marketing_carrier?.name || 'Airline unavailable'}
                          {seg.flightNumber ? ` · ${seg.flightNumber}` : ''}
                          {seg.durationMin ? ` · ${Math.floor(seg.durationMin / 60)}h ${seg.durationMin % 60}m` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Flight segment details are unavailable for this booking.</p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="font-extrabold text-slate-900 mb-4">Passengers</h2>
              {passengers.length ? (
                <div className="grid gap-3">
                  {passengers.map((p, index) => (
                    <div key={index} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                      <strong>{[p.firstName, p.lastName, p.name].filter(Boolean).join(' ') || `Passenger ${index + 1}`}</strong>
                      {p.type && <span className="text-slate-500 ml-2 capitalize">{p.type}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Passenger details are unavailable.</p>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="font-extrabold text-slate-900 mb-4">Price summary</h2>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total</span>
                <strong className="text-green-600 text-lg">{money(booking.total, currency)}</strong>
              </div>
              {booking.payment?.status && (
                <div className="mt-3 text-xs text-slate-500">Payment status: {booking.payment.status}</div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="font-extrabold text-slate-900 mb-4">Ticket</h2>
              {booking.ticket ? (
                <div className="text-sm text-slate-600">
                  <div><strong>{booking.ticket.airline}</strong></div>
                  <div className="font-mono">{booking.ticket.ticketNumber}</div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No ticket has been issued yet.</p>
              )}
            </div>
          </aside>
        </div>
      </main>
      <FlightFooter />
    </>
  );
}
