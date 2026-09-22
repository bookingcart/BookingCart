import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const API = '/api/notifications';

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_CONFIG = {
  BOOKING_REQUESTED: { icon: 'ph-calendar-plus', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  BOOKING_ACCEPTED:  { icon: 'ph-check-circle',  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  BOOKING_REJECTED:  { icon: 'ph-x-circle',      color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/40' },
  BOOKING_CANCELLED: { icon: 'ph-prohibit',       color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/40' },
  BOOKING_UPDATED:   { icon: 'ph-pencil',         color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/40' },
  PAYMENT_COMPLETED: { icon: 'ph-credit-card',    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  TOUR_REMINDER_24H: { icon: 'ph-alarm',          color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  TOUR_REMINDER_2H:  { icon: 'ph-clock-countdown',color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  TOUR_COMPLETED:    { icon: 'ph-star',           color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-50 dark:bg-purple-950/40' },
  PAYOUT_PROCESSED:  { icon: 'ph-money',          color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  REVIEW_RECEIVED:   { icon: 'ph-chat-circle-dots',color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  VERIFICATION_STATUS_CHANGED: { icon: 'ph-shield-check', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { icon: 'ph-bell', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' };
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [animateBell, setAnimateBell] = useState(false);
  const dropdownRef = useRef(null);
  const sseRef = useRef(null);

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
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [recipientId, recipientRole]);

  // Connect SSE for real-time push
  useEffect(() => {
    fetchNotifications();

    const evtSource = new EventSource(
      `/api/notifications/stream?recipientId=${encodeURIComponent(recipientId)}&role=${recipientRole}`
    );
    sseRef.current = evtSource;

    evtSource.onmessage = (e) => {
      try {
        const notif = JSON.parse(e.data);
        if (notif.type === 'CONNECTED') return;
        setNotifications((prev) => [notif, ...prev].slice(0, 50));
        setUnread((n) => n + 1);
        // Ring the bell animation
        setAnimateBell(true);
        setTimeout(() => setAnimateBell(false), 1000);
      } catch {}
    };

    evtSource.onerror = () => {
      evtSource.close();
    };

    return () => {
      evtSource.close();
    };
  }, [recipientId, recipientRole, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markRead = async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
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

  const handleNotifClick = (notif) => {
    if (!notif.read) markRead(notif.id);
    if (notif.actionUrl && notif.actionUrl !== '#') {
      window.location.href = notif.actionUrl;
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200
          ${open
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
          }`}
      >
        <i
          className={`ph ph-bell text-lg transition-transform duration-300 ${animateBell ? 'animate-[swing_0.5s_ease-in-out]' : ''}`}
          style={animateBell ? { transformOrigin: 'top center' } : {}}
        />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-extrabold text-white shadow-sm shadow-emerald-500/40 ring-2 ring-white dark:ring-slate-950 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          id="notification-dropdown"
          className="absolute right-0 top-12 z-[200] w-[380px] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950 overflow-hidden animate-[fadeSlideDown_0.18s_ease-out]"
          style={{ transformOrigin: 'top right' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <i className="ph ph-bell text-emerald-600 text-lg" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
              {unread > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-1.5">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <a
                href="/notifications"
                className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:underline"
              >
                See all
              </a>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <i className="ph ph-bell-slash text-2xl text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">You're all caught up!</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {notifications.map((notif) => {
                  const cfg = getTypeConfig(notif.type);
                  return (
                    <li key={notif.id}>
                      <button
                        type="button"
                        onClick={() => handleNotifClick(notif)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ${!notif.read ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}
                      >
                        {/* Icon */}
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                          <i className={`ph ${cfg.icon} text-base ${cfg.color}`} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-semibold leading-tight ${notif.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                              {notif.title}
                            </p>
                            <time className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {timeAgo(notif.createdAt)}
                            </time>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                            {notif.message}
                          </p>
                        </div>

                        {/* Unread dot */}
                        {!notif.read && (
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <a
              href="/notifications"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
            >
              <i className="ph ph-list-bullets text-sm" />
              View all notifications
            </a>
          </div>
        </div>
      )}

      <style>{`
        @keyframes swing {
          0%,100% { transform: rotate(0deg); }
          25% { transform: rotate(-18deg); }
          75% { transform: rotate(18deg); }
        }
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
