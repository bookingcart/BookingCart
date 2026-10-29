/**
 * Verifies: (1) a fresh visitor is light even when the OS asks for dark,
 * (2) the sign-in prompt is fully dark in dark mode and light in light mode.
 * Usage: node scratch/popup-check.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, 'popup');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const report = {};

  // 1. Fresh visitor on a dark-OS machine.
  const fresh = await browser.newPage();
  await fresh.setViewport({ width: 1440, height: 900 });
  await fresh.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await fresh.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  report.freshVisit = await fresh.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('bc_theme'),
    colorScheme: document.documentElement.style.colorScheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

  // 2. Sign-in prompt in both themes.
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((t) => {
      localStorage.setItem('bc_theme', t);
      sessionStorage.removeItem('bc_signin_popup_dismissed');
    }, theme);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(4400);

    report[theme] = await page.evaluate(() => {
      const card = document.querySelector('[aria-label="Sign in to BookingCart"]');
      if (!card) return null;
      const style = getComputedStyle(card);
      const google = card.querySelector('.g_id_signin iframe, .g_id_signin > div > div');
      const rect = card.getBoundingClientRect();
      return {
        cardBg: style.backgroundColor,
        cardBorder: style.borderTopColor,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        googleBg: google ? getComputedStyle(google).backgroundColor : null,
        googleLabel: card.querySelector('.g_id_signin')?.textContent.trim().slice(0, 40) || '',
        hasGradientHeader: card.innerHTML.includes('linear-gradient(135deg, #14532d'),
      };
    });

    const box = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Sign in to BookingCart"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x) - 10, y: Math.round(r.y) - 10, width: Math.round(r.width) + 20, height: Math.round(r.height) + 20 };
    });
    if (box) await page.screenshot({ path: path.join(OUT, `popup-${theme}.png`), clip: box });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})();
