/**
 * Mobile check: the drawer carries the only theme switch below xl.
 * Usage: node scratch/theme-mobile.js
 */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.join(__dirname, 'dark');
const BASE = 'http://127.0.0.1:3000';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(BASE + '/transport', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('bc_theme', 'light'));
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  await page.click('[aria-label="Open menu"]');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'v2-drawer-light.png') });

  // Flip the switch row inside the drawer.
  const flipped = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('[role="switch"]')).find((el) => /dark mode/i.test(el.textContent));
    if (!row) return { found: false };
    row.click();
    return { found: true };
  });
  await new Promise((r) => setTimeout(r, 600));
  const state = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('bc_theme'),
    drawerOpen: !!document.querySelector('.bookingcart-mobile-menu'),
    switchOn: Array.from(document.querySelectorAll('[role="switch"]')).some((el) => el.getAttribute('aria-checked') === 'true'),
  }));
  console.log('flipped:', JSON.stringify(flipped), 'state:', JSON.stringify(state));
  await page.screenshot({ path: path.join(OUT, 'v2-drawer-dark.png') });

  await browser.close();
})();
