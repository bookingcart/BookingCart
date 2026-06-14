"use strict";

require("dotenv").config();

const { Pool } = require("pg");
const { readMigrationFiles } = require("drizzle-orm/migrator");
const drizzleConfig = require("../drizzle.config.js");

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function requiresSsl(databaseUrl) {
  if (!databaseUrl) return false;
  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

function sqlPreview(statement) {
  return statement.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function ensureMigrationsTable(client, schema, table) {
  if (schema !== "public") {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running migrations.");
  }

  const migrationsFolder = drizzleConfig.out || "./db/migrations";
  const migrationsSchema = drizzleConfig.migrations?.schema || "drizzle";
  const migrationsTable = drizzleConfig.migrations?.table || "__drizzle_migrations";
  const migrations = readMigrationFiles({ migrationsFolder });

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: requiresSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  const tableRef = `${quoteIdentifier(migrationsSchema)}.${quoteIdentifier(migrationsTable)}`;

  try {
    console.log(`[migrations] Ensuring journal table ${migrationsSchema}.${migrationsTable}`);
    await ensureMigrationsTable(client, migrationsSchema, migrationsTable);

    const { rows } = await client.query(
      `SELECT id, hash, created_at FROM ${tableRef} ORDER BY created_at DESC LIMIT 1`
    );
    const lastMigration = rows[0];
    const lastCreatedAt = lastMigration ? Number(lastMigration.created_at) : 0;
    console.log(`[migrations] Last applied migration timestamp: ${lastCreatedAt || "none"}`);

    let applied = 0;

    for (const migration of migrations) {
      if (lastCreatedAt >= migration.folderMillis) {
        console.log(`[migrations] Skipping ${migration.folderMillis}; already applied`);
        continue;
      }

      console.log(`[migrations] Applying ${migration.folderMillis} (${migration.sql.length} statements)`);
      await client.query("BEGIN");

      try {
        for (let i = 0; i < migration.sql.length; i += 1) {
          const statement = migration.sql[i].trim();
          if (!statement) continue;

          console.log(`[migrations] Statement ${i + 1}/${migration.sql.length}: ${sqlPreview(statement)}`);
          await client.query(statement);
        }

        await client.query(
          `INSERT INTO ${tableRef} ("hash", "created_at") VALUES ($1, $2)`,
          [migration.hash, migration.folderMillis]
        );
        await client.query("COMMIT");
        applied += 1;
        console.log(`[migrations] Applied ${migration.folderMillis}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`[migrations] Failed while applying ${migration.folderMillis}`);
        console.error(error);
        throw error;
      }
    }

    console.log(`[migrations] Complete. Applied ${applied} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[migrations] ${error.message}`);
  process.exit(1);
});
