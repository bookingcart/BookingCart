import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const API = '/api/notifications';

const FILTER_OPTIONS = [
  { id: 'all',      label: 'All',       icon: 'ph-list-bullets' },
  { id: 'unread',   label: 'Unread',    icon: 'ph-circle-dashed' },
  { id: 'bookings', label: 'Bookings',  icon: 'ph-calendar' },
  { id: 'payments', label: 'Payments',  icon: 'ph-credit-card' },
  { id: 'reviews',  label: 'Reviews',   icon: 'ph-star' },
  { id: 'tours',    label: 'Tours',     icon: 'ph-map-pin' },
];

const TYPE_CATEGORIES = {
  bookings: ['BOOKING_REQUESTED','BOOKING_ACCEPTED','BOOKING_REJECTED','BOOKING_CANCELLED','BOOKING_UPDATED'],
  payments: ['PAYMENT_COMPLETED','PAYOUT_PROCESSED'],
  reviews:  ['REVIEW_RECEIVED'],
  tours:    ['TOUR_REMINDER_24H','TOUR_REMINDER_2H','TOUR_COMPLETED'],
};

const TYPE_CONFIG = {
  BOOKING_REQUESTED: { icon: 'ph-calendar-plus', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', label: 'New Booking' },
  BOOKING_ACCEPTED:  { icon: 'ph-check-circle',  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', label: 'Accepted' },
  BOOKING_REJECTED:  { icon: 'ph-x-circle',      color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/40', label: 'Declined' },
  BOOKING_CANCELLED: { icon: 'ph-prohibit',       color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/40', label: 'Cancelled' },
  BOOKING_UPDATED:   { icon: 'ph-pencil',         color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/40', label: 'Updated' },
  PAYMENT_COMPLETED: { icon: 'ph-credit-card',    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', label: 'Payment' },
  TOUR_REMINDER_24H: { icon: 'ph-alarm',          color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', label: 'Reminder' },
  TOUR_REMINDER_2H:  { icon: 'ph-clock-countdown',color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', label: 'Reminder' },
  TOUR_COMPLETED:    { icon: 'ph-star',           color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-50 dark:bg-purple-950/40', label: 'Completed' },
  PAYOUT_PROCESSED:  { icon: 'ph-money',          color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', label: 'Payout' },
  REVIEW_RECEIVED:   { icon: 'ph-chat-circle-dots',color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', label: 'Review' },
  VERIFICATION_STATUS_CHANGED: { icon: 'ph-shield-check', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', label: 'Verified' },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { icon: 'ph-bell', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', label: 'Notification' };
}

function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Preference toggle component
function PreferenceCard({ icon, title, description, checked, onChange }) {
  return (
    <label className="flex items-center gap-4 cursor-pointer group">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${checked ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-slate-100 dark:bg-slate-800'}`}>
        <i className={`ph ${icon} text-lg ${checked ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative shrink-0 h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900
          ${checked ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState({
    inApp: true,
    email: true,
    whatsapp: false,
    sms: false,
    types: {
      bookingUpdates: true,
      reminders: true,
      reviews: true,
      payouts: true,
      marketing: false
    }
  });
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' | 'preferences'

  const recipientId = user?.id || user?.email || 'guide-1';
  const recipientRole = user?.role === 'admin' ? 'admin' : (user?.role || 'guide');

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}?recipientId=${encodeURIComponent(recipientId)}&role=${recipientRole}`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnread(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Fetch notifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [recipientId, recipientRole]);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch(`${API}/preferences?recipientId=${encodeURIComponent(recipientId)}`);
      const data = await res.json();
      if (data.success && data.preferences) {
        setPreferences(data.preferences);
      }
    } catch {}
  }, [recipientId]);

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();
  }, [fetchNotifications, fetchPreferences]);

  const markRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await fetch(`${API}/${id}/read`, { method: 'PUT' });
    } catch {}
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await fetch(`${API}/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, recipientRole })
      });
    } catch {}
  };

  const savePreferences = async () => {
    setPrefSaving(true);
    try {
      await fetch(`${API}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, preferences })
      });
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 3000);
    } catch {}
    setPrefSaving(false);
  };

  const toggleChannelPref = (channel) => {
    setPreferences((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  const toggleTypePref = (type) => {
    setPreferences((prev) => ({
      ...prev,
      types: { ...prev.types, [type]: !prev.types[type] }
    }));
  };

  // Filter logic
  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter in TYPE_CATEGORIES) return TYPE_CATEGORIES[filter].includes(n.type);
    return true;
  });

  const grouped = filtered.reduce((acc, n) => {
    const date = new Date(n.createdAt);
    const now = new Date();
    let group;
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) group = 'Today';
    else if (diffDays === 1) group = 'Yesterday';
    else if (diffDays < 7) group = 'This Week';
    else group = 'Earlier';

    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];

  return (
    <>
      <BookingCartNavbar />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Page Header */}
        <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Notifications
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Stay up to date on your bookings, payments, and tours
                </p>
              </div>
              {unread > 0 && activeTab === 'notifications' && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
                >
                  <i className="ph ph-checks text-base" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-1 border-b border-slate-200 dark:border-slate-800 -mb-px">
              {[
                { id: 'notifications', label: 'Notifications', icon: 'ph-bell' },
                { id: 'preferences',   label: 'Preferences',   icon: 'ph-sliders-horizontal' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px
                    ${activeTab === tab.id
                      ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  <i className={`ph ${tab.icon}`} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
          {/* ── NOTIFICATIONS TAB ── */}
          {activeTab === 'notifications' && (
            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              {/* Filter Sidebar */}
              <aside className="w-full lg:w-48 shrink-0">
                <nav className="flex flex-row gap-1 lg:flex-col overflow-x-auto pb-2 lg:pb-0">
                  {FILTER_OPTIONS.map((opt) => {
                    const count = opt.id === 'all'
                      ? notifications.length
                      : opt.id === 'unread'
                        ? notifications.filter((n) => !n.read).length
                        : opt.id in TYPE_CATEGORIES
                          ? notifications.filter((n) => TYPE_CATEGORIES[opt.id].includes(n.type)).length
                          : 0;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => setFilter(opt.id)}
                        className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors text-left whitespace-nowrap
                          ${filter === opt.id
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'}`}
                      >
                        <i className={`ph ${opt.icon} text-base`} />
                        <span className="flex-1">{opt.label}</span>
                        {count > 0 && (
                          <span className={`text-[10px] font-extrabold min-w-[18px] h-4.5 flex items-center justify-center rounded-full px-1
                            ${filter === opt.id ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </aside>

              {/* Notifications List */}
              <div className="flex-1 min-w-0">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="h-7 w-7 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                      <i className="ph ph-bell-slash text-3xl text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                        {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                      </p>
                      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                        {filter === 'unread' ? "You're all caught up!" : `No ${filter} notifications yet.`}
                      </p>
                    </div>
                    {filter !== 'all' && (
                      <button
                        onClick={() => setFilter('all')}
                        className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View all notifications
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupOrder.filter((g) => grouped[g]).map((group) => (
                      <div key={group}>
                        <div className="mb-3 flex items-center gap-3">
                          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            {group}
                          </h2>
                          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                          {grouped[group].map((notif) => {
                            const cfg = getTypeConfig(notif.type);
                            return (
                              <div
                                key={notif.id}
                                className={`flex items-start gap-4 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${!notif.read ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}`}
                                onClick={() => {
                                  if (!notif.read) markRead(notif.id);
                                  if (notif.actionUrl && notif.actionUrl !== '#') window.location.href = notif.actionUrl;
                                }}
                              >
                                {/* Icon */}
                                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                                  <i className={`ph ${cfg.icon} text-lg ${cfg.color}`} />
                                </div>

                                {/* Body */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-sm font-semibold ${notif.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                                        {notif.title}
                                      </span>
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                                        {cfg.label}
                                      </span>
                                    </div>
                                    <time className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                                      {formatDateTime(notif.createdAt)}
                                    </time>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {notif.message}
                                  </p>
                                  {notif.actionUrl && notif.actionUrl !== '#' && (
                                    <div className="mt-2">
                                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                                        View details →
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Unread dot */}
                                {!notif.read && (
                                  <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PREFERENCES TAB ── */}
          {activeTab === 'preferences' && (
            <div className="max-w-2xl space-y-8">
              {/* Channel Preferences */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Notification Channels</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose how you want to receive notifications</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 px-6">
                  <div className="py-4">
                    <PreferenceCard
                      icon="ph-bell"
                      title="In-App Notifications"
                      description="Receive notifications directly inside BookingCart"
                      checked={preferences.inApp}
                      onChange={() => toggleChannelPref('inApp')}
                    />
                  </div>
                  <div className="py-4">
                    <PreferenceCard
                      icon="ph-envelope"
                      title="Email Notifications"
                      description="Receive booking updates and reminders via email"
                      checked={preferences.email}
                      onChange={() => toggleChannelPref('email')}
                    />
                  </div>
                  <div className="py-4">
                    <PreferenceCard
                      icon="ph-whatsapp-logo"
                      title="WhatsApp Messages"
                      description="Get instant alerts via WhatsApp (requires phone verification)"
                      checked={preferences.whatsapp}
                      onChange={() => toggleChannelPref('whatsapp')}
                    />
                  </div>
                  <div className="py-4">
                    <PreferenceCard
                      icon="ph-device-mobile"
                      title="SMS Notifications"
                      description="Receive critical alerts via SMS text message"
                      checked={preferences.sms}
                      onChange={() => toggleChannelPref('sms')}
                    />
                  </div>
                </div>
              </div>

              {/* Notification Types */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Notification Types</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Control which events trigger notifications</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 px-6">
                  {[
                    { key: 'bookingUpdates', icon: 'ph-calendar-check', title: 'Booking Updates', desc: 'New bookings, acceptances, cancellations' },
                    { key: 'reminders',      icon: 'ph-alarm',          title: 'Tour Reminders',  desc: '24h and 2h reminders before your tour' },
                    { key: 'reviews',        icon: 'ph-star',           title: 'Reviews',         desc: 'When travelers leave a review' },
                    { key: 'payouts',        icon: 'ph-money',          title: 'Payouts & Earnings', desc: 'Payment completions and escrow releases' },
                    { key: 'marketing',      icon: 'ph-megaphone',      title: 'Tips & Promotions', desc: 'Platform tips and promotional content' },
                  ].map(({ key, icon, title, desc }) => (
                    <div key={key} className="py-4">
                      <PreferenceCard
                        icon={icon}
                        title={title}
                        description={desc}
                        checked={preferences.types?.[key] ?? true}
                        onChange={() => toggleTypePref(key)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={savePreferences}
                  disabled={prefSaving}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 shadow-lg shadow-emerald-600/20"
                >
                  {prefSaving ? (
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <i className="ph ph-floppy-disk text-base" />
                  )}
                  {prefSaving ? 'Saving…' : 'Save Preferences'}
                </button>
                {prefSaved && (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <i className="ph ph-check-circle text-base" />
                    Saved!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
