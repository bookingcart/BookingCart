'use strict';

// Platform-wide ticket artwork.
//
// Each printed ticket is three panels: the admission stub, this company panel
// and the client's own artwork space. The company panel is stamped on every
// ticket the platform prints, so it is one platform row (id = 1) managed from
// the admin dashboard instead of per-attraction ticket settings.

const { query } = require('./db');
const T = require('./ticketing');

const FITS = ['cover', 'contain'];

const DEFAULT_BRANDING = {
  companyName: 'BookingCart',
  companyTagline: 'Compare. Book. Instant.',
  companyWebsite: 'www.bookingcart.online',
  artworkUrl: '',
  artworkFit: 'cover',
};

/**
 * Artwork URLs are injected into print HTML, so only absolute http(s) URLs and
 * site-relative paths are allowed. Anything with quotes, angle brackets or a
 * script-y scheme is dropped rather than escaped.
 */
function sanitizeImageUrl(value, max = 800) {
  const text = T.text(value, max);
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  if (/^https?:\/\/[^\s"'<>\\]+$/i.test(text)) return text;
  return '';
}

function normalizeFit(value) {
  const fit = String(value || '').toLowerCase();
  return FITS.includes(fit) ? fit : DEFAULT_BRANDING.artworkFit;
}

function mapBranding(row) {
  if (!row) return { ...DEFAULT_BRANDING, updatedBy: '', updatedAt: null };
  return {
    companyName: row.company_name || DEFAULT_BRANDING.companyName,
    companyTagline: row.company_tagline || '',
    companyWebsite: row.company_website || '',
    artworkUrl: row.artwork_url || '',
    artworkFit: normalizeFit(row.artwork_fit),
    updatedBy: row.updated_by || '',
    updatedAt: row.updated_at || null,
  };
}

/** Read the company panel. A missing table must never break the ticket office. */
async function getBranding() {
  try {
    const result = await query('SELECT * FROM bc_ticket_branding WHERE id = 1');
    return mapBranding(result.rows[0]);
  } catch (error) {
    console.warn('[ticket-branding] branding unavailable:', error.message);
    return { ...DEFAULT_BRANDING, updatedBy: '', updatedAt: null };
  }
}

async function saveBranding(input = {}, actorEmail = '') {
  const companyName = T.text(input.companyName, 80) || DEFAULT_BRANDING.companyName;
  const companyTagline = T.text(input.companyTagline, 120);
  const companyWebsite = T.text(input.companyWebsite, 120);
  const artworkUrl = sanitizeImageUrl(input.artworkUrl);
  const artworkFit = normalizeFit(input.artworkFit);

  // Upsert so a deleted seed row cannot leave the platform without branding.
  const result = await query(
    `INSERT INTO bc_ticket_branding
       (id, company_name, company_tagline, company_website, artwork_url, artwork_fit, updated_by, updated_at)
     VALUES (1, $1, COALESCE($2, ''), COALESCE($3, ''), COALESCE($4, ''), $5, COALESCE($6, ''), NOW())
     ON CONFLICT (id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       company_tagline = EXCLUDED.company_tagline,
       company_website = EXCLUDED.company_website,
       artwork_url = EXCLUDED.artwork_url,
       artwork_fit = EXCLUDED.artwork_fit,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [companyName, companyTagline, companyWebsite, artworkUrl, artworkFit, T.text(actorEmail, 320)]
  );
  return mapBranding(result.rows[0]);
}

module.exports = {
  DEFAULT_BRANDING,
  FITS,
  getBranding,
  mapBranding,
  normalizeFit,
  sanitizeImageUrl,
  saveBranding,
};
