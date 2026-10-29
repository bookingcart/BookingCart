'use strict';

/**
 * Guards the dark theme contract: the toggle is reachable from every header,
 * the choice survives reloads (including the pre-paint bootstrap), and the
 * Tailwind dark variant keys off the `.dark` class rather than the OS setting.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('the dark variant is class-based so the toggle can drive every page', () => {
  const css = read('src/styles/app.css');
  assert.match(css, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\)/, 'dark: utilities must follow <html class="dark">');
  assert.match(css, /body \{[^}]*dark:bg-slate-950/, 'the page background must follow the theme');
});

test('the theme store applies the class, persists the choice and defaults to light', () => {
  const store = read('src/lib/theme.js');
  assert.match(store, /classList\.toggle\('dark', dark\)/, 'applyTheme must toggle the class on <html>');
  assert.match(store, /localStorage\.setItem\(THEME_KEY, theme\)/, 'an explicit choice must be remembered');
  assert.match(store, /applyTheme\(storedTheme\(\) \|\| 'light'\)/, 'a first visit must be light, not dark');
  assert.doesNotMatch(store, /prefers-color-scheme/, 'the OS setting must not decide the theme');
  assert.match(store, /useSyncExternalStore/, 'components must re-render when the theme flips');
});

test('the saved theme is applied before the first paint', () => {
  const html = read('index.html');
  assert.match(html, /localStorage\.getItem\('bc_theme'\) === 'dark'/, 'only a saved dark choice may paint dark');
  assert.doesNotMatch(html, /prefers-color-scheme/, 'the bootstrap must not inherit the OS dark setting');
  assert.match(html, /document\.documentElement\.classList\.toggle\('dark', dark\)/, 'the bootstrap must set the class itself');
  assert.match(read('src/main.jsx'), /initTheme\(\)/, 'main.jsx must re-sync the theme on boot');
});

test('every header exposes the theme toggle and the mobile drawer carries a switch', () => {
  const navbar = read('src/components/BookingCartNavbar.jsx');
  assert.match(navbar, /import \{ ThemeToggle, ThemeToggleRow \} from '\.\/ThemeToggle\.jsx'/, 'the navbar must import the toggle');
  assert.match(navbar, /<ThemeToggle \/>/, 'desktop header tools need the toggle');
  assert.match(navbar, /<ThemeToggleRow \/>/, 'the mobile drawer needs the switch');

  const toggle = read('src/components/ThemeToggle.jsx');
  assert.match(toggle, /aria-label=\{label\}/, 'the icon button must be labelled for screen readers');
  assert.match(toggle, /role="switch"/, 'the drawer row must read as a switch');
  assert.match(toggle, /aria-checked=\{isDark\}/, 'the switch must report its state');
  // Both controls call the same store, so they can never disagree.
  assert.match(toggle, /const \{ isDark, toggle \} = useTheme\(\)/);
});

test('the official on-dark wordmark is the one the dark theme uses', () => {
  const files = [
    'src/components/BookingCartNavbar.jsx',
    'src/components/FlightFooter.jsx',
    'src/pages/TransportConfirmationPage.jsx',
    'src/pages/EventConfirmationPage.jsx',
  ];
  files.forEach((file) => {
    assert.match(read(file), /bookingcart-logo-on-dark\.png/, `${file} must render the official on-dark logo`);
  });
  assert.ok(fs.existsSync(path.join(ROOT, 'public/images/bookingcart-logo-on-dark.png')), 'the on-dark asset must ship');
});
