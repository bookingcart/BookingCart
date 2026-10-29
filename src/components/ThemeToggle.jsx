import { useTheme } from '../lib/theme.js';

const ICON_BTN =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white';

/** Sun/moon toggle for the header bars (desktop tools + mobile drawer). */
export function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme();
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={`${ICON_BTN} ${className}`.trim()}
    >
      <i className={`ph ${isDark ? 'ph-sun' : 'ph-moon'} text-base ${isDark ? 'text-amber-400' : 'text-slate-500'}`} />
    </button>
  );
}

/** Labelled row with a switch, for the mobile drawer. */
export function ThemeToggleRow({ onClick }) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={() => {
        toggle();
        onClick?.();
      }}
      className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
    >
      <i className={`ph ${isDark ? 'ph-sun' : 'ph-moon'} text-lg ${isDark ? 'text-amber-400' : 'text-slate-400'}`} />
      Dark mode
      <span
        aria-hidden="true"
        className={`ml-auto flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${isDark ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}
