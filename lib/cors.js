'use strict';

/**
 * CORS helpers: use ALLOWED_ORIGINS (comma-separated) in production.
 * In non-production, reflects request Origin when possible, else *.
 */
function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickAllowOrigin(requestOrigin) {
  const list = parseAllowedOrigins();
  if (list.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      const url = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
      if (url && requestOrigin && url.replace(/\/$/, '') === requestOrigin.replace(/\/$/, '')) {
        return requestOrigin;
      }
      return requestOrigin || null;
    }
    if (requestOrigin) return requestOrigin;
    return 'http://localhost:3000';
  }
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return list[0] || null;
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

module.exports = { getCorsHeaders, pickAllowOrigin, parseAllowedOrigins };
