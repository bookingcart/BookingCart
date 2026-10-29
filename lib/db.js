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
      connectionTimeoutMillis: 15000,
    });
    // pg emits 'error' on *idle* clients when the server drops a socket. With no
    // listener Node treats it as an unhandled exception and exits, so a single
    // network blip would take the whole API down. Log it and let the pool
    // replace the connection on the next query instead.
    pool.on("error", (err) => {
      console.error("[DB] Idle client error:", err.message);
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

/**
 * Run a set of statements inside a single transaction. The callback receives a
 * dedicated client so row locks (SELECT ... FOR UPDATE) stay valid until COMMIT,
 * which is what prevents ticket overselling under concurrent checkouts.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.warn("[DB] Rollback failed:", rollbackError.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

// Tables that must exist before API handlers run. Keep in sync with db/schema.js
// and db/migrations; every table here is created by a migration, never at runtime.
const REQUIRED_TABLES = [
  "bc_users",
  "bc_bookings",
  "bc_search_cache",
  "bc_admin_audit",
  "bc_support",
  "bc_price_alerts",
  "bc_attraction_events",
  "bc_attraction_profiles",
  "bc_event_profiles",
  "bc_event_bookings",
  "bc_event_organizer_profiles",
  "bc_guides",
  "bc_guide_bookings",
  "bc_guide_profiles",
  "bc_guide_reviews",
  "bc_guide_withdrawals",
  "bc_hotel_profiles",
  "bc_pms_floors",
  "bc_pms_rooms",
  "bc_pms_bookings",
  "bc_pms_blocks",
  "bc_pms_holds",
  "bc_ticket_validations",
  "bc_ticket_types",
  "bc_ticket_slots",
  "bc_ticket_calendar",
  "bc_ticket_inventory",
  "bc_ticket_promos",
  "bc_ticket_orders",
  "bc_ticket_order_items",
  "bc_attraction_tickets",
  "bc_ticket_staff",
  "bc_ticket_settings",
  "bc_ticket_audit",
  "bc_ticket_batches",
  "bc_ticket_branding",
  "bc_ticket_prints",
  "bc_cash_shifts",
  "bc_cash_movements",
  "bc_uploaded_images",
  "bc_aviation_records",
  "bc_rate_limits",
  "ba_user",
  "ba_session",
  "ba_account",
  "ba_verification",
  "__drizzle_migrations__",
];

async function ensureMigratedSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    try {
      const result = await query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `, [REQUIRED_TABLES]);

      const found = new Set(result.rows.map((row) => row.table_name));
      const missing = REQUIRED_TABLES.filter((name) => !found.has(name));

      if (missing.length > 0) {
        throw new Error(`Database schema is not migrated. Missing tables: ${missing.join(", ")}. Run npm run db:migrate:deploy.`);
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
  REQUIRED_TABLES,
  getAdminPin,
  getCache,
  getPool,
  initDb,
  isDbConfigured,
  query,
  setCache,
  withTransaction,
  writeAudit,
};
