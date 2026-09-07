import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function StarRow({ rating, size = 'md' }) {
  const full = Math.floor(rating);
  const hasHalf = (rating % 1) >= 0.5;
  const sz = size === 'lg' ? 'text-lg' : 'text-sm';
  return (
    <div className={`flex items-center gap-0.5 ${sz}`}>
      {Array.from({ length: full }).map((_, i) => <i key={i} className="ph-fill ph-star text-amber-400" />)}
      {hasHalf && <i className="ph-fill ph-star-half text-amber-400" />}
      {Array.from({ length: 5 - full - (hasHalf ? 1 : 0) }).map((_, i) => <i key={`e${i}`} className="ph ph-star text-slate-300 dark:text-slate-600" />)}
    </div>
  );
}

const STATUS_BADGE = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  pending: 'bg-amber-100 text-amber-700',
  pending_traveler_confirmation: 'bg-blue-100 text-blue-700',
  completed: 'bg-purple-100 text-purple-700'
};

export default function GuideDashboardPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');

  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  
  const [bookings, setBookings] = useState([]);
  const [wallet, setWallet] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('Bank Transfer');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    document.title = 'Guide Dashboard | BookingCart';
    if (!user) {
      navigate('/auth?redirect=/guide-dashboard');
      return;
    }
    const guideId = user.guideId || user.id;

    async function loadAll() {
      try {
        // Load Reviews & Stats
        const resR = await fetch('/api/guide-reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'guide-dashboard', guideId })
        });
        const dataR = await resR.json();
        if (dataR.ok) {
          setReviews(dataR.reviews || []);
          setStats(dataR.stats || { total: 0, averageRating: 0, topTags: [] });
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

      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [user, navigate]);

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
      } else {
        alert(data.error || 'Failed to post reply.');
      }
    } catch {
      alert('Network error.');
    }
  };

  const handleMarkComplete = async (ref) => {
    if (!window.confirm('Mark this tour as completed? This will ask the traveler to confirm before releasing your payment.')) return;
    try {
      const res = await fetch('/api/guide-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-complete', ref })
      });
      const data = await res.json();
      if (data.ok) {
        setBookings(prev => prev.map(b => b.ref === ref ? { ...b, status: 'pending_traveler_confirmation' } : b));
        alert('Tour marked as complete. Awaiting traveler confirmation.');
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
    if (!amt || amt <= 0 || amt > wallet.available) return alert('Invalid amount');
    setWithdrawing(true);
    try {
      const res = await fetch('/api/guide-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-withdrawal', guideId: user.guideId || user.id, amount: amt, method: withdrawMethod })
      });
      const data = await res.json();
      if (data.ok) {
        alert('Withdrawal requested successfully!');
        setWallet(prev => ({ ...prev, available: prev.available - amt, withdrawn: prev.withdrawn + amt }));
        setShowWithdrawModal(false);
        setWithdrawAmount('');
      } else {
        alert(data.error || 'Failed to withdraw.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><i className="ph ph-spinner-gap text-4xl text-green-600 animate-spin" /></div>;
  if (error) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 text-center text-red-500 font-bold">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Guide Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">Manage your reviews, track your ratings, and respond to travelers.</p>

        {/* ── Tabs ── */}
        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 mb-8">
          {['overview', 'bookings', 'wallet'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-2 text-sm font-bold capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div>
            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Average Rating</h3>
                <div className="text-5xl font-black text-slate-900 dark:text-white mb-2">{stats.averageRating}</div>
                <StarRow rating={parseFloat(stats.averageRating)} size="lg" />
              </div>
              
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center justify-center">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Reviews</h3>
                <div className="text-5xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</div>
                <p className="text-sm font-semibold text-green-600">Great job!</p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center justify-center">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Top Tags</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {stats.topTags.length > 0 ? stats.topTags.map(tag => (
                    <span key={tag} className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      {tag}
                    </span>
                  )) : <span className="text-slate-400">No tags yet</span>}
                </div>
              </div>
            </div>

            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Recent Reviews</h2>
            
            {reviews.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <i className="ph ph-chat-circle text-4xl text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium">You don't have any reviews yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {reviews.map(review => (
                  <div key={review.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full flex items-center justify-center font-bold text-lg">
                          {review.authorName[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white">{review.authorName}</h4>
                          <p className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString()} · {review.travelerType || 'Traveler'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-end gap-2">
                        <StarRow rating={review.rating} />
                        {review.recommendation === 'Yes' && <span className="text-xs font-bold text-green-600"><i className="ph-fill ph-thumbs-up" /> Recommends</span>}
                      </div>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line mb-4">
                      {review.text}
                    </p>

                    {review.tags && review.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {review.tags.map(t => <span key={t} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold px-2 py-1 rounded-lg">{t}</span>)}
                      </div>
                    )}
                    
                    {review.photos && review.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
                        {review.photos.map((p, i) => (
                          <img key={i} src={p} alt="" className="h-20 w-20 object-cover rounded-xl flex-shrink-0" />
                        ))}
                      </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                      {review.guideResponse ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Response</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{review.guideResponse}</p>
                        </div>
                      ) : replyingTo === review.id ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Thank the traveler for their feedback..."
                            className="w-full h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3 resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setReplyingTo(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                            <button onClick={() => handleReplySubmit(review.id)} className="bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Post Reply</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReplyingTo(review.id)} className="text-sm font-bold text-green-600 hover:text-green-700 flex items-center gap-1">
                          <i className="ph ph-arrow-u-down-left" /> Respond to review
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── BOOKINGS TAB ── */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            {bookings.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <i className="ph ph-calendar-blank text-4xl text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium">No bookings yet.</p>
              </div>
            ) : (
              bookings.map(b => {
                const statusKey = (b.status || 'pending').toLowerCase();
                const pastEnd = new Date(b.endDate) <= new Date(); // roughly checking if tour ended
                const canMarkComplete = statusKey === 'confirmed' && pastEnd;

                return (
                  <div key={b.ref} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xl text-slate-700 dark:text-slate-300">
                        <i className="ph ph-user" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-base">{b.contact?.firstName} {b.contact?.lastName}</div>
                        <div className="text-xs text-slate-500">Ref: {b.ref} · {b.contactEmail}</div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <span><i className="ph ph-calendar-blank" /> {b.startDate} → {b.endDate}</span>
                          <span><i className="ph ph-users" /> {b.guests} Guests</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-3">
                      <div className="text-right">
                        <div className="font-black text-green-600 text-lg">${b.payment?.guideEarnings || (b.total * 0.85)}</div>
                        <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGE[statusKey] || STATUS_BADGE.pending}`}>
                          {statusKey.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {canMarkComplete && (
                        <button 
                          onClick={() => handleMarkComplete(b.ref)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
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
        )}

        {/* ── WALLET TAB ── */}
        {activeTab === 'wallet' && wallet && (
          <div>
            <div className="grid sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-3xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-green-800 dark:text-green-400 uppercase tracking-wider mb-2">Available to Withdraw</h3>
                <div className="text-4xl font-black text-green-600 mb-1">${wallet.available.toFixed(2)}</div>
                <button 
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={wallet.available <= 0}
                  className="mt-3 w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                >
                  Request Payout
                </button>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-2">Pending Escrow</h3>
                <div className="text-4xl font-black text-amber-600 mb-1">${wallet.pending.toFixed(2)}</div>
                <p className="text-[10px] text-amber-700/70 font-semibold leading-tight mt-1">Funds from active bookings. Released 48h after tour completion.</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Withdrawn</h3>
                <div className="text-4xl font-black text-slate-900 dark:text-white">${wallet.withdrawn.toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lifetime Earnings</h3>
                <div className="text-4xl font-black text-slate-900 dark:text-white">${wallet.lifetime.toFixed(2)}</div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 flex items-start gap-4">
              <i className="ph-fill ph-info text-blue-600 text-2xl" />
              <div>
                <h4 className="font-bold text-blue-900 dark:text-blue-300">How you get paid</h4>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">
                  Travelers pay BookingCart when they book. The funds are held in escrow. Once you mark a tour as complete (and the traveler confirms), the funds move to your <strong>Available Balance</strong>. Payouts are processed every Friday for available balances.
                </p>
              </div>
            </div>

            {/* WITHDRAW MODAL */}
            {showWithdrawModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative border border-slate-200 dark:border-slate-700">
                  <button onClick={() => setShowWithdrawModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <i className="ph ph-x text-xl" />
                  </button>
                  <h3 className="font-black text-xl text-slate-900 dark:text-white mb-4">Request Payout</h3>
                  
                  <form onSubmit={handleWithdraw} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Amount (Available: ${wallet.available.toFixed(2)})</label>
                      <input 
                        type="number" 
                        min="1" 
                        max={wallet.available} 
                        step="0.01"
                        required
                        value={withdrawAmount} 
                        onChange={e => setWithdrawAmount(e.target.value)} 
                        placeholder="0.00"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Payout Method</label>
                      <select 
                        value={withdrawMethod} 
                        onChange={e => setWithdrawMethod(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-green-500" 
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
                      className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl mt-2 transition-colors"
                    >
                      {withdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
