const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');
const { publish, subscribe } = require('../lib/support-live');

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email === 'guest@anonymous' ? '' : email;
}

function isGuestThread(thread) {
  return !String(thread?.email || '').trim();
}

function canReadGuestThread(thread, threadId) {
  return !!thread && isGuestThread(thread) && thread.id === threadId;
}

async function findThreadById(dbReady, threadId) {
  if (!threadId) return null;
  if (dbReady) {
    const result = await query('SELECT * FROM bc_support WHERE thread_id = $1 LIMIT 1', [threadId]);
    return result.rows.length > 0 ? rowToThread(result.rows[0]) : null;
  }
  return (global.__support || []).find((thread) => thread.id === threadId) || null;
}

async function listThreadsByEmail(dbReady, email) {
  if (dbReady) {
    const result = await query('SELECT * FROM bc_support WHERE email = $1 ORDER BY updated_at DESC', [email]);
    return result.rows.map(rowToThread);
  }
  return (global.__support || [])
    .filter((thread) => thread.email === email)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

async function listAllThreads(dbReady) {
  if (dbReady) {
    const result = await query('SELECT * FROM bc_support ORDER BY updated_at DESC');
    return result.rows.map(rowToThread);
  }
  return [...(global.__support || [])].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function writeStreamEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleStream(req, res, dbReady) {
  if (typeof res.write !== 'function') {
    return res.status(501).json({ ok: false, error: 'Support live updates are not available on this deployment target' });
  }

  const requestedThreadId = String(req.query.threadId || '').trim();
  const guestMode = String(req.query.guest || '') === '1';
  const requestedEmail = normalizeEmail(req.query.email);

  const adminGate = await requireAdminEmail(req);
  let scope = null;

  if (adminGate.ok) {
    scope = { mode: 'admin' };
  } else if (guestMode && requestedThreadId) {
    const thread = await findThreadById(dbReady, requestedThreadId);
    if (thread && !canReadGuestThread(thread, requestedThreadId)) {
      return res.status(403).json({ ok: false, error: 'Thread is not available for guest access' });
    }
    scope = { mode: 'guest', threadId: requestedThreadId };
  } else {
    if (!requestedEmail) {
      return res.status(400).json({ ok: false, error: 'Missing email' });
    }
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    if (auth.email !== requestedEmail) {
      return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
    }
    scope = { mode: 'user', email: auth.email };
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  writeStreamEvent(res, 'ready', { mode: scope.mode });

  const unsubscribe = subscribe((thread) => {
    if (scope.mode === 'admin') {
      writeStreamEvent(res, 'thread', thread);
      return;
    }
    if (scope.mode === 'guest' && thread.id === scope.threadId && isGuestThread(thread)) {
      writeStreamEvent(res, 'thread', thread);
      return;
    }
    if (scope.mode === 'user' && thread.email === scope.email) {
      writeStreamEvent(res, 'thread', thread);
    }
  });

  const heartbeat = setInterval(() => {
    writeStreamEvent(res, 'ping', { ts: Date.now() });
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    if (typeof res.end === 'function') res.end();
  };

  req.on('close', cleanup);
  req.on('end', cleanup);
  return undefined;
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
      if (!global.__support) global.__support = [];
    }

    if (req.method === 'GET' && req.params?.action === 'stream') {
      return handleStream(req, res, dbReady);
    }

    if (req.method === 'GET') {
      const email = normalizeEmail(req.query.email);
      const threadId = String(req.query.threadId || '').trim();
      const guestMode = String(req.query.guest || '') === '1';

      const adminGate = await requireAdminEmail(req);
      const isAdmin = adminGate.ok;

      let threads = [];
      if (isAdmin) {
        threads = await listAllThreads(dbReady);
      } else if (guestMode && threadId) {
        const thread = await findThreadById(dbReady, threadId);
        if (!thread) return res.json({ ok: true, threads: [] });
        if (!canReadGuestThread(thread, threadId)) {
          return res.status(403).json({ ok: false, error: 'Thread is not available for guest access' });
        }
        threads = [thread];
      } else {
        if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

        const auth = await verifyRequestBearer(req);
        if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
        if (auth.email !== email) {
          return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
        }

        threads = await listThreadsByEmail(dbReady, email);
      }
      return res.json({ ok: true, threads });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { threadId, email, topic, message } = body;
      const guestMode = body.guest === true || String(body.guest || '') === '1';

      if (!threadId || !message) {
        return res.status(400).json({ ok: false, error: 'Missing threadId or message' });
      }

      const adminGate = await requireAdminEmail(req);
      const isAdmin = adminGate.ok;

      const emailRaw = normalizeEmail(email);
      let actor = isAdmin ? 'admin' : 'user';
      if (!isAdmin) {
        const hasAuthorization = !!String(req.headers?.authorization || req.headers?.Authorization || '').trim();
        const auth = hasAuthorization ? await verifyRequestBearer(req) : { ok: false, status: 401, error: 'Missing or invalid Authorization' };

        if (auth.ok) {
          if (!emailRaw || auth.email !== emailRaw) {
            return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
          }
        } else if (!hasAuthorization && guestMode) {
          actor = 'guest';
        } else {
          return res.status(auth.status).json({ ok: false, error: auth.error });
        }
      }

      const ts = Date.now();
      const newMessage = {
        from: actor === 'admin' ? 'admin' : 'user',
        text: message,
        ts
      };

      let updatedThread = null;
      if (dbReady) {
        const existing = await query('SELECT * FROM bc_support WHERE thread_id = $1 LIMIT 1', [threadId]);
        if (existing.rows.length > 0) {
          const current = rowToThread(existing.rows[0]);
          if (actor === 'guest' && !isGuestThread(current)) {
            return res.status(403).json({ ok: false, error: 'Thread is not available for guest access' });
          }
          if (actor === 'user' && current.email !== emailRaw) {
            return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
          }

          const messages = current.messages || [];
          messages.push(newMessage);
          const result = await query(
            `UPDATE bc_support
             SET messages = $1,
                 updated_at = to_timestamp($2 / 1000.0),
                 admin_read = $3,
                 status = 'open'
             WHERE thread_id = $4
             RETURNING *`,
            [JSON.stringify(messages), ts, actor === 'admin', threadId]
          );
          updatedThread = rowToThread(result.rows[0]);
        } else {
          const result = await query(
            `INSERT INTO bc_support (thread_id, email, topic, status, admin_read, messages, created_at, updated_at)
             VALUES ($1, $2, $3, 'open', $4, $5, to_timestamp($6 / 1000.0), to_timestamp($6 / 1000.0))
             RETURNING *`,
            [threadId, actor === 'guest' ? '' : emailRaw, topic || message.slice(0, 60), actor === 'admin', JSON.stringify([newMessage]), ts]
          );
          updatedThread = rowToThread(result.rows[0]);
        }
      } else {
        const existing = global.__support.find(t => t.id === threadId);
        if (existing) {
          if (actor === 'guest' && !isGuestThread(existing)) {
            return res.status(403).json({ ok: false, error: 'Thread is not available for guest access' });
          }
          if (actor === 'user' && existing.email !== emailRaw) {
            return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
          }
          existing.messages.push(newMessage);
          existing.updatedAt = ts;
          existing.adminRead = actor === 'admin';
          existing.status = 'open';
          updatedThread = { ...existing };
        } else {
          updatedThread = {
            id: threadId,
            email: actor === 'guest' ? '' : emailRaw,
            topic: topic || message.slice(0, 60),
            status: 'open',
            adminRead: actor === 'admin',
            createdAt: ts,
            updatedAt: ts,
            messages: [newMessage]
          };
          global.__support.unshift(updatedThread);
        }
      }
      publish(updatedThread);
      return res.json({ ok: true, thread: updatedThread });
    }

    if (req.method === 'PATCH') {
      const adminGate = await requireAdminEmail(req);
      if (!adminGate.ok) return res.status(adminGate.status).json({ ok: false, error: adminGate.error });

      const { id, status, adminRead } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      let updatedThread = null;
      if (dbReady) {
        const sets = [];
        const vals = [];
        let idx = 1;
        if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
        if (typeof adminRead === 'boolean') { sets.push(`admin_read = $${idx++}`); vals.push(adminRead); }
        if (sets.length > 0) {
          vals.push(id);
          const result = await query(`UPDATE bc_support SET ${sets.join(', ')} WHERE thread_id = $${idx} RETURNING *`, vals);
          if (result.rows.length > 0) updatedThread = rowToThread(result.rows[0]);
        }
      } else {
        const thread = global.__support.find(t => t.id === id);
        if (thread) {
          if (status) thread.status = status;
          if (typeof adminRead === 'boolean') thread.adminRead = adminRead;
          updatedThread = { ...thread };
        }
      }
      if (updatedThread) publish(updatedThread);
      return res.json({ ok: true, thread: updatedThread });
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
