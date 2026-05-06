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
        className="flex items-center gap-3 bg-[#003b95] hover:bg-[#00224f] transition-colors rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#febb02]"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <div className="w-10 h-10 rounded-full border-2 border-[#febb02] bg-white flex items-center justify-center overflow-hidden shrink-0">
          <HeaderUserAvatarImg className="w-full h-full object-cover rounded-full" />
        </div>
        <div className="flex flex-col items-start pr-2">
          <span data-profile-name-label className="text-sm font-bold text-white leading-tight">{user?.name || user?.email?.split('@')[0] || 'User'}</span>
          <span className="text-xs font-bold text-[#febb02] leading-tight mt-0.5">Genius Level 1</span>
        </div>
      </button>
      <div
        data-profile-menu
        role="menu"
        className={`absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl ring-1 ring-slate-100 py-2 z-50${open ? '' : ' hidden'}`}
      >
        <a
          href="/account-settings"
          role="menuitem"
          className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="ph ph-user-circle text-xl text-slate-400"></i> My Account
        </a>
        {isAdmin && (
          <a
            href="/admin"
            role="menuitem"
            className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors"
            onClick={() => setOpen(false)}
          >
            <i className="ph ph-shield-check text-xl text-teal-600"></i> Admin Dashboard
          </a>
        )}
        <a
          href="/my-bookings"
          role="menuitem"
          className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="ph ph-suitcase-rolling text-xl text-slate-400"></i> Bookings & Trips
        </a>
        <div className="border-t border-slate-100 my-1"></div>
        <button
          type="button"
          role="menuitem"
          data-signout
          className="w-full flex items-center gap-3 px-5 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left"
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
