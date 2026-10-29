/* Does a same-origin full page load keep the tab's user activation?
 * If it does, the confirmation page can chime immediately instead of waiting
 * for a fresh tap. */
const http = require('http');
const puppeteer = require('puppeteer');

const pages = {
  '/a.html': '<a id="go" href="/b.html">go</a>',
  '/b.html': '<h1>b</h1>',
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(pages[req.url] || '');
});

(async () => {
  await new Promise((r) => server.listen(4599, r));
  const browser = await puppeteer.launch({
    headless: 'new',
    ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:4599/a.html');
  const before = await page.evaluate(() => ({
    hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive),
    ctx: new AudioContext().state,
  }));

  await Promise.all([page.waitForNavigation(), page.click('#go')]);
  const after = await page.evaluate(() => ({
    hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive),
    ctx: new AudioContext().state,
  }));

  console.log(JSON.stringify({ before, after }, null, 2));
  await browser.close();
  server.close();
})();
