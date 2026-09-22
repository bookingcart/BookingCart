const fetch = require('node-fetch');

async function testHttpRoutes() {
  console.log('--- Testing API endpoint directly ---');
  const slugs = [
    'guide-black-denum',
    'guide-james-bogere-1788950215549',
    'guide-mustapha-ali-1788865352408',
    'guide-test-guide',
    'guide-ayebale-ayebale',
    'guide-mustapha-ali',
    'guide-james-bogere',
    'guide-sarah-johnson'
  ];

  for (const s of slugs) {
    try {
      const res = await fetch(`http://localhost:3001/api/guides?slug=${s}`);
      const json = await res.json();
      console.log(`API lookup for "${s}": status=${res.status}, ok=${json.ok}, guideName="${json.guide?.name}"`);
    } catch (e) {
      console.error(`API lookup failed for "${s}":`, e.message);
    }
  }

  console.log('\n--- Testing Frontend routes HTML ---');
  try {
    const res = await fetch('http://127.0.0.1:3000/tour-guides/guide-black-denum');
    console.log(`Frontend index HTML fetch: status=${res.status}, size=${(await res.text()).length} bytes`);
  } catch (e) {
    console.error('Frontend fetch failed:', e.message);
  }
}

testHttpRoutes();
