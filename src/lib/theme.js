import { useCallback, useSyncExternalStore } from 'react';

/**
 * Site-wide dark theme.
 * The choice is expressed as <html class="dark"> (Tailwind's class-based dark
 * variant) and mirrored to localStorage so the inline bootstrap in index.html
 * can paint the right colours before React mounts. The site is light by default:
 * dark mode is opt-in through the toggle, not inherited from the OS setting.
 */
export const THEME_KEY = 'bc_theme';

const listeners = new Set();

export function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    // Storage can be blocked in private mode — the light default still applies.
  }
  return null;
}

export function activeTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const dark = theme === 'dark';
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  // Browser chrome / mobile status bar follows the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#020617' : '#16a34a');
  listeners.forEach((listener) => listener());
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Preference simply won't survive the session.
  }
  applyTheme(theme);
}

export function toggleTheme() {
  setTheme(activeTheme() === 'dark' ? 'light' : 'dark');
}

/** Re-applies the resolved theme on boot. Light unless dark was chosen. */
export function initTheme() {
  applyTheme(storedTheme() || 'light');
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, activeTheme, () => 'light');
  const toggle = useCallback(() => toggleTheme(), []);
  return { theme, isDark: theme === 'dark', toggle, setTheme };
}
