/**
 * The site-wide "which search am I in" pill row that sits under a section hero:
 * Flights · Tour Guides · Stays · Attractions · Transport. The current section
 * renders as a button so it reads as the active tab, every other one is a link.
 */

const MODES = [
  { key: 'flights', href: '/', icon: 'ph-airplane-tilt', label: 'Flights', short: 'Fly' },
  { key: 'guides', href: '/tour-guides', icon: 'ph-compass', label: 'Tour Guides', short: 'Guides', accent: 'text-green-600' },
  { key: 'stays', href: '/stays', icon: 'ph-bed', label: 'Stays', accent: 'text-blue-600' },
  { key: 'attractions', href: '/?mode=attractions', icon: 'ph-ticket', label: 'Attractions', short: 'Events', accent: 'text-amber-500' },
  { key: 'transport', href: '/transport', icon: 'ph-bus', label: 'Transport', accent: 'text-emerald-600' },
];

const PILL = 'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-all sm:flex-none sm:px-4 sm:text-sm';

export default function ModeSwitcher({ active = 'flights', className = '' }) {
  return (
    <div
      className={`flex w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-white/80 bg-white/80 p-1 shadow-sm backdrop-blur transition-colors dark:border-slate-700/80 dark:bg-slate-800/80 sm:w-auto sm:inline-flex ${className}`}
      aria-label="Search mode"
    >
      {MODES.map((mode) => {
        const isActive = mode.key === active;
        const inner = (
          <>
            <i className={`ph ${mode.icon} shrink-0 text-base ${isActive ? '' : mode.accent || ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sm:hidden">{mode.short || mode.label}</span>
          </>
        );

        return isActive ? (
          <button
            key={mode.key}
            type="button"
            aria-current="page"
            className={`${PILL} bg-green-600 text-white shadow-md shadow-green-600/30`}
          >
            {inner}
          </button>
        ) : (
          <a
            key={mode.key}
            href={mode.href}
            className={`${PILL} text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white`}
          >
            {inner}
          </a>
        );
      })}
    </div>
  );
}
