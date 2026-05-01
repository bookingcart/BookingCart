const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  console.log('Navigating to http://localhost:3000');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  console.log('Waiting for .g_id_signin');
  try {
    await page.waitForSelector('.g_id_signin', { timeout: 5000 });
    const innerHTML = await page.$eval('.g_id_signin', el => el.innerHTML);
    console.log('SignIn HTML length:', innerHTML.length);
    if (innerHTML.length > 0) {
      console.log('Button is rendered!');
    } else {
      console.log('Button is empty!');
    }
  } catch(e) {
    console.log('Could not find .g_id_signin');
  }

  await browser.close();
})();
