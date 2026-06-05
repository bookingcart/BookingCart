const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');

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
      if (!global.__support) global.__support = [];
    }

    if (req.method === 'GET') {
      const email = String(req.query.email || '').trim().toLowerCase();
      
      const adminGate = await requireAdminEmail(req);
      const isAdmin = adminGate.ok;
      
      let threads = [];
      if (isAdmin) {
        if (dbReady) {
          const result = await query('SELECT * FROM bc_support ORDER BY updated_at DESC');
          threads = result.rows.map(rowToThread);
        } else {
          threads = global.__support;
        }
      } else {
        if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
        
        const auth = await verifyRequestBearer(req);
        if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
        if (auth.email !== email) {
          return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
        }
        
        if (dbReady) {
          const result = await query('SELECT * FROM bc_support WHERE email = $1 ORDER BY updated_at DESC', [email]);
          threads = result.rows.map(rowToThread);
        } else {
          threads = global.__support.filter(t => t.email === email);
        }
      }
      return res.json({ ok: true, threads });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { threadId, email, topic, message } = body;
      
      if (!threadId || !message) {
        return res.status(400).json({ ok: false, error: 'Missing threadId or message' });
      }

      const adminGate = await requireAdminEmail(req);
      const isAdmin = adminGate.ok;
      
      const emailRaw = String(email || '').trim().toLowerCase();
      if (!isAdmin) {
        if (!emailRaw) return res.status(400).json({ ok: false, error: 'Missing email' });
        const auth = await verifyRequestBearer(req);
        if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
        if (auth.email !== emailRaw) {
          return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
        }
      }

      const ts = Date.now();
      const newMessage = {
        from: isAdmin ? 'admin' : 'user',
        text: message,
        ts
      };

      if (dbReady) {
        const existing = await query('SELECT id, messages FROM bc_support WHERE thread_id = $1', [threadId]);
        if (existing.rows.length > 0) {
          const messages = existing.rows[0].messages || [];
          messages.push(newMessage);
          await query(
            `UPDATE bc_support SET messages = $1, updated_at = to_timestamp($2 / 1000.0), admin_read = $3, status = 'open' WHERE thread_id = $4`,
            [JSON.stringify(messages), ts, isAdmin, threadId]
          );
        } else {
          await query(
            `INSERT INTO bc_support (thread_id, email, topic, status, admin_read, messages, created_at, updated_at)
             VALUES ($1, $2, $3, 'open', $4, $5, to_timestamp($6 / 1000.0), to_timestamp($6 / 1000.0))`,
            [threadId, emailRaw, topic || message.slice(0, 60), isAdmin, JSON.stringify([newMessage]), ts]
          );
        }
      } else {
        const existing = global.__support.find(t => t.id === threadId);
        if (existing) {
          existing.messages.push(newMessage);
          existing.updatedAt = ts;
          existing.adminRead = isAdmin;
          existing.status = 'open';
        } else {
          global.__support.unshift({
            id: threadId,
            email: emailRaw,
            topic: topic || message.slice(0, 60),
            status: 'open',
            adminRead: isAdmin,
            createdAt: ts,
            updatedAt: ts,
            messages: [newMessage]
          });
        }
      }
      return res.json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const adminGate = await requireAdminEmail(req);
      if (!adminGate.ok) return res.status(adminGate.status).json({ ok: false, error: adminGate.error });

      const { id, status, adminRead } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      if (dbReady) {
        const sets = [];
        const vals = [];
        let idx = 1;
        if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
        if (typeof adminRead === 'boolean') { sets.push(`admin_read = $${idx++}`); vals.push(adminRead); }
        if (sets.length > 0) {
          vals.push(id);
          await query(`UPDATE bc_support SET ${sets.join(', ')} WHERE thread_id = $${idx}`, vals);
        }
      } else {
        const thread = global.__support.find(t => t.id === id);
        if (thread) {
          if (status) thread.status = status;
          if (typeof adminRead === 'boolean') thread.adminRead = adminRead;
        }
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Support API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};

function rowToThread(row) {
  return {
    id: row.thread_id,
    email: row.email,
    topic: row.topic,
    status: row.status,
    adminRead: row.admin_read,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    messages: row.messages || [],
  };
}
