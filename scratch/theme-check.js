/**
 * Re-checks the pages that used to stay light in dark mode, then proves the
 * same pages still render correctly in light mode.
 * Usage: node scratch/theme-check.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'scratch', 'dark');

const ROUTES = [
  ['/account-settings', 'v2-settings'],
  ['/booking-details', 'v2-booking-details'],
  ['/event-confirmation', 'v2-event-confirmation'],
  ['/explore', 'v2-explore'],
  ['/tracker', 'v2-tracker'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  for (const theme of ['dark', 'light']) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate((t) => localStorage.setItem('bc_theme', t), theme);
    for (const [route, name] of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1800));
      const probe = await page.evaluate(() => {
        const isLight = (color) => {
          const m = color.match(/rgba?\(([^)]+)\)/);
          if (!m) return false;
          const [r, g, b, a = 1] = m[1].split(',').map(Number);
          return a > 0.5 && r > 238 && g > 238 && b > 238;
        };
        return {
          dark: document.documentElement.classList.contains('dark'),
          white: Array.from(document.querySelectorAll('div, section, main, aside, article, header, form'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width >= 260 && r.height >= 90 && isLight(getComputedStyle(el).backgroundColor);
            }).length,
        };
      });
      console.log(`${theme} ${route}:`, JSON.stringify(probe));
      await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`) });
    }
  }

  await browser.close();
})();
