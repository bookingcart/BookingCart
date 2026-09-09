require('dotenv').config();
const { query, initDb } = require('../lib/db');

async function testSql() {
  await initDb();
  const guideId = 'guide-sarah-johnson';
  const cleanId = guideId.toLowerCase();
  const cleanNoPrefix = cleanId.replace(/^guide-/, '');
  const cleanWithPrefix = cleanId.startsWith('guide-') ? cleanId : 'guide-' + cleanId;
  const cleanSpaces = cleanId.replace(/-/g, ' ');

  console.log('Testing query 1: bc_guides...');
  try {
    const res1 = await query(
      `SELECT * FROM bc_guides 
       WHERE LOWER(slug) = $1 
          OR LOWER(slug) = $2
          OR LOWER(slug) = $3
          OR (email IS NOT NULL AND LOWER(TRIM(email)) = $1)
          OR LOWER(TRIM(name)) = $1
          OR LOWER(TRIM(name)) = $4
          OR LOWER(REPLACE(slug, '-', ' ')) = $4
       LIMIT 1`,
      [cleanId, cleanNoPrefix, cleanWithPrefix, cleanSpaces]
    );
    console.log('Query 1 success, rows:', res1.rows.length);
  } catch (e) {
    console.error('Query 1 failed:', e.message);
  }

  console.log('Testing query 2: bc_guide_profiles...');
  try {
    const res2 = await query(
      `SELECT * FROM bc_guide_profiles 
       WHERE (id::text = $1)
          OR LOWER(TRIM(email)) = $1
          OR LOWER(TRIM(step_personal->>'fullName')) = $1
          OR LOWER(TRIM(step_personal->>'fullName')) = $2
          OR LOWER(TRIM(step_personal->>'name')) = $1
          OR LOWER(TRIM(step_personal->>'name')) = $2
       ORDER BY created_at DESC LIMIT 1`,
      [cleanId, cleanSpaces]
    );
    console.log('Query 2 success, rows:', res2.rows.length);
  } catch (e) {
    console.error('Query 2 failed:', e.message);
  }
  process.exit(0);
}

testSql();
