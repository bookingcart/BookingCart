/**
 * Finds light-on-dark offenders: every large element whose computed background
 * is near-white while the dark theme is active. Usage:
 *   node scratch/dark-probe.js /route /route ...
 */
const puppeteer = require('puppeteer');

const BASE = 'http://127.0.0.1:3000';
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('bc_theme', 'dark'));

  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1600));
    const report = await page.evaluate(() => {
      const isLight = (color) => {
        const m = color.match(/rgba?\(([^)]+)\)/);
        if (!m) return false;
        const [r, g, b, a = 1] = m[1].split(',').map(Number);
        return a > 0.5 && r > 238 && g > 238 && b > 238;
      };
      return Array.from(document.querySelectorAll('div, section, main, aside, article, li, header, form'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, r };
        })
        .filter(({ el, r }) => r.width >= 260 && r.height >= 90 && isLight(getComputedStyle(el).backgroundColor))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
        .slice(0, 6)
        .map(({ el, r }) => ({
          size: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`,
          cls: (el.className || '').toString().replace(/\s+/g, ' ').slice(0, 190),
          text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
        }));
    });
    console.log(`\n=== ${route}`);
    if (!report.length) console.log('  ok — nothing near-white');
    report.forEach((item) => console.log(`  [${item.size}] ${item.cls}\n     "${item.text}"`));
  }
  await browser.close();
})();
