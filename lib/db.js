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
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
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

      CREATE TABLE IF NOT EXISTS bookings (
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
        ticket          JSONB,
        download_count  INT DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS search_cache (
        id          SERIAL PRIMARY KEY,
        key         TEXT UNIQUE NOT NULL,
        payload     JSONB DEFAULT '{}'::jsonb,
        meta        JSONB DEFAULT '{}'::jsonb,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_audit (
        id          SERIAL PRIMARY KEY,
        event       JSONB DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS support (
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

      CREATE TABLE IF NOT EXISTS price_alerts (
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

      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings (ref);
      CREATE INDEX IF NOT EXISTS idx_bookings_contact_email ON bookings (contact_email);
      CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache (key);
      CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache (expires_at);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_support_thread_id ON support (thread_id);
      CREATE INDEX IF NOT EXISTS idx_support_updated ON support (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_email ON price_alerts (email);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts (status);
    `;
    await query(sql);
    console.log("[DB] Postgres schema initialized successfully.");
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

// ── Cache helpers (same API as the old mongo.js ones) ──────────────────────

async function getCache(key) {
  try {
    const result = await query(
      `SELECT payload, meta, expires_at FROM search_cache WHERE key = $1 AND expires_at > NOW()`,
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
      `INSERT INTO search_cache (key, payload, meta, expires_at, updated_at)
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
      `INSERT INTO admin_audit (event, created_at) VALUES ($1, NOW())`,
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
