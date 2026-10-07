import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { HeaderUserAvatarImg } from './HeaderUserAvatarImg.jsx';

const BTN_CLASS =
  'w-11 h-11 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm hover:border-green-500 transition-all focus:ring-2 focus:ring-green-500 outline-none';

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

  const hasAnyPortal = isHotelOwner || isGuide || isAttractionOwner || isAviationOperator || isAdmin;

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

  const primaryRoleLabel = isHotelOwner ? 'Property Owner' : isGuide ? 'Tour Guide' : isAttractionOwner ? 'Event Host' : isAviationOperator ? 'Aircraft Operator' : isAdmin ? 'Admin' : 'Genius Lvl 1';

  return (
    <div className="relative" data-profile-dropdown ref={rootRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className="group flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 rounded-full shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-300">
          <div className="w-full h-full bg-white dark:bg-slate-900 rounded-full overflow-hidden border border-white dark:border-slate-900">
            <HeaderUserAvatarImg className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="flex flex-col items-start justify-center pr-0.5 text-left">
          <span data-profile-name-label className="text-[13px] font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-none tracking-tight">
            {user?.name || user?.email?.split('@')[0] || 'User'}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-none mt-1">
            {primaryRoleLabel}
          </span>
        </div>

        <i className={`ph-bold ph-caret-down text-slate-400 text-xs ml-0.5 transition-transform duration-300 ${open ? 'rotate-180 text-emerald-500' : 'group-hover:text-slate-600'}`} />
      </button>

      {/* Dropdown Menu Box */}
      <div
        data-profile-menu
        role="menu"
        className={`
          absolute right-0 top-full mt-2 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl ring-1 ring-slate-900/5 dark:ring-slate-800 p-2 z-50 transition-all duration-200
          ${open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none hidden'}
        `}
      >
        {/* User Identity Header Card */}
        <div className="px-3 py-3 mb-1 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-base flex items-center justify-center shrink-0 shadow-sm">
            {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.name || 'My Account'}</div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email}</div>
          </div>
        </div>

        {/* Core Member Links */}
        <div className="space-y-0.5 py-1">
          <a
            href="/account-settings"
            role="menuitem"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
              <i className="ph ph-user text-base" />
            </div>
            <span>Member Account</span>
          </a>

          <a
            href="/my-bookings"
            role="menuitem"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setOpen(false)}
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
              <i className="ph ph-suitcase-rolling text-base" />
            </div>
            <span>Bookings & Trips</span>
          </a>
        </div>

        {/* Portals & Management Section */}
        {hasAnyPortal && (
          <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-0.5">
            <div className="px-3 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Management Portals
            </div>

            {isHotelOwner && (
              <a
                href="/hotel-dashboard"
                role="menuitem"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 group transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <i className="ph-fill ph-buildings text-base" />
                  </div>
                  <span>Property & PMS Portal</span>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Stays
                </span>
              </a>
            )}

            {isGuide && (
              <a
                href="/guide-dashboard"
                role="menuitem"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 group transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <i className="ph-fill ph-compass text-base" />
                  </div>
                  <span>Tour Guide Dashboard</span>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Guide
                </span>
              </a>
            )}

            {isAttractionOwner && (
              <a
                href="/attraction-dashboard"
                role="menuitem"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-amber-50/70 dark:hover:bg-amber-950/40 group transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <i className="ph-fill ph-ticket text-base" />
                  </div>
                  <span>Attraction Host Portal</span>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Events
                </span>
              </a>
            )}

            {isAviationOperator && (
              <a
                href="/aviation/dashboard"
                role="menuitem"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-sky-50/70 dark:hover:bg-sky-950/40 group transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <i className="ph-fill ph-airplane-tilt text-base" />
                  </div>
                  <span>Aviation Operator Portal</span>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  Aviation
                </span>
              </a>
            )}

            {isAdmin && (
              <a
                href="/admin"
                role="menuitem"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-purple-50/70 dark:hover:bg-purple-950/40 group transition-colors"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <i className="ph-fill ph-shield-check text-base" />
                  </div>
                  <span>Admin Control Center</span>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Admin
                </span>
              </a>
            )}
          </div>
        )}

        {/* Sign Out Divider & Button */}
        <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            role="menuitem"
            data-signout
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              signOut();
            }}
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <i className="ph ph-sign-out text-base" />
            </div>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
