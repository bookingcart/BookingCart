const cron = require('node-cron');
const fetch = require('node-fetch');
const { Resend } = require('resend');
const { query, isDbConfigured, initDb } = require('./db');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

function extractIata(value) {
  if (typeof value !== 'string') return '';
  const m = value.toUpperCase().match(/\(([A-Z]{3})\)\s*$/);
  if (m && m[1]) return m[1];
  const m2 = value.toUpperCase().match(/\b([A-Z]{3})\b/);
  return m2 && m2[1] ? m2[1] : '';
}

async function checkPrices() {
  console.log('[Price Tracker] Starting periodic price check...');
  
  let activeAlerts = [];
  let dbReady = false;
  
  try {
    if (isDbConfigured()) {
      await initDb();
      dbReady = true;
      const result = await query("SELECT * FROM bc_price_alerts WHERE status = 'active'");
      activeAlerts = result.rows.map(r => ({
        id: r.id,
        email: r.email,
        from: r.origin,
        to: r.destination,
        departDate: r.depart_date,
        targetPrice: parseFloat(r.target_price),
        currency: r.currency,
        isNonstop: r.is_nonstop,
      }));
    }
  } catch (err) {
    console.warn('[Price Tracker] DB query failed, checking memory fallback:', err.message);
    if (global.__priceAlerts) {
      activeAlerts = global.__priceAlerts.filter(a => a.status === 'active');
    }
  }

  if (activeAlerts.length === 0) {
    console.log('[Price Tracker] No active price alerts found.');
    return;
  }

  console.log(`[Price Tracker] Found ${activeAlerts.length} active alerts to process.`);

  if (!DUFFEL_API_KEY) {
    console.warn('[Price Tracker] Duffel API Key is not configured. Cannot perform live check.');
    return;
  }

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'BookingCart <onboarding@resend.dev>';

  for (const alert of activeAlerts) {
    try {
      const originCode = extractIata(alert.from);
      const destCode = extractIata(alert.to);

      if (!originCode || !destCode) {
        console.warn(`[Price Tracker] Invalid IATA code for alert: ${alert.from} -> ${alert.to}. Skipping.`);
        continue;
      }

      const datesToCheck = alert.departDate ? alert.departDate.split(',') : [];
      if (datesToCheck.length === 0) {
        console.warn(`[Price Tracker] No departure dates specified for alert ${alert.id || alert.email}. Skipping.`);
        continue;
      }

      console.log(`[Price Tracker] Checking alert for ${alert.email} (${originCode} -> ${destCode}) on dates [${datesToCheck.join(', ')}]...`);

      let cheapestOffer = null;

      for (const date of datesToCheck) {
        try {
          const createResponse = await fetch(`${DUFFEL_BASE_URL}/air/offer_requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Duffel-Version': 'v2',
              Authorization: `Bearer ${DUFFEL_API_KEY}`
            },
            body: JSON.stringify({
              data: {
                slices: [
                  {
                    origin: originCode,
                    destination: destCode,
                    departure_date: date.trim()
                  }
                ],
                passengers: [{ type: 'adult' }],
                cabin_class: 'economy'
              }
            })
          });

          if (!createResponse.ok) {
            const errText = await createResponse.text();
            console.error(`[Price Tracker] Duffel offer_request failed for ${date}:`, createResponse.status, errText.slice(0, 300));
            continue;
          }

          const createData = await createResponse.json();
          const offerRequestId = createData.data?.id;

          if (!offerRequestId) continue;

          const offersResponse = await fetch(
            `${DUFFEL_BASE_URL}/air/offers?offer_request_id=${encodeURIComponent(offerRequestId)}&limit=10`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'Duffel-Version': 'v2',
                Authorization: `Bearer ${DUFFEL_API_KEY}`
              }
            }
          );

          if (!offersResponse.ok) continue;

          const offersData = await offersResponse.json();
          const offers = offersData.data?.offers || offersData.data || [];

          for (const offer of offers) {
            const price = parseFloat(offer.total_amount) || 0;
            const currency = offer.total_currency || 'USD';
            
            if (alert.isNonstop) {
              const slice = offer.slices?.[0];
              const isDirect = slice && slice.segments && slice.segments.length === 1;
              if (!isDirect) continue;
            }

            if (!cheapestOffer || price < cheapestOffer.price) {
              cheapestOffer = {
                price,
                currency,
                date,
                airline: offer.slices?.[0]?.segments?.[0]?.operating_carrier?.name || 'Airline',
                offerId: offer.id
              };
            }
          }
        } catch (innerErr) {
          console.error(`[Price Tracker] Error checking date ${date} for ${alert.email}:`, innerErr);
        }
      }

      if (cheapestOffer) {
        console.log(`[Price Tracker] Cheapest flight found: ${cheapestOffer.currency} ${cheapestOffer.price} (Target: ${alert.targetPrice})`);
        
        if (cheapestOffer.price <= alert.targetPrice) {
          console.log(`[Price Tracker] MATCH! Price ${cheapestOffer.price} is below target ${alert.targetPrice}. Triggering notification.`);

          if (resend) {
            const htmlContent = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="background-color: #16a34a; color: #fff; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">🎉 Price Drop Alert!</h1>
                </div>
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p>Hi there,</p>
                  <p>Great news! We spotted a fare drop for your route that matches or beats your target price of <strong>${alert.currency} ${alert.targetPrice}</strong>!</p>
                  
                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
                    <h2 style="margin: 0 0 8px 0; color: #15803d; font-size: 28px;">${cheapestOffer.currency} ${cheapestOffer.price}</h2>
                    <p style="margin: 0; font-weight: bold; color: #1e293b;">${alert.from} → ${alert.to}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">Departure Date: ${cheapestOffer.date} (${cheapestOffer.airline})</p>
                  </div>

                  <p style="text-align: center; margin-top: 28px;">
                    <a href="https://bookingcart.com/search?from=${encodeURIComponent(alert.from)}&to=${encodeURIComponent(alert.to)}&depart=${cheapestOffer.date}" 
                       style="background-color: #16a34a; color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                       Book Now
                    </a>
                  </p>
                  
                  <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
                    This price alert has now been fulfilled. If you wish to continue tracking this route, you can set up a new alert anytime on BookingCart.
                  </p>
                </div>
              </div>
            `;

            await resend.emails.send({
              from: fromAddress,
              to: alert.email,
              subject: `🔥 Price Drop: ${alert.from} to ${alert.to} is now ${cheapestOffer.currency} ${cheapestOffer.price}!`,
              html: htmlContent
            });
          }

          // Update Status to Fulfilled
          if (dbReady && alert.id) {
            await query(
              "UPDATE bc_price_alerts SET status = 'fulfilled', updated_at = NOW() WHERE id = $1",
              [alert.id]
            );
          } else {
            // Memory fallback update
            alert.status = 'fulfilled';
            alert.updatedAt = new Date();
          }
          console.log(`[Price Tracker] Alert for ${alert.email} marked as fulfilled.`);
        }
      }
    } catch (err) {
      console.error(`[Price Tracker] Failed to process alert for ${alert.email}:`, err);
    }
  }
}

function startTracker() {
  // Check once immediately on start
  checkPrices().catch(err => console.error('[Price Tracker] Immediate price check error:', err));

  // Schedule to run every 12 hours
  cron.schedule('0 */12 * * *', () => {
    checkPrices().catch(err => console.error('[Price Tracker] Periodic price check error:', err));
  });

  // Daily eviction of expired search-cache rows from Postgres
  cron.schedule('0 3 * * *', async () => {
    try {
      if (isDbConfigured()) {
        await initDb();
        await query('DELETE FROM bc_search_cache WHERE expires_at < NOW()');
        console.log('[Price Tracker] Expired search cache rows evicted.');
      }
    } catch (err) {
      console.error('[Price Tracker] Cache eviction error:', err.message);
    }
  });

  // Schedule to run every 1 minute if TEST_PRICE_TRACKER environment variable is true
  if (process.env.TEST_PRICE_TRACKER === 'true') {
    console.log('[Price Tracker] TEST_PRICE_TRACKER is enabled. Checking prices every minute.');
    cron.schedule('* * * * *', () => {
      checkPrices().catch(err => console.error('[Price Tracker] Test price check error:', err));
    });
  }
}

module.exports = {
  checkPrices,
  startTracker
};
