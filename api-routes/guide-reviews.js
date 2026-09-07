const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');

function rowToReview(row) {
  return {
    id: row.id,
    guideId: row.guide_id,
    bookingRef: row.booking_ref,
    authorName: row.author_name,
    authorEmail: row.author_email,
    rating: parseFloat(row.rating),
    detailedRatings: row.detailed_ratings || {},
    text: row.text,
    photos: row.photos || [],
    recommendation: row.recommendation,
    travelerType: row.traveler_type,
    tags: row.tags || [],
    status: row.status,
    guideResponse: row.guide_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
        await query(`
          CREATE TABLE IF NOT EXISTS bc_guide_reviews (
            id SERIAL PRIMARY KEY,
            guide_id TEXT NOT NULL,
            booking_ref TEXT NOT NULL UNIQUE,
            author_name TEXT,
            author_email TEXT,
            rating NUMERIC(3, 2) NOT NULL,
            detailed_ratings JSONB DEFAULT '{}'::jsonb,
            text TEXT,
            photos JSONB DEFAULT '[]'::jsonb,
            recommendation TEXT,
            traveler_type TEXT,
            tags JSONB DEFAULT '[]'::jsonb,
            status TEXT DEFAULT 'approved', -- 'approved', 'hidden', 'flagged'
            guide_response TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        dbReady = true;
      }
    } catch (err) {
      console.warn('Postgres guide-reviews connection failed, using fallback:', err.message);
      if (!global.__guideReviews) global.__guideReviews = [];
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const { action } = req.body || {};

    // ── Save/Submit a Review ────────────────────────────────────────────────
    if (action === 'save') {
      const { review } = req.body;
      if (!review || !review.bookingRef || !review.guideId) {
        return res.status(400).json({ ok: false, error: 'Missing required fields' });
      }

      // Check if booking is valid & completed (for MVP we trust the client logic, but we enforce uniqueness on bookingRef)
      if (dbReady) {
        try {
          const now = new Date().toISOString();
          const result = await query(`
            INSERT INTO bc_guide_reviews 
              (guide_id, booking_ref, author_name, author_email, rating, detailed_ratings, text, photos, recommendation, traveler_type, tags, created_at, updated_at)
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `, [
            review.guideId, review.bookingRef, review.authorName, review.authorEmail, review.rating, JSON.stringify(review.detailedRatings || {}),
            review.text, JSON.stringify(review.photos || []), review.recommendation, review.travelerType, JSON.stringify(review.tags || []), now, now
          ]);
          return res.json({ ok: true, review: rowToReview(result.rows[0]) });
        } catch (err) {
          if (err.code === '23505') return res.status(400).json({ ok: false, error: 'Review already exists for this booking.' });
          throw err;
        }
      } else {
        const existing = global.__guideReviews.find(r => r.bookingRef === review.bookingRef);
        if (existing) return res.status(400).json({ ok: false, error: 'Review already exists.' });
        
        const newReview = { ...review, id: Date.now(), status: 'approved', createdAt: new Date().toISOString() };
        global.__guideReviews.push(newReview);
        return res.json({ ok: true, review: newReview });
      }
    }

    // ── List reviews for a guide (public profile) ───────────────────────────
    if (action === 'list-for-guide') {
      const { guideId } = req.body;
      if (!guideId) return res.status(400).json({ ok: false, error: 'Missing guideId' });

      let reviews = [];
      if (dbReady) {
        const result = await query("SELECT * FROM bc_guide_reviews WHERE guide_id = $1 AND status = 'approved' ORDER BY created_at DESC", [guideId]);
        reviews = result.rows.map(rowToReview);
      } else {
        reviews = global.__guideReviews.filter(r => r.guideId === guideId && r.status === 'approved').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return res.json({ ok: true, reviews });
    }

    // ── Guide Dashboard: Get reviews and stats ─────────────────────────────
    if (action === 'guide-dashboard') {
      const { guideId } = req.body;
      if (!guideId) return res.status(400).json({ ok: false, error: 'Missing guideId' });

      let reviews = [];
      if (dbReady) {
        const result = await query("SELECT * FROM bc_guide_reviews WHERE guide_id = $1 ORDER BY created_at DESC", [guideId]);
        reviews = result.rows.map(rowToReview);
      } else {
        reviews = global.__guideReviews.filter(r => r.guideId === guideId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      // Compute stats
      const total = reviews.length;
      const averageRating = total > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / total).toFixed(1) : 0;
      
      const tagCounts = {};
      reviews.forEach(r => {
        if (r.tags) r.tags.forEach(tag => tagCounts[tag] = (tagCounts[tag] || 0) + 1);
      });
      const topTags = Object.entries(tagCounts).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

      return res.json({ ok: true, reviews, stats: { total, averageRating, topTags } });
    }

    // ── Guide Response ──────────────────────────────────────────────────────
    if (action === 'respond') {
      const { reviewId, response } = req.body;
      if (!reviewId || !response) return res.status(400).json({ ok: false, error: 'Missing reviewId or response' });

      if (dbReady) {
        const result = await query("UPDATE bc_guide_reviews SET guide_response = $1, updated_at = $2 WHERE id = $3 AND guide_response IS NULL RETURNING *", 
          [response, new Date().toISOString(), reviewId]);
        if (result.rows.length === 0) return res.status(400).json({ ok: false, error: 'Review not found or already responded.' });
        return res.json({ ok: true, review: rowToReview(result.rows[0]) });
      } else {
        const r = global.__guideReviews.find(x => x.id === reviewId);
        if (!r) return res.status(404).json({ ok: false, error: 'Not found' });
        if (r.guideResponse) return res.status(400).json({ ok: false, error: 'Already responded' });
        r.guideResponse = response;
        return res.json({ ok: true, review: r });
      }
    }

    // ── Admin: List all ─────────────────────────────────────────────────────
    if (action === 'admin-list') {
      let reviews = [];
      if (dbReady) {
        const result = await query("SELECT * FROM bc_guide_reviews ORDER BY created_at DESC");
        reviews = result.rows.map(rowToReview);
      } else {
        reviews = [...global.__guideReviews].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return res.json({ ok: true, reviews });
    }

    // ── Admin: Moderate ─────────────────────────────────────────────────────
    if (action === 'moderate') {
      const { reviewId, status } = req.body;
      if (!['approved', 'hidden', 'deleted'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });

      if (dbReady) {
        if (status === 'deleted') {
          await query("DELETE FROM bc_guide_reviews WHERE id = $1", [reviewId]);
          return res.json({ ok: true });
        } else {
          const result = await query("UPDATE bc_guide_reviews SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *", [status, new Date().toISOString(), reviewId]);
          return res.json({ ok: true, review: rowToReview(result.rows[0]) });
        }
      } else {
        if (status === 'deleted') {
          global.__guideReviews = global.__guideReviews.filter(x => x.id !== reviewId);
        } else {
          const r = global.__guideReviews.find(x => x.id === reviewId);
          if (r) r.status = status;
        }
        return res.json({ ok: true });
      }
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('guide-reviews error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
