"use strict";

const { MongoClient } = require("mongodb");

const DEFAULT_DB_NAME = process.env.MONGODB_DB || "bookingcart";
const BOOKINGS_COLLECTION = "bookings";
const USERS_COLLECTION = "users";
const SEARCH_CACHE_COLLECTION = "search_cache";
const ADMIN_AUDIT_COLLECTION = "admin_audit";
const SUPPORT_COLLECTION = "support";
const PRICE_ALERTS_COLLECTION = "price_alerts";

let clientPromise = null;
let indexPromise = null;

function getMongoUri() {
  return String(process.env.MONGODB_URI || "").trim();
}

function isMongoConfigured() {
  return !!getMongoUri();
}

function getAdminPin() {
  const pin = String(process.env.ADMIN_PIN || "").trim();
  if (!pin) {
    throw new Error("ADMIN_PIN is not configured");
  }
  return pin;
}

function getDbName() {
  return String(process.env.MONGODB_DB || DEFAULT_DB_NAME).trim() || DEFAULT_DB_NAME;
}

async function connectClient() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!clientPromise) {
    // Support X.509 certificate authentication
    const options = {};
    if (uri.includes('authMechanism=MONGODB-X509')) {
      options.tls = true;
      options.authMechanism = 'MONGODB-X509';
    }
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

async function getDb() {
  const client = await connectClient();
  return client.db(getDbName());
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(BOOKINGS_COLLECTION).createIndex({ ref: 1 }, { unique: true }),
    db.collection(BOOKINGS_COLLECTION).createIndex({ "contact.email": 1 }),
    db.collection(BOOKINGS_COLLECTION).createIndex({ createdAt: -1 }),
    db.collection(USERS_COLLECTION).createIndex({ "profile.email": 1 }, { unique: true }),
    db.collection(SEARCH_CACHE_COLLECTION).createIndex({ key: 1 }, { unique: true }),
    db.collection(SEARCH_CACHE_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(ADMIN_AUDIT_COLLECTION).createIndex({ createdAt: -1 }),
    db.collection(SUPPORT_COLLECTION).createIndex({ id: 1 }, { unique: true }),
    db.collection(SUPPORT_COLLECTION).createIndex({ updatedAt: -1 }),
    db.collection(PRICE_ALERTS_COLLECTION).createIndex({ email: 1 }),
    db.collection(PRICE_ALERTS_COLLECTION).createIndex({ status: 1 })
  ]);
}

async function getCollections() {
  const db = await getDb();
  if (!indexPromise) {
    indexPromise = ensureIndexes(db);
  }
  await indexPromise;

  return {
    db,
    bookings: db.collection(BOOKINGS_COLLECTION),
    users: db.collection(USERS_COLLECTION),
    searchCache: db.collection(SEARCH_CACHE_COLLECTION),
    audit: db.collection(ADMIN_AUDIT_COLLECTION),
    support: db.collection(SUPPORT_COLLECTION),
    priceAlerts: db.collection(PRICE_ALERTS_COLLECTION)
  };
}

async function getCache(collection, key) {
  const doc = await collection.findOne({
    key,
    expiresAt: { $gt: new Date() }
  });

  if (!doc) {
    return null;
  }

  return {
    payload: doc.payload,
    meta: doc.meta || {},
    expiresAt: doc.expiresAt
  };
}

async function setCache(collection, key, payload, ttlMs, meta = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  await collection.updateOne(
    { key },
    {
      $set: {
        key,
        payload,
        meta,
        expiresAt,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return { key, payload, meta, expiresAt };
}

async function writeAudit(collection, event) {
  if (!collection) return;
  try {
    await collection.insertOne({
      ...event,
      createdAt: new Date()
    });
  } catch (error) {
    console.warn("Audit log write failed:", error && error.message ? error.message : error);
  }
}

module.exports = {
  getAdminPin,
  getCache,
  getCollections,
  getDb,
  isMongoConfigured,
  setCache,
  writeAudit
};
