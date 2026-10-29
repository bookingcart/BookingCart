/* Seeds a confirmed stay into sessionStorage and shoots the new voucher. */
const path = require('path');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:5199';

const booking = {
  id: 'bcs_1791357842289',
  reference: 'BCS-NBAZZXN',
  status: 'confirmed',
  email: 'stephanwolf001@gmail.com',
  phone_number: '+25634344',
  guests: [{ given_name: 'Stephan', family_name: 'Wolf' }],
  accommodation: {
    name: 'Hamz Accomodations',
    rating: 4,
    photos: [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80' }],
    address: { line_1: 'Plot 12 Kampala Road', city_name: 'Kampala', country_code: 'UG' },
    phone_numbers: ['+256 700 000 000'],
  },
  check_in_date: '2026-10-29',
  check_out_date: '2026-11-05',
  total_amount: '700',
  currency: 'USD',
  rooms: [{ name: '4' }],
  created_at: '2026-10-29T23:54:00Z',
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const shoot = async (name, { width, height, dark }) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((data) => {
      sessionStorage.setItem('stays_booking_result', JSON.stringify(data));
    }, booking);
    if (dark) {
      await page.evaluate(() => localStorage.setItem('bc_theme', 'dark'));
    } else {
      await page.evaluate(() => localStorage.removeItem('bc_theme'));
    }
    await page.goto(`${BASE}/stays/confirmation?quote_id=quo_local_1_1791357842289_n7&direct=1`, {
      waitUntil: 'networkidle2',
    });
    // Let the icon font and the hotel photo settle, then drop the sign-in
    // popup so it never covers the summary cards.
    await new Promise((r) => setTimeout(r, 3500));
    await page.evaluate(() => {
      document.querySelector('[role="dialog"][aria-label="Sign in to BookingCart"]')?.remove();
    });
    await page.screenshot({ path: path.join(__dirname, 'stays', `${name}.png`), fullPage: true });
  };

  await shoot('desktop-light', { width: 1280, height: 1000, dark: false });
  await shoot('desktop-dark', { width: 1280, height: 1000, dark: true });
  await shoot('mobile-light', { width: 420, height: 900, dark: false });

  // What the printer gets: the voucher alone, no site chrome.
  await page.emulateMediaType('print');
  await shoot('print', { width: 820, height: 1000, dark: false });
  await page.emulateMediaType('screen');

  const report = await page.evaluate(() => {
    const pass = document.querySelector('.ticket-print');
    const box = pass?.getBoundingClientRect();
    const roomDd = [...document.querySelectorAll('dd, p')]
      .map((el) => el.textContent.trim())
      .filter((text) => text === '4' || text === 'Room 4');
    return {
      title: document.title,
      pass: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
      roomText: roomDd,
      hasLogo: Boolean(document.querySelector('.ticket-print img[alt="BookingCart"]')),
      banner: document.querySelector('section h1')?.textContent?.trim(),
      pageBg: getComputedStyle(document.body).backgroundColor,
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
