import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';

const EVENT_TICKET_PREVIEW = {
  bookingRef: 'B009865456T',
  ticketNo: '08839373t3e352627',
  issueDate: 'Saturday.05.2026',
  clientName: 'James Andrew Mwenda',
  eventName: 'Winds Recreation Center',
  venueName: 'Winds Recreation Center',
  location: 'William Street, Kampala',
  entrance: 'Main Entrance Gate',
  ticketType: 'General Admission',
  status: 'confirmed',
  bannerImage: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=85',
};

// ─── Lightweight QR Code Generator ───────────────────────────────────────────
// Uses a simple SVG-based QR code via Google Charts API (no extra deps needed)
function QRCode({ value, size = 120 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=2d2d2d&color=ffffff&format=svg&margin=4`;
  return (
    <img
      src={url}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-[12px] bg-black p-1.5"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ─── The Ticket Component ─────────────────────────────────────────────────────
// ─── The Ticket Component ─────────────────────────────────────────────────────
function EventTicket({ booking, ticketBannerImage }) {
  const {
    bookingRef,
    ticketNo,
    issueDate,
    clientName,
    eventName,
    venueName,
    location,
    entrance,
    ticketType,
  } = booking;

  const [imgSrc, setImgSrc] = useState(
    ticketBannerImage || booking.bannerImage || 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1000&q=85'
  );

  useEffect(() => {
    setImgSrc(ticketBannerImage || booking.bannerImage || 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1000&q=85');
  }, [ticketBannerImage, booking.bannerImage]);

  const effectiveTicketNo = ticketNo || bookingRef;
  const effectiveIssueDate = issueDate || new Date(booking.createdAt || Date.now()).toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' });
  const qrData = JSON.stringify({ ref: bookingRef, ticket: effectiveTicketNo, event: eventName });

  return (
    <div
      id="event-ticket"
      className="relative mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-200"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Printable CSS override */}
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #event-ticket, #event-ticket * {
            visibility: visible !important;
          }
          #event-ticket {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            margin: 0 !important;
            width: 420px !important;
            max-width: 420px !important;
            box-shadow: none !important;
            border: 2px solid #e2e8f0 !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Ticket Header */}
      <header className="flex flex-col items-center justify-center bg-slate-900 py-3.5 px-6 text-center">
        <img
          src="/images/logo%20.png"
          alt="BookingCart"
          className="h-7 w-auto object-contain brightness-0 invert"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <p className="mt-1 text-[10px] font-bold tracking-[0.28em] text-emerald-400 uppercase">COMPARE · BOOK · INSTANT</p>
      </header>

      {/* Image Banner Container */}
      <section className="relative min-h-[210px] w-full overflow-hidden bg-slate-900 flex flex-col justify-between p-6">
        <img
          src={imgSrc}
          alt={eventName}
          crossOrigin="anonymous"
          onError={() => setImgSrc('https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1000&q=85')}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-black/40" />

        {/* Top bar over banner */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md">
            Verified Pass
          </span>
          <span className="font-mono text-xs font-bold text-white bg-black/60 px-3 py-1 rounded-full border border-slate-700 backdrop-blur-md">
            {bookingRef}
          </span>
        </div>

        {/* Bottom text over banner */}
        <div className="relative z-10 mt-6 space-y-1">
          <p className="text-[10px] font-extrabold tracking-wider text-emerald-400 uppercase">VENUE & EVENT</p>
          <h2 className="text-xl font-black leading-tight text-white drop-shadow-md">
            {venueName || eventName}
          </h2>
          {location && (
            <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mt-1 pt-1.5 border-t border-white/20">
              <i className="ph ph-map-pin text-emerald-400 text-sm shrink-0" />
              <span className="line-clamp-2">{location}</span>
            </p>
          )}
        </div>
      </section>

      {/* Dashed Tear-off Divider */}
      <div className="relative border-t-2 border-dashed border-emerald-500 bg-slate-100 px-6 pb-6 pt-5 before:absolute before:-left-4 before:-top-4 before:h-8 before:w-8 before:rounded-full before:bg-slate-950 after:absolute after:-right-4 after:-top-4 after:h-8 after:w-8 after:rounded-full after:bg-slate-950">
        <div className="grid grid-cols-2 gap-4 text-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ticket No.</p>
            <p className="text-xs sm:text-sm font-mono font-black text-slate-900 tracking-tight">{effectiveTicketNo}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Issue Date</p>
            <p className="text-xs sm:text-sm font-bold text-slate-900">{effectiveIssueDate}</p>
          </div>
        </div>

        {/* Guest & QR Code Card */}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-slate-900 p-4 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Guest Name</p>
            <p className="mt-0.5 text-base font-extrabold text-white truncate">{clientName}</p>
            <p className="mt-2.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Entrance / Gate</p>
            <p className="mt-0.5 text-xs font-bold text-slate-200 truncate">{entrance || ticketType || 'Main Entrance Gate'}</p>
          </div>
          <QRCode value={qrData} size={96} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EventConfirmationPage() {
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const queryRef = new URLSearchParams(location.search).get('ref');

  useEffect(() => {
    document.title = 'Event reservation | BookingCart';

    if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'ticket') {
      setBooking(EVENT_TICKET_PREVIEW);
      setLoading(false);
      return;
    }

    if (location.state?.booking) {
      setBooking(location.state.booking);
      setLoading(false);
      return;
    }

    if (!queryRef) {
      setLoading(false);
      return;
    }

    fetch(`/api/event-bookings?ref=${encodeURIComponent(queryRef)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.booking) setBooking(data.booking);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [queryRef, location.state]);

  // ── Download ticket as image using html2canvas (loaded from CDN) ─────────
  async function handleDownload() {
    setDownloading(true);
    try {
      // Dynamically load html2canvas if not already loaded
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const el = document.getElementById('event-ticket');
      const canvas = await window.html2canvas(el, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null });
      const link = document.createElement('a');
      link.download = `ticket-${booking?.bookingRef || 'booking'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      alert('Could not download ticket. Please screenshot it instead.');
    } finally {
      setDownloading(false);
    }
  }

  const [confirming, setConfirming] = useState(false);

  async function handleCompletePayment(method = 'card') {
    if (!booking?.bookingRef) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/event-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_payment', bookingRef: booking.bookingRef, paymentMethod: method }),
      });
      const data = await res.json();
      if (data.ok && data.booking) {
        setBooking(data.booking);
      } else {
        alert(data.error || 'Failed to complete payment.');
      }
    } catch {
      alert('Network error attempting to confirm payment.');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-emerald-400">
          <i className="ph ph-spinner-gap animate-spin text-3xl" />
          <span className="text-lg font-semibold">Loading your ticket…</span>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 pt-32 text-center text-white">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl backdrop-blur-xl">
          <i className="ph ph-warning-circle text-5xl text-amber-400 mb-3 block" />
          <h1 className="text-2xl font-black">No Confirmed Booking Found</h1>
          <p className="mt-2 text-slate-400 text-sm">A valid reservation reference is required to display your ticket.</p>
          <Link to="/events" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-emerald-500 transition-all">
            Browse Events
          </Link>
        </div>
      </main>
    );
  }

  if (booking.status !== 'confirmed') {
    const total = new Intl.NumberFormat(undefined, { style: 'currency', currency: booking.currency || 'USD' }).format(Number(booking.total) || 0);
    return (
      <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-28 text-white">
        <section className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/90 p-7 sm:p-10 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-3xl text-amber-400 border border-amber-400/20 shrink-0">
              <i className="ph ph-clock-countdown" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Reservation Staged</p>
              <h1 className="text-2xl sm:text-3xl font-black text-white">Payment Still Required</h1>
            </div>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed">
            Your place has been reserved (Ref: <span className="font-mono font-bold text-emerald-400">{booking.bookingRef}</span>). Complete your payment below to instantly generate your official e-ticket and entry QR code.
          </p>

          <dl className="divide-y divide-slate-800 rounded-2xl bg-slate-950/80 border border-slate-800 px-6 py-2 text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-slate-400">Reference</dt>
              <dd className="font-mono font-bold text-emerald-400">{booking.bookingRef}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-slate-400">Event</dt>
              <dd className="text-right font-bold text-white">{booking.eventName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-slate-400">Tickets</dt>
              <dd className="text-right font-bold text-white">{booking.ticketName} × {booking.quantity}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-slate-400">Amount Due</dt>
              <dd className="font-black text-emerald-400 text-lg">{total}</dd>
            </div>
          </dl>

          {/* Action Payment Section */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <i className="ph ph-credit-card text-emerald-400" /> Complete Payment Now
            </h3>
            <p className="text-xs text-slate-400">Select a payment option below to verify payment and receive your digital QR entry pass instantly:</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => handleCompletePayment('card')}
                disabled={confirming}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
              >
                {confirming ? <i className="ph ph-spinner-gap animate-spin" /> : <i className="ph ph-credit-card" />}
                Pay {total} (Card / Online)
              </button>
              <button
                onClick={() => handleCompletePayment('mobile_money')}
                disabled={confirming}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                {confirming ? <i className="ph ph-spinner-gap animate-spin" /> : <i className="ph ph-device-mobile" />}
                Mobile Money
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row pt-2">
            <Link to="/events" className="rounded-xl border border-slate-800 px-5 py-3 text-center text-sm font-bold text-slate-400 hover:text-white transition-colors flex-1">
              Browse More Experiences
            </Link>
            <Link to="/support" className="rounded-xl border border-slate-800 px-5 py-3 text-center text-sm font-bold text-slate-400 hover:text-white transition-colors flex-1">
              Contact Support
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const b = booking;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-slate-950 to-slate-950 pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">

        {/* ── Success Header ── */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-4 text-green-400 text-3xl">
            <i className="ph ph-check-circle-fill" />
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Booking Confirmed! 🎉</h1>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Your ticket has been generated below. Download or screenshot it to use at the venue.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">

          {/* ── The Ticket ── */}
          <div className="flex-shrink-0 w-full max-w-[430px] mx-auto lg:mx-0">
            <EventTicket booking={b} ticketBannerImage={b.bannerImage} />

            {/* Download Button */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-900/30"
              >
                {downloading
                  ? <><i className="ph ph-spinner-gap animate-spin" /> Preparing…</>
                  : <><i className="ph ph-download-simple" /> Download Ticket</>
                }
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                title="Print Ticket"
              >
                <i className="ph ph-printer text-xl" />
              </button>
            </div>
          </div>

          {/* ── Booking Summary ── */}
          <div className="flex-1 w-full max-w-md">
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm mb-4">
              <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <i className="ph ph-receipt text-green-400" />
                Booking Summary
              </h2>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Booking Ref', value: b.bookingRef, mono: true },
                  { label: 'Ticket No', value: b.ticketNo, mono: true },
                  { label: 'Event / Venue', value: b.venueName || b.eventName },
                  { label: 'Client Name', value: b.clientName },
                  { label: 'Location', value: b.location },
                  { label: 'Entrance', value: b.entrance || b.ticketType || 'Main Entrance Gate' },
                  { label: 'Issue Date', value: b.issueDate },
                  { label: 'Status', value: b.status || 'Confirmed', badge: true },
                ].map(({ label, value, mono, badge }) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-slate-800 last:border-0">
                    <span className="text-slate-400 shrink-0">{label}</span>
                    {badge ? (
                      <span className="text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {value}
                      </span>
                    ) : (
                      <span className={`text-white font-semibold text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
                    )}
                  </div>
                ))}
                {b.total > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-slate-400">Total Paid</span>
                    <span className="text-2xl font-black text-green-400">{b.currency || '$'}{typeof b.total === 'number' ? b.total.toFixed(2) : b.total}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Link
                to="/"
                className="w-full text-center py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold rounded-xl transition-colors"
              >
                <i className="ph ph-house mr-2" />Back to Home
              </Link>
              <Link
                to="/my-bookings"
                className="w-full text-center py-3 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 font-bold rounded-xl transition-colors"
              >
                <i className="ph ph-calendar-check mr-2" />View My Bookings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
