// api-routes/stripe-connect.js — Stripe Connect Endpoints

const Stripe = require('stripe');
const { query, isDbConfigured } = require('../lib/db');
const { applyCors } = require('../lib/cors');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (!stripe) {
    return res.status(503).json({ ok: false, error: 'Stripe is not configured on the server.' });
  }

  try {
    const { action, guideId, email } = req.body || {};

    if (!isDbConfigured()) {
      return res.status(500).json({ ok: false, error: 'Database is required for Stripe Connect.' });
    }

    if (action === 'create-account-link') {
      if (!guideId || !email) return res.status(400).json({ ok: false, error: 'Missing guideId or email' });

      // Find guide profile
      const r = await query(`SELECT * FROM bc_guide_profiles WHERE id = $1 OR email = $2 LIMIT 1`, [parseInt(guideId) || 0, email]);
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Guide profile not found.' });
      }
      const profile = r.rows[0];

      let accountId = profile.stripe_account_id;

      // Create new connected account if they don't have one
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: profile.email,
          capabilities: {
            transfers: { requested: true },
          },
        });
        accountId = account.id;
        
        // Save account ID
        await query(`UPDATE bc_guide_profiles SET stripe_account_id = $1 WHERE id = $2`, [accountId, profile.id]);
      }

      // Generate account link for onboarding
      const origin = req.headers.origin || 'http://localhost:3000';
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/guide-dashboard?tab=earnings`,
        return_url: `${origin}/guide-dashboard?tab=earnings&stripe_connected=1`,
        type: 'account_onboarding',
      });

      return res.json({ ok: true, url: accountLink.url });
    }

    if (action === 'check-status') {
      if (!guideId || !email) return res.status(400).json({ ok: false, error: 'Missing guideId or email' });

      const r = await query(`SELECT id, stripe_account_id, stripe_onboarding_complete FROM bc_guide_profiles WHERE id = $1 OR email = $2 LIMIT 1`, [parseInt(guideId) || 0, email]);
      if (r.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'Guide profile not found.' });
      }
      const profile = r.rows[0];

      if (!profile.stripe_account_id) {
        return res.json({ ok: true, connected: false });
      }

      // Check with Stripe
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);
      const isComplete = account.charges_enabled && account.payouts_enabled;

      if (isComplete !== profile.stripe_onboarding_complete) {
        await query(`UPDATE bc_guide_profiles SET stripe_onboarding_complete = $1 WHERE id = $2`, [isComplete, profile.id]);
      }

      return res.json({ ok: true, connected: isComplete });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('Stripe connect API error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
};
