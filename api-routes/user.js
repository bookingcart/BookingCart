// api/user.js – persist Account Settings (Postgres or local fallback)

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');
const { requireAdminEmail } = require('../lib/admin');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Verify token (supports both JWT and Google)
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    return { ok: false, error: 'No token provided' };
  }
  
  // Try JWT verification first (new auth system)
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.userId) {
      // Get user email from database
      if (isDbConfigured()) {
        try {
          const result = await query('SELECT email FROM bc_users WHERE id = $1', [decoded.userId]);
          if (result.rows.length > 0) {
            return { ok: true, email: result.rows[0].email, userId: decoded.userId };
          }
        } catch {}
      }
    }
  } catch (jwtErr) {
    // JWT failed, try Google verification
  }
  
  // Fall back to Google token verification
  return await verifyRequestBearer(req);
}

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let dbReady = false;
    try {
      if (isDbConfigured()) {
        await initDb();
        dbReady = true;
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
      if (!global.__users) global.__users = {};
    }

    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'count') {
        const gate = await requireAdminEmail(req);
        if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

        let count = 0;
        if (dbReady) {
          const result = await query('SELECT COUNT(*) AS cnt FROM bc_users');
          count = parseInt(result.rows[0].cnt, 10);
        } else {
          count = Object.keys(global.__users || {}).length;
        }
        return res.json({ ok: true, count });
      }

      if (action === 'list') {
        const gate = await requireAdminEmail(req);
        if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

        let userList = [];
        if (dbReady) {
          const result = await query(
            'SELECT id, email, name, auth_method, created_at FROM bc_users ORDER BY created_at DESC'
          );
          userList = result.rows.map(d => ({
            id: String(d.id),
            email: d.email || '',
            name: d.name || '',
            authMethod: d.auth_method || 'google',
            createdAt: d.created_at || null,
          }));
        } else {
          // In-memory fallback (dev only)
          const googleUsers = Object.entries(global.__users || {}).map(([email, state]) => ({
            id: email,
            email,
            name: (state && state.name) || '',
            authMethod: 'google',
            createdAt: (state && state.signedUpAt) || null,
          }));

          const localUsers = [];
          if (global.__bc_auth_users) {
            for (const [id, user] of global.__bc_auth_users.entries()) {
              localUsers.push({
                id: String(user._id || id),
                email: user.email || '',
                name: user.name || '',
                authMethod: 'email',
                createdAt: user.createdAt || null,
              });
            }
          }

          const combined = [...localUsers, ...googleUsers];
          const unique = [];
          const seen = new Set();
          for (const u of combined) {
            if (!seen.has(u.email)) {
              seen.add(u.email);
              unique.push(u);
            }
          }
          userList = unique.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }
        return res.json({ ok: true, users: userList });
      }

      const email = String(req.query.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      if (process.env.NODE_ENV === 'production' && !dbReady) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (DATABASE_URL)' });
      }

      const auth = await verifyAuthToken(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
      if (auth.email !== email) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
      }

      if (dbReady) {
        const result = await query('SELECT state FROM bc_users WHERE email = $1', [email]);
        return res.json({ ok: true, state: result.rows.length > 0 ? result.rows[0].state : null });
      }
      return res.json({ ok: true, state: global.__users[email] || null });
    }

    if (req.method === 'POST') {
      if (process.env.NODE_ENV === 'production' && !dbReady) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (DATABASE_URL)' });
      }

      const auth = await verifyAuthToken(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

      const body = req.body || {};
      const emailRaw = String(body.email || '').trim().toLowerCase();
      if (!emailRaw || !body.state) {
        return res.status(400).json({ ok: false, error: 'Missing email or state payload' });
      }
      if (auth.email !== emailRaw) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
      }

      if (dbReady) {
        await query(
          `INSERT INTO bc_users (email, name, state, profile, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (email) DO UPDATE SET
             state = $3,
             profile = $4,
             updated_at = NOW()`,
          [
            emailRaw,
            body.state.name || '',
            JSON.stringify(body.state),
            JSON.stringify({ email: emailRaw, name: body.state.name || '' }),
          ]
        );
      } else {
        global.__users[emailRaw] = body.state;
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (process.env.NODE_ENV === 'production' && !dbReady) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (DATABASE_URL)' });
      }

      const auth = await verifyAuthToken(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

      const email = String(req.body?.email || req.query?.email || '')
        .trim()
        .toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      let canDelete = false;
      if (auth.email === email) {
        canDelete = true;
      } else {
        const adminCheck = await requireAdminEmail(req);
        if (adminCheck.ok) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account and user is not admin' });
      }

      if (dbReady) {
        await query('DELETE FROM bc_users WHERE email = $1', [email]);
      } else {
        delete global.__users[email];
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('User Settings API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
