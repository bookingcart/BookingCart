"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";

let pool = null;
let schemaReady = null;

function getPool() {
  if (!pool) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

function isDbConfigured() {
  return !!DATABASE_URL;
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
 * Create all required tables if they don't exist.
 */
async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    try {
      const sql = `
      CREATE TABLE IF NOT EXISTS bc_users (
        id            SERIAL PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        name          TEXT DEFAULT '',
        password_hash TEXT,
        auth_method   TEXT DEFAULT 'google',
        profile       JSONB DEFAULT '{}'::jsonb,
        state         JSONB DEFAULT '{}'::jsonb,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bc_bookings (
        id              SERIAL PRIMARY KEY,
        ref             TEXT UNIQUE NOT NULL,
        contact_email   TEXT DEFAULT '',
        status          TEXT DEFAULT 'new',
        route           TEXT DEFAULT '',
        dates           TEXT DEFAULT '',
        flight          JSONB DEFAULT '{}'::jsonb,
        passengers      JSONB DEFAULT '[]'::jsonb,
        contact         JSONB DEFAULT '{}'::jsonb,
        extras          JSONB DEFAULT '{}'::jsonb,
        total           NUMERIC(12,2) DEFAULT 0,
        payment         JSONB,
        payment_split   JSONB,
        duffel_order_id TEXT DEFAULT '',
        duffel_booking_reference TEXT DEFAULT '',
        duffel_order_status TEXT DEFAULT '',
        duffel_order_request JSONB,
        ticket          JSONB,
        download_count  INT DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bc_search_cache (
        id          SERIAL PRIMARY KEY,
        key         TEXT UNIQUE NOT NULL,
        payload     JSONB DEFAULT '{}'::jsonb,
        meta        JSONB DEFAULT '{}'::jsonb,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bc_admin_audit (
        id          SERIAL PRIMARY KEY,
        event       JSONB DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bc_support (
        id          SERIAL PRIMARY KEY,
        thread_id   TEXT UNIQUE NOT NULL,
        email       TEXT DEFAULT '',
        topic       TEXT DEFAULT '',
        status      TEXT DEFAULT 'open',
        admin_read  BOOLEAN DEFAULT false,
        messages    JSONB DEFAULT '[]'::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bc_price_alerts (
        id            SERIAL PRIMARY KEY,
        email         TEXT NOT NULL,
        origin        TEXT DEFAULT '',
        destination   TEXT DEFAULT '',
        depart_date   TEXT DEFAULT '',
        target_price  NUMERIC(12,2) DEFAULT 0,
        currency      TEXT DEFAULT 'USD',
        is_nonstop    BOOLEAN DEFAULT false,
        status        TEXT DEFAULT 'active',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON bc_users (email);
      CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bc_bookings (ref);
      CREATE INDEX IF NOT EXISTS idx_bookings_contact_email ON bc_bookings (contact_email);
      CREATE INDEX IF NOT EXISTS idx_bookings_created ON bc_bookings (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_search_cache_key ON bc_search_cache (key);
      CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON bc_search_cache (expires_at);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON bc_admin_audit (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_support_thread_id ON bc_support (thread_id);
      CREATE INDEX IF NOT EXISTS idx_support_updated ON bc_support (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_email ON bc_price_alerts (email);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON bc_price_alerts (status);
    `;
    await query(sql);

    await query(`
      ALTER TABLE bc_bookings
        ADD COLUMN IF NOT EXISTS payment_split JSONB,
        ADD COLUMN IF NOT EXISTS duffel_order_id TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS duffel_booking_reference TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS duffel_order_status TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS duffel_order_request JSONB
    `);
    console.log("[DB] Postgres schema initialized successfully.");
    } catch (err) {
      // Reset so the next request gets a fresh attempt (transient failure recovery)
      schemaReady = null;
      throw err;
    }
  })();

  return schemaReady;
}

/**
 * Initialize the database: get pool + ensure schema.
 * Call this once at startup.
 */
async function initDb() {
  if (!isDbConfigured()) {
    console.warn("[DB] DATABASE_URL is not configured. Using in-memory fallback.");
    return false;
  }
  try {
    await ensureSchema();
    return true;
  } catch (err) {
    console.error("[DB] Failed to initialize Postgres:", err.message);
    return false;
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
