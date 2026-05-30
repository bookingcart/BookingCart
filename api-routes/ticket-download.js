const puppeteer = require('puppeteer');
const { query, isDbConfigured, initDb } = require('../lib/db');
const { verifyRequestBearer } = require('../lib/google-verify');

module.exports = async (req, res) => {
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
    const paxName = (booking.passengers && booking.passengers[0]) ? 
        ((booking.passengers[0].firstName || '') + ' ' + (booking.passengers[0].lastName || '')).trim().toUpperCase() : 
        (booking.contact && booking.contact.email ? booking.contact.email.split('@')[0].toUpperCase() : 'PASSENGER');
        
    const route = booking.route || '—';
    const parts = route.split(' → ');
    const from = parts[0] || '—';
    const to = parts[1] || '—';
    
    const flight = booking.flight || {};
    const times = (flight.time || '').split(' → ');
    const departTime = times[0] || '—';
    const arriveTime = times[1] || '—';
    
    const dates = booking.dates || '';
    const dateParts = dates.split(' → ');
    const departDate = dateParts[0] || '—';
    const returnDate = dateParts[1] || departDate;
    const airline = flight.airline || '—';
    
    const total = booking.total ? '$' + Number(booking.total).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—';
    const email = booking.contact?.email || '—';
    const phone = booking.contact?.phone || '—';

    // HTML Template based on traditional airline itinerary format
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Travel Reservation</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Roboto', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #ffffff; color: #000000; }
            .trip-header { border-top: 4px solid #000; border-bottom: 2px solid #000; }
            .flight-header { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; background-color: #f9f9f9; }
            .pax-bar { background-color: #f1f1f1; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; }
        </style>
    </head>
    <body class="p-8">
        
        <div class="max-w-4xl mx-auto">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">PREPARED FOR</p>
                    <p class="text-xl font-bold uppercase mb-4">${paxName}</p>
                    <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">RESERVATION CODE</p>
                    <p class="text-lg font-bold">${booking.ref}</p>
                </div>
                <div class="text-right">
                    <h1 class="text-3xl font-black tracking-tighter text-blue-800 flex items-center justify-end gap-2">
                        BookingCart
                    </h1>
                </div>
            </div>

            <div class="trip-header py-2 mb-6">
                <h2 class="text-base font-bold uppercase tracking-wide">${departDate} ${returnDate !== departDate && returnDate !== '—' ? '- ' + returnDate : ''} TRIP TO ${to.toUpperCase()}</h2>
            </div>

            <div class="mb-8">
                <div class="flight-header py-2 px-2 mb-4 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transform rotate-45" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                    <span class="text-sm font-bold uppercase tracking-wide">DEPARTURE: ${departDate.toUpperCase()}</span>
                    <span class="text-[10px] text-gray-500 ml-4">Please verify flight times prior to departure</span>
                </div>

                <div class="grid grid-cols-4 gap-4 px-2 mb-4">
                    <div>
                        <p class="text-sm font-bold uppercase">${airline}</p>
                        <p class="text-sm font-bold uppercase mb-4">${flight.number || ''}</p>
                        <div class="space-y-1">
                            <p class="text-[10px] text-gray-500">Duration:</p>
                            <p class="text-[11px] font-medium">${flight.duration || 'Check with airline'}</p>
                            <p class="text-[10px] text-gray-500 mt-2">Cabin:</p>
                            <p class="text-[11px] font-medium">${flight.cabin || 'Economy'}</p>
                            <p class="text-[10px] text-gray-500 mt-2">Status:</p>
                            <p class="text-[11px] font-medium">Confirmed</p>
                        </div>
                    </div>
                    <div>
                        <p class="text-lg font-bold">${from.toUpperCase()}</p>
                        <p class="text-[10px] text-gray-500 mb-4">Departing At:</p>
                        <p class="text-sm font-bold">${departTime}</p>
                        <p class="text-[10px] text-gray-500 mt-2">Terminal:</p>
                        <p class="text-[11px] font-medium">${flight.departureTerminal || 'Not Available'}</p>
                    </div>
                    <div>
                        <p class="text-lg font-bold">${to.toUpperCase()}</p>
                        <p class="text-[10px] text-gray-500 mb-4">Arriving At:</p>
                        <p class="text-sm font-bold">${arriveTime}</p>
                        <p class="text-[10px] text-gray-500 mt-2">Terminal:</p>
                        <p class="text-[11px] font-medium">${flight.arrivalTerminal || 'Not Available'}</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-gray-500">Aircraft:</p>
                        <p class="text-[11px] font-medium mb-3">${flight.aircraft || 'Passenger Plane'}</p>
                        <p class="text-[10px] text-gray-500">Meals:</p>
                        <p class="text-[11px] font-medium">Check with airline</p>
                    </div>
                </div>

                <div class="pax-bar py-2 px-2 flex">
                    <div class="w-1/3">
                        <p class="text-[10px] text-gray-500">Passenger Name:</p>
                        <p class="text-xs font-bold uppercase">» ${paxName}</p>
                    </div>
                    <div class="w-1/3">
                        <p class="text-[10px] text-gray-500">Seats:</p>
                        <p class="text-xs font-medium">Check-In Required</p>
                    </div>
                    <div class="w-1/3">
                        <p class="text-[10px] text-gray-500">eTicket Receipt(s):</p>
                        <p class="text-xs font-medium">${booking.ref} / ET</p>
                    </div>
                </div>
            </div>
            
            <div class="mt-12 border-t-2 border-black pt-4 flex justify-between">
                <div>
                    <h3 class="text-sm font-bold uppercase">Payment Summary</h3>
                    <p class="text-xs text-gray-500 mt-1">Amount Paid for Ticket</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-bold">${total}</p>
                </div>
            </div>

            <div class="mt-8 text-center text-[10px] text-gray-500">
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
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ETicket-${ref}.pdf"`);
    res.end(pdfBuffer);

  } catch (err) {
    console.error('Ticket download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  }
};
