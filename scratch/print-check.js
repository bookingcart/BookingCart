/**
 * Render the transport confirmation page through Chrome's print pipeline and
 * rasterise each PDF page, so the printable ticket can be eyeballed.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const url = process.argv[2] || 'http://127.0.0.1:3000/transport/confirmation?ref=TR-4FF06F4B32';
const out = process.argv[3] || path.join(__dirname, 'print-output');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.ticket-print', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();

  const file = out.endsWith('.pdf') ? out : `${out}.pdf`;
  fs.writeFileSync(file, pdf);
  console.log('pdf', file, pdf.length, 'bytes');

  // macOS sips only walks the first page, which is what the ticket check needs.
  const png = `${file.replace(/\.pdf$/, '')}-page1.png`;
  execFileSync('sips', ['-s', 'format', 'png', file, '--out', png], { stdio: 'ignore' });
  console.log('png', png);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
