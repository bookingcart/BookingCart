const { Resend } = require('resend');
const { getCollections } = require('../lib/mongo');

module.exports = async function priceAlertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, from, to, departDate, targetPrice, currency, isNonstop } = req.body;

    if (!email || !from || !to || !targetPrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save to Database (MongoDB or memory fallback)
    try {
      const collections = await getCollections();
      if (collections && collections.priceAlerts) {
        await collections.priceAlerts.insertOne({
          email,
          from,
          to,
          departDate,
          targetPrice: parseFloat(targetPrice),
          currency,
          isNonstop: !!isNonstop,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`Saved price alert for ${email} to MongoDB.`);
      }
    } catch (e) {
      console.warn('Failed to save price alert to MongoDB, using memory fallback:', e.message);
      if (!global.__priceAlerts) global.__priceAlerts = [];
      global.__priceAlerts.push({
        email,
        from,
        to,
        departDate,
        targetPrice: parseFloat(targetPrice),
        currency,
        isNonstop: !!isNonstop,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY is not configured. Mocking price alert success.');
      return res.status(200).json({ message: 'Price alert created (mocked, no API key)' });
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
          <p>You're all set! We are now tracking flight prices for your upcoming trip.</p>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
            <h3 style="margin-top: 0;">Route: ${from} → ${to}</h3>
            ${dateValue ? `<p style="margin: 0;"><strong>${dateLabel}:</strong> ${dateValue}</p>` : ''}
            <p style="margin: 0; margin-top: 8px;"><strong>Target Price:</strong> Under ${currency} ${targetPrice}</p>
            ${isNonstop ? `<p style="margin: 0; margin-top: 8px;"><strong>Preference:</strong> Nonstop only</p>` : ''}
          </div>

          <p>We'll send you an email immediately if we spot a fare dropping below your target price.</p>
          <p>Safe travels,<br/>The BookingCart Team</p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `Price Alert Setup: ${from} to ${to}`,
      html: htmlContent
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message || 'Failed to send email' });
    }

    return res.status(200).json({ message: 'Price alert activated', data });
  } catch (err) {
    console.error('Price Alert Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
