// api-routes/event-profiles.js
// Handles event / attraction listing creation lifecycle:
//   POST { action: 'register' }           — create user + empty draft event profile
//   POST { action: 'save', step, data }   — save progress for a specific step
//   GET  ?token=                          — load draft for authenticated user
//   POST { action: 'submit' }             — submit draft for admin review
//   POST { action: 'admin-list' }         — list pending/all profiles (admin only)
//   POST { action: 'admin-review', id, status, note } — approve / reject / revision

const bcrypt = require('bcrypt');
const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { signBookingCartJwt, verifyRequestBearer } = require('../lib/google-verify');

const SALT_ROUNDS = 12;

// ─── Completeness Calculator ──────────────────────────────────────────────────
function calcCompleteness(profile) {
  let score = 0;
  const info = profile.step_event_info || {};
  const loc = profile.step_location || {};
  const features = profile.step_features || {};
  const tickets = profile.step_tickets || {};
  const gallery = Array.isArray(profile.step_gallery) ? profile.step_gallery : [];
  const policies = profile.step_policies || {};
  const contact = profile.step_contact || {};

  // Event name & description (15%)
  if (info.eventName && info.eventName.length > 3) score += 5;
  if (info.description && info.description.length >= 50) score += 10;

  // Location (15%)
  if (loc.country && loc.city) score += 15;
  else if (loc.country) score += 7;

  // Features (10%)
  const featureList = Array.isArray(features.selected) ? features.selected : [];
  if (featureList.length >= 3) score += 10;
  else if (featureList.length >= 1) score += 5;

  // Tickets (20%)
  const ticketList = Array.isArray(tickets.list) ? tickets.list : [];
  if (ticketList.length >= 2) score += 20;
  else if (ticketList.length >= 1) score += 10;

  // Gallery (20%)
  if (gallery.length >= 6) score += 20;
  else if (gallery.length >= 3) score += 10;
  else if (gallery.length >= 1) score += 5;

  // Policies (10%)
  if (policies.startTime && policies.endTime) score += 10;
  else if (policies.startTime || policies.endTime) score += 5;

  // Contact (10%)
  if (contact.bookingEmail || contact.phone) score += 10;

  return Math.min(100, score);
}

// ─── In-memory fallback store ─────────────────────────────────────────────────
function getMemProfiles() {
  if (!global.__bc_event_profiles) global.__bc_event_profiles = new Map();
  return global.__bc_event_profiles;
}
function getMemUsers() {
  if (!global.__bc_auth_users) global.__bc_auth_users = new Map();
  return global.__bc_auth_users;
}
function nextMemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Ensure tables exist ──────────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    ALTER TABLE bc_users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE bc_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'traveler';
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS bc_event_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT NOT NULL,
      step_event_info JSONB DEFAULT '{}',
      step_location JSONB DEFAULT '{}',
      step_features JSONB DEFAULT '{}',
      step_tickets JSONB DEFAULT '{}',
      step_gallery JSONB DEFAULT '[]',
      step_policies JSONB DEFAULT '{}',
      step_contact JSONB DEFAULT '{}',
      ticket_banner_image TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      admin_note TEXT DEFAULT '',
      completeness INTEGER DEFAULT 0,
      current_step INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  // Add ticket_banner_image column if upgrading existing table
  await query(`ALTER TABLE bc_event_profiles ADD COLUMN IF NOT EXISTS ticket_banner_image TEXT DEFAULT ''`).catch(() => {});
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let dbReady = false;
  try {
    if (isDbConfigured()) {
      await initDb();
      await ensureTables();
      dbReady = true;
    }
  } catch (err) {
    console.warn('[event-profiles] DB unavailable, using memory fallback:', err.message);
  }

  // ── GET — load profile(s) for authenticated user ─────────────────────────
  if (req.method === 'GET') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    // ?action=list — return ALL non-deleted profiles for this user
    if (req.query.action === 'list') {
      let profiles = [];
      if (dbReady) {
        const r = await query(
          `SELECT * FROM bc_event_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 100`,
          [auth.email]
        );
        profiles = r.rows;
      } else {
        const store = getMemProfiles();
        for (const [, p] of store) {
          if (p.email === auth.email) profiles.push(p);
        }
        profiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      return res.json({ ok: true, profiles });
    }

    // Default: return the most-recent single profile (backward compat)
    let profile = null;
    if (dbReady) {
      const r = await query(
        `SELECT * FROM bc_event_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
        [auth.email]
      );
      if (r.rows.length) profile = r.rows[0];
    } else {
      const store = getMemProfiles();
      for (const [, p] of store) {
        if (p.email === auth.email) { profile = p; break; }
      }
    }

    if (!profile) return res.json({ ok: true, profile: null });
    return res.json({ ok: true, profile });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = req.body || {};
  const { action } = body;

  // ── REGISTER / CONNECT — create user + draft profile ─────────────────────
  if (action === 'register') {
    const auth = await verifyRequestBearer(req);
    const { fullName, email, phone, password } = body;
    const reqEmail = (auth.ok && auth.email) ? auth.email.toLowerCase().trim() : (email || '').toLowerCase().trim();
    const nameTrimmed = String(fullName || auth.name || reqEmail.split('@')[0] || 'User').trim();

    if (!reqEmail) {
      return res.status(400).json({ ok: false, error: 'Email is required.' });
    }

    let userId = null;
    let token = null;

    if (dbReady) {
      const existingUser = await query('SELECT id, password_hash FROM bc_users WHERE email = $1', [reqEmail]);
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        // Verify password if not already authenticated via Bearer token
        if (!auth.ok) {
          if (!password) {
            return res.status(400).json({ ok: false, error: 'An account with this email exists. Please enter your password to continue.' });
          }
          const valid = await bcrypt.compare(password, existingUser.rows[0].password_hash || '');
          if (!valid) {
            return res.status(401).json({ ok: false, error: 'Incorrect password for existing account. Please log in or enter the correct password.' });
          }
        }
        await query(
          `UPDATE bc_users SET name = COALESCE(NULLIF($1, ''), name), role = 'event_organizer', phone = COALESCE(NULLIF($2, ''), phone), updated_at = NOW() WHERE id = $3`,
          [nameTrimmed, phone || '', userId]
        );
      } else {
        if (!password && !auth.ok) {
          return res.status(400).json({ ok: false, error: 'Password is required to create a new account.' });
        }
        const hash = password ? await bcrypt.hash(password, SALT_ROUNDS) : '';
        const r = await query(
          `INSERT INTO bc_users (email, name, phone, password_hash, auth_method, role, profile, state, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'email','event_organizer',$5,$6,NOW(),NOW()) RETURNING id`,
          [reqEmail, nameTrimmed, phone || '', hash,
           JSON.stringify({ email: reqEmail, name: nameTrimmed }),
           JSON.stringify({ name: nameTrimmed, email: reqEmail, signedUpAt: new Date().toISOString() })]
        );
        userId = r.rows[0].id;
      }

      // Reuse active draft profile or create a new one
      const existingDraft = await query(
        `SELECT id FROM bc_event_profiles WHERE email = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
        [reqEmail]
      );
      let profileId;
      if (existingDraft.rows.length > 0) {
        profileId = existingDraft.rows[0].id;
      } else {
        const pr = await query(
          `INSERT INTO bc_event_profiles (user_id, email, step_event_info, current_step, status, created_at, updated_at)
           VALUES ($1, $2, $3, 1, 'draft', NOW(), NOW()) RETURNING id`,
          [userId, reqEmail, JSON.stringify({ organizerName: nameTrimmed, phone, email: reqEmail })]
        );
        profileId = pr.rows[0].id;
      }

      token = signBookingCartJwt(
        { sub: String(userId), userId, email: reqEmail, name: nameTrimmed, role: 'event_organizer', isEventOrganizer: true, eventProfileId: profileId },
        { expiresIn: '30d' }
      );

      return res.status(200).json({
        ok: true, token, profileId,
        user: { email: reqEmail, name: nameTrimmed, role: 'event_organizer', isEventOrganizer: true, eventProfileId: profileId }
      });
    } else {
      // Memory fallback
      const memUsers = getMemUsers();
      const store = getMemProfiles();
      let memUser = memUsers.get(reqEmail);

      if (memUser) {
        userId = memUser.id;
        if (!auth.ok && password) {
          const valid = await bcrypt.compare(password, memUser.passwordHash || '');
          if (!valid) {
            return res.status(401).json({ ok: false, error: 'Incorrect password for existing account.' });
          }
        }
        memUser.role = 'event_organizer';
      } else {
        userId = nextMemId('u');
        const hash = password ? await bcrypt.hash(password, SALT_ROUNDS) : '';
        memUser = { id: userId, email: reqEmail, name: nameTrimmed, phone: phone || '', passwordHash: hash, role: 'event_organizer' };
        memUsers.set(reqEmail, memUser);
      }

      let profileId;
      for (const [id, p] of store) {
        if (p.email === reqEmail && p.status === 'draft') {
          profileId = id;
          break;
        }
      }
      if (!profileId) {
        profileId = nextMemId('ep');
        store.set(profileId, {
          id: profileId, user_id: userId, email: reqEmail, status: 'draft', current_step: 1,
          step_event_info: { organizerName: nameTrimmed, phone, email: reqEmail },
          step_location: {}, step_features: {}, step_tickets: {}, step_gallery: [],
          step_policies: {}, step_contact: {}, completeness: 0,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
      }

      token = signBookingCartJwt(
        { sub: String(userId), userId, email: reqEmail, name: nameTrimmed, role: 'event_organizer', isEventOrganizer: true, eventProfileId: profileId },
        { expiresIn: '30d' }
      );

      return res.status(200).json({
        ok: true, token, profileId,
        user: { email: reqEmail, name: nameTrimmed, role: 'event_organizer', isEventOrganizer: true, eventProfileId: profileId }
      });
    }
  }

  // ── SAVE — persist a step's data ──────────────────────────────────────────
  if (action === 'save') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { step, data, profileId, currentStep } = body;
    const stepKey = `step_${step}`;
    const validSteps = ['event_info', 'location', 'features', 'tickets', 'gallery', 'policies', 'contact'];
    if (!validSteps.includes(step)) return res.status(400).json({ ok: false, error: `Unknown step: ${step}` });

    let fullProfile = null;

    if (dbReady) {
      const colData = JSON.stringify(data);
      let targetId = profileId;
      if (!targetId) {
        const r = await query(`SELECT id FROM bc_event_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, [auth.email]);
        targetId = r.rows.length ? r.rows[0].id : null;
      }
      if (!targetId) return res.status(404).json({ ok: false, error: 'Profile not found. Please restart registration.' });

      await query(
        `UPDATE bc_event_profiles SET ${stepKey} = $1, current_step = $2, updated_at = NOW() WHERE id = $3`,
        [colData, currentStep || 1, targetId]
      );
      // Also persist ticketBannerImage as a dedicated column when gallery step is saved
      if (step === 'gallery' && data && data.ticketBannerImage !== undefined) {
        await query(
          `UPDATE bc_event_profiles SET ticket_banner_image = $1 WHERE id = $2`,
          [data.ticketBannerImage || '', targetId]
        );
      }
      const r = await query(`SELECT * FROM bc_event_profiles WHERE id = $1`, [targetId]);
      fullProfile = r.rows[0] || null;
    } else {
      const store = getMemProfiles();
      let profile = null;
      if (profileId) {
        profile = store.get(profileId);
      } else {
        for (const [, p] of store) {
          if (p.email === auth.email) { profile = p; break; }
        }
      }
      if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found.' });
      profile[stepKey] = data;
      // Also persist ticketBannerImage in memory store when gallery step saved
      if (step === 'gallery' && data && data.ticketBannerImage !== undefined) {
        profile.ticket_banner_image = data.ticketBannerImage || '';
      }
      profile.current_step = currentStep || profile.current_step;
      profile.updated_at = new Date().toISOString();
      store.set(profile.id, profile);
      fullProfile = profile;
    }

    const completeness = calcCompleteness(fullProfile || {});
    if (dbReady && fullProfile) {
      await query(`UPDATE bc_event_profiles SET completeness = $1 WHERE id = $2`, [completeness, fullProfile.id]);
    } else if (fullProfile) {
      fullProfile.completeness = completeness;
    }

    return res.json({ ok: true, completeness, profile: fullProfile });
  }

  // ── SUBMIT — transition draft to pending ──────────────────────────────────
  if (action === 'submit') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { profileId } = body;
    let fullProfile = null;

    if (dbReady) {
      let targetId = profileId;
      if (!targetId) {
        const r = await query(`SELECT id FROM bc_event_profiles WHERE email = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1`, [auth.email]);
        targetId = r.rows.length ? r.rows[0].id : null;
      }
      if (!targetId) return res.status(404).json({ ok: false, error: 'Draft not found' });

      // Fetch the draft to check its eventName
      const draftRes = await query(`SELECT step_event_info FROM bc_event_profiles WHERE id = $1`, [targetId]);
      const draftInfo = draftRes.rows[0]?.step_event_info || {};
      const eventName = draftInfo.eventName || '';

      // Check for duplicates
      if (eventName) {
        const dupRes = await query(
          `SELECT id FROM bc_event_profiles WHERE id != $1 AND status IN ('pending', 'approved') AND step_event_info->>'eventName' ILIKE $2 LIMIT 1`,
          [targetId, eventName.trim()]
        );
        if (dupRes.rows.length > 0) {
          return res.status(409).json({ ok: false, error: 'An event or attraction with this name is already listed.' });
        }
      }

      await query(`UPDATE bc_event_profiles SET status = 'pending', updated_at = NOW() WHERE id = $1`, [targetId]);
      const r = await query(`SELECT * FROM bc_event_profiles WHERE id = $1`, [targetId]);
      fullProfile = r.rows[0];
    } else {
      const store = getMemProfiles();
      
      // First find the draft
      let draftProfile = null;
      let draftKey = null;
      for (const [key, p] of store) {
        if ((p.email === auth.email || String(p.id) === String(profileId)) && p.status === 'draft') {
          draftProfile = p;
          draftKey = key;
          break;
        }
      }

      if (draftProfile) {
        const eventName = draftProfile.step_event_info?.eventName || '';
        // Check for duplicates
        let isDuplicate = false;
        if (eventName) {
          for (const [, p] of store) {
            if (p.id !== draftProfile.id && ['pending', 'approved'].includes(p.status) && (p.step_event_info?.eventName || '').toLowerCase() === eventName.trim().toLowerCase()) {
              isDuplicate = true;
              break;
            }
          }
        }

        if (isDuplicate) {
          return res.status(409).json({ ok: false, error: 'An event or attraction with this name is already listed.' });
        }

        draftProfile.status = 'pending';
        draftProfile.updated_at = new Date().toISOString();
        store.set(draftKey, draftProfile);
        fullProfile = draftProfile;
      }
    }

    if (!fullProfile) return res.status(404).json({ ok: false, error: 'Draft not found' });
    return res.json({ ok: true, status: 'pending', completeness: fullProfile.completeness || 0 });
  }

  // ── ADMIN-LIST — get all profiles for admin review ────────────────────────
  if (action === 'admin-list') {
    const gate = await requireAdminEmail(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

    const { statusFilter = 'pending' } = body;
    let profiles = [];
    if (dbReady) {
      const r = await query(
        `SELECT * FROM bc_event_profiles WHERE status = $1 ORDER BY updated_at DESC LIMIT 100`,
        [statusFilter]
      );
      profiles = r.rows;
    } else {
      const store = getMemProfiles();
      for (const [, p] of store) {
        if (p.status === statusFilter) profiles.push(p);
      }
    }
    return res.json({ ok: true, profiles });
  }

  // ── ADMIN-REVIEW — approve / reject / request revision ───────────────────
  if (action === 'admin-review') {
    const gate = await requireAdminEmail(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

    const { profileId, id, status: newStatus, note } = body;
    const targetId = profileId || id;
    if (!targetId || !newStatus) return res.status(400).json({ ok: false, error: 'Missing profileId or status' });

    const validStatuses = ['approved', 'rejected', 'revision'];
    if (!validStatuses.includes(newStatus)) return res.status(400).json({ ok: false, error: 'Invalid status' });

    if (dbReady) {
      await query(
        `UPDATE bc_event_profiles SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, note || '', targetId]
      );
    } else {
      const store = getMemProfiles();
      for (const [key, p] of store) {
        if (String(p.id) === String(targetId)) {
          p.status = newStatus;
          p.admin_note = note || '';
          p.updated_at = new Date().toISOString();
          store.set(key, p);
          break;
        }
      }
    }

    console.log(`[event-profiles] Admin reviewed profile ${targetId}: ${newStatus}`);
    return res.json({ ok: true, status: newStatus });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
};
