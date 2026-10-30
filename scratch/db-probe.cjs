require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
const ssl = url && !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: url, ssl });

(async () => {
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  const tables = await q(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'bc_cinema%' ORDER BY 1`
  );
  console.log('cinema tables:', tables.map((r) => r.table_name).join(', '));
  const screens = await q(
    `SELECT id, attraction_id, name, row_count, seats_per_row, status FROM bc_cinema_screens ORDER BY id LIMIT 10`
  );
  console.log('screens:', JSON.stringify(screens));
  const seats = await q(`SELECT screen_id, COUNT(*)::int AS n FROM bc_cinema_seats GROUP BY screen_id ORDER BY 1`);
  console.log('seats:', JSON.stringify(seats));
  const showtimes = await q(
    `SELECT id, attraction_id, screen_id, movie_id, show_date, start_time, base_price, currency FROM bc_cinema_showtimes ORDER BY id DESC LIMIT 8`
  );
  console.log('showtimes:', JSON.stringify(showtimes));
  const cols = await q(
    `SELECT column_name FROM information_schema.columns WHERE table_name='bc_cinema_showtimes' ORDER BY ordinal_position`
  );
  console.log('showtime cols:', cols.map((r) => r.column_name).join(','));
  const mig = await q(`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 3`).catch(() => []);
  console.log('migrations:', JSON.stringify(mig));
  await pool.end();
})().catch((error) => { console.error('PROBE FAILED', error.message); process.exit(1); });
