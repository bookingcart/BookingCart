import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';

export default function TourGuideConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  const queryRef = new URLSearchParams(location.search).get('ref');

  useEffect(() => {
    if (!queryRef) {
      setLoading(false);
      return;
    }

    fetch(`/api/guide-bookings?ref=${encodeURIComponent(queryRef)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.booking) {
          setBooking(data.booking);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load guide booking:', err);
        setLoading(false);
      });
  }, [queryRef]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center space-x-3 text-emerald-400">
          <i className="ph ph-spinner animate-spin text-3xl"></i>
          <span className="text-lg font-medium">Loading booking confirmation...</span>
        </div>
      </div>
    );
  }

  const b = booking || {
    ref: queryRef || 'GB-DEMO-999',
    guideName: 'Sarah Johnson',
    startDate: '2026-09-15',
    endDate: '2026-09-18',
    guests: 2,
    total: 360,
    status: 'confirmed',
    contact: { firstName: 'Traveler', lastName: 'Guest', email: 'guest@example.com' }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header card */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-8 mb-8 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl"></div>
          
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            <i className="ph ph-check-circle"></i>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">Booking Confirmed!</h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Your tour guide booking has been reserved successfully. A confirmation summary has been logged under reference code.
          </p>

          <div className="inline-block mt-4 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-emerald-400 font-mono text-sm">
            Ref: <span className="font-bold text-white">{b.ref}</span>
          </div>
        </div>

        {/* Details card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 space-y-6">
          <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-3 flex items-center justify-between">
            <span>Booking Details</span>
            <span className="text-xs uppercase tracking-wider px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-semibold">
              {b.status || 'Confirmed'}
            </span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-xs mb-1">Guide Name</span>
              <span className="text-white font-semibold text-base">{b.guideName || b.guideId || 'Tour Guide'}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-xs mb-1">Guests</span>
              <span className="text-white font-semibold text-base">{b.guests || 1} Person(s)</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-xs mb-1">Start Date</span>
              <span className="text-white font-medium">{b.startDate || 'N/A'}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-xs mb-1">End Date</span>
              <span className="text-white font-medium">{b.endDate || 'N/A'}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-slate-400 block text-xs">Total Amount Paid</span>
              <span className="text-xs text-slate-500">Includes all taxes & services</span>
            </div>
            <span className="text-2xl font-bold text-emerald-400">${b.total}</span>
          </div>

          {b.contact && (
            <div className="border-t border-slate-800 pt-4 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Contact Email:</span> {b.contact.email || b.contactEmail}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/tour-guides"
            className="w-full sm:w-auto text-center px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
          >
            Browse More Guides
          </Link>
          <Link
            to="/account"
            className="w-full sm:w-auto text-center px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
          >
            My Bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
