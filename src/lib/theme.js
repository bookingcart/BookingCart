import { useCallback, useSyncExternalStore } from 'react';

/**
 * Site-wide dark theme.
 * The choice is expressed as <html class="dark"> (Tailwind's class-based dark
 * variant) and mirrored to localStorage so the inline bootstrap in index.html
 * can paint the right colours before React mounts. Visitors without a saved
 * choice follow their operating system until they press the toggle.
 */
export const THEME_KEY = 'bc_theme';

const listeners = new Set();

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    // Storage can be blocked in private mode — the system preference wins.
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

/** Follow the OS only while the visitor has not picked a theme themselves. */
export function watchSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Re-applies the resolved theme on boot and keeps the system listener alive. */
export function initTheme() {
  applyTheme(storedTheme() || (systemPrefersDark() ? 'dark' : 'light'));
  return watchSystemTheme();
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
