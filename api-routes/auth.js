/**
 * api-routes/auth.js
 * Email + password authentication: register, login, logout, forgot-password.
 * Uses bcrypt for hashing and JWT for session tokens.
 * All user records are stored in the existing MongoDB "users" collection.
 */
require('dotenv').config();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { getCollections } = require('../lib/mongo');
const { applyCors } = require('../lib/cors');

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'bc_jwt_dev_secret_change_in_prod';
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

/** Sign a JWT for a user document */
function signToken(user) {
  return jwt.sign(
    { sub: String(user._id || user.email), email: user.email, name: user.name || '' },
    JWT_SECRET,
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
 */
module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Determine action from sub-path (e.g. /api/auth/register → "register")
  const action = String(req.params?.action || req.query?.action || '').toLowerCase();

  // IP-based rate limiting (10 requests per minute per IP per action)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const rateLimitKey = `${action}:${ip}`;
  if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' });
  }

  // ── Connect to MongoDB (fall back to in-memory for dev) ──────────────────────
  let usersCol = null;
  try {
    const { users } = await getCollections();
    usersCol = users;
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

    if (usersCol) {
      // Check for duplicate
      const existing = await usersCol.findOne({ 'profile.email': email });
      if (existing) {
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
      }
      const result = await usersCol.insertOne({
        profile: { email, name },
        passwordHash: hash,
        authMethod: 'email',
        createdAt: now,
        updatedAt: now,
        state: { name, email, signedUpAt: now.toISOString() }
      });
      const newUser = { _id: result.insertedId, email, name };
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
      const token = signToken({ _id: id, email, name });
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
    if (usersCol) {
      userDoc = await usersCol.findOne({ 'profile.email': email });
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

    const email_ = userDoc.profile?.email || userDoc.email;
    const name_ = userDoc.profile?.name || userDoc.name || '';
    const token = signToken({ _id: userDoc._id || userDoc.id, email: email_, name: name_ });

    return res.json({ ok: true, token, user: { email: email_, name: name_ } });
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
    const resetToken = jwt.sign({ sub: email, purpose: 'reset' }, JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/auth?reset=${resetToken}`;

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

  return res.status(404).json({ ok: false, error: 'Unknown auth action.' });
};
