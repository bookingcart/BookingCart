const { getCollections } = require('../lib/mongo');
const { getCorsHeaders } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { verifyRequestBearer } = require('../lib/google-verify');

function applyCors(req, res) {
  const h = getCorsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
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
      if (!global.__support) global.__support = [];
    }

    const support = collections ? collections.support : null;

    if (req.method === 'GET') {
      const email = String(req.query.email || '').trim().toLowerCase();
      
      const adminGate = await requireAdminEmail(req);
      const isAdmin = adminGate.ok;
      
      let threads = [];
      if (isAdmin) {
        // Admin gets all threads
        if (support) {
          threads = await support.find({}).sort({ updatedAt: -1 }).toArray();
        } else {
          threads = global.__support;
        }
      } else {
        // User gets only their threads
        if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
        
        const auth = await verifyRequestBearer(req);
        if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
        if (auth.email !== email) {
          return res.status(403).json({ ok: false, error: 'Email does not match signed-in account' });
        }
        
        if (support) {
          threads = await support.find({ email }).sort({ updatedAt: -1 }).toArray();
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
        from: isAdmin ? 'bot' : 'user', // We use 'bot' or 'admin' for admin replies
        text: message,
        ts
      };

      if (support) {
        const existing = await support.findOne({ id: threadId });
        if (existing) {
          await support.updateOne(
            { id: threadId },
            { 
              $push: { messages: newMessage },
              $set: { 
                updatedAt: ts,
                adminRead: isAdmin, // If admin replies, it's read by admin. If user replies, admin needs to read it
                status: 'open'
              }
            }
          );
        } else {
          // Create new thread
          const newThread = {
            id: threadId,
            email: emailRaw,
            topic: topic || message.slice(0, 60),
            status: 'open',
            adminRead: isAdmin,
            createdAt: ts,
            updatedAt: ts,
            messages: [newMessage]
          };
          await support.insertOne(newThread);
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

      const updates = {};
      if (status) updates.status = status;
      if (typeof adminRead === 'boolean') updates.adminRead = adminRead;

      if (Object.keys(updates).length > 0) {
        if (support) {
          await support.updateOne({ id }, { $set: updates });
        } else {
          const thread = global.__support.find(t => t.id === id);
          if (thread) {
            if (status) thread.status = status;
            if (typeof adminRead === 'boolean') thread.adminRead = adminRead;
          }
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
