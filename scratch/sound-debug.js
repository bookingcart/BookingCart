/* Why is the confirmation page silent? Traces context creation, resume and
 * every playSound decision from the instrumented AudioContext. */
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:5199';
const CONFIRM = `${BASE}/stays/confirmation?quote_id=quo_local_1_1791357842289_n7&direct=1`;

const booking = {
  reference: 'BCS-DEBUG01',
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
  page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.evaluateOnNewDocument(() => {
    window.__log = [];
    const Original = window.AudioContext || window.webkitAudioContext;
    if (!Original) return;
    class Counting extends Original {
      constructor(...args) {
        super(...args);
        window.__log.push(`ctx created ${this.state}`);
      }
      createOscillator() {
        window.__log.push('oscillator');
        return super.createOscillator();
      }
      resume() {
        window.__log.push(`resume called (${this.state})`);
        return super.resume();
      }
    }
    window.AudioContext = Counting;
    window.webkitAudioContext = Counting;
  });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => sessionStorage.setItem('stays_booking_result', JSON.stringify(data)), booking);
  await page.goto(CONFIRM, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const state = await page.evaluate(() => ({
    log: window.__log,
    sound: localStorage.getItem('bc_sound'),
    played: sessionStorage.getItem('bc_sound_played'),
    hasBooking: Boolean(document.querySelector('.ticket-print')),
    userActivation: Boolean(navigator.userActivation?.hasBeenActive),
  }));
  console.log(JSON.stringify(state, null, 2));

  // A tap afterwards: does the held chime flush?
  await page.click('body');
  await new Promise((r) => setTimeout(r, 800));
  const after = await page.evaluate(() => window.__log);
  console.log('after click:', JSON.stringify(after));

  await browser.close();
})();
