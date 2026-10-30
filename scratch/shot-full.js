/**
 * Full-page screenshot helper — usage: node scratch/shot-full.js <url> <width> <out.png> [waitMs] [theme]
 */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const [url = 'http://127.0.0.1:3000/attractions/cinemas', width = '1440', out = 'scratch/shot-full.png', waitMs = '3500', theme = 'light'] =
    process.argv.slice(2);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: Number(width), height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((value) => {
    localStorage.setItem('bc_theme', value);
  }, theme);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, Number(waitMs)));
  await page.screenshot({ path: path.resolve(out), fullPage: true });
  await browser.close();
  console.log('saved', out);
})();
