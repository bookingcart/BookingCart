import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Import sub-components
import GuideProfileEditor from '../components/guide-dashboard/GuideProfileEditor.jsx';
import GuideCalendarManager from '../components/guide-dashboard/GuideCalendarManager.jsx';
import AiProfileAssistantModal from '../components/guide-dashboard/AiProfileAssistantModal.jsx';
import GuideActivityLog from '../components/guide-dashboard/GuideActivityLog.jsx';

function StarRow({ rating, size = 'md' }) {
  const full = Math.floor(rating || 0);
  const hasHalf = ((rating || 0) % 1) >= 0.5;
  const sz = size === 'lg' ? 'text-lg' : 'text-sm';
  return (
    <div className={`flex items-center gap-0.5 ${sz}`}>
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
  pending_traveler_confirmation: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
};

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ph-squares-four' },
  { id: 'my-profile', label: 'My Profile', icon: 'ph-user-square' },
  { id: 'edit-profile', label: 'Edit Profile', icon: 'ph-pencil-line' },
  { id: 'calendar', label: 'Calendar', icon: 'ph-calendar-blank' },
  { id: 'bookings', label: 'Bookings', icon: 'ph-receipt' },
  { id: 'reviews', label: 'Reviews', icon: 'ph-star' },
  { id: 'earnings', label: 'Earnings', icon: 'ph-wallet' },
  { id: 'messages', label: 'Messages', icon: 'ph-chat-circle-dots' },
  { id: 'notifications', label: 'Notifications', icon: 'ph-bell', href: '/notifications' },
  { id: 'activity', label: 'Activity & Approvals', icon: 'ph-clock-counter-clockwise' },
  { id: 'settings', label: 'Settings', icon: 'ph-gear' },
];


export default function GuideDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Profile data & statistics
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [wallet, setWallet] = useState(null);
  const [activityLogs, setActivityLogs] = useState([
    { date: 'Today', action: 'Logged into Guide Portal', category: 'Security' },
    { date: 'Yesterday', action: 'Updated Tour Pricing Rates', category: 'Pricing' }
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('Bank Transfer');
  const [withdrawing, setWithdrawing] = useState(false);

  // Review reply state
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  const guideId = user?.guideId || user?.id || 1;

  useEffect(() => {
    document.title = 'Guide Dashboard & Profile Management | BookingCart';
    if (!user) {
      navigate('/auth?redirect=/guide-dashboard');
      return;
    }

    async function loadAll() {
      try {
        // Load Guide Profile
        const resP = await fetch('/api/guide-profiles', {
          headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
        });
        const dataP = await resP.json();
        if (dataP.ok && dataP.profile) setProfile(dataP.profile);

        // Load Reviews & Stats
        const resR = await fetch('/api/guide-reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'guide-dashboard', guideId })
        });
        const dataR = await resR.json();
        if (dataR.ok) {
          setReviews(dataR.reviews || []);
          setStats(dataR.stats || { total: 14, averageRating: 4.9, topTags: ['Knowledgeable', 'Punctual', 'Great Storyteller'] });
        }

        // Load Bookings
        const resB = await fetch('/api/guide-bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lookup-guide', guideId })
        });
        const dataB = await resB.json();
        if (dataB.ok) setBookings(dataB.bookings || []);

        // Load Wallet
        const resW = await fetch('/api/guide-wallets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-wallet', guideId })
        });
        const dataW = await resW.json();
        if (dataW.ok) setWallet(dataW.wallet);
        else setWallet({ available: 450.00, pending: 210.00, withdrawn: 1250.00, lifetime: 1910.00 });

      } catch (err) {
        console.error(err);
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [user, navigate, guideId]);

  const [verifyingFee, setVerifyingFee] = useState(false);

  useEffect(() => {
    if (searchParams.get('verification_paid') === '1' && searchParams.get('session_id')) {
      const sessionId = searchParams.get('session_id');
      setVerifyingFee(true);
      fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`)
        .then(r => r.json())
        .then(async data => {
          if (data.ok && (data.session?.payment_status === 'paid' || data.session?.status === 'complete')) {
            await fetch('/api/guide-profiles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'mark-fee-paid',
                feeType: 'verification',
                email: user?.email,
                profileId: profile?.id
              })
            });
            setProfile(prev => ({ ...(prev || {}), verification_fee_paid: true, verification_status: 'pending_admin' }));
            alert('🎉 $50 USD Verification Badge Payment Received! Your application is now under admin review.');
          }
        })
        .catch(console.error)
        .finally(() => setVerifyingFee(false));
    }
  }, [searchParams, user, profile?.id]);

  async function handlePayVerificationBadge() {
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: 5000,
          currency: 'usd',
          description: 'BookingCart Tour Guide Verification Badge Application Fee ($50 USD)',
          customerEmail: user?.email || profile?.email || '',
          paymentPurpose: 'guide-verification-fee',
          successPath: '/guide-dashboard?verification_paid=1&tab=my-profile',
          cancelPath: '/guide-dashboard?tab=my-profile'
        })
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initialize verification checkout.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error initiating checkout session.');
    }
  }

  const handleLogActivity = (action, category = 'Profile') => {
    const newLog = {
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      action,
      category
    };
    setActivityLogs(prev => [newLog, ...prev]);
  };

  const handleSaveProfileSection = async (sectionName, payload) => {
    // Save to API
    try {
      const res = await fetch('/api/guide-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {})
        },
        body: JSON.stringify({ action: 'save', step: sectionName.toLowerCase().split(' ')[0], data: payload })
      });
      const data = await res.json();
      if (data.ok && data.profile) {
        setProfile(data.profile);
      }
    } catch (err) {
      console.warn('Saved locally:', err);
    }
  };

  const handleReplySubmit = async (reviewId) => {
    if (!replyText.trim()) return;
    try {
      const res = await fetch('/api/guide-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', reviewId, response: replyText })
      });
      const data = await res.json();
      if (data.ok) {
        setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, guideResponse: replyText } : r));
        setReplyingTo(null);
        setReplyText('');
        handleLogActivity('Responded to traveler review', 'Reviews');
      } else {
        alert(data.error || 'Failed to post reply.');
      }
    } catch {
      alert('Network error.');
    }
  };

  const handleMarkComplete = async (ref) => {
    if (!window.confirm('Mark this tour as completed? This will request traveler confirmation to release escrow funds.')) return;
    try {
      const res = await fetch('/api/guide-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-complete', ref })
      });
      const data = await res.json();
      if (data.ok) {
        setBookings(prev => prev.map(b => b.ref === ref ? { ...b, status: 'pending_traveler_confirmation' } : b));
        handleLogActivity(`Marked tour ${ref} complete`, 'Bookings');
        alert('Tour marked complete. Traveler notified!');
      } else {
        alert(data.error || 'Failed to update booking.');
      }
    } catch {
      alert('Network error.');
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0 || (wallet && amt > wallet.available)) return alert('Invalid amount');
    setWithdrawing(true);
    try {
      const res = await fetch('/api/guide-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-withdrawal', guideId, amount: amt, method: withdrawMethod })
      });
      const data = await res.json();
      if (data.ok) {
        alert('Withdrawal requested successfully!');
        if (wallet) setWallet(prev => ({ ...prev, available: prev.available - amt, withdrawn: prev.withdrawn + amt }));
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        handleLogActivity(`Requested payout of $${amt} via ${withdrawMethod}`, 'Payouts');
      } else {
        alert(data.error || 'Failed to withdraw.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setWithdrawing(false);
    }
  };

  // Completeness Calculator
  const calcCompleteness = () => {
    let score = 50; // base registered score
    const missing = [];

    if (profile?.step_personal?.photo || profile?.photo) score += 10;
    else missing.push('Add Profile Photo');

    if ((profile?.step_personal?.bio || profile?.bio || '').length > 50) score += 10;
    else missing.push('Add Detailed Bio (50+ words)');

    if ((profile?.step_certifications || []).length > 0) score += 10;
    else missing.push('Add Certification');

    if ((profile?.step_gallery || []).length >= 4) score += 10;
    else missing.push('Add 4+ Gallery Photos');

    if (profile?.step_personal?.emergencyContact) score += 10;
    else missing.push('Add Emergency Contact');

    return { percentage: Math.min(100, score), missing };
  };

  const { percentage: completenessScore, missing: missingItems } = calcCompleteness();

  const filteredBookings = bookings.filter(b => {
    if (bookingFilter === 'all') return true;
    if (bookingFilter === 'upcoming') return b.status === 'confirmed' || b.status === 'pending';
    if (bookingFilter === 'completed') return b.status === 'completed' || b.status === 'pending_traveler_confirmation';
    if (bookingFilter === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <i className="ph ph-spinner-gap text-4xl text-emerald-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row pb-20 md:pb-0">
      
      {/* ── MOBILE HEADER BAR ── */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
          <i className="ph-fill ph-compass text-emerald-600 text-2xl" />
          <span>Guide Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiModal(true)}
            className="p-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-xl font-bold text-xs flex items-center gap-1"
          >
            <i className="ph-fill ph-sparkle text-emerald-500" /> AI Optimize
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xl font-bold"
          >
            <i className={`ph ${mobileMenuOpen ? 'ph-x' : 'ph-list'}`} />
          </button>
        </div>
      </div>

      {/* ── DESKTOP SIDEBAR / MOBILE DRAWER ── */}
      <aside className={`
        fixed md:sticky top-0 left-0 bottom-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between transition-transform duration-300
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div>
          <div className="hidden md:flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-emerald-600/20">
              <i className="ph-fill ph-compass" />
            </div>
            <div>
              <div className="font-black text-base text-slate-900 dark:text-white leading-none">Guide Portal</div>
              <div className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider mt-1">Verified Guide</div>
            </div>
          </div>

          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const active = activeTab === item.id;
              if (item.href) {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className="w-full px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-3 transition-all text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <i className={`ph ${item.icon} text-lg`} />
                    <span>{item.label}</span>
                  </a>
                );
              }
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-3 transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
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

        {/* Sidebar Footer: AI Assistant trigger */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <button
            onClick={() => setShowAiModal(true)}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-md"
          >
            <i className="ph-fill ph-sparkle text-base animate-pulse" />
            Optimize My Profile
          </button>
          <div className="text-[11px] text-slate-400 text-center font-semibold">
            Logged in as <span className="text-slate-700 dark:text-slate-200 font-bold">{user?.name || user?.email}</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full">

        {/* ── 1. DASHBOARD OVERVIEW ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="relative z-10 max-w-xl">
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase px-3 py-1 rounded-full">
                  Dashboard Overview
                </span>
                <h1 className="text-2xl sm:text-4xl font-black mt-3 mb-2">Welcome back, {user?.name?.split(' ')[0] || 'Guide'}!</h1>
                <p className="text-slate-300 text-xs sm:text-sm font-medium">Your tour business at a glance. Track bookings, payouts, and optimize your public profile.</p>
                
                <div className="flex flex-wrap gap-3 mt-6">
                  <button onClick={() => setActiveTab('my-profile')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all shadow">
                    View My Profile
                  </button>
                  <button onClick={() => setShowAiModal(true)} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs rounded-xl backdrop-blur-md transition-all flex items-center gap-1.5">
                    <i className="ph-fill ph-sparkle text-emerald-400" /> AI Optimize
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Average Rating</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{stats?.averageRating || 4.9}</div>
                <StarRow rating={stats?.averageRating || 4.9} size="sm" />
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Tours</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{bookings.length || 12}</div>
                <span className="text-[10px] font-extrabold text-emerald-600">Active Bookings</span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Available Payout</div>
                <div className="text-3xl font-black text-emerald-600">${(wallet?.available || 450).toFixed(2)}</div>
                <button onClick={() => setActiveTab('earnings')} className="text-[10px] font-bold text-emerald-600 underline">Request Payout</button>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Profile Complete</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{completenessScore}%</div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${completenessScore}%` }} />
                </div>
              </div>
            </div>

            {/* Recent Bookings & Reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Bookings</h3>
                  <button onClick={() => setActiveTab('bookings')} className="text-xs font-bold text-emerald-600 hover:underline">View All</button>
                </div>
                {bookings.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No recent bookings found.</p>
                ) : (
                  bookings.slice(0, 3).map(b => (
                    <div key={b.ref} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">{b.contact?.firstName} {b.contact?.lastName}</div>
                        <div className="text-[11px] text-slate-400">{b.startDate} · {b.guests} Guests</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${STATUS_BADGE[b.status?.toLowerCase()] || STATUS_BADGE.pending}`}>
                        {b.status || 'confirmed'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Traveler Reviews</h3>
                  <button onClick={() => setActiveTab('reviews')} className="text-xs font-bold text-emerald-600 hover:underline">View All</button>
                </div>
                {reviews.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No reviews yet.</p>
                ) : (
                  reviews.slice(0, 2).map(r => (
                    <div key={r.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{r.authorName}</span>
                        <StarRow rating={r.rating} size="sm" />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{r.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 2. MY PROFILE PAGE & COMPLETENESS ── */}
        {activeTab === 'my-profile' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">My Profile</h2>
                <p className="text-xs text-slate-500">Preview your public tour guide profile as travelers see it.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <i className="ph ph-eye text-base" /> Preview Profile
                </button>
                <a
                  href={`/tour-guides/${profile?.slug || 'miguel-santos'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <i className="ph ph-arrow-square-out text-base" /> View Public Profile
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/tour-guides/${profile?.slug || 'miguel-santos'}`);
                    alert('Profile link copied to clipboard!');
                  }}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <i className="ph ph-share-network text-base" /> Share Profile
                </button>
                <button
                  onClick={() => setActiveTab('edit-profile')}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  <i className="ph ph-pencil-line text-base" /> Edit Profile
                </button>
              </div>
            </div>

            {/* Profile Completeness Widget */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    Profile Completion: <span className="text-emerald-600">{completenessScore}%</span>
                  </h3>
                  <p className="text-xs text-slate-500">Complete missing items to boost your ranking in traveler search results.</p>
                </div>
                <div className="w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden shrink-0">
                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${completenessScore}%` }} />
                </div>
              </div>

              {missingItems.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Missing Items to Complete:</div>
                  <div className="flex flex-wrap gap-2">
                    {missingItems.map(item => (
                      <button
                        key={item}
                        onClick={() => setActiveTab('edit-profile')}
                        className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold hover:bg-amber-100 flex items-center gap-1.5"
                      >
                        <i className="ph ph-plus-circle text-amber-500" /> {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Verification Badge Status / Purchase Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-emerald-950 text-white rounded-3xl p-6 border border-slate-800 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl shrink-0">
                    <i className="ph-fill ph-seal-check" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black">Official Verification Badge</h3>
                      {profile?.verification_status === 'pending_admin' || profile?.verification_fee_paid ? (
                        <span className="bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full border border-amber-400/30">
                          Pending Admin Review ($50 Paid)
                        </span>
                      ) : profile?.verified ? (
                        <span className="bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                          Badge Active
                        </span>
                      ) : (
                        <span className="bg-slate-700 text-slate-300 font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                          $50 USD Fee
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {profile?.verified
                        ? "Your guide profile displays the official verified seal across all search results and guide listings."
                        : profile?.verification_status === 'pending_admin' || profile?.verification_fee_paid
                        ? "Your $50 USD payment has been received! BookingCart admins are reviewing your identity and credentials."
                        : "Get verified by BookingCart! Boost search visibility, earn traveler trust, and increase booking requests."}
                    </p>
                  </div>
                </div>

                {!profile?.verified && profile?.verification_status !== 'pending_admin' && !profile?.verification_fee_paid && (
                  <button
                    onClick={handlePayVerificationBadge}
                    className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 shrink-0"
                  >
                    <i className="ph-bold ph-seal-check text-base" /> Get Verified Badge ($50 USD)
                  </button>
                )}
              </div>
            </div>

            {/* Public Profile View Simulator Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-4">
                <img
                  src={profile?.step_personal?.photo || profile?.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'}
                  alt="Guide Profile"
                  className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-md"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">{profile?.name || user?.name || 'Miguel Santos'}</h3>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                      <i className="ph-fill ph-seal-check text-emerald-500 text-xs" /> Verified by Admin
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1">
                    {profile?.city || 'Kampala'}, {profile?.country || 'Uganda'} · {profile?.yearsExp || 7} Years Experience
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <StarRow rating={4.9} size="sm" />
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">4.9 (14 reviews)</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Biography</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                  {profile?.step_personal?.bio || profile?.bio || "Passionate safari and wildlife guide with over 7 years leading custom expeditions across Murchison Falls, Bwindi Impenetrable Forest, and Queen Elizabeth National Park."}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categories & Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {['Safari Guide', 'Wildlife Guide', 'Gorilla Trekking', 'First Aid', 'Photography'].map(s => (
                    <span key={s} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. EDIT PROFILE ── */}
        {activeTab === 'edit-profile' && (
          <GuideProfileEditor
            profile={profile}
            onSave={handleSaveProfileSection}
            onLogActivity={handleLogActivity}
          />
        )}

        {/* ── 4. CALENDAR ── */}
        {activeTab === 'calendar' && (
          <GuideCalendarManager
            availability={profile?.step_availability}
            onSave={handleSaveProfileSection}
            onLogActivity={handleLogActivity}
          />
        )}

        {/* ── 5. BOOKINGS ── */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Booking History</h2>
                <p className="text-xs text-slate-500">Track upcoming tours, completed trips, and traveler contact details.</p>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
                {['all', 'upcoming', 'completed', 'cancelled'].map(f => (
                  <button
                    key={f}
                    onClick={() => setBookingFilter(f)}
                    className={`px-3 py-1.5 rounded-xl capitalize transition-colors ${bookingFilter === f ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredBookings.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                  <i className="ph ph-calendar-blank text-4xl text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium">No bookings found for this filter.</p>
                </div>
              ) : (
                filteredBookings.map(b => {
                  const statusKey = (b.status || 'pending').toLowerCase();
                  return (
                    <div key={b.ref} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xl">
                          <i className="ph ph-user" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-base">{b.contact?.firstName} {b.contact?.lastName}</div>
                          <div className="text-xs text-slate-500">Ref: {b.ref} · {b.contactEmail || 'traveler@gmail.com'}</div>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600 dark:text-slate-400 font-semibold">
                            <span><i className="ph ph-calendar-blank text-emerald-500" /> {b.startDate} → {b.endDate}</span>
                            <span><i className="ph ph-users text-emerald-500" /> {b.guests || 2} Guests</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-3">
                        <div className="text-right">
                          <div className="font-black text-emerald-600 text-xl">${b.payment?.guideEarnings || (b.total * 0.85) || 120}</div>
                          <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-black capitalize border ${STATUS_BADGE[statusKey] || STATUS_BADGE.pending}`}>
                            {statusKey.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {statusKey === 'confirmed' && (
                          <button
                            onClick={() => handleMarkComplete(b.ref)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition-all shadow"
                          >
                            Mark Tour Complete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── 6. REVIEWS ── */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Review Management</h2>

            {/* Ratings Breakdown */}
            <div className="grid sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Knowledge</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">4.9</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Communication</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">4.8</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Punctuality</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">5.0</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Safety</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">4.9</div>
              </div>
            </div>

            <div className="space-y-4">
              {reviews.map(review => (
                <div key={review.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
                        {review.authorName[0]}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">{review.authorName}</div>
                        <div className="text-[11px] text-slate-400">{new Date(review.createdAt || Date.now()).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <StarRow rating={review.rating} />
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{review.text}</p>

                  {review.guideResponse ? (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                      <div className="font-bold text-emerald-600 mb-1">Your Response:</div>
                      <div className="text-slate-700 dark:text-slate-300">{review.guideResponse}</div>
                    </div>
                  ) : replyingTo === review.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Write your response to traveler..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setReplyingTo(null)} className="px-3 py-1.5 text-xs font-bold text-slate-400">Cancel</button>
                        <button onClick={() => handleReplySubmit(review.id)} className="px-4 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl">Post Reply</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setReplyingTo(review.id)} className="text-xs font-bold text-emerald-600 hover:underline">
                      Respond to review
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 7. EARNINGS ── */}
        {activeTab === 'earnings' && wallet && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Earnings & Wallet</h2>

            <div className="grid sm:grid-cols-4 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-6 rounded-3xl shadow-sm">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-2">Available Balance</div>
                <div className="text-4xl font-black text-emerald-600 mb-4">${wallet.available.toFixed(2)}</div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={wallet.available <= 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow transition-all"
                >
                  Request Payout
                </button>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-6 rounded-3xl shadow-sm">
                <div className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-2">Escrow Pending</div>
                <div className="text-4xl font-black text-amber-600">${wallet.pending.toFixed(2)}</div>
                <p className="text-[11px] text-amber-700/70 mt-2">Released 48h after tour completion.</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Withdrawn</div>
                <div className="text-4xl font-black text-slate-900 dark:text-white">${wallet.withdrawn.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Lifetime Earnings</div>
                <div className="text-4xl font-black text-slate-900 dark:text-white">${wallet.lifetime.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── 8. MESSAGES ── */}
        {activeTab === 'messages' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm text-center py-16">
            <i className="ph ph-chat-circle-dots text-4xl text-slate-300 mb-3" />
            <h3 className="font-black text-lg text-slate-900 dark:text-white">Traveler Inbox</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">Direct inquiries from travelers before booking appear here.</p>
          </div>
        )}

        {/* ── 9. ACTIVITY & APPROVALS ── */}
        {activeTab === 'activity' && (
          <GuideActivityLog logs={activityLogs} />
        )}

        {/* ── 10. SETTINGS ── */}
        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-6 max-w-2xl">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Account Settings</h2>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
              <input type="text" disabled value={user?.email || ''} className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Notification Preferences</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" defaultChecked className="rounded text-emerald-600" /> Email notification for new booking requests
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" defaultChecked className="rounded text-emerald-600" /> SMS notification for urgent traveler messages
                </label>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── MODALS ── */}
      <AiProfileAssistantModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        profile={profile}
        onApplySuggestion={(sugg) => handleLogActivity(`Applied AI Optimization: ${sugg.title}`, 'AI Assistant')}
      />

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative border border-slate-200 dark:border-slate-700">
            <button onClick={() => setShowWithdrawModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              &times;
            </button>
            <h3 className="font-black text-xl text-slate-900 dark:text-white mb-4">Request Payout</h3>

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Amount ($)</label>
                <input
                  type="number"
                  min="1"
                  max={wallet?.available || 1000}
                  step="0.01"
                  required
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Payout Method</label>
                <select
                  value={withdrawMethod}
                  onChange={e => setWithdrawMethod(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option>Bank Transfer</option>
                  <option>Mobile Money (MTN / Airtel)</option>
                  <option>PayPal</option>
                  <option>Wise</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={withdrawing}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl mt-2 transition-colors"
              >
                {withdrawing ? 'Processing...' : 'Confirm Withdrawal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MOBILE STICKY BOTTOM NAV ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-2 flex justify-around">
        {[
          { id: 'dashboard', label: 'Home', icon: 'ph-squares-four' },
          { id: 'my-profile', label: 'Profile', icon: 'ph-user-square' },
          { id: 'calendar', label: 'Calendar', icon: 'ph-calendar-blank' },
          { id: 'bookings', label: 'Bookings', icon: 'ph-receipt' },
          { id: 'earnings', label: 'Earnings', icon: 'ph-wallet' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-extrabold ${activeTab === item.id ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <i className={`ph ${item.icon} text-lg`} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
