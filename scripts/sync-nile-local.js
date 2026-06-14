"use strict";

require("dotenv").config();

const { Pool } = require("pg");

const TABLES = [
  "bc_users",
  "bc_bookings",
  "bc_search_cache",
  "bc_admin_audit",
  "bc_support",
  "bc_price_alerts",
];

function getEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiresSsl(databaseUrl) {
  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

function createPool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: requiresSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
    max: 4,
  });
}

function normalizeValue(value) {
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
}

async function resetSequence(local, table) {
  const sequenceResult = await local.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [table]);
  const sequenceName = sequenceResult.rows[0] && sequenceResult.rows[0].sequence_name;
  if (!sequenceName) return;

  await local.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
    [sequenceName]
  );
}

async function insertRows(local, table, rows) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const columnSql = columns.map((column) => `"${column}"`).join(", ");
    const values = columns.map((column) => normalizeValue(row[column]));
    await local.query(`INSERT INTO ${table} (${columnSql}) VALUES (${placeholders})`, values);
  }
}

async function main() {
  const remoteUrl = getEnv("NILE_DATABASE_URL");
  const localUrl = process.env.LOCAL_DATABASE_URL || "postgres://localhost/bookingcart_local";
  const remote = createPool(remoteUrl);
  const local = createPool(localUrl);

  try {
    await local.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of TABLES) {
      const result = await remote.query(`SELECT * FROM public.${table} ORDER BY id`);
      await insertRows(local, table, result.rows);
      await resetSequence(local, table);
      console.log(`${table}: copied ${result.rowCount} rows`);
    }
  } finally {
    await remote.end();
    await local.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
