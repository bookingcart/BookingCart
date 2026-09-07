// api-routes/guide-profiles.js
// Handles guide profile creation lifecycle:
//   POST { action: 'register' }          — create user + empty draft profile
//   POST { action: 'save', step, data }  — save progress for a specific step
//   GET  ?token=&userId=                 — load draft for authenticated user
//   POST { action: 'submit', token }     — submit draft for admin review
//   POST { action: 'admin-review', id, status, note } — approve / reject / revision
//   POST { action: 'admin-list' }        — list pending/all profiles (admin only)

const bcrypt = require('bcrypt');
const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');
const { signBookingCartJwt, verifyRequestBearer } = require('../lib/google-verify');

const SALT_ROUNDS = 12;

// ─── Completeness Calculator ──────────────────────────────────────────────────
function calcCompleteness(profile) {
  let score = 0;
  const p = profile;
  const personal = p.step_personal || {};
  const categories = p.step_categories || {};
  const areas = p.step_areas || {};
  const languages = p.step_languages || {};
  const skills = p.step_skills || {};
  const certifications = Array.isArray(p.step_certifications) ? p.step_certifications : [];
  const gallery = Array.isArray(p.step_gallery) ? p.step_gallery : [];
  const availability = p.step_availability || {};
  const pricing = p.step_pricing || {};

  // Photo (10%)
  if (personal.photo && personal.photo.length > 10) score += 10;
  // Bio (10%)
  if (personal.bio && personal.bio.length >= 50) score += 10;
  // Skills (15%)
  const skillList = Array.isArray(skills.selected) ? skills.selected : [];
  if (skillList.length >= 3) score += 15;
  else if (skillList.length >= 1) score += 7;
  // Areas (15%)
  const cities = Array.isArray(areas.cities) ? areas.cities : [];
  const attractions = Array.isArray(areas.attractions) ? areas.attractions : [];
  if (cities.length >= 1 || attractions.length >= 1) score += 15;
  else if (areas.country) score += 7;
  // Languages (10%)
  const langs = Array.isArray(languages.list) ? languages.list : [];
  if (langs.length >= 2) score += 10;
  else if (langs.length === 1) score += 5;
  // Gallery (10%)
  if (gallery.length >= 4) score += 10;
  else if (gallery.length >= 2) score += 5;
  // Availability (15%)
  const workingDays = Array.isArray(availability.workingDays) ? availability.workingDays : [];
  if (workingDays.length >= 5) score += 15;
  else if (workingDays.length >= 3) score += 8;
  // Pricing (10%)
  if (pricing.perDay && parseFloat(pricing.perDay) > 0) score += 10;
  else if (pricing.perHour && parseFloat(pricing.perHour) > 0) score += 5;
  // Certifications (5%)
  if (certifications.length >= 1) score += 5;

  return Math.min(100, score);
}

// ─── Badge Calculator ─────────────────────────────────────────────────────────
function computeBadges(profile) {
  const badges = [];
  const certs = Array.isArray(profile.step_certifications) ? profile.step_certifications : [];
  const exp = profile.step_experience || {};
  const pricing = profile.step_pricing || {};

  if (profile.status === 'approved') badges.push('verified');
  if (certs.some(c => (c.name || '').toLowerCase().includes('license') || (c.name || '').toLowerCase().includes('licensed'))) badges.push('licensed');
  if (certs.some(c => (c.name || '').toLowerCase().includes('first aid') || (c.name || '').toLowerCase().includes('wilderness first'))) badges.push('first-aid');
  if (parseInt(exp.toursCount || 0) >= 500) badges.push('500-tours');
  else if (parseInt(exp.toursCount || 0) >= 100) badges.push('100-tours');
  if (profile.instant_booking) badges.push('instant-booking');
  return badges;
}

// ─── In-memory fallback store ─────────────────────────────────────────────────
function getMemProfiles() {
  if (!global.__bc_guide_profiles) global.__bc_guide_profiles = new Map();
  return global.__bc_guide_profiles;
}
function getMemUsers() {
  if (!global.__bc_auth_users) global.__bc_auth_users = new Map();
  return global.__bc_auth_users;
}
function nextMemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Build bc_guides row from profile ────────────────────────────────────────
function profileToGuide(profile) {
  const personal = profile.step_personal || {};
  const categories = profile.step_categories || {};
  const areas = profile.step_areas || {};
  const languages = profile.step_languages || {};
  const skills = profile.step_skills || {};
  const certs = Array.isArray(profile.step_certifications) ? profile.step_certifications : [];
  const exp = profile.step_experience || {};
  const pricing = profile.step_pricing || {};
  const gallery = Array.isArray(profile.step_gallery) ? profile.step_gallery : [];
  const availability = profile.step_availability || {};
  const bookingSettings = profile.step_booking_settings || {};

  const slug = `guide-${(personal.fullName || profile.email || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now()}`;

  // Build availability map for next 90 days
  const availMap = {};
  const today = new Date();
  const workingDays = (availability.workingDays || ['Mon','Tue','Wed','Thu','Fri']).map(d => d.toLowerCase().slice(0, 3));
  const blockedDates = Array.isArray(availability.blockedDates) ? availability.blockedDates : [];
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getDay()];
    if (blockedDates.includes(key)) availMap[key] = 'blocked';
    else if (workingDays.includes(dayName)) availMap[key] = 'available';
    else availMap[key] = 'blocked';
  }

  return {
    slug,
    name: personal.fullName || profile.email,
    photo: personal.photo || '',
    country: areas.country || '',
    city: personal.city || '',
    bio: personal.bio || '',
    years_exp: parseInt(exp.yearsExp || 0),
    verified: true,
    rating: 0,
    review_count: 0,
    categories: Array.isArray(categories.selected) ? categories.selected : [],
    skills: Array.isArray(skills.selected) ? skills.selected : [],
    languages: Array.isArray(languages.list) ? languages.list : [],
    areas: {
      country: areas.country || '',
      regions: Array.isArray(areas.regions) ? areas.regions : [],
      cities: Array.isArray(areas.cities) ? areas.cities : [],
      attractions: Array.isArray(areas.attractions) ? areas.attractions : [],
    },
    certifications: certs.map(c => `${c.name || ''} – ${c.org || ''}`).filter(Boolean),
    gallery: Array.isArray(gallery) ? gallery.filter(u => u && u.url).map(u => u.url) : [],
    reviews: [],
    pricing: {
      perDay: parseFloat(pricing.perDay || 0),
      perPerson: 0,
      perHour: parseFloat(pricing.perHour || 0),
      halfDay: parseFloat(pricing.halfDay || 0),
      multiDay: parseFloat(pricing.multiDay || 0),
      currency: pricing.currency || 'USD',
      notes: pricing.notes || '',
      instantBooking: !!bookingSettings.instantBooking,
    },
    trust_indicators: {
      bookingsThisMonth: 0,
      lastBookedDays: null,
      responseMinutes: 60,
      toursCount: parseInt(exp.toursCount || 0),
      achievements: exp.achievements || '',
    },
    badges: computeBadges({ ...profile, status: 'approved' }),
    demand_level: 'moderate',
    status: 'active',
    availability: availMap,
    instant_booking: !!bookingSettings.instantBooking,
    working_days: JSON.stringify(availability.workingDays || []),
    working_hours: JSON.stringify({ start: availability.startTime || '07:00', end: availability.endTime || '19:00' }),
    max_tours_per_day: parseInt(availability.maxToursPerDay || 1),
  };
}

// ─── Ensure tables exist ──────────────────────────────────────────────────────
async function ensureTables() {
  // Ensure bc_users has phone + role columns
  await query(`
    ALTER TABLE bc_users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE bc_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'traveler';
  `).catch(() => {});

  // Ensure bc_guides has extended columns
  await query(`
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS instant_booking BOOLEAN DEFAULT false;
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS working_days TEXT DEFAULT '[]';
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS working_hours TEXT DEFAULT '{}';
    ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS max_tours_per_day INTEGER DEFAULT 1;
  `).catch(() => {});

  // Create bc_guide_profiles table
  await query(`
    CREATE TABLE IF NOT EXISTS bc_guide_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT NOT NULL,
      step_personal JSONB DEFAULT '{}',
      step_categories JSONB DEFAULT '{}',
      step_areas JSONB DEFAULT '{}',
      step_languages JSONB DEFAULT '{}',
      step_skills JSONB DEFAULT '{}',
      step_certifications JSONB DEFAULT '[]',
      step_experience JSONB DEFAULT '{}',
      step_pricing JSONB DEFAULT '{}',
      step_gallery JSONB DEFAULT '[]',
      step_availability JSONB DEFAULT '{}',
      step_booking_settings JSONB DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      admin_note TEXT DEFAULT '',
      completeness INTEGER DEFAULT 0,
      current_step INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
    console.warn('[guide-profiles] DB unavailable, using memory fallback:', err.message);
  }

  // ── GET — load profile for authenticated user ─────────────────────────────
  if (req.method === 'GET') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    let profile = null;
    if (dbReady) {
      const r = await query(
        `SELECT * FROM bc_guide_profiles WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
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

  // ── REGISTER — create user + draft profile ────────────────────────────────
  if (action === 'register') {
    const { fullName, email, phone, password } = body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Name, email, and password are required.' });
    }
    const emailLower = email.toLowerCase().trim();

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    let userId = null;

    if (dbReady) {
      // Check for existing user
      const existing = await query('SELECT id FROM bc_users WHERE email = $1', [emailLower]);
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        // Update role to guide_applicant if not already
        await query(`UPDATE bc_users SET role = 'guide_applicant', phone = $1, updated_at = NOW() WHERE id = $2`, [phone || '', userId]);
      } else {
        const r = await query(
          `INSERT INTO bc_users (email, name, phone, password_hash, auth_method, role, profile, state, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'email','guide_applicant',$5,$6,NOW(),NOW()) RETURNING id`,
          [emailLower, fullName, phone || '', hash,
           JSON.stringify({ email: emailLower, name: fullName }),
           JSON.stringify({ name: fullName, email: emailLower, signedUpAt: new Date().toISOString() })]
        );
        userId = r.rows[0].id;
      }

      // Check for existing draft
      const existingDraft = await query(
        `SELECT id FROM bc_guide_profiles WHERE email = $1 AND status = 'draft' LIMIT 1`, [emailLower]
      );
      let profileId;
      if (existingDraft.rows.length > 0) {
        profileId = existingDraft.rows[0].id;
      } else {
        const pr = await query(
          `INSERT INTO bc_guide_profiles (user_id, email, step_personal, current_step, status, created_at, updated_at)
           VALUES ($1, $2, $3, 1, 'draft', NOW(), NOW()) RETURNING id`,
          [userId, emailLower, JSON.stringify({ fullName, phone, email: emailLower })]
        );
        profileId = pr.rows[0].id;
      }

      const token = signBookingCartJwt(
        { sub: String(userId), userId, email: emailLower, name: fullName, role: 'guide_applicant' },
        { expiresIn: '30d' }
      );
      return res.status(201).json({ ok: true, token, profileId, user: { email: emailLower, name: fullName } });
    } else {
      // In-memory fallback
      const memUsers = getMemUsers();
      let memUser = memUsers.get(emailLower);
      if (memUser) {
        userId = memUser.id;
      } else {
        userId = nextMemId('u');
        memUser = { id: userId, email: emailLower, name: fullName, phone: phone || '', passwordHash: hash, role: 'guide_applicant' };
        memUsers.set(emailLower, memUser);
      }
      const profileId = nextMemId('gp');
      const store = getMemProfiles();
      store.set(profileId, {
        id: profileId, user_id: userId, email: emailLower, status: 'draft', current_step: 1,
        step_personal: { fullName, phone, email: emailLower },
        step_categories: {}, step_areas: {}, step_languages: {}, step_skills: {},
        step_certifications: [], step_experience: {}, step_pricing: {}, step_gallery: [],
        step_availability: {}, step_booking_settings: {}, completeness: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      const token = signBookingCartJwt(
        { sub: String(userId), userId, email: emailLower, name: fullName, role: 'guide_applicant' },
        { expiresIn: '30d' }
      );
      return res.status(201).json({ ok: true, token, profileId, user: { email: emailLower, name: fullName } });
    }
  }

  // ── SAVE — persist a step's data ──────────────────────────────────────────
  if (action === 'save') {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { step, data, profileId, currentStep } = body;
    const stepKey = `step_${step}`;
    const validSteps = ['personal','categories','areas','languages','skills','certifications','experience','pricing','gallery','availability','booking_settings'];
    if (!validSteps.includes(step)) return res.status(400).json({ ok: false, error: `Unknown step: ${step}` });

    let fullProfile = null;

    if (dbReady) {
      const colData = JSON.stringify(Array.isArray(data) ? data : data);
      let targetId = profileId;
      if (!targetId) {
        const r = await query(`SELECT id FROM bc_guide_profiles WHERE email = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1`, [auth.email]);
        targetId = r.rows.length ? r.rows[0].id : null;
      }
      if (!targetId) return res.status(404).json({ ok: false, error: 'Draft profile not found. Please restart registration.' });

      await query(
        `UPDATE bc_guide_profiles SET ${stepKey} = $1, current_step = $2, updated_at = NOW() WHERE id = $3`,
        [colData, currentStep || 1, targetId]
      );
      const r = await query(`SELECT * FROM bc_guide_profiles WHERE id = $1`, [targetId]);
      fullProfile = r.rows[0] || null;
    } else {
      const store = getMemProfiles();
      let profile = null;
      if (profileId) {
        profile = store.get(profileId);
      } else {
        for (const [, p] of store) {
          if (p.email === auth.email && p.status === 'draft') { profile = p; break; }
        }
      }
      if (!profile) return res.status(404).json({ ok: false, error: 'Draft profile not found.' });
      profile[stepKey] = data;
      profile.current_step = currentStep || profile.current_step;
      profile.updated_at = new Date().toISOString();
      store.set(profile.id, profile);
      fullProfile = profile;
    }

    // Recalculate completeness
    const completeness = calcCompleteness(fullProfile || {});
    if (dbReady && fullProfile) {
      await query(`UPDATE bc_guide_profiles SET completeness = $1 WHERE id = $2`, [completeness, fullProfile.id]);
    } else if (fullProfile) {
      fullProfile.completeness = completeness;
    }

    return res.json({ ok: true, completeness });
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
        const r = await query(`SELECT id FROM bc_guide_profiles WHERE email = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1`, [auth.email]);
        targetId = r.rows.length ? r.rows[0].id : null;
      }
      if (!targetId) return res.status(404).json({ ok: false, error: 'Draft not found' });
      await query(`UPDATE bc_guide_profiles SET status = 'pending', updated_at = NOW() WHERE id = $1`, [targetId]);
      const r = await query(`SELECT * FROM bc_guide_profiles WHERE id = $1`, [targetId]);
      fullProfile = r.rows[0];
    } else {
      const store = getMemProfiles();
      for (const [key, p] of store) {
        if ((p.email === auth.email || String(p.id) === String(profileId)) && p.status === 'draft') {
          p.status = 'pending';
          p.updated_at = new Date().toISOString();
          store.set(key, p);
          fullProfile = p;
          break;
        }
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
        `SELECT * FROM bc_guide_profiles WHERE status = $1 ORDER BY updated_at DESC LIMIT 100`,
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

    let fullProfile = null;
    if (dbReady) {
      await query(
        `UPDATE bc_guide_profiles SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, note || '', targetId]
      );
      const r = await query(`SELECT * FROM bc_guide_profiles WHERE id = $1`, [targetId]);
      fullProfile = r.rows[0];
    } else {
      const store = getMemProfiles();
      for (const [key, p] of store) {
        if (String(p.id) === String(targetId)) {
          p.status = newStatus;
          p.admin_note = note || '';
          p.updated_at = new Date().toISOString();
          store.set(key, p);
          fullProfile = p;
          break;
        }
      }
    }

    // If approved, upsert into bc_guides
    if (newStatus === 'approved' && fullProfile) {
      try {
        const guideData = profileToGuide(fullProfile);
        if (dbReady) {
          await query(`
            INSERT INTO bc_guides (
              slug, name, photo, country, city, years_exp, verified, rating, review_count,
              categories, skills, languages, areas, certifications, gallery, reviews,
              pricing, trust_indicators, demand_level, status, availability,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())
            ON CONFLICT (slug) DO UPDATE SET
              name=EXCLUDED.name, photo=EXCLUDED.photo, status='active', updated_at=NOW()`,
            [
              guideData.slug, guideData.name, guideData.photo, guideData.country,
              guideData.city, guideData.years_exp, guideData.verified, guideData.rating,
              guideData.review_count, JSON.stringify(guideData.categories),
              JSON.stringify(guideData.skills), JSON.stringify(guideData.languages),
              JSON.stringify(guideData.areas), JSON.stringify(guideData.certifications),
              JSON.stringify(guideData.gallery), JSON.stringify(guideData.reviews),
              JSON.stringify(guideData.pricing), JSON.stringify(guideData.trust_indicators),
              guideData.demand_level, 'active', JSON.stringify(guideData.availability)
            ]
          );
        } else {
          if (!global.__guides) global.__guides = [];
          const idx = global.__guides.findIndex(g => g.email === fullProfile.email);
          const newGuide = { ...guideData, id: idx >= 0 ? global.__guides[idx].id : Date.now(), createdAt: new Date().toISOString() };
          if (idx >= 0) global.__guides[idx] = newGuide;
          else global.__guides.push(newGuide);
        }
        console.log(`[guide-profiles] Approved & published guide: ${guideData.slug}`);
      } catch (err) {
        console.error('[guide-profiles] Error publishing guide to bc_guides:', err);
      }
    }

    return res.json({ ok: true, status: newStatus });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
};
