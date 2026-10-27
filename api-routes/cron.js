'use strict';

/**
 * Serverless-friendly scheduler entry point.
 *
 * Serverless functions cannot keep node-cron timers alive, so the price tracker
 * and the search-cache eviction are triggered by platform crons hitting these
 * endpoints. The in-process node-cron schedules stay available for local
 * development and can be disabled with DISABLE_IN_PROCESS_CRON=1.
 *
 * Usage (see vercel.json -> crons):
 *   GET /api/cron/price-tracker
 *   GET /api/cron/cache-eviction
 */

const crypto = require('crypto');
const { checkPrices } = require('../lib/price-tracker');
const { query, isDbConfigured, initDb } = require('../lib/db');

const TASK_BY_PATH = {
  'price-tracker': 'price-check',
  'cache-eviction': 'cache-eviction',
};

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readToken(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const queryToken = req.query?.token;
  return typeof queryToken === 'string' ? queryToken.trim() : '';
}

async function evictExpiredCache() {
  if (!isDbConfigured()) return { skipped: 'DATABASE_URL is not configured' };
  await initDb();
  const result = await query('DELETE FROM bc_search_cache WHERE expires_at < NOW()');
  return { evicted: result.rowCount || 0 };
}

module.exports = async function cronHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) {
    return res.status(503).json({ ok: false, error: 'CRON_SECRET is not configured' });
  }
  if (!safeEqual(readToken(req), secret)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const suffix = String(req.path || '').split('/').filter(Boolean).pop();
  const task = req.query?.task || TASK_BY_PATH[suffix] || 'all';
  const startedAt = Date.now();

  try {
    const result = {};
    if (task === 'price-check' || task === 'all') {
      await checkPrices();
      result.priceCheck = 'completed';
    }
    if (task === 'cache-eviction' || task === 'all') {
      result.cacheEviction = await evictExpiredCache();
    }
    if (Object.keys(result).length === 0) {
      return res.status(400).json({ ok: false, error: `Unknown task: ${task}` });
    }

    return res.json({ ok: true, task, durationMs: Date.now() - startedAt, ...result });
  } catch (error) {
    console.error('[cron] task failed:', error);
    return res.status(500).json({ ok: false, task, error: error.message || 'Cron task failed' });
  }
};
