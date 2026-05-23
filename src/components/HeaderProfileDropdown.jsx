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
            <span className="text-[9px] font-bold uppercase tracking-widest text-green-700 dark:text-green-400 leading-none mt-[1px]">Genius Lvl 1</span>
          </div>
        </div>
        <i className="ph-bold ph-caret-down text-slate-300 text-xs ml-1 group-hover:text-green-600 transition-colors duration-300 translate-y-[1px]"></i>
      </button>
      <div
        data-profile-menu
        role="menu"
        className={`absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-100 dark:ring-slate-700 py-2 z-50 transition-colors duration-200${open ? '' : ' hidden'}`}
      >
        <a
          href="/account-settings"
          role="menuitem"
          className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="ph ph-user-circle text-xl text-slate-400"></i> My Account
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
