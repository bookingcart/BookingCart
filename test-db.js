require('dotenv').config();
const { query, isDbConfigured, initDb } = require('./lib/db');

async function testConnection() {
  console.log('Testing Postgres Connection...');
  if (!isDbConfigured()) {
    console.error('DATABASE_URL is not set!');
    process.exit(1);
  }

  try {
    await initDb();
    const result = await query('SELECT NOW() as time');
    console.log('✅ Connection successful!');
    console.log('Server time:', result.rows[0].time);
    
    // Check tables
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables found:', tables.rows.map(r => r.table_name).join(', '));
    
  } catch (err) {
    console.error('❌ Connection failed:', err);
  } finally {
    process.exit(0);
  }
}

testConnection();
