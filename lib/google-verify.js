'use strict';

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

let client = null;

function getClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return null;
  if (!client) client = new OAuth2Client(id);
  return client;
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'bc_jwt_dev_secret_change_in_prod';
}

function signBookingCartJwt(payload, options) {
  return jwt.sign(payload, getJwtSecret(), options);
}

/**
 * @param {string} bearerHeader - value of Authorization header
 * @returns {Promise<{ ok: true, email: string, payload: object } | { ok: false, status: number, error: string }>}
 */
async function verifyAuthorizationBearer(bearerHeader) {
  if (!bearerHeader || !String(bearerHeader).startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing or invalid Authorization' };
  }
  const idToken = String(bearerHeader).slice('Bearer '.length).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: 'Missing ID token' };
  }

  try {
    // Try to decode as our own JWT first
    const decoded = jwt.verify(idToken, getJwtSecret());
    
    if (decoded) {
      if (decoded.email) {
        return { ok: true, email: decoded.email.toLowerCase(), payload: decoded };
      }
      if (decoded.userId) {
        // Local auth with userId instead of email in token
        try {
          const { query, isDbConfigured, initDb } = require('./db');
          if (isDbConfigured()) {
            await initDb();
            const result = await query('SELECT email FROM bc_users WHERE id = $1', [decoded.userId]);
            if (result.rows.length > 0) {
              return { ok: true, email: result.rows[0].email, payload: decoded };
            }
          }
        } catch (dbErr) {
          console.warn('DB lookup failed during JWT verification:', dbErr.message);
        }
      }
    }
  } catch (err) {
    if (err && err.message === 'JWT_SECRET is required in production') {
      return { ok: false, status: 503, error: err.message };
    }
    // Not our JWT, or expired. Fall back to Google verification below.
  }

  const oauth = getClient();
  if (!oauth) {
    return { ok: false, status: 503, error: 'Google Sign-In is not configured (GOOGLE_CLIENT_ID)' };
  }

  try {
    const ticket = await oauth.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const email = (payload.email || '').trim().toLowerCase();
    if (!email || payload.email_verified === false) {
      return { ok: false, status: 403, error: 'Invalid or unverified Google account' };
    }
    return { ok: true, email, payload };
  } catch (e) {
    console.error('Google ID token verification failed:', e.message);
    return { ok: false, status: 401, error: 'Invalid authentication token' };
  }
}

/**
 * Express / Netlify-style req with headers object.
 */
async function verifyRequestBearer(req) {
  const raw =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return verifyAuthorizationBearer(raw);
}

module.exports = {
  getJwtSecret,
  signBookingCartJwt,
  verifyAuthorizationBearer,
  verifyRequestBearer
};
