import { useState, useEffect } from 'react';
import { FlightFooter } from '../components/FlightFooter.jsx';

const STATUS_BADGE = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  pending: 'bg-amber-100 text-amber-700',
};

function StaysBookingCard({ booking, onCancel }) {
  const [cancelling, setCancelling] = useState(false);
  const statusKey = (booking.status || 'pending').toLowerCase();

  const handleCancel = async () => {
    if (!window.confirm('Cancel this hotel booking?')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/stays-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', booking_id: booking.id }),
      });
      const data = await res.json();
      if (data.ok) onCancel(booking.id);
      else alert(data.error || 'Failed to cancel.');
    } catch {
      alert('Network error.');
    } finally {
      setCancelling(false);
    }
  };

  const hotelName = booking.accommodation?.name || booking.accommodation_name || 'Hotel';
  const checkin = booking.check_in_date || booking.check_in || '—';
  const checkout = booking.check_out_date || booking.check_out || '—';
  const guests = booking.guests?.length || 1;
  const total = booking.total_amount ? `${booking.total_currency || '$'}${booking.total_amount}` : '—';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <i className="ph ph-buildings text-green-600 text-xl" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100 text-base">{hotelName}</div>
            <div className="text-xs text-slate-500 mt-0.5">Booking ID: {booking.id}</div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                <i className="ph ph-calendar-blank" />
                {checkin} → {checkout}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                <i className="ph ph-user" />
                {guests} Guest{guests !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-slate-900 dark:text-white text-lg">{total}</div>
          <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGE[statusKey] || STATUS_BADGE.pending}`}>
            {booking.status || 'Pending'}
          </span>
        </div>
      </div>

      {statusKey !== 'cancelled' && (
        <div className="flex justify-end mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-xs font-bold text-red-500 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
          >
            <i className="ph ph-x-circle" />
            {cancelling ? 'Cancelling…' : 'Cancel booking'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MyBookingsPage() {
  const [activeTab, setActiveTab] = useState('flights');
  const [flightEmail, setFlightEmail] = useState('');
  const [staysBookings, setStaysBookings] = useState([]);
  const [staysLoading, setStaysLoading] = useState(false);
  const [staysError, setStaysError] = useState('');
  const [staysFetched, setStaysFetched] = useState(false);

  useEffect(() => {
    document.title = 'My Bookings | BookingCart';
  }, []);

  // Load stays bookings
  useEffect(() => {
    if (activeTab === 'stays' && !staysFetched) {
      setStaysLoading(true);
      setStaysError('');
      fetch('/api/stays-booking')
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            setStaysBookings(data.bookings || []);
          } else {
            setStaysError(data.error || 'Failed to load hotel bookings.');
          }
          setStaysFetched(true);
        })
        .catch(() => setStaysError('Network error loading bookings.'))
        .finally(() => setStaysLoading(false));
    }
  }, [activeTab, staysFetched]);

  const handleCancelStay = (id) => {
    setStaysBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
  };

  return (
    <>
      <div className="container mx-auto px-6 py-8 flex gap-8 max-w-7xl">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 hidden lg:block">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <i className="ph ph-user text-green-600 text-xl" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">My Account</div>
                  <div className="text-xs text-slate-400">Your bookings</div>
                </div>
              </div>
            </div>

            <nav className="p-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">My Bookings</div>
              <button
                onClick={() => setActiveTab('flights')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'flights' ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <i className="ph ph-airplane text-lg" /> Flights
              </button>
              <button
                onClick={() => setActiveTab('stays')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'stays' ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                <i className="ph ph-buildings text-lg" /> Hotel Stays
              </button>
              <div className="border-t border-slate-100 dark:border-slate-700 my-2 mx-3" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">Account</div>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                <i className="ph ph-heart text-lg" /> Saved
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                <i className="ph ph-bell text-lg" /> Price Alerts
              </button>
            </nav>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">My Bookings</h1>
            {/* Mobile tab switcher */}
            <div className="flex gap-2 lg:hidden">
              <button
                onClick={() => setActiveTab('flights')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'flights' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
              >
                <i className="ph ph-airplane mr-1" /> Flights
              </button>
              <button
                onClick={() => setActiveTab('stays')}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'stays' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
              >
                <i className="ph ph-buildings mr-1" /> Hotels
              </button>
            </div>
          </div>

          {/* ─── FLIGHTS TAB ─── */}
          {activeTab === 'flights' && (
            <div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-6">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Enter your email to find your flight bookings</p>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <i className="ph ph-envelope absolute left-4 top-3.5 text-slate-400 text-xl" />
                    <input
                      id="lookup-email"
                      type="email"
                      value={flightEmail}
                      onChange={e => setFlightEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 pl-12 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <button
                    id="lookup-btn"
                    className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 rounded-xl transition-all flex items-center gap-2 text-sm"
                  >
                    <i className="ph ph-magnifying-glass" /> Find
                  </button>
                </div>
              </div>

              <div className="text-center py-16">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <i className="ph ph-airplane-tilt text-3xl text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No flight bookings yet</h3>
                <p className="text-sm text-slate-400 mb-6">Enter your email above to find your bookings.</p>
                <a href="/" className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm">
                  <i className="ph ph-magnifying-glass" /> Search Flights
                </a>
              </div>
            </div>
          )}

          {/* ─── STAYS TAB ─── */}
          {activeTab === 'stays' && (
            <div>
              {staysLoading && (
                <div className="flex items-center justify-center py-20 text-slate-400">
                  <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mr-3" />
                  Loading hotel bookings…
                </div>
              )}

              {!staysLoading && staysError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
                  <i className="ph ph-warning text-3xl text-red-400 mb-2 block" />
                  <p className="text-red-600 font-medium">{staysError}</p>
                  <button onClick={() => setStaysFetched(false)} className="mt-3 text-sm font-bold text-green-600 hover:underline">
                    Retry
                  </button>
                </div>
              )}

              {!staysLoading && !staysError && staysBookings.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <i className="ph ph-buildings text-3xl text-slate-300" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No hotel bookings found</h3>
                  <p className="text-sm text-slate-400 mb-6">Your hotel reservations will appear here after booking.</p>
                  <a href="/stays" className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm">
                    <i className="ph ph-magnifying-glass" /> Search Hotels
                  </a>
                </div>
              )}

              {!staysLoading && staysBookings.length > 0 && (
                <div className="space-y-4">
                  {staysBookings.map(booking => (
                    <StaysBookingCard key={booking.id} booking={booking} onCancel={handleCancelStay} />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <FlightFooter />
    </>
  );
}
