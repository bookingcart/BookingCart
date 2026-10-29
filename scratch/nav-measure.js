/**
 * Checks the desktop header never lets its groups collide, signed out or in,
 * on the pages that add a context CTA (attractions / guides / transport).
 * Usage: node scratch/nav-measure.js
 */
const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDTHS = [1280, 1366, 1440, 1536, 1600, 1920];
const USER = { id: 'u1', name: 'Stephan Wolf', email: 'stephan@example.com', role: 'guide', isGuide: true };

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const rows = [];

  for (const signedIn of [false, true]) {
    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 });
      await page.evaluateOnNewDocument((user) => {
        sessionStorage.setItem('bc_signin_popup_dismissed', '1');
        localStorage.setItem('bc_theme', 'light');
        if (user) localStorage.setItem('bookingcart_user', JSON.stringify(user));
        else localStorage.removeItem('bookingcart_user');
      }, signedIn ? USER : null);
      await page.goto('http://127.0.0.1:3000/?mode=attractions', { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(450);

      rows.push(await page.evaluate((w, signed) => {
        const row = document.querySelector('header.bookingcart-navbar > div > div');
        const logo = document.querySelector('.bookingcart-logo');
        const nav = document.querySelector('.bookingcart-nav');
        const tools = document.querySelector('.bookingcart-header-tools');
        const cluster = row.lastElementChild;
        const first = nav.firstElementChild.getBoundingClientRect();
        const last = nav.lastElementChild.getBoundingClientRect();
        const logoRight = logo.getBoundingClientRect().right;
        const toolsLeft = tools.getBoundingClientRect().left;
        const clusterLeft = cluster.getBoundingClientRect().left;
        return {
          signed,
          width: w,
          row: Math.round(row.getBoundingClientRect().width),
          logoRight: Math.round(logoRight),
          navLeft: Math.round(first.left),
          navRight: Math.round(last.right),
          toolsLeft: Math.round(toolsLeft),
          clusterLeft: Math.round(clusterLeft),
          // Gaps (negative = collision)
          gapLogoNav: Math.round(first.left - logoRight),
          gapNavTools: Math.round(toolsLeft - last.right),
          gapToolsCluster: Math.round(clusterLeft - tools.getBoundingClientRect().right),
          dollars: [...document.querySelectorAll('.bookingcart-currency')].some((el) => el.getBoundingClientRect().width > 0),
          supportLabel: [...document.querySelectorAll('a[href="/support"] span')].some((el) => el.getBoundingClientRect().width > 0),
        };
      }, width, signedIn));
    }
  }

  await page.setViewport({ width: 1600, height: 900 });
  await page.evaluateOnNewDocument((user) => {
    sessionStorage.setItem('bc_signin_popup_dismissed', '1');
    localStorage.setItem('bookingcart_user', JSON.stringify(user));
  }, USER);
  await page.goto('http://127.0.0.1:3000/?mode=attractions', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(450);
  await page.screenshot({ path: `${__dirname}/nav/header-1600-attractions.png`, clip: { x: 0, y: 0, width: 1600, height: 90 } });
  await page.setViewport({ width: 1280, height: 900 });
  await sleep(300);
  await page.screenshot({ path: `${__dirname}/nav/header-1280-attractions.png`, clip: { x: 0, y: 0, width: 1280, height: 90 } });
  await page.setViewport({ width: 1920, height: 900 });
  await sleep(300);
  await page.screenshot({ path: `${__dirname}/nav/header-1920-attractions.png`, clip: { x: 0, y: 0, width: 1920, height: 90 } });

  await browser.close();
  console.table(rows);
  const bad = rows.filter((r) => r.gapLogoNav < 0 || r.gapNavTools < 0 || r.gapToolsCluster < 0);
  console.log(bad.length ? `COLLISIONS: ${bad.length}` : 'no collisions');
})();
