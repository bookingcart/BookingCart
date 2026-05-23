import { useState, useEffect } from 'react';
import { HeaderAuthCluster } from './HeaderAuthCluster.jsx';

/**
 * BookingCartNavbar
 * Pill-shaped, green-gradient navigation bar.
 * Props:
 *   activeNav  – 'flights' | 'stays' | 'bookings' | 'events'  (highlights the active pill)
 *   rightSlot  – optional JSX rendered on the far right (e.g. Print button)
 */
export default function BookingCartNavbar({ activeNav = 'flights', rightSlot }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const navItems = [
    { key: 'flights',  href: '/',           icon: 'ph-airplane-tilt',     label: 'Flights'  },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">

        {/* ── outer pill track ── */}
        <div className="flex items-center gap-3">

          {/* ── LEFT: logo capsule ── */}
          <a
            href="/"
            className="shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all group"
          >
            {/* swoosh icon */}
            <span className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center shadow-sm shadow-green-300 dark:shadow-none group-hover:scale-105 transition-transform">
              <i className="ph ph-airplane-tilt text-white text-sm" />
            </span>

            {/* wordmark */}
            <span className="text-sm font-black tracking-tight leading-none select-none">
              <span className="text-slate-900 dark:text-white transition-colors">BOOKING</span>
              <span className="text-green-600">CART</span>
            </span>
          </a>

          {/* ── MIDDLE: green pill nav ── */}
          <nav
            className="flex-1 flex items-center bg-green-600 rounded-full px-2 py-1.5 gap-1 shadow-lg shadow-green-200/60"
            style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
          >
            {navItems.map(({ key, href, icon, label }) => {
              const isActive = activeNav === key;
              return (
                <a
                  key={key}
                  href={href}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 select-none
                    ${isActive
                      ? 'bg-white/20 text-white shadow-inner backdrop-blur-sm'
                      : 'text-green-100 hover:text-white hover:bg-white/15'}
                  `}
                >
                  <i className={`ph ${icon} text-base`} />
                  <span className="hidden sm:inline">{label}</span>
                </a>
              );
            })}
          </nav>

          {/* ── RIGHT: utilities ── */}
          <div className="shrink-0 flex items-center gap-2">

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-8 h-8 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {theme === 'light' ? (
                <i className="ph ph-moon text-lg" />
              ) : (
                <i className="ph ph-sun text-lg" />
              )}
            </button>

            {/* Currency selector */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
              <i className="ph ph-globe text-green-600 text-base" />
              <span className="hidden sm:inline">USD</span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 transition-colors" />

            {/* Customer support */}
            <a
              href="/support"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <i className="ph ph-headset text-green-600 text-base" />
              <span className="hidden md:inline">Support</span>
            </a>

            {/* Optional slot (e.g. Print button) */}
            {rightSlot}

            {/* Auth Cluster (Google Sign-In or Profile Dropdown) */}
            <HeaderAuthCluster />

          </div>
        </div>
      </div>
    </header>
  );
}
