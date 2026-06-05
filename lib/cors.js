'use strict';

/**
 * CORS helpers: use ALLOWED_ORIGINS (comma-separated) in production.
 * In non-production, request origins are allowed for local/dev convenience.
 */

let _cachedOriginsRaw = null;
let _cachedOrigins = null;

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  if (_cachedOrigins !== null && _cachedOriginsRaw === raw) return _cachedOrigins;
  _cachedOriginsRaw = raw;
  _cachedOrigins = raw
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);
  return _cachedOrigins;
}

function normalizeOrigin(value) {
  const origin = String(value || '').trim().replace(/\/+$/, '');
  if (!origin) return '';
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function pickAllowOrigin(requestOrigin) {
  const list = parseAllowedOrigins();
  const origin = normalizeOrigin(requestOrigin);
  if (list.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
    if (origin) return origin;
    return 'http://localhost:3000';
  }
  if (origin && list.includes(origin)) return origin;
  return null;
}

function getAllowedOriginsConfigError() {
  if (process.env.NODE_ENV === 'production' && parseAllowedOrigins().length === 0) {
    return 'ALLOWED_ORIGINS is required in production';
  }
  return null;
}

function assertAllowedOrigin(origin) {
  const configError = getAllowedOriginsConfigError();
  if (configError) {
    return { ok: false, status: 503, error: configError };
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Missing request origin' };
  }

  const allow = pickAllowOrigin(normalized);
  if (allow !== normalized) {
    return { ok: false, status: 403, error: 'Origin is not allowed' };
  }

  return { ok: true, origin: normalized };
}

function getCorsHeaders(reqLike) {
  const origin =
    (reqLike.headers && (reqLike.headers.origin || reqLike.headers.Origin)) || '';
  const allow = pickAllowOrigin(String(origin));
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (allow) {
    headers['Access-Control-Allow-Origin'] = allow;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function applyCors(req, res) {
  const headers = getCorsHeaders(req);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

module.exports = {
  applyCors,
  assertAllowedOrigin,
  getAllowedOriginsConfigError,
  getCorsHeaders,
  normalizeOrigin,
  parseAllowedOrigins,
  pickAllowOrigin
};
