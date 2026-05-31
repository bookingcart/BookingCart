const puppeteer = require('puppeteer');
const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');
const { verifyRequestBearer } = require('../lib/google-verify');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ ok: false, error: 'Missing ref' });

    // Verify auth
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    let booking = null;
    let dbReady = false;
    
    try {
      if (isDbConfigured()) {
        await initDb();
        dbReady = true;
      }
    } catch (e) {
      // Fallback
    }

    if (dbReady) {
      const result = await query('SELECT * FROM bc_bookings WHERE ref = $1', [ref]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        booking = {
          ref: row.ref,
          status: row.status,
          route: row.route,
          dates: row.dates,
          flight: row.flight || {},
          passengers: row.passengers || [],
          contact: row.contact || {},
          extras: row.extras || {},
          total: row.total ? parseFloat(row.total) : 0,
          ticket: row.ticket || null,
        };
      }
    } else if (global.__bookings) {
      booking = global.__bookings.find((b) => b.ref === ref);
    }

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const em = ((booking.contact && booking.contact.email) || '').trim().toLowerCase();
    if (!em || em !== auth.email) {
      return res.status(403).json({ ok: false, error: 'Not allowed for this booking' });
    }

    // Prepare variables
    const paxNameRaw = (booking.passengers && booking.passengers[0]) ? 
        ((booking.passengers[0].firstName || '') + ' ' + (booking.passengers[0].lastName || '')).trim().toUpperCase() : 
        (booking.contact && booking.contact.email ? booking.contact.email.split('@')[0].toUpperCase() : 'PASSENGER');
        
    const route = booking.route || '—';
    const parts = route.split(' → ');
    const fromRaw = parts[0] || '—';
    const toRaw = parts[1] || '—';
    
    const flight = booking.flight || {};
    const times = (flight.time || '').split(' → ');
    const departTimeRaw = times[0] || '—';
    const arriveTimeRaw = times[1] || '—';
    
    const dates = booking.dates || '';
    const dateParts = dates.split(' → ');
    const departDateRaw = dateParts[0] || '—';
    const returnDateRaw = dateParts[1] || departDateRaw;
    const tripRangeRaw = `${departDateRaw} ${returnDateRaw !== departDateRaw && returnDateRaw !== '—' ? `- ${returnDateRaw}` : ''}`;
    
    const paxName = escapeHtml(paxNameRaw || 'PASSENGER');
    const refEsc = escapeHtml(booking.ref);
    const from = escapeHtml(fromRaw.toUpperCase());
    const to = escapeHtml(toRaw.toUpperCase());
    const departTime = escapeHtml(departTimeRaw);
    const arriveTime = escapeHtml(arriveTimeRaw);
    const departDate = escapeHtml(departDateRaw.toUpperCase());
    const tripRange = escapeHtml(tripRangeRaw);
    const airline = escapeHtml(flight.airline || '—');
    const flightNumber = escapeHtml(flight.number || '');
    const duration = escapeHtml(flight.duration || 'Check with airline');
    const cabin = escapeHtml(flight.cabin || 'Economy');
    const departureTerminal = escapeHtml(flight.departureTerminal || 'Not Available');
    const arrivalTerminal = escapeHtml(flight.arrivalTerminal || 'Not Available');
    const aircraft = escapeHtml(flight.aircraft || 'Passenger Plane');
    const total = escapeHtml(booking.total ? '$' + Number(booking.total).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—');

    // HTML Template based on traditional airline itinerary format
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Travel Reservation</title>
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 32px; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #ffffff; color: #000000; }
            .container { max-width: 896px; margin: 0 auto; }
            .row { display: flex; }
            .between { justify-content: space-between; }
            .start { align-items: flex-start; }
            .center { align-items: center; }
            .gap { gap: 12px; }
            .right { text-align: right; }
            .mb-1 { margin-bottom: 4px; }
            .mb-3 { margin-bottom: 12px; }
            .mb-4 { margin-bottom: 16px; }
            .mb-6 { margin-bottom: 24px; }
            .mb-8 { margin-bottom: 32px; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mt-8 { margin-top: 32px; }
            .mt-12 { margin-top: 48px; }
            .px-2 { padding-left: 8px; padding-right: 8px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .pt-4 { padding-top: 16px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
            .w-third { width: 33.333%; }
            .tiny { font-size: 10px; color: #6b7280; }
            .small { font-size: 11px; font-weight: 500; }
            .text-xs { font-size: 12px; }
            .text-sm { font-size: 14px; }
            .text-base { font-size: 16px; }
            .text-lg { font-size: 18px; }
            .text-xl { font-size: 20px; }
            .text-3xl { font-size: 30px; }
            .bold { font-weight: 700; }
            .black { font-weight: 900; }
            .upper { text-transform: uppercase; }
            .tracking { letter-spacing: 0.04em; }
            .blue { color: #1e40af; }
            .trip-header { border-top: 4px solid #000; border-bottom: 2px solid #000; }
            .flight-header { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; background-color: #f9f9f9; }
            .pax-bar { background-color: #f1f1f1; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; }
            .border-top { border-top: 2px solid #000; }
            .notice { text-align: center; font-size: 10px; color: #6b7280; line-height: 1.4; }
        </style>
    </head>
    <body>
        
        <div class="container">
            <div class="row between start mb-6">
                <div>
                    <p class="tiny upper bold tracking mb-1">PREPARED FOR</p>
                    <p class="text-xl bold upper mb-4">${paxName}</p>
                    <p class="tiny upper bold tracking mb-1">RESERVATION CODE</p>
                    <p class="text-lg bold">${refEsc}</p>
                </div>
                <div class="right">
                    <h1 class="text-3xl black blue">
                        BookingCart
                    </h1>
                </div>
            </div>

            <div class="trip-header py-2 mb-6">
                <h2 class="text-base bold upper tracking">${tripRange} TRIP TO ${to}</h2>
            </div>

            <div class="mb-8">
                <div class="flight-header py-2 px-2 mb-4 row center gap">
                    <span class="text-sm bold upper tracking">DEPARTURE: ${departDate}</span>
                    <span class="tiny">Please verify flight times prior to departure</span>
                </div>

                <div class="grid grid-cols-4 gap-4 px-2 mb-4">
                    <div>
                        <p class="text-sm bold upper">${airline}</p>
                        <p class="text-sm bold upper mb-4">${flightNumber}</p>
                        <div class="space-y-1">
                            <p class="tiny">Duration:</p>
                            <p class="small">${duration}</p>
                            <p class="tiny mt-2">Cabin:</p>
                            <p class="small">${cabin}</p>
                            <p class="tiny mt-2">Status:</p>
                            <p class="small">Confirmed</p>
                        </div>
                    </div>
                    <div>
                        <p class="text-lg bold">${from}</p>
                        <p class="tiny mb-4">Departing At:</p>
                        <p class="text-sm bold">${departTime}</p>
                        <p class="tiny mt-2">Terminal:</p>
                        <p class="small">${departureTerminal}</p>
                    </div>
                    <div>
                        <p class="text-lg bold">${to}</p>
                        <p class="tiny mb-4">Arriving At:</p>
                        <p class="text-sm bold">${arriveTime}</p>
                        <p class="tiny mt-2">Terminal:</p>
                        <p class="small">${arrivalTerminal}</p>
                    </div>
                    <div>
                        <p class="tiny">Aircraft:</p>
                        <p class="small mb-3">${aircraft}</p>
                        <p class="tiny">Meals:</p>
                        <p class="small">Check with airline</p>
                    </div>
                </div>

                <div class="pax-bar py-2 px-2 row">
                    <div class="w-third">
                        <p class="tiny">Passenger Name:</p>
                        <p class="text-xs bold upper">» ${paxName}</p>
                    </div>
                    <div class="w-third">
                        <p class="tiny">Seats:</p>
                        <p class="text-xs">Check-In Required</p>
                    </div>
                    <div class="w-third">
                        <p class="tiny">eTicket Receipt(s):</p>
                        <p class="text-xs">${refEsc} / ET</p>
                    </div>
                </div>
            </div>
            
            <div class="mt-12 border-top pt-4 row between">
                <div>
                    <h3 class="text-sm bold upper">Payment Summary</h3>
                    <p class="text-xs mt-1">Amount Paid for Ticket</p>
                </div>
                <div class="right">
                    <p class="text-xl bold">${total}</p>
                </div>
            </div>

            <div class="mt-8 notice">
                <p>Data Protection Notice: Your personal data will be processed in accordance with the applicable carrier's privacy policy and, if your booking is made via a reservation system provider ("GDS"), with its privacy policy.</p>
                <p class="mt-2">BookingCart Support: support@bookingcart.com</p>
            </div>

        </div>
    </body>
    </html>
    `;

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set content and wait for network/fonts to load
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ETicket-${safeFilename(ref)}.pdf"`);
    res.end(pdfBuffer);

  } catch (err) {
    console.error('Ticket download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  }
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFilename(value) {
  return String(value || 'booking').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'booking';
}
