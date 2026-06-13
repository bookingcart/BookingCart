import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import schema from "../db/schema.js";

const { Pool } = pg;

let pool;
let db;

function requiresSsl(databaseUrl) {
  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

export function isDrizzleDbConfigured() {
  return !!String(process.env.DATABASE_URL || "").trim();
}

export function getDrizzlePool() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: requiresSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  return pool;
}

export function getDrizzleDb() {
  if (!db) {
    db = drizzle(getDrizzlePool(), { schema });
  }
  return db;
}
