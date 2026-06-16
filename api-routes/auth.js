/**
 * api-routes/auth.js
 * Email + password authentication: register, login, logout, forgot-password.
 * Uses bcrypt for hashing and JWT for session tokens.
 * All user records are stored in Postgres "users" table.
 */
require('dotenv').config();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { query, isDbConfigured, initDb } = require('../lib/db');
const {
  applyCors,
  assertAllowedOrigin,
  getAppOrigin,
  getAppOriginConfigError,
  getRequestOriginFromHeaders,
  parseAllowedOrigins,
} = require('../lib/cors');
const { getJwtSecret, signBookingCartJwt, verifyRequestBearer } = require('../lib/google-verify');

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '30d';

// Simple in-memory rate limit: { key -> { count, resetAt } }
const rateLimitMap = new Map();
function checkRateLimit(key, maxReq, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);
  return entry.count <= maxReq;
}


/** Validate email format */
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
}

/** Validate password: min 8 chars, 1 number, 1 special char */
function isStrongPassword(p) {
  const s = String(p || '');
  return s.length >= 8 && /[0-9]/.test(s) && /[^A-Za-z0-9]/.test(s);
}

function getPublicAppUrl(req) {
  const configError = getAppOriginConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const configured = getAppOrigin();
  if (configured) return configured;

  const origin = String(req.headers?.origin || '').trim();
  if (origin) {
    const allowed = assertAllowedOrigin(origin);
    if (allowed.ok) return allowed.origin;
  }

  const allowedOrigins = parseAllowedOrigins();
  if (allowedOrigins.length > 0) return allowedOrigins[0];
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL or ALLOWED_ORIGINS is required in production');
  }

  return getRequestOriginFromHeaders(req.headers, 'localhost:3000') || 'http://localhost:3000';
}

/** Sign a JWT for a user document */
function signToken(user) {
  return signBookingCartJwt(
    { sub: String(user.id || user.email), userId: user.id || null, email: user.email, name: user.name || '' },
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Get or create in-memory fallback store (dev only) */
function getMemStore() {
  if (!global.__bc_auth_users) global.__bc_auth_users = new Map();
  return global.__bc_auth_users;
}

/**
 * Main handler — routes by sub-path:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *   GET  /api/auth/session
 *   POST /api/auth/change-password
 */
module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Determine action from sub-path (e.g. /api/auth/register → "register")
  const action = String(req.params?.action || req.query?.action || '').toLowerCase();

  if (action === 'session') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    let user = {
      email: auth.email,
      name: String(auth.payload?.name || auth.payload?.given_name || '').trim(),
      picture: String(auth.payload?.picture || '').trim(),
    };

    try {
      if (isDbConfigured()) {
        await initDb();
        const result = await query('SELECT email, name, profile FROM bc_users WHERE email = $1', [auth.email]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const profile = row.profile && typeof row.profile === 'object' ? row.profile : {};
          user = {
            email: row.email,
            name: row.name || profile.name || user.name || row.email,
            picture: profile.avatar || profile.picture || user.picture || '',
          };
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ ok: false, error: 'Database is not configured (DATABASE_URL)' });
      }
    }

    return res.json({
      ok: true,
      user,
      session: {
        expiresAt: auth.payload?.exp ? new Date(Number(auth.payload.exp) * 1000).toISOString() : null,
      },
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // IP-based rate limiting (10 requests per minute per IP per action)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const rateLimitKey = `${action}:${ip}`;
  if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' });
  }

  if (['register', 'login', 'forgot-password', 'reset-password'].includes(action)) {
    try {
      getJwtSecret();
    } catch (err) {
      return res.status(503).json({ ok: false, error: err.message });
    }
  }

  // ── Connect to Postgres (fall back to in-memory for dev) ──────────────────────
  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      dbReady = true;
    }
  } catch {
    // dev fallback — in-memory store
  }

  const body = req.body || {};

  // ════════════════════════════════════════════════════════════════════════════
  // REGISTER
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'register') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 80);

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters and include a number and a special character.'
      });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date();

    if (dbReady) {
      // Check for duplicate
      const existing = await query('SELECT id FROM bc_users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
      }
      const result = await query(
        `INSERT INTO bc_users (email, name, password_hash, auth_method, profile, state, created_at, updated_at)
         VALUES ($1, $2, $3, 'email', $4, $5, $6, $6)
         RETURNING id`,
        [
          email,
          name,
          hash,
          JSON.stringify({ email, name }),
          JSON.stringify({ name, email, signedUpAt: now.toISOString() }),
          now,
        ]
      );
      const newUser = { id: result.rows[0].id, email, name };
      const token = signToken(newUser);
      return res.status(201).json({ ok: true, token, user: { email, name } });
    } else {
      // Dev in-memory
      const store = getMemStore();
      if (store.has(email)) {
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
      }
      const id = `mem_${Date.now()}`;
      store.set(email, { id, email, name, passwordHash: hash, createdAt: now });
      const token = signToken({ id, email, name });
      return res.status(201).json({ ok: true, token, user: { email, name } });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }

    let userDoc = null;
    if (dbReady) {
      const result = await query('SELECT id, email, name, password_hash FROM bc_users WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        userDoc = { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash };
      }
    } else {
      userDoc = getMemStore().get(email) || null;
    }

    // Prevent user enumeration: always bcrypt-compare even if not found
    const dummyHash = '$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const hash = userDoc?.passwordHash || dummyHash;
    const match = await bcrypt.compare(password, hash);

    if (!userDoc || !match) {
      return res.status(401).json({ ok: false, error: 'Incorrect email or password.' });
    }

    const token = signToken({ id: userDoc.id, email: userDoc.email, name: userDoc.name || '' });

    return res.json({ ok: true, token, user: { email: userDoc.email, name: userDoc.name || '' } });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOGOUT  (client handles token removal, server just ack)
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'logout') {
    return res.json({ ok: true });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'forgot-password') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    // Generate a short-lived reset token (15 minutes)
    let resetToken;
    try {
      resetToken = jwt.sign({ sub: email, purpose: 'reset' }, getJwtSecret(), { expiresIn: '15m' });
    } catch (err) {
      return res.status(503).json({ ok: false, error: err.message });
    }
    let resetLink;
    try {
      resetLink = `${getPublicAppUrl(req)}/auth?reset=${resetToken}`;
    } catch (err) {
      return res.status(503).json({ ok: false, error: err.message });
    }

    console.log(`[AUTH] Password reset link for ${email}: ${resetLink}`);

    // If Resend is configured, send the email
    if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('put_your_api_key_here')) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'BookingCart <onboarding@resend.dev>';
        
        const { data, error } = await resend.emails.send({
          from: fromAddress,
          to: [email],
          subject: 'Password Reset - BookingCart',
          text: `You requested a password reset. Click the following link to reset your password:\n\n${resetLink}\n\nThis link will expire in 15 minutes. If you did not request this, please ignore this email.`,
          html: `<p>You requested a password reset.</p><p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>`
        });

        if (error) {
          console.error(`[AUTH] Failed to send reset email via Resend to ${email}:`, error);
        } else {
          console.log(`[AUTH] Reset email sent successfully to ${email} (ID: ${data.id})`);
        }
      } catch (err) {
        console.error(`[AUTH] Error sending reset email via Resend:`, err);
        // We still return success to prevent email enumeration, but log the error
      }
    } else {
      console.warn('[AUTH] RESEND_API_KEY not configured in .env. Email was not sent.');
    }

    return res.json({
      ok: true,
      message: "If an account exists for that email, a reset link has been sent."
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RESET PASSWORD
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'reset-password') {
    const resetToken = String(body.token || '').trim();
    const password = String(body.password || '');

    if (!resetToken) {
      return res.status(400).json({ ok: false, error: 'Reset token is required.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters and include a number and a special character.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, getJwtSecret());
    } catch (err) {
      if (err && err.message === 'JWT_SECRET is required in production') {
        return res.status(503).json({ ok: false, error: err.message });
      }
      return res.status(400).json({ ok: false, error: 'Reset link is invalid or has expired.' });
    }

    const email = String(decoded?.sub || '').trim().toLowerCase();
    if (!email || decoded?.purpose !== 'reset') {
      return res.status(400).json({ ok: false, error: 'Reset link is invalid or has expired.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    if (dbReady) {
      const result = await query(
        `UPDATE bc_users
         SET password_hash = $1, auth_method = 'email', updated_at = NOW()
         WHERE email = $2`,
        [hash, email]
      );
      if (result.rowCount === 0) {
        return res.status(400).json({ ok: false, error: 'Reset link is invalid or has expired.' });
      }
    } else {
      const store = getMemStore();
      const user = store.get(email);
      if (!user) {
        return res.status(400).json({ ok: false, error: 'Reset link is invalid or has expired.' });
      }
      user.passwordHash = hash;
      store.set(email, user);
    }

    return res.json({ ok: true, message: 'Password updated. You can now sign in.' });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CHANGE PASSWORD
  // ════════════════════════════════════════════════════════════════════════════
  if (action === 'change-password') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Current and new password are required.' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters and include a number and a special character.'
      });
    }

    let userDoc = null;
    if (dbReady) {
      const result = await query('SELECT id, email, name, password_hash FROM bc_users WHERE email = $1', [auth.email]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        userDoc = { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash };
      }
    } else {
      userDoc = getMemStore().get(auth.email) || null;
    }

    if (!userDoc?.passwordHash) {
      return res.status(400).json({ ok: false, error: 'Password changes are only available for email/password accounts.' });
    }

    const match = await bcrypt.compare(currentPassword, userDoc.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    if (dbReady) {
      await query('UPDATE bc_users SET password_hash = $1, updated_at = NOW() WHERE email = $2', [hash, auth.email]);
    } else {
      userDoc.passwordHash = hash;
      getMemStore().set(auth.email, userDoc);
    }

    return res.json({ ok: true, message: 'Password changed successfully.' });
  }

  return res.status(404).json({ ok: false, error: 'Unknown auth action.' });
};
