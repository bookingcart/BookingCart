"use strict";

require("dotenv").config();

const { spawnSync } = require("node:child_process");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`[vercel-build] Failed to run ${command}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
const forceMigrations = process.env.RUN_DB_MIGRATIONS === "1";
const shouldMigrate = forceMigrations || vercelEnv === "production";

if (shouldMigrate) {
  if (!process.env.DATABASE_URL) {
    console.error("[vercel-build] DATABASE_URL is required before running migrations.");
    process.exit(1);
  }

  console.log("[vercel-build] Running database migrations before build...");
  run("npm", ["run", "db:migrate"]);
} else {
  console.log(`[vercel-build] Skipping migrations for VERCEL_ENV=${vercelEnv || "unset"}.`);
}

run("npm", ["run", "build"]);
