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
    document.title = 'Booking Confirmation | BookingCart';
    
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

        // Call backend to create booking in Duffel
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center">
        {loading && (
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin mx-auto"></div>
            <h2 className="mt-6 text-xl font-bold text-slate-900 dark:text-white">Confirming your booking...</h2>
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
            <div className="bg-green-600 px-8 py-10 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <i className="ph ph-check text-3xl" />
              </div>
              <h1 className="text-3xl font-black mb-2">Booking Confirmed!</h1>
              <p className="text-green-50 text-lg">Your stay is all set.</p>
            </div>
            
            <div className="p-8">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 mb-6 flex flex-col items-center text-center border border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-1">Booking Reference</p>
                <p className="text-3xl font-mono font-black text-slate-900 dark:text-white tracking-widest">{booking.reference}</p>
                {booking.confirmed_at && (
                  <p className="text-xs text-slate-500 mt-2">Confirmed at: {new Date(booking.confirmed_at).toLocaleString()}</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Accommodation</span>
                  <span className="font-bold text-slate-900 dark:text-white text-right">{booking.accommodation?.name || 'Hotel'}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Check-in</span>
                  <span className="font-bold text-slate-900 dark:text-white">{booking.check_in_date}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Check-out</span>
                  <span className="font-bold text-slate-900 dark:text-white">{booking.check_out_date}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-slate-500">Guest</span>
                  <span className="font-bold text-slate-900 dark:text-white capitalize">
                    {booking.guests?.[0]?.given_name} {booking.guests?.[0]?.family_name}
                  </span>
                </div>
              </div>

              {/* Price Summary & Payment */}
              <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Price Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total Paid</span>
                    <span className="font-bold text-slate-900 dark:text-white">{booking.currency} {Number(booking.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Taxes</span>
                    <span className="font-bold text-slate-900 dark:text-white">{booking.currency} {Number(booking.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Fees</span>
                    <span className="font-bold text-slate-900 dark:text-white">{booking.currency} {Number(booking.fee_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold bg-green-50 dark:bg-green-900/20 p-3 rounded">
                    <span className="text-green-800 dark:text-green-300">Due at Accommodation</span>
                    <span className="text-green-800 dark:text-green-300">
                      {booking.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_currency || booking.currency} {Number(booking.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Collection */}
              <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Key Collection</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <i className="ph-fill ph-key text-green-600 mr-2" />
                  {booking.accommodation?.key_collection?.instructions || 'Please contact the accommodation directly for key collection instructions.'}
                </p>
              </div>

              {/* Policy & Conditions */}
              <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Policy and Rate Conditions</h3>
                <div className="text-xs text-slate-500 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 p-4 rounded">
                  {booking.accommodation?.rooms?.[0]?.rates?.[0]?.conditions || 'No cancellation conditions specified. Please contact support.'}
                </div>
              </div>

              {/* Business Details Section */}
              <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Business Details</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  <p><strong>BookingCart Inc.</strong></p>
                  <p>123 Travel Street, Silicon Valley, CA 94000, USA</p>
                  <p><strong>Customer Service:</strong> bookingcart.business@gmail.com | +1 (800) 555-0199</p>
                  <p className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    By confirming this booking, you agree to our <Link to="/terms" className="text-green-600 hover:underline">Terms & Conditions</Link> and <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link>, as well as any applicable Booking.com terms and conditions.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <Link to="/" className="block w-full text-center py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl transition-transform hover:scale-[1.02]">
                  Return to Home
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
      <FlightFooter />
    </div>
  );
}
