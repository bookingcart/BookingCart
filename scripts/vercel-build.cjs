"use strict";

require("dotenv").config();

const { spawnSync } = require("node:child_process");

function run(command, args, allowFailure = false) {
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

if (!process.env.DATABASE_URL) {
  console.warn("[vercel-build] DATABASE_URL is not set. Skipping database migrations during build step.");
} else {
  console.log("[vercel-build] Running database migrations before build...");
  const ok = run("npm", ["run", "db:migrate:deploy"], true);
  if (!ok) {
    console.warn("[vercel-build] Database migration encountered an issue during build. Continuing build process...");
  }
}

console.log("[vercel-build] Building client application...");
run("npm", ["run", "build"]);

