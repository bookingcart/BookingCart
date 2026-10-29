/* Does the confirmation page still chime when the checkout hands over with a
 * full page load? Counts oscillator starts on the fresh document. */
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:5199';
const CONFIRM = `${BASE}/stays/confirmation?quote_id=quo_local_1_1791357842289_n7&direct=1`;

const booking = {
  reference: 'BCS-SOUNDTEST',
  status: 'confirmed',
  email: 'guest@example.com',
  guests: [{ given_name: 'Stephan', family_name: 'Wolf' }],
  accommodation: { name: 'Hamz Accomodations', photos: [], address: 'Kampala' },
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
  await page.setViewport({ width: 1280, height: 900 });

  // Count every note the page schedules, on every document.
  await page.evaluateOnNewDocument(() => {
    window.__tones = 0;
    const Original = window.AudioContext || window.webkitAudioContext;
    if (!Original) return;
    class Counting extends Original {
      createOscillator() {
        window.__tones += 1;
        return super.createOscillator();
      }
    }
    window.AudioContext = Counting;
    window.webkitAudioContext = Counting;
  });

  const seed = () => page.evaluate((data) => {
    sessionStorage.setItem('stays_booking_result', JSON.stringify(data));
  }, booking);

  // 1. Cold document: no gesture has ever happened on this tab.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await seed();
  await page.goto(CONFIRM, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const cold = await page.evaluate(() => ({
    tones: window.__tones,
    hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive),
  }));

  // 2. Same tab after a tap, then a full page load into the confirmation.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.click('body');
  await seed();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.evaluate((url) => { window.location.href = url; }, CONFIRM),
  ]);
  await new Promise((r) => setTimeout(r, 1200));
  const carried = await page.evaluate(() => ({
    tones: window.__tones,
    hasBeenActive: Boolean(navigator.userActivation?.hasBeenActive),
  }));

  // 3. Revisiting the same confirmation must stay quiet.
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const revisit = await page.evaluate(() => window.__tones);

  console.log(JSON.stringify({ cold, carried, revisit }, null, 2));
  await browser.close();
})();
