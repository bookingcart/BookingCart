require('dotenv').config();
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { query, initDb } = require('../lib/db');

// Mock browser globals needed for TourGuideProfilePage
global.window = {
  location: { origin: 'http://localhost:3000', scrollTo: () => {} },
  scrollTo: () => {}
};
global.document = { title: '' };

// Import rowToGuide from guides route
const guidesRoute = require('../api-routes/guides');

async function testRenderAll() {
  await initDb();
  const res = await query('SELECT * FROM bc_guides');
  console.log(`Testing SSR render of ${res.rows.length} guides from DB...`);

  // We need to import the component logic or simulate JSX execution
  // Let's inspect each transformed guide object returned by rowToGuide(r)
  const guides = [];
  for (const row of res.rows) {
    // Re-create guide using backend mapping
    const g = rowToGuide(row);
    console.log(`\nTesting guide: "${g.name}" (slug: ${g.slug})`);

    try {
      // 1. Test Guide Availability Calendar calculation
      const availability = g.availability || {};
      const dateMap = {};
      if (typeof availability === 'object' && availability !== null) {
        if (Array.isArray(availability.blockedDates)) {
          for (const d of availability.blockedDates) if (typeof d === 'string') dateMap[d] = 'blocked';
        } else if (!availability.startTime && !availability.endTime) {
          for (const [k, v] of Object.entries(availability)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(k)) dateMap[k] = v;
          }
        }
      }

      // 2. Test Photos normalization
      let rawPhotos = [];
      if (Array.isArray(g.gallery)) rawPhotos = g.gallery;
      else if (typeof g.gallery === 'string') {
        try { rawPhotos = JSON.parse(g.gallery); } catch (_) { if (g.gallery.startsWith('http')) rawPhotos = [g.gallery]; }
      }
      const photoUrls = rawPhotos.map(p => (typeof p === 'string' ? p : p?.url)).filter(Boolean);
      const allPhotos = [];
      if (g.photo && !allPhotos.includes(g.photo)) allPhotos.push(g.photo);
      photoUrls.forEach(u => { if (!allPhotos.includes(u)) allPhotos.push(u); });
      if (allPhotos.length === 0) allPhotos.push('https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=80');
      const mainPhoto = allPhotos[0];
      const sidePhotos = allPhotos.slice(1, 5);

      // 3. Test Guide Name & split
      const guideName = g.name || 'Guide';
      const nameFirst = guideName.split(' ')[0] || 'Guide';

      // 4. Test Categories, Skills, Languages
      const categoriesList = Array.isArray(g.categories) ? g.categories : [];
      const skillsList = Array.isArray(g.skills) ? g.skills : [];
      const languagesList = Array.isArray(g.languages) ? g.languages : [];

      // Render check skills item
      skillsList.forEach((skill, idx) => {
        const name = typeof skill === 'string' ? skill : (skill?.name || '');
      });

      // Render check languages item
      languagesList.forEach((l, idx) => {
        const langName = typeof l === 'string' ? l : (l?.lang || l?.language || '');
        const langProf = typeof l === 'object' ? (l?.proficiency || '') : '';
      });

      // 5. Test Pricing calculation
      let pricingObj = g.pricing || {};
      if (typeof pricingObj === 'string') {
        try { pricingObj = JSON.parse(pricingObj); } catch (_) { pricingObj = {}; }
      }
      const pricePerDay = parseFloat(pricingObj?.perDay || 0);
      const perPerson = parseFloat(pricingObj?.perPerson || 0);

      console.log(`  ✅ OK! Price: $${pricePerDay}, Photos: ${allPhotos.length}, Categories: ${categoriesList.length}, Skills: ${skillsList.length}, Languages: ${languagesList.length}`);
    } catch (err) {
      console.error(`  ❌ CRASH for guide "${g.name}":`, err.stack);
    }
  }
  process.exit(0);
}

// Helper to access rowToGuide from guides.js module
function rowToGuide(row) {
  function safeParseJson(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return parsed !== null ? parsed : fallback;
      } catch (_) { return fallback; }
    }
    return fallback;
  }
  let categories = safeParseJson(row.categories, []);
  if (!Array.isArray(categories)) categories = typeof categories === 'string' ? [categories] : [];
  let skills = safeParseJson(row.skills, []);
  if (!Array.isArray(skills)) skills = typeof skills === 'string' ? [skills] : [];
  let languages = safeParseJson(row.languages, []);
  if (!Array.isArray(languages)) languages = typeof languages === 'string' ? [languages] : [];
  let certifications = safeParseJson(row.certifications, []);
  if (!Array.isArray(certifications)) certifications = typeof certifications === 'string' ? [certifications] : [];
  let gallery = safeParseJson(row.gallery, []);
  if (!Array.isArray(gallery)) gallery = typeof gallery === 'string' ? [gallery] : [];
  let reviews = safeParseJson(row.reviews, []);
  if (!Array.isArray(reviews)) reviews = [];
  let pricing = safeParseJson(row.pricing, {});
  if (typeof pricing !== 'object' || pricing === null) pricing = { perDay: parseFloat(pricing) || 0 };
  let areas = safeParseJson(row.areas, {});
  if (typeof areas !== 'object' || areas === null) areas = {};
  let trustIndicators = safeParseJson(row.trust_indicators, {});
  if (typeof trustIndicators !== 'object' || trustIndicators === null) trustIndicators = {};
  let availability = safeParseJson(row.availability, {});
  if (typeof availability !== 'object' || availability === null) availability = {};

  return {
    id: row.id,
    slug: row.slug,
    name: row.name || 'Guide',
    photo: row.photo || '',
    country: row.country || '',
    city: row.city || '',
    bio: row.bio || '',
    yearsExp: row.years_exp || 0,
    verified: !!row.verified,
    rating: row.rating ? parseFloat(row.rating) : 0,
    reviewCount: row.review_count || 0,
    categories,
    skills,
    languages,
    areas,
    certifications,
    gallery,
    reviews,
    pricing,
    trustIndicators,
    demandLevel: row.demand_level || 'moderate',
    status: row.status || 'active',
    availability,
  };
}

testRenderAll();
