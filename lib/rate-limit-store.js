'use strict';

/**
 * Postgres-backed rate limit store for express-rate-limit.
 *
 * Serverless functions do not share memory, so the default in-memory store
 * resets on every cold start and effectively disables brute-force protection on
 * auth endpoints. This store keeps counters in bc_rate_limits and falls back to
 * an in-memory store only when the database is unreachable, so a database
 * outage cannot lock everyone out.
 */

const { MemoryStore } = require('express-rate-limit');
const { query, isDbConfigured } = require('./db');

const CLEANUP_EVERY = 500;

class PgRateLimitStore {
  /**
   * @param {object} options
   * @param {string} options.prefix Namespace so different limiters do not share counters.
   */
  constructor({ prefix = 'rl' } = {}) {
    this.prefix = prefix;
    this.localKeys = false;
    this.windowMs = 60 * 1000;
    this.fallback = new MemoryStore();
    this.calls = 0;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  storeKey(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    if (!isDbConfigured()) return this.fallback.increment(key);

    try {
      const result = await query(
        `INSERT INTO bc_rate_limits (key, count, reset_at)
         VALUES ($1, 1, NOW() + ($2::text || ' milliseconds')::interval)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN bc_rate_limits.reset_at <= NOW() THEN 1 ELSE bc_rate_limits.count + 1 END,
           reset_at = CASE WHEN bc_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE bc_rate_limits.reset_at END
         RETURNING count, reset_at`,
        [this.storeKey(key), this.windowMs]
      );
      const row = result.rows[0];
      this.maybeCleanup();
      return { totalHits: Number(row.count), resetTime: new Date(row.reset_at) };
    } catch (error) {
      console.warn('[rate-limit] Postgres store unavailable, using in-memory fallback:', error.message);
      return this.fallback.increment(key);
    }
  }

  async decrement(key) {
    if (!isDbConfigured()) return this.fallback.decrement(key);
    try {
      await query(
        'UPDATE bc_rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1',
        [this.storeKey(key)]
      );
    } catch (error) {
      console.warn('[rate-limit] decrement failed:', error.message);
      return this.fallback.decrement(key);
    }
    return undefined;
  }

  async resetKey(key) {
    if (!isDbConfigured()) return this.fallback.resetKey(key);
    try {
      await query('DELETE FROM bc_rate_limits WHERE key = $1', [this.storeKey(key)]);
    } catch (error) {
      console.warn('[rate-limit] resetKey failed:', error.message);
      return this.fallback.resetKey(key);
    }
    return undefined;
  }

  /** Drop expired rows occasionally so the table cannot grow without bound. */
  maybeCleanup() {
    this.calls += 1;
    if (this.calls % CLEANUP_EVERY !== 0) return;
    query('DELETE FROM bc_rate_limits WHERE reset_at < NOW()').catch(() => {});
  }
}

module.exports = { PgRateLimitStore };
