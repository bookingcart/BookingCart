import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import schema from "../db/schema.js";
import { getDrizzleDb, isDrizzleDbConfigured } from "./drizzle.mjs";

let auth;
let nodeHandler;

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getBaseURL() {
  return String(process.env.BETTER_AUTH_URL || process.env.APP_URL || "").replace(/\/+$/, "");
}

function getGoogleProvider() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return {};
  return {
    google: {
      clientId,
      clientSecret,
    },
  };
}

export function getBetterAuth() {
  if (auth) return auth;
  if (!isDrizzleDbConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }

  const baseURL = getBaseURL();

  auth = betterAuth({
    appName: "BookingCart",
    basePath: "/api/better-auth",
    ...(baseURL ? { baseURL } : {}),
    secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET,
    database: drizzleAdapter(getDrizzleDb(), {
      provider: "pg",
      schema: {
        user: schema.baUser,
        session: schema.baSession,
        account: schema.baAccount,
        verification: schema.baVerification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: getGoogleProvider(),
    trustedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  });

  return auth;
}

export function getBetterAuthNodeHandler() {
  if (!nodeHandler) {
    nodeHandler = toNodeHandler(getBetterAuth());
  }
  return nodeHandler;
}

export async function handleBetterAuthNodeRequest(req, res) {
  try {
    return await getBetterAuthNodeHandler()(req, res);
  } catch (err) {
    const message = err && err.message ? err.message : "Better Auth is not configured";
    if (!res.headersSent) {
      return res.status(503).json({ ok: false, error: message });
    }
    throw err;
  }
}

export async function handleBetterAuthFetchRequest(request) {
  try {
    return await getBetterAuth().handler(request);
  } catch (err) {
    return Response.json(
      { ok: false, error: err && err.message ? err.message : "Better Auth is not configured" },
      { status: 503 }
    );
  }
}
