import { useState } from 'react';
import { HeaderAuthCluster } from './HeaderAuthCluster.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

/**
 * BookingCartNavbar
 * Primary site navigation — desktop + mobile drawer.
 * Props:
 *   activeNav  – 'flights' | 'stays' | 'guides' | 'attractions' | 'aviation' | 'explore' | 'bookings'
 *   rightSlot  – optional JSX rendered on the far right (e.g. Print button)
 */
export default function BookingCartNavbar({ activeNav = 'flights', rightSlot }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const isGuide       = user?.role === 'guide' || user?.role === 'guide_applicant' || !!user?.isGuide;
  const isHotelOwner = !!user && (
    user?.role === 'hotel_owner' ||
    user?.role === 'property_owner' ||
    user?.role === 'hotel' ||
    !!user?.isHotelOwner ||
    !!user?.isPropertyOwner ||
    !!user?.hotelProfileId ||
    user?.role === 'admin' ||
    localStorage.getItem('bc_is_hotel_owner') === 'true' ||
    !!localStorage.getItem('bc_hotel_profile_id')
  );
  const isAttractionOwner = user?.role === 'attraction_owner' || !!user?.isAttractionOwner;
  const isAdmin       = user?.role === 'admin';
  const isAviationOperator = !!user && (
    user.role === 'operator' ||
    user.isOperator ||
    isAdmin ||
    localStorage.getItem('bc_is_operator') === 'true'
  );

  // All main nav sections shown in the mobile drawer
  const NAV_SECTIONS = [
    { key: 'flights',    href: '/',             icon: 'ph-airplane-tilt',  label: 'Flights' },
    { key: 'stays',      href: '/stays',         icon: 'ph-buildings',      label: 'Stays' },
    { key: 'guides',     href: '/tour-guides',   icon: 'ph-compass',        label: 'Tour Guides' },
    { key: 'attractions',href: '/?mode=attractions', icon: 'ph-ticket',  label: 'Attractions' },
    { key: 'aviation',   href: '/aviation',      icon: 'ph-airplane-takeoff', label: 'Aviation' },
  ];

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="bookingcart-navbar sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">

          {/* Logo */}
          <a
            href="/"
            className="bookingcart-logo flex shrink-0 items-center gap-2.5 rounded-xl px-1 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
            aria-label="BookingCart home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm shadow-green-200 dark:shadow-none">
              <i className="ph ph-airplane-tilt text-lg" />
            </span>
            <span className="bookingcart-logo-text inline-flex text-base font-black tracking-tight leading-none select-none">
              <span className="text-slate-950 dark:text-white transition-colors">Booking</span>
              <span className="text-green-600">Cart</span>
            </span>
          </a>

          {/* Desktop nav pills — hidden on mobile */}
          <nav className="bookingcart-nav hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:flex" aria-label="Primary">
            {NAV_SECTIONS.map(({ key, href, icon, label }) => {
              const isActive = activeNav === key;
              return (
                <a
                  key={key}
                  href={href}
                  className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-all duration-200 select-none whitespace-nowrap
                    ${isActive
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'}`}
                >
                  <i className={`ph ${icon} text-sm`} />
                  <span>{label}</span>
                </a>
              );
            })}
          </nav>

          {/* Desktop-only right tools */}
          <div className="bookingcart-header-tools hidden shrink-0 items-center gap-2 md:flex">
            <div className="bookingcart-currency flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">
              <i className="ph ph-globe text-green-600 text-sm" />
              <span>USD</span>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

            <a href="/support" className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white">
              <i className="ph ph-headset text-green-600 text-sm" />
              <span>Support</span>
            </a>

            {/* Context CTAs */}
            {!isGuide && activeNav === 'guides' && (
              <a href="/become-a-guide" className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 text-[13px] font-bold text-white transition-colors shadow-sm shadow-amber-500/25">
                <i className="ph ph-compass text-sm" /><span>Become a Guide</span>
              </a>
            )}
            {!isHotelOwner && activeNav === 'stays' && (
              <a href="/list-your-hotel" className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-[13px] font-bold text-white transition-colors shadow-sm shadow-blue-600/25">
                <i className="ph ph-buildings text-sm" /><span>List Property</span>
              </a>
            )}
            {activeNav === 'aviation' && (
              <a href="/aviation/operators/join" className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-[13px] font-bold text-white transition-colors hover:bg-slate-800">
                <i className="ph ph-airplane-takeoff text-sm" /><span>List Aircraft</span>
              </a>
            )}
            {activeNav === 'attractions' && (
              <a href="/list-your-event" className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 text-[13px] font-bold text-white transition-colors shadow-sm shadow-amber-500/25">
                <i className="ph ph-ticket text-sm" /><span>List your event</span>
              </a>
            )}
            {isHotelOwner && (
              <a href="/hotel-dashboard" className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-[13px] font-bold text-white transition-colors shadow-sm shadow-blue-600/25">
                <i className="ph ph-buildings text-sm" /><span>Property Portal</span>
              </a>
            )}

            {rightSlot}
            {user && (isGuide || isAdmin) && <NotificationBell />}
          </div>

          {/* Auth cluster + hamburger — always visible */}
          <div className="flex shrink-0 items-center gap-1.5">
            {user && (isGuide || isAdmin) && (
              <span className="md:hidden"><NotificationBell /></span>
            )}
            <HeaderAuthCluster />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 md:hidden"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(o => !o)}
            >
              <i className={`ph ${mobileOpen ? 'ph-x' : 'ph-list'} text-xl`} />
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        {mobileOpen && (
          <div className="bookingcart-mobile-menu border-t border-slate-100 dark:border-slate-800 pb-4 pt-2 md:hidden">

            {/* Section label */}
            <p className="px-3 pt-1 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Browse</p>

            <nav className="grid gap-0.5" aria-label="Mobile primary">
              {NAV_SECTIONS.map(({ key, href, icon, label }) => {
                const isActive = activeNav === key;
                return (
                  <a
                    key={key}
                    href={href}
                    onClick={closeMobile}
                    className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors
                      ${isActive
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'}`}
                  >
                    <i className={`ph ${icon} text-lg ${isActive ? 'text-green-600' : 'text-slate-400'}`} />
                    {label}
                    {isActive && <i className="ph ph-caret-right ml-auto text-green-500 text-xs" />}
                  </a>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="my-3 border-t border-slate-100 dark:border-slate-800" />

            {/* Context CTAs */}
            <div className="grid gap-2 px-0.5">
              {!isGuide && activeNav === 'guides' && (
                <a href="/become-a-guide" onClick={closeMobile}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-600 shadow-sm shadow-amber-500/25">
                  <i className="ph ph-compass" /> Become a Guide
                </a>
              )}
              {!isHotelOwner && activeNav === 'stays' && (
                <a href="/list-your-hotel" onClick={closeMobile}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 shadow-sm shadow-blue-600/25">
                  <i className="ph ph-buildings" /> List Your Property
                </a>
              )}
              {activeNav === 'aviation' && (
                <a href="/aviation/operators/join" onClick={closeMobile}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800">
                  <i className="ph ph-airplane-takeoff" /> List your aircraft
                </a>
              )}
              {activeNav === 'attractions' && (
                <a href="/list-your-event" onClick={closeMobile}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-600 shadow-sm shadow-amber-500/25">
                  <i className="ph ph-ticket" /> List your event or attraction
                </a>
              )}

              {/* Support — always shown */}
              <a href="/support" onClick={closeMobile}
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900">
                <i className="ph ph-headset text-lg text-green-600" />
                Support & Help
              </a>
            </div>

            {/* Auth section */}
            <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              {user ? (
                <>
                  {/* User identity strip */}
                  <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                      {(user.name || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name || 'My Account'}</div>
                      <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                    </div>
                  </div>

                  <div className="grid gap-0.5">
                    <a href="/account-settings" onClick={closeMobile}
                      className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900">
                      <i className="ph ph-user-circle text-lg text-slate-400" /> My Account
                    </a>
                    <a href="/my-bookings" onClick={closeMobile}
                      className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900">
                      <i className="ph ph-suitcase-rolling text-lg text-slate-400" /> Bookings &amp; Trips
                    </a>

                    {/* Role-specific dashboards */}
                    {isHotelOwner && (
                      <a href="/hotel-dashboard" onClick={closeMobile}
                        className="flex h-11 items-center justify-between rounded-xl px-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <span className="flex items-center gap-3">
                          <i className="ph-fill ph-buildings text-lg text-blue-600 dark:text-blue-400" /> Property &amp; PMS Portal
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">Stays</span>
                      </a>
                    )}
                    {isGuide && (
                      <a href="/guide-dashboard" onClick={closeMobile}
                        className="flex h-11 items-center justify-between rounded-xl px-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <span className="flex items-center gap-3">
                          <i className="ph-fill ph-compass text-lg text-emerald-600 dark:text-emerald-400" /> Guide Dashboard
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Guide</span>
                      </a>
                    )}
                    {isAttractionOwner && (
                      <a href="/attraction-dashboard" onClick={closeMobile}
                        className="flex h-11 items-center justify-between rounded-xl px-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <span className="flex items-center gap-3">
                          <i className="ph-fill ph-ticket text-lg text-amber-600 dark:text-amber-400" /> Attraction Portal
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Events</span>
                      </a>
                    )}
                    {isAviationOperator && (
                      <a href="/aviation/dashboard" onClick={closeMobile}
                        className="flex h-11 items-center justify-between rounded-xl px-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <span className="flex items-center gap-3">
                          <i className="ph-fill ph-airplane-tilt text-lg text-sky-600 dark:text-sky-400" /> Operator Portal
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">Aviation</span>
                      </a>
                    )}
                    {isAdmin && (
                      <a href="/admin" onClick={closeMobile}
                        className="flex h-11 items-center justify-between rounded-xl px-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <span className="flex items-center gap-3">
                          <i className="ph-fill ph-shield-check text-lg text-purple-600 dark:text-purple-400" /> Admin Control
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">Admin</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={async () => { closeMobile(); await logout(); }}
                      className="mt-1 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 text-left"
                    >
                      <i className="ph ph-sign-out text-lg" /> Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <a href="/auth" onClick={closeMobile}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">
                    Sign In
                  </a>
                  <a href="/auth" onClick={closeMobile}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-bold text-white transition-colors hover:bg-green-700 shadow-md shadow-green-600/25">
                    <i className="ph ph-rocket-launch" /> Get Started
                  </a>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </header>
  );
}
