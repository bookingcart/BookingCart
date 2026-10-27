"use strict";

require("dotenv").config();

const { spawnSync } = require("node:child_process");

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`[vercel-build] Error running ${command}:`, result.error.message);
    if (!allowFailure) process.exit(1);
    return false;
  }

  if (result.status !== 0) {
    if (!allowFailure) process.exit(result.status || 1);
    return false;
  }

  return true;
}

function fail(message) {
  console.error(`[vercel-build] ${message}`);
  process.exit(1);
}

// Local `vite build` alone never migrates; this wrapper is the deploy path and
// therefore must apply migrations before the app is published.
if (process.env.SKIP_DB_MIGRATIONS === "1") {
  console.warn("[vercel-build] SKIP_DB_MIGRATIONS=1 set. Skipping database migrations (local/offline builds only).");
} else if (!process.env.DATABASE_URL) {
  fail(
    "DATABASE_URL is not set. Migrations cannot run, so the deployment would start against an unmigrated schema. " +
      "Set DATABASE_URL for this environment (see README), or set SKIP_DB_MIGRATIONS=1 for a local-only build."
  );
} else {
  console.log("[vercel-build] Running database migrations before build...");
  if (!run("npm", ["run", "db:migrate:deploy"])) {
    fail("Database migrations failed. Fix the failing migration before deploying.");
  }
  console.log("[vercel-build] Database migrations applied.");
}

console.log("[vercel-build] Building client application...");
run("npm", ["run", "build"]);
