import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { HeaderUserAvatarImg } from './HeaderUserAvatarImg.jsx';

const BTN_CLASS =
  'w-11 h-11 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm hover:border-green-500 transition-all focus:ring-2 focus:ring-green-500 outline-none';

/**
 * Legacy-aligned header profile control: avatar + dropdown (My Account, Bookings & Trips, Sign Out).
 * Uses data-profile-dropdown / data-header-profile-btn / data-profile-menu for public/js/auth.js (applyAuthUI).
 * React handles open state + sign-out so it works across SPA navigations (bookingcart initProfileDropdown only binds once).
 */
export function HeaderProfileDropdown({ triggerClassName = BTN_CLASS }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { user, logout } = useAuth();

  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const isAdmin = user && adminEmails.includes(user.email?.toLowerCase());
  const isGuide = !!user && (user.isGuide || user.role === 'guide' || user.role === 'guide_applicant' || !!user.guideId || !!user.guideProfileId);
  const [hasUserAttractions, setHasUserAttractions] = useState(() => localStorage.getItem('bc_has_attractions') === 'true');
  const [hasUserAircrafts, setHasUserAircrafts] = useState(() => localStorage.getItem('bc_is_operator') === 'true');
  const [hasUserHotel, setHasUserHotel] = useState(() => localStorage.getItem('bc_is_hotel_owner') === 'true' || !!localStorage.getItem('bc_hotel_profile_id'));

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('bookingcart_google_id_token') || localStorage.getItem('bookingcart_jwt_token') || localStorage.getItem('bc_jwt') || localStorage.getItem('bc_hotel_token') || '';
    if (!token) return;

    Promise.all([
      fetch('/api/attraction-profiles?limit=1', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      fetch('/api/event-profiles', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      fetch('/api/aviation?action=operator-get', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      fetch('/api/hotel-profiles', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}))
    ]).then(([attrRes, evRes, avRes, hotelRes]) => {
      const hasAttr = (attrRes.ok && Array.isArray(attrRes.attractions) && attrRes.attractions.length > 0) || (evRes.ok && !!evRes.profile);
      if (hasAttr) {
        setHasUserAttractions(true);
        localStorage.setItem('bc_has_attractions', 'true');
      }
      if (avRes.ok && avRes.portal?.operator) {
        setHasUserAircrafts(true);
        localStorage.setItem('bc_is_operator', 'true');
      }
      if (hotelRes.ok && (hotelRes.profile || (Array.isArray(hotelRes.profiles) && hotelRes.profiles.length > 0))) {
        setHasUserHotel(true);
        localStorage.setItem('bc_is_hotel_owner', 'true');
      }
    });
  }, [user]);

  const isHotelOwner = !!user && (
    user.role === 'hotel_owner' ||
    user.role === 'property_owner' ||
    user.role === 'hotel' ||
    isAdmin ||
    !!user.isHotelOwner ||
    !!user.isPropertyOwner ||
    !!user.hotelProfileId ||
    hasUserHotel ||
    !!localStorage.getItem('bc_hotel_profile_id') ||
    localStorage.getItem('bc_is_hotel_owner') === 'true'
  );

  const isAttractionOwner = !!user && (
    user.role === 'event_organizer' ||
    user.role === 'attraction_host' ||
    user.role === 'attraction_owner' ||
    user.role === 'organizer' ||
    user.role === 'host' ||
    isAdmin ||
    !!user.isEventOrganizer ||
    !!user.isAttractionHost ||
    !!user.hasAttractions ||
    !!user.eventProfileId ||
    hasUserAttractions ||
    !!localStorage.getItem('bc_event_profile_id')
  );

  const isAviationOperator = !!user && (
    user.isOperator ||
    user.role === 'operator' ||
    isAdmin ||
    hasUserAircrafts
  );

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current || rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const signOut = useCallback(async () => {
    setOpen(false);
    await logout();
  }, [logout]);

  return (
    <div className="relative" data-profile-dropdown ref={rootRef}>
      <button
        type="button"
        className="group flex items-center gap-3 pl-1 pr-4 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-green-200 dark:hover:border-green-500/50 rounded-full shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-green-100/50"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-300 p-[2px] shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-300">
          <div className="w-full h-full bg-white dark:bg-slate-800 rounded-full overflow-hidden border-[1.5px] border-white dark:border-slate-800">
            <HeaderUserAvatarImg className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="flex flex-col items-start justify-center pr-1 h-full pt-0.5">
          <span data-profile-name-label className="text-[13px] font-extrabold text-slate-800 dark:text-slate-200 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors leading-none tracking-tight">
            {user?.name || user?.email?.split('@')[0] || 'User'}
          </span>
          <div className="flex items-center gap-1 mt-1 bg-green-50 dark:bg-green-900/40 px-1.5 py-0.5 rounded-md border border-green-100 dark:border-green-800">
            <i className="ph-fill ph-seal-check text-green-500 text-[10px]"></i>
            <span className="text-[9px] font-bold uppercase tracking-widest text-green-700 dark:text-green-400 leading-none mt-[1px]">
              {isGuide ? 'Tour Guide' : 'Genius Lvl 1'}
            </span>
          </div>
        </div>
        <i className="ph-bold ph-caret-down text-slate-300 text-xs ml-1 group-hover:text-green-600 transition-colors duration-300 translate-y-[1px]"></i>
      </button>
      <div
        data-profile-menu
        role="menu"
        className={`absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-100 dark:ring-slate-700 py-2 z-50 transition-colors duration-200${open ? '' : ' hidden'}`}
      >
        {isGuide && (
          <a
            href="/guide-dashboard"
            role="menuitem"
            className="flex items-center justify-between px-5 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 border-b border-emerald-100 dark:border-emerald-800/40 transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <i className="ph ph-squares-four text-xl text-emerald-600"></i> Guide Dashboard
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100 rounded">Guide</span>
          </a>
        )}
        <a
          href="/account-settings"
          role="menuitem"
          className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="ph ph-user-circle text-xl text-slate-400"></i> Member Account
        </a>
        {isAdmin && (
          <a
            href="/admin"
            role="menuitem"
            className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <i className="ph ph-shield-check text-xl text-teal-600"></i> Admin Dashboard
          </a>
        )}
        <a
          href="/my-bookings"
          role="menuitem"
          className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="ph ph-suitcase-rolling text-xl text-slate-400"></i> Bookings & Trips
        </a>
        {isHotelOwner && (
          <a
            href="/hotel-dashboard"
            role="menuitem"
            className="flex items-center justify-between px-5 py-3 text-sm font-bold text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/70 border-b border-blue-100 dark:border-blue-800/40 transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <i className="ph ph-buildings text-xl text-blue-600"></i> Property Portal (Hotel & PMS)
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100 rounded">Stays</span>
          </a>
        )}
        {isAttractionOwner && (
          <a
            href="/attraction-dashboard"
            role="menuitem"
            className="flex items-center justify-between px-5 py-3 text-sm font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/70 border-b border-amber-100 dark:border-amber-800/40 transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <i className="ph ph-ticket text-xl text-amber-600"></i> Attraction Dashboard
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100 rounded">Host</span>
          </a>
        )}
        {isAviationOperator && (
          <a
            href="/aviation/dashboard"
            role="menuitem"
            className="flex items-center justify-between px-5 py-3 text-sm font-bold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/70 border-b border-sky-100 dark:border-sky-800/40 transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="flex items-center gap-2.5">
              <i className="ph ph-airplane-tilt text-xl text-sky-600"></i> Operator Portal
            </span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100 rounded">Aviation</span>
          </a>
        )}
        <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
        <button
          type="button"
          role="menuitem"
          data-signout
          className="w-full flex items-center gap-3 px-5 py-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-left"
          onClick={(e) => {
            e.preventDefault();
            setOpen(false);
            signOut();
          }}
        >
          <i className="ph ph-sign-out text-xl"></i> Sign Out
        </button>
      </div>
    </div>
  );
}
