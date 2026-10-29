import { useSound } from '../lib/sound.js';

/**
 * Sound controls — an icon button for the desktop header tools and a switch
 * row for the mobile drawer. Both read the same store, so they always agree.
 */

const ICON_BTN =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white';

export function SoundToggle({ className = '' }) {
  const { enabled, toggle } = useSound();
  const label = enabled ? 'Mute booking and notification sounds' : 'Unmute booking and notification sounds';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      className={`${ICON_BTN} ${className}`.trim()}
    >
      <i className={`ph ${enabled ? 'ph-speaker-high' : 'ph-speaker-slash'} text-base ${enabled ? 'text-slate-500 dark:text-slate-300' : 'text-rose-500 dark:text-rose-400'}`} />
    </button>
  );
}

export function SoundToggleRow({ onClick, className = '' }) {
  const { enabled, toggle } = useSound();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => { toggle(); onClick?.(); }}
      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900 ${className}`.trim()}
    >
      <i className={`ph ${enabled ? 'ph-speaker-high' : 'ph-speaker-slash'} text-lg ${enabled ? 'text-slate-400' : 'text-rose-500 dark:text-rose-400'}`} />
      Sound effects
      <span
        aria-hidden="true"
        className={`ml-auto flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${enabled ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}
