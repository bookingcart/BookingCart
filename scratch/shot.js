/**
 * Screenshot helper for viewports the in-app browser can't reach (wide desktop
 * breakpoints) — usage: node scratch/shot.js <url> <width> <out.png> [waitMs]
 */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const [url = 'http://127.0.0.1:3000/transport', width = '1440', out = 'scratch/shot.png', waitMs = '3500', scrollTo = ''] =
    process.argv.slice(2);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: Number(width), height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, Number(waitMs)));
  if (scrollTo) {
    await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      if (node) node.scrollIntoView({ block: 'end' });
    }, scrollTo);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  await page.screenshot({ path: path.resolve(out) });
  await browser.close();
  console.log('saved', out);
})();
