"use strict";

require("dotenv").config();

const { defineConfig } = require("drizzle-kit");

function requiresSsl(databaseUrl) {
  if (!databaseUrl) return false;
  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

const databaseUrl = process.env.DATABASE_URL || "postgres://user:password@localhost:5432/bookingcart";

module.exports = defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.js",
  out: "./db/migrations",
  dbCredentials: {
    url: databaseUrl,
    ssl: requiresSsl(databaseUrl) ? "require" : false,
  },
  migrations: {
    table: "__drizzle_migrations__",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
