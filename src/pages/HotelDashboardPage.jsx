import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function money(val, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(val) || 0);
}

function StarRow({ rating }) {
  const full = Math.floor(rating || 0);
  const hasHalf = (rating % 1) >= 0.5;
  return (
    <div className="flex items-center gap-0.5 text-sm">
      {Array.from({ length: full }).map((_, i) => <i key={i} className="ph-fill ph-star text-amber-400" />)}
      {hasHalf && <i className="ph-fill ph-star-half text-amber-400" />}
      {Array.from({ length: Math.max(0, 5 - full - (hasHalf ? 1 : 0)) }).map((_, i) => <i key={`e${i}`} className="ph ph-star text-slate-300 dark:text-slate-600" />)}
    </div>
  );
}

const STATUS_BADGE = {
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  checked_in: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

const MENU_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: 'ph-squares-four' },
  { id: 'my-hotel',     label: 'My Hotel',      icon: 'ph-buildings' },
  { id: 'edit-listing', label: 'Edit Listing',  icon: 'ph-pencil-line' },
  { id: 'reservations', label: 'Reservations',  icon: 'ph-receipt' },
  { id: 'reviews',      label: 'Reviews',       icon: 'ph-star' },
  { id: 'earnings',     label: 'Earnings',      icon: 'ph-wallet' },
  { id: 'settings',     label: 'Settings',      icon: 'ph-gear' },
];

// ─── Mock data for demo ───────────────────────────────────────────────────────
const DEMO_RESERVATIONS = [
  { ref: 'HTL-2841', guestName: 'Sarah & James Okonkwo', checkIn: '2026-09-25', checkOut: '2026-09-28', guests: 2, room: 'Deluxe King', total: 450, status: 'confirmed' },
  { ref: 'HTL-2842', guestName: 'Amara Diallo', checkIn: '2026-10-02', checkOut: '2026-10-05', guests: 1, room: 'Standard Queen', total: 240, status: 'pending' },
  { ref: 'HTL-2839', guestName: 'Chen Wei', checkIn: '2026-09-20', checkOut: '2026-09-22', guests: 2, room: 'Suite', total: 680, status: 'completed' },
  { ref: 'HTL-2835', guestName: 'Fatima Nkrumah', checkIn: '2026-09-15', checkOut: '2026-09-18', guests: 3, room: 'Family Room', total: 520, status: 'completed' },
];

const DEMO_REVIEWS = [
  { id: 1, guestName: 'Sarah O.', rating: 5, text: 'Absolutely stunning location. The staff were incredibly welcoming and the rooms were spotless. Will definitely return!', date: '2026-09-19', room: 'Deluxe King' },
  { id: 2, guestName: 'Luca M.', rating: 4, text: 'Beautiful property with great amenities. The pool area was a bit crowded during peak hours but overall a wonderful stay.', date: '2026-09-14', room: 'Suite' },
  { id: 3, guestName: 'Amara K.', rating: 5, text: 'Perfect in every way. The breakfast was exceptional and the views were breathtaking. Best hotel I\'ve stayed in Africa!', date: '2026-09-08', room: 'Standard Queen' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HotelDashboardPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reservationFilter, setReservationFilter] = useState('all');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // Demo wallet
  const wallet = { available: 1840.00, pending: 450.00, withdrawn: 5200.00, lifetime: 7490.00 };

  useEffect(() => {
    document.title = 'Property Portal & Dashboard | BookingCart';
    if (!user) {
      navigate('/auth?redirect=/hotel-dashboard');
      return;
    }

    async function loadProfile() {
      try {
        const token = getToken();
        const res = await fetch('/api/hotel-profiles', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data.ok && data.profile) setProfile(data.profile);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user, navigate]);

  const filteredReservations = DEMO_RESERVATIONS.filter(r => {
    if (reservationFilter === 'all') return true;
    return r.status === reservationFilter;
  });

  const avgRating = (DEMO_REVIEWS.reduce((a, r) => a + r.rating, 0) / DEMO_REVIEWS.length).toFixed(1);

  // Completeness
  function calcCompleteness() {
    if (!profile) return 50;
    let score = 50;
    const p = profile.step_property_info || {};
    const g = Array.isArray(profile.step_gallery) ? profile.step_gallery : [];
    const r = profile.step_rooms?.list || [];
    if (p.hotelName) score += 10;
    if (p.description?.length >= 50) score += 10;
    if (g.length >= 6) score += 20;
    else if (g.length >= 3) score += 10;
    if (r.length >= 3) score += 10;
    return Math.min(100, score);
  }

  const completenessScore = calcCompleteness();

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <i className="ph ph-spinner-gap text-4xl text-blue-600 animate-spin" />
    </div>
  );

  const hotelName = profile?.step_property_info?.hotelName || 'Your Hotel';
  const hotelCity = profile?.step_location?.city || '';
  const hotelCountry = profile?.step_location?.country || '';
  const coverPhoto = profile?.step_gallery?.[0]?.url || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row pb-20 md:pb-0">

      {/* ── MOBILE HEADER ── */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
          <i className="ph-fill ph-buildings text-blue-600 text-2xl" />
          <span>Property Portal</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xl font-bold"
        >
          <i className={`ph ${mobileMenuOpen ? 'ph-x' : 'ph-list'}`} />
        </button>
      </div>

      {/* ── SIDEBAR ── */}
      <aside className={`
        fixed md:sticky top-0 left-0 bottom-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between transition-transform duration-300
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div>
          <div className="hidden md:flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-blue-600/20">
              <i className="ph-fill ph-buildings" />
            </div>
            <div>
              <div className="font-black text-base text-slate-900 dark:text-white leading-none">Property Portal</div>
              <div className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mt-1">Property Owner</div>
            </div>
          </div>

          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-3 transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <i className={`ph ${item.icon} text-lg`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
          <a
            href="/list-your-hotel"
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-md"
          >
            <i className="ph ph-plus-circle text-base" /> Add Another Property
          </a>
          <div className="text-[11px] text-slate-400 text-center font-semibold mt-3">
            Logged in as <span className="text-slate-700 dark:text-slate-200 font-bold">{user?.name || user?.email}</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full">

        {/* ═══════════════════════════════════════════════════ DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                {coverPhoto && <img src={coverPhoto} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="relative z-10 max-w-xl">
                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-black uppercase px-3 py-1 rounded-full">
                  Dashboard Overview
                </span>
                <h1 className="text-2xl sm:text-4xl font-black mt-3 mb-2">
                  Welcome back, {user?.name?.split(' ')[0] || 'Owner'}!
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm font-medium">
                  {hotelName}{hotelCity ? ` · ${hotelCity}${hotelCountry ? `, ${hotelCountry}` : ''}` : ''}
                </p>
                <div className="flex flex-wrap gap-3 mt-6">
                  <button onClick={() => setActiveTab('my-hotel')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all shadow">
                    View Listing
                  </button>
                  <button onClick={() => setActiveTab('edit-listing')} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs rounded-xl backdrop-blur-md transition-all flex items-center gap-1.5">
                    <i className="ph ph-pencil-line" /> Edit Listing
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Avg. Rating', value: avgRating, sub: <StarRow rating={parseFloat(avgRating)} />, color: 'text-slate-900 dark:text-white' },
                { label: 'Reservations', value: DEMO_RESERVATIONS.length, sub: <span className="text-[10px] font-extrabold text-blue-600">Active</span>, color: 'text-slate-900 dark:text-white' },
                { label: 'Available Payout', value: money(wallet.available), sub: <button onClick={() => setShowWithdrawModal(true)} className="text-[10px] font-bold text-blue-600 underline">Request Payout</button>, color: 'text-blue-600' },
                { label: 'Profile Complete', value: `${completenessScore}%`, sub: <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden"><div className="bg-blue-500 h-full rounded-full" style={{ width: `${completenessScore}%` }} /></div>, color: 'text-slate-900 dark:text-white' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                  <div className={`text-3xl font-black ${color}`}>{value}</div>
                  {sub}
                </div>
              ))}
            </div>

            {/* Recent Reservations & Reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Reservations</h3>
                  <button onClick={() => setActiveTab('reservations')} className="text-xs font-bold text-blue-600 hover:underline">View All</button>
                </div>
                {DEMO_RESERVATIONS.slice(0, 3).map(b => (
                  <div key={b.ref} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">{b.guestName}</div>
                      <div className="text-[11px] text-slate-400">{b.checkIn} · {b.room}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${STATUS_BADGE[b.status] || STATUS_BADGE.pending}`}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Guest Reviews</h3>
                  <button onClick={() => setActiveTab('reviews')} className="text-xs font-bold text-blue-600 hover:underline">View All</button>
                </div>
                {DEMO_REVIEWS.slice(0, 2).map(r => (
                  <div key={r.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">{r.guestName}</span>
                      <StarRow rating={r.rating} />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════ MY HOTEL TAB ═══ */}
        {activeTab === 'my-hotel' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">My Property Listing</h2>
                <p className="text-xs text-slate-500">Preview how your property appears to travelers.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab('edit-listing')}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  <i className="ph ph-pencil-line text-base" /> Edit Listing
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.origin + '/stays'); alert('Stays link copied!'); }}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <i className="ph ph-share-network text-base" /> Share
                </button>
              </div>
            </div>

            {/* Listing Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
              {coverPhoto ? (
                <div className="relative h-60 overflow-hidden">
                  <img src={coverPhoto} alt="Hotel" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5">
                    <h3 className="text-2xl font-black text-white">{hotelName}</h3>
                    <p className="text-white/80 text-sm mt-1">{hotelCity}{hotelCountry ? `, ${hotelCountry}` : ''}</p>
                  </div>
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                  <div className="text-center text-white">
                    <i className="ph ph-buildings text-5xl mb-2" />
                    <p className="font-black text-2xl">{hotelName}</p>
                    <p className="text-blue-200">{hotelCity}{hotelCountry ? `, ${hotelCountry}` : ''}</p>
                  </div>
                </div>
              )}
              <div className="p-6 space-y-5">
                <div className="flex flex-wrap gap-2">
                  {profile?.step_property_info?.propertyType && (
                    <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full border border-blue-200 dark:border-blue-800">
                      {profile.step_property_info.propertyType}
                    </span>
                  )}
                  {profile?.step_property_info?.starRating && (
                    <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-bold rounded-full border border-amber-200 dark:border-amber-800">
                      {profile.step_property_info.starRating}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${profile?.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}>
                    {profile?.status === 'approved' ? '✓ Live' : profile?.status === 'pending' ? '⏳ Under Review' : '📝 Draft'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {profile?.step_property_info?.description || 'No description added yet. Go to Edit Listing to add one.'}
                </p>
                {profile?.step_amenities?.selected?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.step_amenities.selected.slice(0, 10).map(a => (
                        <span key={a} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <i className="ph ph-check text-blue-500" /> {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profile?.step_rooms?.list?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Room Types</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {profile.step_rooms.list.map((room, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                          <p className="font-bold text-sm text-slate-900 dark:text-white">{room.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{room.bedType} · Max {room.maxOccupancy} guests</p>
                          <p className="text-blue-600 font-black text-sm mt-1">${room.pricePerNight}/night</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ EDIT LISTING TAB ═══ */}
        {activeTab === 'edit-listing' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Edit Your Listing</h2>
              <p className="text-xs text-slate-500">Make changes to your hotel profile. Changes are reviewed before going live.</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 flex items-start gap-4">
              <i className="ph ph-info text-blue-600 text-xl shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-900 dark:text-blue-200 text-sm">Continue Your Onboarding</p>
                <p className="text-blue-700 dark:text-blue-400 text-xs mt-1">To update your listing details, go back to the onboarding wizard where you can change any section.</p>
                <a href="/list-your-hotel" className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors">
                  <i className="ph ph-arrow-square-out" /> Open Listing Wizard
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ RESERVATIONS TAB ═══ */}
        {activeTab === 'reservations' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Reservations</h2>
                <p className="text-xs text-slate-500">Track all guest bookings and stay details.</p>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
                {['all', 'confirmed', 'pending', 'completed', 'cancelled'].map(f => (
                  <button
                    key={f}
                    onClick={() => setReservationFilter(f)}
                    className={`px-3 py-1.5 rounded-xl capitalize transition-colors ${reservationFilter === f ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredReservations.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                  <i className="ph ph-calendar-blank text-4xl text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium">No reservations found for this filter.</p>
                </div>
              ) : filteredReservations.map(b => (
                <div key={b.ref} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xl">
                      <i className="ph ph-user" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-base">{b.guestName}</div>
                      <div className="text-xs text-slate-500">Ref: {b.ref} · {b.room}</div>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600 dark:text-slate-400 font-semibold">
                        <span><i className="ph ph-calendar-blank text-blue-500" /> {b.checkIn} → {b.checkOut}</span>
                        <span><i className="ph ph-users text-blue-500" /> {b.guests} Guests</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="font-black text-blue-600 text-xl">{money(b.total)}</div>
                    <span className={`px-3 py-0.5 rounded-full text-xs font-black capitalize border ${STATUS_BADGE[b.status] || STATUS_BADGE.pending}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════ REVIEWS TAB ═══ */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Guest Reviews</h2>
                <p className="text-xs text-slate-500">Read and respond to traveler feedback.</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 flex items-center gap-3">
                <div className="text-3xl font-black text-slate-900 dark:text-white">{avgRating}</div>
                <div>
                  <StarRow rating={parseFloat(avgRating)} />
                  <p className="text-xs text-slate-400 mt-0.5">{DEMO_REVIEWS.length} reviews</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {DEMO_REVIEWS.map(r => (
                <div key={r.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{r.guestName}</span>
                        <span className="text-xs text-slate-400">· {r.date} · {r.room}</span>
                      </div>
                      <StarRow rating={r.rating} />
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{r.text}</p>

                  {replyingTo === r.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={3}
                        placeholder="Write your response to the guest..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setReplyingTo(null); setReplyText(''); }} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => { setReplyingTo(null); setReplyText(''); alert('Reply posted!'); }} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors">
                          Post Response
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReplyingTo(r.id)}
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <i className="ph ph-chat-circle-dots" /> Reply to Guest
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ EARNINGS TAB ═══ */}
        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Earnings & Payouts</h2>
              <p className="text-xs text-slate-500">Track your hotel revenue and request withdrawals.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Available', value: money(wallet.available), color: 'text-emerald-600', sub: 'Ready to withdraw' },
                { label: 'Pending', value: money(wallet.pending), color: 'text-amber-500', sub: 'Awaiting check-out' },
                { label: 'Withdrawn', value: money(wallet.withdrawn), color: 'text-slate-900 dark:text-white', sub: 'Total paid out' },
                { label: 'Lifetime', value: money(wallet.lifetime), color: 'text-blue-600', sub: 'Total earned' },
              ].map(({ label, value, color, sub }) => (
                <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="font-black text-slate-900 dark:text-white mb-4">Request Payout</h3>
              <div className="max-w-sm space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Amount (USD)</label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    max={wallet.available}
                    placeholder={`Max ${money(wallet.available)}`}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (withdrawAmount && parseFloat(withdrawAmount) > 0 && parseFloat(withdrawAmount) <= wallet.available) {
                      alert(`Withdrawal of ${money(withdrawAmount)} requested! Processing within 3–5 business days.`);
                      setWithdrawAmount('');
                    } else {
                      alert('Please enter a valid amount.');
                    }
                  }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-blue-600/20"
                >
                  Request Withdrawal
                </button>
                <p className="text-xs text-slate-400">Payouts are processed via Bank Transfer or Mobile Money within 3–5 business days.</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ SETTINGS TAB ═══ */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Account Settings</h2>
              <p className="text-xs text-slate-500">Manage your account and notification preferences.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-3">Profile Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.email || '—'}</p>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <a href="/account-settings" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors">
                  <i className="ph ph-user-gear" /> Manage Account Settings
                </a>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
