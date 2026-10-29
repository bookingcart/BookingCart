/**
 * Proves the booking/notification chimes actually run in a browser:
 * the AudioContext is locked until the first gesture, the held booking chime
 * plays on unlock, it never replays for the same booking, and the header /
 * drawer toggles mute it.
 * Usage: node scratch/sound-check.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, 'sound');

async function instrument(page) {
  await page.evaluateOnNewDocument(() => {
    window.__tones = 0;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const create = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function patched(...args) {
      const osc = create.apply(this, args);
      const start = osc.start.bind(osc);
      osc.start = (...rest) => {
        window.__tones += 1;
        return start(...rest);
      };
      return osc;
    };
  });
}

const tones = (page) => page.evaluate(() => window.__tones || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const report = {};

  // ── 1. Header toggle: mute, then unmute and hear the preview ping ──────────
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await instrument(page);
  await page.setExtraHTTPHeaders({});
  await page.evaluateOnNewDocument(() => localStorage.removeItem('bc_sound'));
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });

  const button = '[aria-label*="booking and notification sounds" i]';
  report.headerToggle = await page.$(button) !== null;
  report.pressedBefore = await page.$eval(button, (el) => el.getAttribute('aria-pressed'));

  await page.click(button);
  await sleep(400);
  report.muted = await page.evaluate(() => localStorage.getItem('bc_sound'));
  report.pressedWhenMuted = await page.$eval(button, (el) => el.getAttribute('aria-pressed'));
  report.tonesWhileMuted = await tones(page);

  await page.click(button);
  await sleep(500);
  report.unmuted = await page.evaluate(() => localStorage.getItem('bc_sound'));
  report.unmutePreviewTones = await tones(page);

  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  report.persistedAfterReload = await page.$eval(button, (el) => el.getAttribute('aria-pressed'));
  await page.screenshot({ path: path.join(OUT, 'header-sound-toggle.png'), clip: { x: 900, y: 0, width: 540, height: 90 } });

  // ── 2. Booking chime: held while locked, played on first gesture, no replay ─
  const booking = await browser.newPage();
  await booking.setViewport({ width: 1440, height: 900 });
  await instrument(booking);
  await booking.goto(BASE + '/confirmation', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(700);
  report.bookingTonesBeforeGesture = await tones(booking);

  await booking.mouse.click(720, 640);
  await sleep(900);
  report.bookingTonesAfterGesture = await tones(booking);

  await booking.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(400);
  await booking.mouse.click(720, 640);
  await sleep(700);
  report.bookingTonesAfterRevisit = await tones(booking);

  // ── 3. Mobile drawer switch ────────────────────────────────────────────────
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobile.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await mobile.click('[aria-label="Open menu"]');
  await sleep(300);
  const switchInfo = await mobile.evaluate(() => {
    const row = [...document.querySelectorAll('[role="switch"]')].find((el) => el.textContent.includes('Sound effects'));
    if (!row) return null;
    const box = row.getBoundingClientRect();
    return { label: row.textContent.trim().replace(/\s+/g, ' '), checked: row.getAttribute('aria-checked'), y: Math.round(box.y) };
  });
  report.drawerSwitch = switchInfo;
  if (switchInfo) {
    await mobile.evaluate(() => {
      const row = [...document.querySelectorAll('[role="switch"]')].find((el) => el.textContent.includes('Sound effects'));
      row.click();
    });
    await sleep(300);
    report.drawerMuted = await mobile.evaluate(() => localStorage.getItem('bc_sound'));
  }
  await mobile.screenshot({ path: path.join(OUT, 'drawer-sound-row.png') });

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})();
