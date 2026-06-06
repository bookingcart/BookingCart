import { useState } from 'react';
import { HeaderAuthCluster } from './HeaderAuthCluster.jsx';

/**
 * BookingCartNavbar
 * Primary site navigation.
 * Props:
 *   activeNav  – 'flights' | 'stays' | 'bookings' | 'events'  (highlights the active pill)
 *   rightSlot  – optional JSX rendered on the far right (e.g. Print button)
 */
export default function BookingCartNavbar({ activeNav = 'flights', rightSlot }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { key: 'flights',  href: '/',          icon: 'ph-airplane-tilt',   label: 'Flights'  },
    { key: 'explore',  href: '/explore',   icon: 'ph-compass',         label: 'Explore'  },
    { key: 'tracker',  href: '/tracker',   icon: 'ph-broadcast',       label: 'Tracker'  },
  ];

  return (
    <header className="bookingcart-navbar sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
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

          <nav
            className="bookingcart-nav hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex"
            aria-label="Primary"
          >
            {navItems.map(({ key, href, icon, label }) => {
              const isActive = activeNav === key;
              return (
                <a
                  key={key}
                  href={href}
                  aria-label={label}
                  className={`
                    flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all duration-200 select-none
                    ${isActive
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'}
                  `}
                >
                  <i className={`ph ${icon} text-base`} />
                  <span>{label}</span>
                </a>
              );
            })}
          </nav>

          <div className="bookingcart-header-tools hidden shrink-0 items-center gap-2 md:flex">
            <div className="bookingcart-currency flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">
              <i className="ph ph-globe text-green-600 text-base" />
              <span>USD</span>
            </div>

            <div className="h-5 w-px bg-slate-200 transition-colors dark:bg-slate-800" />

            <a
              href="/support"
              className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
            >
              <i className="ph ph-headset text-green-600 text-base" />
              <span>Support</span>
            </a>

            {rightSlot}
            <HeaderAuthCluster />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 md:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <i className={`ph ${mobileOpen ? 'ph-x' : 'ph-list'} text-xl`} />
          </button>
        </div>

        {mobileOpen && (
          <div className="bookingcart-mobile-menu border-t border-slate-100 py-3 dark:border-slate-800 md:hidden">
            <nav className="grid gap-1" aria-label="Mobile primary">
              {navItems.map(({ key, href, icon, label }) => {
                const isActive = activeNav === key;
                return (
                  <a
                    key={key}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors
                      ${isActive
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'}
                    `}
                  >
                    <i className={`ph ${icon} text-lg`} />
                    {label}
                  </a>
                );
              })}
              <a
                href="/support"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <i className="ph ph-headset text-lg text-green-600" />
                Support
              </a>
              <a
                href="/auth"
                onClick={() => setMobileOpen(false)}
                className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-bold text-white transition-colors hover:bg-green-700"
              >
                <i className="ph ph-rocket-launch text-base" />
                Get Started
              </a>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
