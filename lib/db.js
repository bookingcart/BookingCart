"use strict";

const { Pool } = require("pg");

let pool = null;
let schemaReady = null;
let poolDatabaseUrl = "";

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function requiresSsl(databaseUrl) {
  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

function getPool() {
  const databaseUrl = getDatabaseUrl();

  if (!pool) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured");
    }
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: requiresSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    poolDatabaseUrl = databaseUrl;
  } else if (poolDatabaseUrl !== databaseUrl) {
    pool.end().catch((err) => console.warn("[DB] Failed to close previous pool:", err.message));
    pool = null;
    schemaReady = null;
    return getPool();
  }
  return pool;
}

function isDbConfigured() {
  return !!getDatabaseUrl();
}

function getAdminPin() {
  const pin = String(process.env.ADMIN_PIN || "").trim();
  if (!pin) {
    throw new Error("ADMIN_PIN is not configured");
  }
  return pin;
}

async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

async function ensureMigratedSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    try {
      const result = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `, [[
        "bc_users",
        "bc_bookings",
        "bc_search_cache",
        "bc_admin_audit",
        "bc_support",
        "bc_price_alerts",
      ]]);

      const found = new Set(result.rows.map((row) => row.table_name));
      const missing = [
        "bc_users",
        "bc_bookings",
        "bc_search_cache",
        "bc_admin_audit",
        "bc_support",
        "bc_price_alerts",
      ].filter((name) => !found.has(name));

      if (missing.length > 0) {
        throw new Error(`Database schema is not migrated. Missing tables: ${missing.join(", ")}. Run npm run db:migrate.`);
      }

      console.log("[DB] Postgres schema verified.");
    } catch (err) {
      // Reset so the next request gets a fresh attempt (transient failure recovery)
      schemaReady = null;
      throw err;
    }
  })();

  return schemaReady;
}

/**
 * Initialize the database connection and verify migrations have been applied.
 * Call this once at startup.
 */
async function initDb() {
  if (!isDbConfigured()) {
    console.warn("[DB] DATABASE_URL is not configured. Using in-memory fallback.");
    return false;
  }
  try {
    await ensureMigratedSchema();
    return true;
  } catch (err) {
    console.error("[DB] Failed to initialize Postgres:", err.message);
    throw err;
  }
}

// ── Cache helpers ───────────────────────────────────────────────────────────

async function getCache(key) {
  try {
    const result = await query(
      `SELECT payload, meta, expires_at FROM bc_search_cache WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      payload: row.payload,
      meta: row.meta || {},
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

async function setCache(key, payload, ttlMs, meta = {}) {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await query(
      `INSERT INTO bc_search_cache (key, payload, meta, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = $2, meta = $3, expires_at = $4, updated_at = NOW()`,
      [key, JSON.stringify(payload), JSON.stringify(meta), expiresAt]
    );
  } catch (err) {
    console.warn("[DB] Cache write failed:", err.message);
  }
}

async function writeAudit(event) {
  try {
    await query(
      `INSERT INTO bc_admin_audit (event, created_at) VALUES ($1, NOW())`,
      [JSON.stringify(event)]
    );
  } catch (err) {
    console.warn("[DB] Audit log write failed:", err.message);
  }
}

module.exports = {
  getAdminPin,
  getCache,
  getPool,
  initDb,
  isDbConfigured,
  query,
  setCache,
  writeAudit,
};
