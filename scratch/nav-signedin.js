/**
 * Worst-case header states: signed-in guide (bell + avatar cluster) on the
 * guides page, which also carries the "Become a Guide" CTA.
 * Usage: node scratch/nav-signedin.js
 */
const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const TOKEN = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u1', exp: 2000000000 })}.sig`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const rows = [];

  for (const width of [1280, 1366, 1440, 1536, 1600, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument((token) => {
      sessionStorage.setItem('bc_signin_popup_dismissed', '1');
      localStorage.setItem('bc_theme', 'light');
      localStorage.setItem('bookingcart_user', JSON.stringify({
        id: 'u1', name: 'Stephan Wolf', email: 'stephanwolf001@gmail.com', role: 'guide', isGuide: true,
      }));
      localStorage.setItem('bookingcart_jwt_token', token);
      localStorage.setItem('bc_signin_popup_dismissed', '1');
    }, TOKEN);
    await page.goto('http://127.0.0.1:3000/tour-guides', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(600);

    rows.push(await page.evaluate((w) => {
      const row = document.querySelector('header.bookingcart-navbar > div > div');
      const logo = document.querySelector('.bookingcart-logo');
      const nav = document.querySelector('.bookingcart-nav');
      const tools = document.querySelector('.bookingcart-header-tools');
      const cluster = row.lastElementChild;
      const first = nav.firstElementChild.getBoundingClientRect();
      const last = nav.lastElementChild.getBoundingClientRect();
      const logoRight = logo.getBoundingClientRect().right;
      const toolsRect = tools.getBoundingClientRect();
      const clusterRect = cluster.getBoundingClientRect();
      return {
        width: w,
        row: Math.round(row.getBoundingClientRect().width),
        gapLogoNav: Math.round(first.left - logoRight),
        gapNavTools: Math.round(toolsRect.left - last.right),
        gapToolsCluster: Math.round(clusterRect.left - toolsRect.right),
        tools: Math.round(toolsRect.width),
        cluster: Math.round(clusterRect.width),
        bell: !!document.querySelector('.bookingcart-header-tools [aria-label="Notifications"]'),
        signedIn: !!document.querySelector('[aria-haspopup="menu"], button[aria-label*="account" i]'),
      };
    }, width));
  }

  await page.setViewport({ width: 1280, height: 900 });
  await sleep(250);
  await page.screenshot({ path: `${__dirname}/nav/header-1280-guide.png`, clip: { x: 0, y: 0, width: 1280, height: 90 } });
  await page.setViewport({ width: 1600, height: 900 });
  await sleep(250);
  await page.screenshot({ path: `${__dirname}/nav/header-1600-guide.png`, clip: { x: 0, y: 0, width: 1600, height: 90 } });

  await browser.close();
  console.table(rows);
})();
