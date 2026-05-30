// api/user.js – persist Account Settings (MongoDB or local fallback)

const { getCollections } = require('../lib/mongo');
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
      const collections = await getCollections();
      const user = await collections.users.findOne({ _id: new require('mongodb').ObjectId(decoded.userId) });
      if (user) {
        return { ok: true, email: user.email, userId: decoded.userId };
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
    let collections;
    try {
      collections = await getCollections();
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
      if (!global.__users) global.__users = {};
    }

    const users = collections ? collections.users : null;

    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'count') {
        const gate = await requireAdminEmail(req);
        if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

        let count = 0;
        if (users) {
          count = await users.countDocuments({});
        } else {
          count = Object.keys(global.__users || {}).length;
        }
        return res.json({ ok: true, count });
      }

      if (action === 'list') {
        const gate = await requireAdminEmail(req);
        if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

        let userList = [];
        if (users) {
          const docs = await users
            .find({}, { projection: { passwordHash: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
          userList = docs.map(d => ({
            id: String(d._id),
            email: d.profile?.email || d.email || '',
            name: d.profile?.name || d.name || '',
            authMethod: d.authMethod || 'google',
            createdAt: d.createdAt || null,
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

          // Combine and deduplicate by email
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

      if (process.env.NODE_ENV === 'production' && !users) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (MONGODB_URI)' });
      }

      const auth = await verifyAuthToken(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
      if (auth.email !== email) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
      }

      if (users) {
        const doc = await users.findOne({ 'profile.email': email });
        return res.json({ ok: true, state: doc ? doc.state : null });
      }
      return res.json({ ok: true, state: global.__users[email] || null });
    }

    if (req.method === 'POST') {
      if (process.env.NODE_ENV === 'production' && !users) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (MONGODB_URI)' });
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

      if (users) {
        await users.updateOne(
          { 'profile.email': emailRaw },
          {
            $set: {
              'profile.email': emailRaw,
              state: body.state,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      } else {
        global.__users[emailRaw] = body.state;
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (process.env.NODE_ENV === 'production' && !users) {
        return res.status(503).json({ ok: false, error: 'Database is not configured (MONGODB_URI)' });
      }

      const auth = await verifyAuthToken(req);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

      const email = String(req.body?.email || req.query?.email || '')
        .trim()
        .toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
      if (auth.email !== email) {
        return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
      }

      if (users) {
        await users.deleteOne({ 'profile.email': email });
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
