'use strict';

const { verifyRequestBearer } = require('./google-verify');

/**
 * Admin access is now checked via Google Sign-In email.
 * The email must match one of the emails in VITE_ADMIN_EMAILS.
 */
async function requireAdminEmail(req) {
  const adminEmails = (process.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  
  if (!adminEmails.length || !adminEmails[0]) {
    const msg = process.env.NODE_ENV === 'production'
      ? 'Admin access is not configured'
      : 'Set VITE_ADMIN_EMAILS in your environment';
    return { ok: false, status: 503, error: msg };
  }

  const auth = await verifyRequestBearer(req);
  if (!auth.ok) {
    return { ok: false, status: 401, error: auth.error };
  }

  if (!adminEmails.includes(auth.email.toLowerCase())) {
    return { ok: false, status: 403, error: 'Access denied: Email is not an administrator' };
  }

  return { ok: true, email: auth.email };
}

function requireDatabaseUrl() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    return { ok: false, status: 503, error: 'Database is not configured (DATABASE_URL)' };
  }
  return { ok: true };
}

module.exports = { requireAdminEmail, requireDatabaseUrl };
