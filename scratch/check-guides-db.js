// scratch/check-guides-db.js
require('dotenv').config();
const { query, isDbConfigured, initDb } = require('../lib/db');

async function check() {
  if (!isDbConfigured()) {
    console.log('DB not configured');
    process.exit(0);
  }
  await initDb();

  console.log('=== BC_GUIDE_PROFILES ===');
  const gp = await query('SELECT id, email, status, step_personal FROM bc_guide_profiles');
  console.log(JSON.stringify(gp.rows, null, 2));

  console.log('=== BC_GUIDES ===');
  const g = await query('SELECT id, slug, name, email, verified, status FROM bc_guides');
  console.log(JSON.stringify(g.rows, null, 2));

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
