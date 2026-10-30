require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const file = process.argv[2];
if (!file) { console.error('usage: node scratch/apply-migration.cjs <sql-file>'); process.exit(1); }

const url = process.env.DATABASE_URL;
const ssl = url && !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: url, ssl });

(async () => {
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
  const client = await pool.connect();
  let done = 0;
  try {
    await client.query('BEGIN');
    for (const statement of statements) {
      await client.query(statement);
      done += 1;
    }
    await client.query('COMMIT');
    console.log(`applied ${done}/${statements.length} statements from ${file}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`FAILED after ${done} statements: ${error.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
