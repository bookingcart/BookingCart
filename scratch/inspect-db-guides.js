require('dotenv').config();
const { query, initDb, isDbConfigured } = require('../lib/db');
const guidesRoute = require('../api-routes/guides');

async function testAllDbRows() {
  if (!isDbConfigured()) {
    console.log('DB not configured');
    process.exit(1);
  }
  await initDb();

  console.log('--- Inspecting bc_guides table ---');
  const res1 = await query('SELECT * FROM bc_guides');
  console.log(`Found ${res1.rows.length} rows in bc_guides:`);
  for (const r of res1.rows) {
    console.log(`\nRow ID ${r.id}: slug="${r.slug}", name="${r.name}"`);
    console.log('  categories:', typeof r.categories, JSON.stringify(r.categories).slice(0, 100));
    console.log('  skills:', typeof r.skills, JSON.stringify(r.skills).slice(0, 100));
    console.log('  languages:', typeof r.languages, JSON.stringify(r.languages).slice(0, 100));
    console.log('  pricing:', typeof r.pricing, JSON.stringify(r.pricing));
    console.log('  availability:', typeof r.availability, JSON.stringify(r.availability).slice(0, 100));
    console.log('  areas:', typeof r.areas, JSON.stringify(r.areas).slice(0, 100));
    console.log('  certifications:', typeof r.certifications, JSON.stringify(r.certifications).slice(0, 100));
    console.log('  gallery:', typeof r.gallery, JSON.stringify(r.gallery).slice(0, 100));
    console.log('  reviews:', typeof r.reviews, JSON.stringify(r.reviews).slice(0, 100));
  }

  console.log('\n--- Inspecting bc_guide_profiles table ---');
  const res2 = await query('SELECT id, email, status, step_personal, step_experience, step_areas, step_pricing FROM bc_guide_profiles');
  console.log(`Found ${res2.rows.length} rows in bc_guide_profiles:`);
  for (const r of res2.rows) {
    console.log(`\nProfile ID ${r.id}: email="${r.email}", status="${r.status}"`);
    console.log('  step_personal:', JSON.stringify(r.step_personal));
    console.log('  step_experience:', JSON.stringify(r.step_experience));
    console.log('  step_areas:', JSON.stringify(r.step_areas));
    console.log('  step_pricing:', JSON.stringify(r.step_pricing));
  }
  process.exit(0);
}

testAllDbRows().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
