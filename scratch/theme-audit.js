/**
 * Dark-theme audit: clicks the header toggle once, proves the choice sticks,
 * then walks the customer-facing routes in dark mode and screenshots each.
 * Usage: node scratch/theme-audit.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'scratch', 'dark');
const BASE = 'http://127.0.0.1:3000';

const ROUTES = [
  ['/', 'home'],
  ['/stays', 'stays'],
  ['/events', 'events'],
  ['/tour-guides', 'guides'],
  ['/transport', 'transport'],
  ['/attractions/cinemas', 'cinemas'],
  ['/explore', 'explore'],
  ['/visa/new', 'visa'],
  ['/account-settings', 'settings'],
  ['/my-bookings', 'my-bookings'],
  ['/support', 'support'],
  ['/notifications', 'notifications'],
  ['/booking-details', 'booking-details'],
  ['/attraction-dashboard', 'attraction-dashboard'],
  ['/guide-dashboard', 'guide-dashboard'],
  ['/transport/dashboard', 'transport-dashboard'],
  ['/admin', 'admin'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  // Start from light so the click has something to prove.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  console.error:', msg.text().slice(0, 160));
  });

  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const before = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('bc_theme'),
    toggle: !!document.querySelector('[aria-label*="theme"]'),
  }));
  console.log('before toggle:', JSON.stringify(before));

  await page.screenshot({ path: path.join(OUT, '_header-light.png'), clip: { x: 0, y: 0, width: 1440, height: 96 } });

  // Press the toggle once.
  await page.click('[aria-label*="theme"]');
  await new Promise((r) => setTimeout(r, 600));

  const after = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('bc_theme'),
    colorScheme: document.documentElement.style.colorScheme,
    meta: document.querySelector('meta[name="theme-color"]')?.content,
  }));
  console.log('after toggle:', JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, '_header-dark.png'), clip: { x: 0, y: 0, width: 1440, height: 96 } });

  // Reload: the inline bootstrap must restore dark before paint.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const early = await page.evaluate(() => ({
    darkAtDomReady: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('bc_theme'),
  }));
  console.log('after reload (domcontentloaded):', JSON.stringify(early));

  for (const [route, name] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.log('nav fail', route, e.message));
    await new Promise((r) => setTimeout(r, 1800));
    const state = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      // biggest painted surface, a crude "is this page still white?" probe
      white: Array.from(document.querySelectorAll('section, main, div')).filter((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const r = el.getBoundingClientRect();
        return bg === 'rgb(255, 255, 255)' && r.width > 600 && r.height > 250;
      }).length,
    }));
    console.log(`route ${route}:`, JSON.stringify(state));
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }

  // Mobile drawer: the switch row only exists below the xl breakpoint.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE + '/transport', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.click('[aria-label="Open menu"]');
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, '_drawer-dark.png') });

  await browser.close();
  console.log('saved to', OUT);
})();
