// api-routes/guide-wallets.js — Guide Wallet and Withdrawals

const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');

module.exports = async (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    let dbReady = false;
    try {
      if (isDbConfigured()) {
        await initDb();
        await query(`
          CREATE TABLE IF NOT EXISTS bc_guide_withdrawals (
            id SERIAL PRIMARY KEY,
            guide_id TEXT NOT NULL,
            amount NUMERIC(12, 2) NOT NULL,
            method TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        dbReady = true;
      }
    } catch (err) {
      console.warn('Postgres guide-wallets connection failed, using fallback:', err.message);
      if (!global.__guideWithdrawals) global.__guideWithdrawals = [];
    }

    const { action, guideId, amount, method } = req.body || {};
    if (!guideId) return res.status(400).json({ ok: false, error: 'Missing guideId' });

    // ── Get Wallet Balances ───────────────────────────────────────────────────
    if (action === 'get-wallet') {
      let pending = 0;
      let available = 0;
      let withdrawn = 0;
      let lifetime = 0;

      if (dbReady) {
        // Sum from bookings
        const bookingsRes = await query('SELECT payment FROM bc_guide_bookings WHERE guide_id = $1 AND status IN ($2, $3, $4)', [guideId, 'confirmed', 'pending_traveler_confirmation', 'completed']);
        for (const row of bookingsRes.rows) {
          const pmt = row.payment;
          if (pmt && pmt.guideEarnings) {
            lifetime += pmt.guideEarnings;
            if (pmt.escrowStatus === 'held') pending += pmt.guideEarnings;
            if (pmt.escrowStatus === 'released') available += pmt.guideEarnings;
          }
        }
        // Deduct withdrawals from available
        const withdrawRes = await query('SELECT amount FROM bc_guide_withdrawals WHERE guide_id = $1 AND status IN ($2, $3)', [guideId, 'pending', 'completed']);
        for (const row of withdrawRes.rows) {
          const amt = parseFloat(row.amount);
          withdrawn += amt;
          available -= amt;
        }
      } else {
        const bookings = (global.__guideBookings || []).filter(b => b.guideId === guideId && ['confirmed', 'pending_traveler_confirmation', 'completed'].includes(b.status));
        for (const b of bookings) {
          const pmt = b.payment;
          if (pmt && pmt.guideEarnings) {
            lifetime += pmt.guideEarnings;
            if (pmt.escrowStatus === 'held') pending += pmt.guideEarnings;
            if (pmt.escrowStatus === 'released') available += pmt.guideEarnings;
          }
        }
        const wds = (global.__guideWithdrawals || []).filter(w => w.guide_id === guideId);
        for (const w of wds) {
          const amt = parseFloat(w.amount);
          withdrawn += amt;
          available -= amt;
        }
      }
      
      // Ensure available doesn't go below 0 due to precision
      available = Math.max(0, available);

      return res.json({ 
        ok: true, 
        wallet: { pending, available, withdrawn, lifetime } 
      });
    }

    // ── Request Withdrawal ────────────────────────────────────────────────────
    if (action === 'request-withdrawal') {
      if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: 'Invalid amount' });
      if (!method) return res.status(400).json({ ok: false, error: 'Missing method' });

      // Check balance first
      let available = 0;
      if (dbReady) {
        const bRes = await query('SELECT payment FROM bc_guide_bookings WHERE guide_id = $1 AND status = $2', [guideId, 'completed']);
        for (const row of bRes.rows) {
          if (row.payment && row.payment.escrowStatus === 'released') available += row.payment.guideEarnings;
        }
        const wRes = await query('SELECT amount FROM bc_guide_withdrawals WHERE guide_id = $1', [guideId]);
        for (const row of wRes.rows) available -= parseFloat(row.amount);
      } else {
        const bookings = (global.__guideBookings || []).filter(b => b.guideId === guideId && b.status === 'completed');
        for (const b of bookings) {
          if (b.payment && b.payment.escrowStatus === 'released') available += b.payment.guideEarnings;
        }
        const wds = (global.__guideWithdrawals || []).filter(w => w.guide_id === guideId);
        for (const w of wds) available -= parseFloat(w.amount);
      }

      if (amount > available + 0.01) {
        return res.status(400).json({ ok: false, error: 'Insufficient available funds' });
      }

      // Record withdrawal
      if (dbReady) {
        await query(
          'INSERT INTO bc_guide_withdrawals (guide_id, amount, method, status) VALUES ($1, $2, $3, $4)',
          [guideId, amount, method, 'pending']
        );
      } else {
        if (!global.__guideWithdrawals) global.__guideWithdrawals = [];
        global.__guideWithdrawals.push({
          id: Date.now(),
          guide_id: guideId,
          amount,
          method,
          status: 'pending',
          created_at: new Date().toISOString()
        });
      }

      return res.json({ ok: true, message: 'Withdrawal requested successfully' });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('Guide wallets API error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
