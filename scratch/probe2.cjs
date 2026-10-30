require('dotenv').config();
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, ssl: url && !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : false });
(async () => {
  const q = async (s) => (await pool.query(s)).rows;
  console.log('versions', JSON.stringify(await q('SELECT id, screen_id, version, status, capacity FROM bc_cinema_layout_versions')));
  console.log('seat versions', JSON.stringify(await q('SELECT layout_version_id, COUNT(*)::int n FROM bc_cinema_seats GROUP BY 1')));
  console.log('screens', JSON.stringify(await q('SELECT id, active_layout_version_id, capacity FROM bc_cinema_screens')));
  console.log('showtimes', JSON.stringify(await q('SELECT id, layout_version_id FROM bc_cinema_showtimes')));
  console.log('types', JSON.stringify(await q('SELECT slug, name, multiplier, admissions FROM bc_cinema_seat_types ORDER BY sort_order')));
  await pool.end();
})();
