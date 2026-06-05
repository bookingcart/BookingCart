const { Resend } = require('resend');
const { query, isDbConfigured, initDb } = require('../lib/db');

module.exports = async function priceAlertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { email, from, to, departDate, targetPrice, currency, isNonstop } = req.body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanFrom = String(from || '').trim();
    const cleanTo = String(to || '').trim();
    const numericTarget = Number(targetPrice);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !cleanFrom || !cleanTo || !Number.isFinite(numericTarget) || numericTarget <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid email, route, and target price are required.' });
    }

    // Save to Database (Postgres or memory fallback)
    try {
      if (isDbConfigured()) {
        await initDb();
        await query(
          `INSERT INTO bc_price_alerts (email, origin, destination, depart_date, target_price, currency, is_nonstop, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())`,
          [cleanEmail, cleanFrom, cleanTo, departDate || '', numericTarget, currency || 'USD', !!isNonstop]
        );
        console.log(`Saved price alert for ${cleanEmail} to Postgres.`);
      } else {
        throw new Error('DB not configured');
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ ok: false, error: 'Price alerts are unavailable because the database is not configured.' });
      }
      console.warn('Failed to save price alert to DB, using memory fallback:', e.message);
      if (!global.__priceAlerts) global.__priceAlerts = [];
      global.__priceAlerts.push({
        email: cleanEmail,
        from: cleanFrom,
        to: cleanTo,
        departDate,
        targetPrice: numericTarget,
        currency: currency || 'USD',
        isNonstop: !!isNonstop,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY is not configured. Price alert saved without email delivery.');
      return res.status(200).json({
        ok: true,
        message: 'Price alert saved. Email delivery is not configured yet.'
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'BookingCart <onboarding@resend.dev>';

    let dateLabel = 'Departure';
    let dateValue = '';
    if (departDate) {
      const dates = departDate.split(',');
      if (dates.length > 1) {
        dateLabel = 'Flexible Dates';
        dateValue = `${dates[0]} to ${dates[dates.length - 1]}`;
      } else {
        dateValue = dates[0];
      }
    }

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #2563eb; color: #fff; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Price Alert Activated</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi there,</p>
          <p>You're all set. We are now tracking flight prices for your upcoming trip.</p>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0;">Route: ${cleanFrom} → ${cleanTo}</h3>
            ${dateValue ? `<p style="margin: 0;"><strong>${dateLabel}:</strong> ${dateValue}</p>` : ''}
            <p style="margin: 0; margin-top: 8px;"><strong>Target Price:</strong> Under ${currency || 'USD'} ${numericTarget}</p>
            ${isNonstop ? `<p style="margin: 0; margin-top: 8px;"><strong>Preference:</strong> Nonstop only</p>` : ''}
          </div>

          <p>We'll send you an email immediately if we spot a fare dropping below your target price.</p>
          <p>Safe travels,<br/>The BookingCart Team</p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: cleanEmail,
      subject: `Price Alert Setup: ${cleanFrom} to ${cleanTo}`,
      html: htmlContent
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Failed to send email' });
    }

    return res.status(200).json({ ok: true, message: 'Price alert activated', data });
  } catch (err) {
    console.error('Price Alert Error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
