/* Are the Phosphor icons actually painting, or is the font blocked here? */
const puppeteer = require('puppeteer');

const booking = {
  reference: 'BCS-NBAZZXN',
  status: 'confirmed',
  email: 'stephanwolf001@gmail.com',
  phone_number: '+25634344',
  guests: [{ given_name: 'Stephan', family_name: 'Wolf' }],
  accommodation: { name: 'Hamz Accomodations', rating: 4, photos: [], address: { line_1: 'Plot 12', city_name: 'Kampala', country_code: 'UG' } },
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
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => sessionStorage.setItem('stays_booking_result', JSON.stringify(data)), booking);
  await page.goto('http://localhost:5199/stays/confirmation?quote_id=q&direct=1', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const info = await page.evaluate(async () => {
    const icon = document.querySelector('.ph');
    const style = icon ? getComputedStyle(icon, '::before') : null;
    return {
      iconClass: icon?.className,
      glyph: style?.content,
      fontFamily: style?.fontFamily,
      loaded: [...document.fonts].map((f) => `${f.family}:${f.status}`).slice(0, 8),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
