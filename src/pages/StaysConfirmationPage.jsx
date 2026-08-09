import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';

export default function StaysConfirmationPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const isDirect = searchParams.get('direct');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    document.title = 'Booking Confirmed | BookingCart';

    const confirmBooking = async () => {
      try {
        if (!sessionId && !isDirect) {
          throw new Error('No payment session found.');
        }

        if (isDirect) {
          const rawResult = sessionStorage.getItem('stays_booking_result');
          if (rawResult) {
            setBooking(JSON.parse(rawResult));
            sessionStorage.removeItem('stays_booking_result');
            return;
          }
        }

        const rawData = sessionStorage.getItem('stays_booking_data');
        if (!rawData) {
          throw new Error('No booking data found in session.');
        }

        const bookingData = JSON.parse(rawData);

        const res = await fetch('/api/stays-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingData)
        });

        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to complete booking with provider.');
        }

        setBooking(data.booking);
        sessionStorage.removeItem('stays_booking_data');

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    confirmBooking();
  }, [sessionId]);

  // Helpers
  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return d; }
  };
  const formatDateTime = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  const cancellationTimeline = booking?.quote?.cancellation_timeline
    || booking?.cancellation_timeline
    || booking?._checkoutQuote?.cancellation_timeline
    || null;
  const rateConditions = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.conditions
    || booking?.rooms?.[0]?.rates?.[0]?.conditions
    || booking?._checkoutQuote?.rooms?.[0]?.rates?.[0]?.conditions
    || '';
  const taxAmount = booking?.tax_amount ?? booking?.quote?.tax_amount ?? booking?._checkoutQuote?.tax_amount ?? null;
  const feeAmount = booking?.fee_amount ?? booking?.quote?.fee_amount ?? booking?._checkoutQuote?.fee_amount ?? null;
  const dueAtAccAmount = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? booking?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? booking?._checkoutQuote?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? null;
  const dueAtAccCurrency = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_currency
    || booking?.currency
    || booking?._checkoutQuote?.currency
    || 'USD';
  // Booking reference: Duffel uses 'id' not 'reference'
  const bookingRef = booking?.reference || booking?.id || '—';
  // Confirmation date: prefer confirmed_at, fall back to created_at
  const confirmedAt = booking?.confirmed_at || booking?.created_at || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-12">
        {loading && (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin mx-auto" />
            <h2 className="mt-6 text-xl font-bold text-slate-900 dark:text-white">Confirming your booking…</h2>
            <p className="text-slate-500 mt-2">Please don't close this page.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 w-full text-red-700 p-8 rounded-2xl border border-red-100 flex flex-col items-center text-center">
            <i className="ph ph-warning-circle text-5xl mb-4" />
            <h2 className="text-xl font-bold">Booking Error</h2>
            <p className="mt-2">{error}</p>
            <Link to="/support" className="mt-6 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Contact Support</Link>
          </div>
        )}

        {!loading && !error && booking && (
          <div className="bg-white dark:bg-slate-800 w-full rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">

            {/* ── Hero header ── */}
            <div className="bg-green-600 px-8 py-10 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <i className="ph ph-check text-3xl" />
              </div>
              <h1 className="text-3xl font-black mb-2">Booking Confirmed!</h1>
              <p className="text-green-50 text-lg">Your stay is all set. A confirmation email will follow shortly.</p>
            </div>

            <div className="p-8 space-y-8">

              {/* ── Booking reference ── */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 flex flex-col items-center text-center border border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Booking Reference</p>
                <p className="text-4xl font-mono font-black text-slate-900 dark:text-white tracking-widest">
                  {bookingRef}
                </p>
                {confirmedAt && (
                  <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
                    <i className="ph ph-calendar-check text-green-600" />
                    Confirmed {formatDateTime(confirmedAt)}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-2">Keep this reference for your records.</p>
              </div>

              {/* ── Stay details ── */}
              <div>
                <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Stay Details</h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  {[
                    { label: 'Accommodation', value: booking.accommodation?.name || 'Hotel' },
                    { label: 'Check-in',       value: formatDate(booking.check_in_date) },
                    { label: 'Check-out',      value: formatDate(booking.check_out_date) },
                    {
                      label: 'Guest',
                      value: `${booking.guests?.[0]?.given_name || ''} ${booking.guests?.[0]?.family_name || ''}`.trim() || '—'
                    },
                    { label: 'Booking status', value: booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : 'Confirmed' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between px-4 py-3 text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-bold text-slate-900 dark:text-white text-right max-w-[55%]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Price summary ── */}
              <div>
                <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Price Summary</h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-500">Total Paid</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {booking.currency} {Number(booking.total_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-500">Taxes</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {taxAmount != null && Number(taxAmount) > 0
                        ? `${booking.currency || dueAtAccCurrency} ${Number(taxAmount).toFixed(2)}`
                        : <span className="italic font-normal text-slate-400">Included in total</span>}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-500">Fees</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {feeAmount != null && Number(feeAmount) > 0
                        ? `${booking.currency || dueAtAccCurrency} ${Number(feeAmount).toFixed(2)}`
                        : <span className="italic font-normal text-slate-400">Included in total</span>}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm bg-green-50 dark:bg-green-900/20">
                    <span className="font-bold text-green-800 dark:text-green-300">Due at Accommodation</span>
                    <span className="font-bold text-green-800 dark:text-green-300">
                      {dueAtAccAmount != null && Number(dueAtAccAmount) > 0
                        ? `${dueAtAccCurrency} ${Number(dueAtAccAmount).toFixed(2)}`
                        : <span className="font-normal italic text-green-700 dark:text-green-400">Nothing due at property</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Cancellation timeline ── */}
              <div>
                <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Cancellation Policy</h2>
                {cancellationTimeline?.cancel_by ? (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-5 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-2">
                      <i className="ph-fill ph-check-circle text-lg" />
                      Free cancellation until {formatDate(cancellationTimeline.cancel_by)}
                    </div>
                    {((cancellationTimeline.penalties || cancellationTimeline.periods) || []).length > 0 && (
                      <div className="space-y-1 mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Penalty schedule</p>
                        {(cancellationTimeline.penalties || cancellationTimeline.periods).map((p, i) => (
                          <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <i className="ph ph-caret-right text-slate-400" />
                            After {formatDate(p.start_date || p.starts_at)}:{' '}
                            {p.percentage != null
                              ? `${p.percentage}% of total amount`
                              : p.amount != null
                              ? `${booking.currency} ${Number(p.amount).toFixed(2)}`
                              : 'Penalty applies'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold">
                      <i className="ph ph-warning-circle text-lg" />
                      {rateConditions?.toLowerCase().includes('non-refundable') 
                        ? 'Non-refundable – no cancellation available after booking'
                        : 'Cancellation policy varies – please check your confirmation email'}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Rate conditions ── */}
              {rateConditions && (
                <div>
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Rate Conditions</h2>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {rateConditions}
                  </div>
                </div>
              )}

              {/* ── Key collection ── */}
              {(booking.accommodation?.key_collection?.instructions) && (
                <div>
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Key Collection</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <i className="ph-fill ph-key text-green-600 mr-2" />
                    {booking.accommodation.key_collection.instructions}
                  </p>
                </div>
              )}

              {/* ── Business details ── */}
              <div>
                <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Business Details</h2>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-base text-slate-900 dark:text-white">BookingCart Inc.</p>
                  <p className="flex items-center gap-2">
                    <i className="ph ph-map-pin text-green-600 shrink-0" />
                    123 Travel Street, Silicon Valley, CA 94000, USA
                  </p>
                  <p className="flex items-center gap-2">
                    <i className="ph ph-envelope text-green-600 shrink-0" />
                    <a href="mailto:bookingcart.business@gmail.com" className="hover:underline text-green-700 dark:text-green-400">
                      bookingcart.business@gmail.com
                    </a>
                  </p>
                  <p className="flex items-center gap-2">
                    <i className="ph ph-phone text-green-600 shrink-0" />
                    <a href="tel:+18005550199" className="hover:underline text-green-700 dark:text-green-400">
                      +1 (800) 555-0199
                    </a>
                  </p>
                  <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 leading-relaxed">
                    By confirming this booking, you agreed to our{' '}
                    <Link to="/terms" className="text-green-600 hover:underline">Terms &amp; Conditions</Link>{' '}and{' '}
                    <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link>,
                    as well as any applicable property terms and conditions.
                  </div>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="flex flex-col sm:flex-row gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl transition-colors"
                >
                  <i className="ph ph-printer text-lg" />
                  Print / Save PDF
                </button>
                <Link to="/my-bookings" className="flex-1 text-center py-3.5 bg-green-600 text-white font-bold rounded-xl transition-transform hover:scale-[1.02] hover:bg-green-700">
                  View My Bookings
                </Link>
                <Link to="/" className="flex-1 text-center py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition-transform hover:scale-[1.02]">
                  Return to Home
                </Link>
              </div>

            </div>
          </div>
        )}
      </main>
      <div className="print:hidden">
        <FlightFooter />
      </div>
    </div>
  );
}
