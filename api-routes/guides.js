// api-routes/guides.js — Tour Guide profile management

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { requireAdminEmail } = require('../lib/admin');

// ─── Rich Demo Seed Data ─────────────────────────────────────────────────────
const SEED_GUIDES = [
  {
    slug: 'guide-sarah-johnson',
    name: 'Sarah Johnson',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    country: 'Uganda',
    city: 'Kampala',
    yearsExp: 7,
    verified: true,
    rating: 4.9,
    reviewCount: 321,
    categories: ['Safari Guide', 'Wildlife Guide', 'Photography Guide'],
    skills: ['Wildlife Tracking', 'Bird Identification', 'Photography Assistance', 'First Aid', 'Safari Planning', 'Nature Conservation'],
    languages: [
      { lang: 'English', proficiency: 'Native' },
      { lang: 'French', proficiency: 'Fluent' },
      { lang: 'Swahili', proficiency: 'Fluent' }
    ],
    areas: {
      country: 'Uganda',
      regions: ['Central Uganda', 'Western Uganda'],
      cities: ['Kampala', 'Fort Portal', 'Mbarara'],
      attractions: ['Bwindi Impenetrable Forest', 'Queen Elizabeth National Park', 'Murchison Falls']
    },
    certifications: ['Licensed Tour Guide – Uganda Tourism Board', 'Wilderness First Aid', 'National Park Certification – Uganda Wildlife Authority'],
    gallery: [
      'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534143776485-53d2b65e71e6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1564760055775-d63b17a55c44?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Mark T.', country: 'Germany', rating: 5, text: 'Sarah is an absolute legend! Her knowledge of Bwindi was extraordinary.', date: '2026-08-12' },
      { author: 'Chloe R.', country: 'France', rating: 5, text: 'Incredible experience. Sarah spotted gorillas within the first hour!', date: '2026-07-28' },
      { author: 'James W.', country: 'USA', rating: 5, text: 'Best wildlife guide I\'ve ever had. Her passion is contagious.', date: '2026-06-15' }
    ],
    pricing: { perDay: 180, perPerson: 0, currency: 'USD', notes: 'Includes transport, park fees arranged separately' },
    trustIndicators: { bookingsThisMonth: 18, lastBookedDays: 2, responseMinutes: 15 },
    demandLevel: 'very-high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-08', '2026-09-09', '2026-09-15', '2026-09-16', '2026-09-17'], pendingDates: ['2026-09-12', '2026-09-13'] })
  },
  {
    slug: 'guide-amara-osei',
    name: 'Amara Osei',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    country: 'Kenya',
    city: 'Nairobi',
    yearsExp: 12,
    verified: true,
    rating: 4.8,
    reviewCount: 487,
    categories: ['Safari Guide', 'Cultural Guide', 'Adventure Guide'],
    skills: ['Wildlife Tracking', 'Cultural Interpretation', 'Hiking Leadership', 'First Aid', 'Safari Planning', 'Historical Storytelling'],
    languages: [
      { lang: 'English', proficiency: 'Native' },
      { lang: 'Swahili', proficiency: 'Native' },
      { lang: 'German', proficiency: 'Professional' }
    ],
    areas: {
      country: 'Kenya',
      regions: ['Rift Valley', 'Nairobi Area', 'Coast Region'],
      cities: ['Nairobi', 'Mombasa', 'Nakuru', 'Samburu'],
      attractions: ['Maasai Mara', 'Amboseli National Park', 'Lake Nakuru', 'Diani Beach']
    },
    certifications: ['Kenya Professional Safari Guide – Silver Level', 'Red Cross First Aid', 'Kenya Wildlife Service Certification'],
    gallery: [
      'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1549366021-9f761d450615?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1560114928-40f1f1eb26a0?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Sophie L.', country: 'UK', rating: 5, text: 'Amara\'s knowledge of the Maasai culture was breathtaking.', date: '2026-08-20' },
      { author: 'Hans M.', country: 'Germany', rating: 5, text: 'Spoke perfect German and knew every animal by name.', date: '2026-07-14' },
      { author: 'Lisa P.', country: 'Canada', rating: 4, text: 'Fantastic guide, very professional and funny!', date: '2026-06-30' }
    ],
    pricing: { perDay: 220, perPerson: 0, currency: 'USD', notes: 'Includes 4×4 vehicle and driver' },
    trustIndicators: { bookingsThisMonth: 24, lastBookedDays: 1, responseMinutes: 10 },
    demandLevel: 'very-high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-22'], pendingDates: ['2026-09-10'] })
  },
  {
    slug: 'guide-fatima-al-rashid',
    name: 'Fatima Al-Rashid',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    country: 'Morocco',
    city: 'Marrakech',
    yearsExp: 9,
    verified: true,
    rating: 4.7,
    reviewCount: 256,
    categories: ['Cultural Guide', 'Historical Guide', 'Food Tour Guide'],
    skills: ['Historical Storytelling', 'Cultural Interpretation', 'Cooking Experiences', 'Photography Assistance', 'Museum Guide'],
    languages: [
      { lang: 'Arabic', proficiency: 'Native' },
      { lang: 'French', proficiency: 'Native' },
      { lang: 'English', proficiency: 'Fluent' },
      { lang: 'Spanish', proficiency: 'Professional' }
    ],
    areas: {
      country: 'Morocco',
      regions: ['Marrakech-Safi', 'Fès-Meknès', 'Drâa-Tafilalet'],
      cities: ['Marrakech', 'Fez', 'Essaouira', 'Merzouga'],
      attractions: ['Djemaa el-Fna', 'Sahara Desert', 'Medina of Fez', 'Atlas Mountains']
    },
    certifications: ['Moroccan Ministry of Tourism – Licensed Guide', 'Food Safety Certificate'],
    gallery: [
      'https://images.unsplash.com/photo-1539020140153-e479b8bbe5f3?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1547036967-23d11aacaee0?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Pierre D.', country: 'France', rating: 5, text: 'Fatima took us to hidden souks that only locals know about. Magical!', date: '2026-08-05' },
      { author: 'Emma K.', country: 'USA', rating: 5, text: 'The cooking class she organized was the highlight of our trip.', date: '2026-07-22' }
    ],
    pricing: { perDay: 140, perPerson: 35, currency: 'USD', notes: 'Food tour pricing per person; private tours per day rate' },
    trustIndicators: { bookingsThisMonth: 12, lastBookedDays: 3, responseMinutes: 30 },
    demandLevel: 'high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-11', '2026-09-12', '2026-09-18'], pendingDates: ['2026-09-20'] })
  },
  {
    slug: 'guide-miguel-santos',
    name: 'Miguel Santos',
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
    country: 'Peru',
    city: 'Cusco',
    yearsExp: 15,
    verified: true,
    rating: 4.9,
    reviewCount: 612,
    categories: ['Historical Guide', 'Adventure Guide', 'Hiking Guide'],
    skills: ['Historical Storytelling', 'Hiking Leadership', 'First Aid', 'Photography Assistance', 'Cultural Interpretation'],
    languages: [
      { lang: 'Spanish', proficiency: 'Native' },
      { lang: 'English', proficiency: 'Fluent' },
      { lang: 'German', proficiency: 'Basic' },
      { lang: 'French', proficiency: 'Basic' }
    ],
    areas: {
      country: 'Peru',
      regions: ['Cusco Region', 'Puno Region', 'Arequipa Region'],
      cities: ['Cusco', 'Aguas Calientes', 'Puno', 'Ollantaytambo'],
      attractions: ['Machu Picchu', 'Inca Trail', 'Lake Titicaca', 'Sacred Valley']
    },
    certifications: ['MINCETUR – Certified Tourism Professional', 'Wilderness First Responder', 'Inca Trail Special Guide Permit'],
    gallery: [
      'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1599229834379-54c28f3ca979?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1587595431973-160d0d94add1?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Anna B.', country: 'Netherlands', rating: 5, text: 'Miguel made Machu Picchu come alive with his historical insights.', date: '2026-08-18' },
      { author: 'John H.', country: 'Australia', rating: 5, text: '15 years of experience shows. Absolutely world-class guide.', date: '2026-07-30' },
      { author: 'Yuki T.', country: 'Japan', rating: 5, text: 'The Inca Trail with Miguel was the best experience of my life.', date: '2026-06-28' }
    ],
    pricing: { perDay: 250, perPerson: 0, currency: 'USD', notes: 'Multi-day treks include camping equipment' },
    trustIndicators: { bookingsThisMonth: 31, lastBookedDays: 0, responseMinutes: 5 },
    demandLevel: 'very-high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-22', '2026-09-23', '2026-09-24'], pendingDates: ['2026-09-13'] })
  },
  {
    slug: 'guide-yuki-tanaka',
    name: 'Yuki Tanaka',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    country: 'Japan',
    city: 'Kyoto',
    yearsExp: 8,
    verified: true,
    rating: 4.8,
    reviewCount: 389,
    categories: ['Cultural Guide', 'Religious Tourism Guide', 'City Tour Guide'],
    skills: ['Cultural Interpretation', 'Historical Storytelling', 'Photography Assistance', 'Cooking Experiences'],
    languages: [
      { lang: 'Japanese', proficiency: 'Native' },
      { lang: 'English', proficiency: 'Fluent' },
      { lang: 'Chinese', proficiency: 'Professional' }
    ],
    areas: {
      country: 'Japan',
      regions: ['Kansai', 'Kinki'],
      cities: ['Kyoto', 'Nara', 'Osaka', 'Hiroshima'],
      attractions: ['Fushimi Inari Shrine', 'Arashiyama Bamboo Grove', 'Kinkaku-ji', 'Nishiki Market']
    },
    certifications: ['Japan Tourism Agency – Licensed Guide Interpreter', 'English Language Certification N1'],
    gallery: [
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Sarah M.', country: 'USA', rating: 5, text: 'Yuki showed us a side of Kyoto that guidebooks don\'t mention.', date: '2026-08-10' },
      { author: 'Wei L.', country: 'China', rating: 5, text: 'Her Chinese was perfect and she knew every temple intimately.', date: '2026-07-25' }
    ],
    pricing: { perDay: 160, perPerson: 0, currency: 'USD', notes: 'Public transport costs billed separately' },
    trustIndicators: { bookingsThisMonth: 15, lastBookedDays: 1, responseMinutes: 20 },
    demandLevel: 'high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-09', '2026-09-16', '2026-09-23'], pendingDates: ['2026-09-19'] })
  },
  {
    slug: 'guide-elena-petrov',
    name: 'Elena Petrov',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80',
    country: 'Greece',
    city: 'Athens',
    yearsExp: 11,
    verified: true,
    rating: 4.7,
    reviewCount: 298,
    categories: ['Historical Guide', 'Museum Guide', 'City Tour Guide'],
    skills: ['Historical Storytelling', 'Cultural Interpretation', 'Museum Guide', 'Photography Assistance'],
    languages: [
      { lang: 'Greek', proficiency: 'Native' },
      { lang: 'English', proficiency: 'Fluent' },
      { lang: 'Russian', proficiency: 'Fluent' },
      { lang: 'German', proficiency: 'Professional' }
    ],
    areas: {
      country: 'Greece',
      regions: ['Attica', 'Central Greece', 'Aegean Islands'],
      cities: ['Athens', 'Delphi', 'Santorini', 'Thessaloniki'],
      attractions: ['Acropolis', 'Parthenon', 'Ancient Agora', 'National Archaeological Museum']
    },
    certifications: ['Greek Ministry of Tourism – EOT Licensed Guide', 'Classical Archaeology Degree – University of Athens'],
    gallery: [
      'https://images.unsplash.com/photo-1555993539-1732b0258235?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1543489822-c49534f3271f?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Robert S.', country: 'UK', rating: 5, text: 'Elena\'s knowledge of Ancient Greek history is simply unparalleled.', date: '2026-08-22' },
      { author: 'Maria K.', country: 'Russia', rating: 5, text: 'Spoke perfect Russian and made history come alive!', date: '2026-07-17' }
    ],
    pricing: { perDay: 175, perPerson: 0, currency: 'USD', notes: 'Museum entry fees billed separately' },
    trustIndicators: { bookingsThisMonth: 9, lastBookedDays: 4, responseMinutes: 45 },
    demandLevel: 'moderate',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-12', '2026-09-13', '2026-09-19'], pendingDates: [] })
  },
  {
    slug: 'guide-kwame-mensah',
    name: 'Kwame Mensah',
    photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
    country: 'Ghana',
    city: 'Accra',
    yearsExp: 6,
    verified: false,
    rating: 4.6,
    reviewCount: 134,
    categories: ['Cultural Guide', 'Historical Guide', 'Food Tour Guide'],
    skills: ['Cultural Interpretation', 'Historical Storytelling', 'Cooking Experiences', 'Boat Excursions'],
    languages: [
      { lang: 'English', proficiency: 'Native' },
      { lang: 'Twi', proficiency: 'Native' },
      { lang: 'French', proficiency: 'Basic' }
    ],
    areas: {
      country: 'Ghana',
      regions: ['Greater Accra', 'Ashanti Region', 'Central Region'],
      cities: ['Accra', 'Kumasi', 'Cape Coast', 'Elmina'],
      attractions: ['Cape Coast Castle', 'Kakum National Park', 'Boti Falls', 'Kejetia Market']
    },
    certifications: ['Ghana Tourism Authority – Licensed Guide'],
    gallery: [
      'https://images.unsplash.com/photo-1580810734915-f37d2e65d9ad?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1565368866787-f0b8b3cadd8e?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'David A.', country: 'USA', rating: 5, text: 'Kwame brought the history of the slave trade to life with deep empathy.', date: '2026-08-01' },
      { author: 'Nicole B.', country: 'France', rating: 4, text: 'Great personality and vast local knowledge. Highly recommend!', date: '2026-07-10' }
    ],
    pricing: { perDay: 95, perPerson: 0, currency: 'USD', notes: 'All-inclusive day rate' },
    trustIndicators: { bookingsThisMonth: 7, lastBookedDays: 5, responseMinutes: 60 },
    demandLevel: 'moderate',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-10', '2026-09-17'], pendingDates: ['2026-09-14'] })
  },
  {
    slug: 'guide-layla-hassan',
    name: 'Layla Hassan',
    photo: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80',
    country: 'Egypt',
    city: 'Cairo',
    yearsExp: 14,
    verified: true,
    rating: 4.9,
    reviewCount: 521,
    categories: ['Historical Guide', 'Museum Guide', 'Luxury Guide'],
    skills: ['Historical Storytelling', 'Cultural Interpretation', 'Museum Guide', 'Photography Assistance', 'Boat Excursions'],
    languages: [
      { lang: 'Arabic', proficiency: 'Native' },
      { lang: 'English', proficiency: 'Fluent' },
      { lang: 'French', proficiency: 'Fluent' },
      { lang: 'Italian', proficiency: 'Professional' }
    ],
    areas: {
      country: 'Egypt',
      regions: ['Cairo Governorate', 'Luxor Governorate', 'Aswan Governorate'],
      cities: ['Cairo', 'Luxor', 'Aswan', 'Alexandria'],
      attractions: ['Great Pyramid of Giza', 'Egyptian Museum', 'Valley of the Kings', 'Abu Simbel']
    },
    certifications: ['Egyptian Ministry of Tourism – Class A Licensed Guide', 'Egyptology Certificate – Cairo University', 'Luxury Tourism Specialist'],
    gallery: [
      'https://images.unsplash.com/photo-1539650116574-75c0c6d74a24?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1533130061792-64b345e4a833?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1581781870027-04212f9f8850?auto=format&fit=crop&w=800&q=80'
    ],
    reviews: [
      { author: 'Isabella R.', country: 'Italy', rating: 5, text: 'Layla is the best guide I have ever hired anywhere in the world.', date: '2026-08-25' },
      { author: 'Marc D.', country: 'Belgium', rating: 5, text: 'Her depth of knowledge about Ancient Egypt is extraordinary.', date: '2026-07-19' },
      { author: 'Claire F.', country: 'France', rating: 5, text: 'She spoke perfect French and knew every hieroglyph at the museum!', date: '2026-06-22' }
    ],
    pricing: { perDay: 300, perPerson: 0, currency: 'USD', notes: 'Luxury vehicle included; Nile cruise arrangements available' },
    trustIndicators: { bookingsThisMonth: 22, lastBookedDays: 1, responseMinutes: 8 },
    demandLevel: 'very-high',
    status: 'active',
    availability: buildAvailability({ bookedDates: ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-23'], pendingDates: ['2026-09-11', '2026-09-18'] })
  }
];

function buildAvailability({ bookedDates = [], pendingDates = [], blockedDates = [] } = {}) {
  // Build a map for 3 months of availability
  const result = {};
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().split('T')[0];
    if (blockedDates.includes(key)) {
      result[key] = 'blocked';
    } else if (bookedDates.includes(key)) {
      result[key] = 'booked';
    } else if (pendingDates.includes(key)) {
      result[key] = 'pending';
    } else {
      result[key] = 'available';
    }
  }
  return result;
}

// ─── Row mapper ─────────────────────────────────────────────────────────────
function rowToGuide(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    photo: row.photo || '',
    country: row.country || '',
    city: row.city || '',
    yearsExp: row.years_exp || 0,
    verified: !!row.verified,
    registrationFeePaid: row.registration_fee_paid !== undefined ? !!row.registration_fee_paid : true,
    registrationFeeType: row.registration_fee_type || 'free_early_bird',
    verificationFeePaid: row.verification_fee_paid !== undefined ? !!row.verification_fee_paid : true,
    verificationStatus: row.verification_status || (row.verified ? 'approved' : 'unrequested'),
    rating: row.rating ? parseFloat(row.rating) : 0,
    reviewCount: row.review_count || 0,
    categories: row.categories || [],
    skills: row.skills || [],
    languages: row.languages || [],
    areas: row.areas || {},
    certifications: row.certifications || [],
    gallery: row.gallery || [],
    reviews: row.reviews || [],
    pricing: row.pricing || {},
    trustIndicators: row.trust_indicators || {},
    demandLevel: row.demand_level || 'moderate',
    status: row.status || 'active',
    availability: row.availability || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Deduplicates a list of guides by name (case-insensitive, trimmed).
 * When duplicates exist, the first encountered entry is kept.
 * This hides existing DB duplicates on every list response until the
 * admin runs the 'dedupe' action to permanently remove them.
 */
function dedupeByName(guides) {
  const seen = new Set();
  return guides.filter(g => {
    const key = String(g.name || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let dbReady = false;
    try {
      if (isDbConfigured()) {
        await initDb();
        await query(`
          CREATE TABLE IF NOT EXISTS bc_guides (
            id SERIAL PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            photo TEXT DEFAULT '',
            country TEXT DEFAULT '',
            city TEXT DEFAULT '',
            years_exp INTEGER DEFAULT 0,
            verified BOOLEAN DEFAULT false,
            rating NUMERIC(3, 2) DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            categories JSONB DEFAULT '[]'::jsonb NOT NULL,
            skills JSONB DEFAULT '[]'::jsonb NOT NULL,
            languages JSONB DEFAULT '[]'::jsonb NOT NULL,
            areas JSONB DEFAULT '{}'::jsonb NOT NULL,
            certifications JSONB DEFAULT '[]'::jsonb NOT NULL,
            gallery JSONB DEFAULT '[]'::jsonb NOT NULL,
            reviews JSONB DEFAULT '[]'::jsonb NOT NULL,
            pricing JSONB DEFAULT '{}'::jsonb NOT NULL,
            trust_indicators JSONB DEFAULT '{}'::jsonb NOT NULL,
            demand_level TEXT DEFAULT 'moderate',
            status TEXT DEFAULT 'active',
            availability JSONB DEFAULT '{}'::jsonb NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await query(`
          ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS registration_fee_paid BOOLEAN DEFAULT true;
          ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS registration_fee_type TEXT DEFAULT 'free_early_bird';
          ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS verification_fee_paid BOOLEAN DEFAULT true;
          ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'approved';
        `).catch(() => {});
        await query(`
          ALTER TABLE bc_guides ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
        `).catch(() => {});
        dbReady = true;
      }
    } catch (dbErr) {
      console.warn('Guides DB unavailable, using memory fallback:', dbErr.message);
    }
    if (req.method === 'GET') {
      if (req.query.action === 'fee-status') {
        let count = 0;
        if (dbReady) {
          const r = await query('SELECT COUNT(*) as count FROM bc_guides');
          count = parseInt(r.rows[0]?.count || 0);
        } else {
          count = (global.__guides || []).length;
        }
        const freeLimit = 200;
        return res.json({
          ok: true,
          guideCount: count,
          freeLimit,
          freeEligible: count < freeLimit,
          registrationFeeCents: 1000,
          verificationFeeCents: 5000
        });
      }

      const guideId = req.query.id || req.query.slug;

      if (guideId) {
        // Single guide fetch
        let guide = null;
        if (dbReady) {
          const isNumeric = /^\d+$/.test(guideId);
          const col = isNumeric ? 'id = $1' : 'slug = $1';
          const val = isNumeric ? parseInt(guideId) : guideId;
          const result = await query(`SELECT * FROM bc_guides WHERE ${col}`, [val]);
          guide = result.rows.length ? rowToGuide(result.rows[0]) : null;
        } else {
          guide = (global.__guides || []).find(g => g.slug === guideId || String(g.id) === String(guideId)) || null;
        }
        if (!guide) return res.status(404).json({ ok: false, error: 'Guide not found' });
        return res.json({ ok: true, guide });
      }

      // List with optional filters
      const { location, skill, lang, category, minRating, maxPrice, status: statusFilter, limit, offset } = req.query;
      const lim = Math.min(parseInt(limit) || 50, 100);
      const off = parseInt(offset) || 0;

      let guides = [];
      if (dbReady) {
        const conditions = ["status = 'active'"];
        const params = [];
        let pi = 1;
        if (statusFilter) { conditions[0] = `status = $${pi++}`; params.push(statusFilter); }
        if (location) { conditions.push(`(LOWER(country) LIKE $${pi} OR LOWER(city) LIKE $${pi})`); params.push(`%${location.toLowerCase()}%`); pi++; }
        if (minRating) { conditions.push(`rating >= $${pi++}`); params.push(parseFloat(minRating)); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await query(`SELECT * FROM bc_guides ${where} ORDER BY rating DESC, review_count DESC LIMIT $${pi} OFFSET $${pi + 1}`, [...params, lim, off]);
        guides = result.rows.map(rowToGuide);
      } else {
        guides = (global.__guides || [])
          .filter(g => !statusFilter || g.status === statusFilter || (statusFilter === 'active' && g.status === 'active'))
          .filter(g => !location || g.country.toLowerCase().includes(location.toLowerCase()) || g.city.toLowerCase().includes(location.toLowerCase()))
          .filter(g => !skill || (g.skills || []).some(s => s.toLowerCase().includes(skill.toLowerCase())))
          .filter(g => !lang || (g.languages || []).some(l => l.lang.toLowerCase().includes(lang.toLowerCase())))
          .filter(g => !category || (g.categories || []).some(c => c.toLowerCase().includes(category.toLowerCase())))
          .filter(g => !minRating || parseFloat(g.rating) >= parseFloat(minRating))
          .filter(g => !maxPrice || parseFloat(g.pricing?.perDay || 9999) <= parseFloat(maxPrice))
          .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
          .slice(off, off + lim);
      }

      return res.json({ ok: true, guides: dedupeByName(guides), total: dedupeByName(guides).length });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const { action, guide, id, status } = req.body || {};

    // ── Seed demo data ────────────────────────────────────────────────────
    if (action === 'seed') {
      if (dbReady) {
        for (const g of SEED_GUIDES) {
          await query(`
            INSERT INTO bc_guides (slug, name, photo, country, city, years_exp, verified, rating, review_count,
              categories, skills, languages, areas, certifications, gallery, reviews, pricing, trust_indicators,
              demand_level, status, availability, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())
            ON CONFLICT (slug) DO NOTHING`,
            [g.slug, g.name, g.photo, g.country, g.city, g.yearsExp, g.verified, g.rating, g.reviewCount,
             JSON.stringify(g.categories), JSON.stringify(g.skills), JSON.stringify(g.languages),
             JSON.stringify(g.areas), JSON.stringify(g.certifications), JSON.stringify(g.gallery),
             JSON.stringify(g.reviews), JSON.stringify(g.pricing), JSON.stringify(g.trustIndicators),
             g.demandLevel, g.status, JSON.stringify(g.availability)]
          );
        }
      } else {
        if (!global.__guides || global.__guides.length === 0) {
          global.__guides = SEED_GUIDES.map((g, i) => ({ ...g, id: i + 1, createdAt: new Date().toISOString() }));
        }
      }
      return res.json({ ok: true, seeded: SEED_GUIDES.length });
    }

    if (action === 'clear-demo' || action === 'clear-all') {
      const demoSlugs = SEED_GUIDES.map(g => g.slug);
      if (dbReady) {
        if (action === 'clear-all') {
          await query('TRUNCATE bc_guides');
        } else {
          await query('DELETE FROM bc_guides WHERE slug = ANY($1)', [demoSlugs]);
        }
      }
      if (action === 'clear-all') {
        global.__guides = [];
      } else {
        global.__guides = (global.__guides || []).filter(g => !demoSlugs.includes(g.slug));
      }
      return res.json({ ok: true, cleared: true });
    }

    if (action === 'sync-real-guides') {
      let syncedCount = 0;
      if (dbReady) {
        const profilesRes = await query(`SELECT * FROM bc_guide_profiles`);
        for (const p of profilesRes.rows) {
          const personal = p.step_personal || {};
          const areas = p.step_areas || {};
          const name = personal.fullName || personal.name || p.email;
          const slug = `guide-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          const galleryArr = Array.isArray(p.step_gallery) ? p.step_gallery.map(u => (typeof u === 'string' ? u : u?.url)).filter(Boolean) : [];
          const photo = personal.photo || p.photo || galleryArr[0] || '';
          await query(`
            INSERT INTO bc_guides (slug, name, email, photo, country, city, years_exp, verified, rating, review_count,
              categories, skills, languages, areas, certifications, gallery, reviews, pricing, trust_indicators,
              demand_level, status, availability, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW())
            ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, photo=EXCLUDED.photo, status='active', updated_at=NOW()`,
            [slug, name, p.email || '', photo, areas.country || 'Uganda', personal.city || '', 5, true, 4.9, 0,
             JSON.stringify(p.step_categories?.selected || []), JSON.stringify(p.step_skills?.selected || []),
             JSON.stringify(p.step_languages?.list || []), JSON.stringify(areas), JSON.stringify(p.step_certifications || []),
             JSON.stringify(galleryArr), JSON.stringify([]), JSON.stringify(p.step_pricing || {}),
             JSON.stringify({}), 'moderate', p.status === 'approved' ? 'active' : 'pending', JSON.stringify(p.step_availability || {})]
          );
          syncedCount++;
        }
      } else {
        const memStore = global.__bc_guide_profiles;
        if (memStore) {
          if (!global.__guides) global.__guides = [];
          for (const [, p] of memStore) {
            const personal = p.step_personal || {};
            const areas = p.step_areas || {};
            const name = personal.fullName || personal.name || p.email;
            const slug = `guide-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const idx = global.__guides.findIndex(g => g.slug === slug || g.email === p.email);
            const galleryArr = Array.isArray(p.step_gallery) ? p.step_gallery.map(u => (typeof u === 'string' ? u : u?.url)).filter(Boolean) : [];
            const photo = personal.photo || p.photo || galleryArr[0] || (global.__guides[idx] && global.__guides[idx].photo) || '';
            const realGuide = {
              id: idx >= 0 ? global.__guides[idx].id : Date.now() + Math.floor(Math.random() * 1000),
              slug,
              name,
              email: p.email,
              photo,
              country: areas.country || 'Uganda',
              city: personal.city || 'Kampala',
              yearsExp: parseInt(p.step_experience?.yearsExp || 5),
              verified: true,
              rating: 4.9,
              reviewCount: 0,
              categories: Array.isArray(p.step_categories?.selected) ? p.step_categories.selected : ['Safari Guide'],
              skills: Array.isArray(p.step_skills?.selected) ? p.step_skills.selected : ['Wildlife Tracking'],
              languages: Array.isArray(p.step_languages?.list) ? p.step_languages.list : [{ lang: 'English', proficiency: 'Native' }],
              areas: areas,
              certifications: p.step_certifications || [],
              gallery: galleryArr,
              reviews: [],
              pricing: p.step_pricing || { perDay: 150 },
              trustIndicators: {},
              demandLevel: 'moderate',
              status: p.status === 'approved' ? 'active' : 'pending',
              availability: {}
            };
            if (idx >= 0) global.__guides[idx] = realGuide;
            else global.__guides.push(realGuide);
            syncedCount++;
          }
        }
      }
      return res.json({ ok: true, syncedCount });
    }

    // ── Deduplicate existing guide rows by name ─────────────────────────────
    if (action === 'dedupe') {
      const gate = await requireAdminEmail(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

      let removed = 0;
      if (dbReady) {
        // For each duplicated name, keep the row with the MAX id and delete the rest
        const dupes = await query(`
          SELECT LOWER(TRIM(name)) as lname, COUNT(*) as cnt, MAX(id) as keep_id
          FROM bc_guides
          GROUP BY LOWER(TRIM(name))
          HAVING COUNT(*) > 1
        `);
        for (const row of dupes.rows) {
          const del = await query(
            `DELETE FROM bc_guides WHERE LOWER(TRIM(name)) = $1 AND id != $2`,
            [row.lname, row.keep_id]
          );
          removed += del.rowCount || 0;
        }
      } else {
        // In-memory: deduplicate global.__guides by name
        const seen = new Map();
        const deduped = [];
        for (const g of (global.__guides || [])) {
          const key = String(g.name || '').toLowerCase().trim();
          if (!seen.has(key)) {
            seen.set(key, true);
            deduped.push(g);
          } else {
            removed++;
          }
        }
        global.__guides = deduped;
      }
      return res.json({ ok: true, removed });
    }
    // ── Admin-only mutations ──────────────────────────────────────────────
    const gate = await requireAdminEmail(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error });

    if (action === 'status') {
      if (!id || !status) return res.status(400).json({ ok: false, error: 'Missing id or status' });
      if (dbReady) {
        await query('UPDATE bc_guides SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
      } else {
        const idx = (global.__guides || []).findIndex(g => String(g.id) === String(id));
        if (idx > -1) global.__guides[idx].status = status;
      }
      return res.json({ ok: true });
    }

    if (action === 'toggle-verified') {
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      const isVerified = req.body.verified !== undefined ? Boolean(req.body.verified) : true;
      if (dbReady) {
        await query('UPDATE bc_guides SET verified = $1, updated_at = NOW() WHERE id = $2', [isVerified, id]);
      } else {
        const idx = (global.__guides || []).findIndex(g => String(g.id) === String(id));
        if (idx > -1) global.__guides[idx].verified = isVerified;
      }
      return res.json({ ok: true, verified: isVerified });
    }

    if (action === 'update' && guide) {
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      if (dbReady) {
        await query(`UPDATE bc_guides SET name=$1, photo=$2, country=$3, city=$4, years_exp=$5, verified=$6,
          categories=$7, skills=$8, languages=$9, areas=$10, certifications=$11, pricing=$12,
          trust_indicators=$13, demand_level=$14, status=$15, availability=$16, updated_at=NOW() WHERE id=$17`,
          [guide.name, guide.photo, guide.country, guide.city, guide.yearsExp, guide.verified,
           JSON.stringify(guide.categories), JSON.stringify(guide.skills), JSON.stringify(guide.languages),
           JSON.stringify(guide.areas), JSON.stringify(guide.certifications), JSON.stringify(guide.pricing),
           JSON.stringify(guide.trustIndicators), guide.demandLevel, guide.status, JSON.stringify(guide.availability), id]
        );
      } else {
        const idx = (global.__guides || []).findIndex(g => String(g.id) === String(id));
        if (idx > -1) global.__guides[idx] = { ...global.__guides[idx], ...guide, id: global.__guides[idx].id };
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('Guides API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
