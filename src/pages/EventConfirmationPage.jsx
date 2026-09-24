import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';

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
      className="rounded-xl"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

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

  const bannerImg = ticketBannerImage || booking.bannerImage;
  const qrData = JSON.stringify({ ref: bookingRef, ticket: ticketNo, event: eventName });

  return (
    <div
      id="event-ticket"
      className="relative w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden shadow-2xl"
      style={{ background: '#f0f0f0', fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Header: BookingCart Brand ── */}
      <div className="flex flex-col items-center justify-center py-5 px-6" style={{ background: '#1a1a1a' }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
            <path d="M2 10C2 5.58 5.58 2 10 2h8c4.42 0 8 3.58 8 8s-3.58 8-8 8h-8C5.58 18 2 14.42 2 10z" fill="#16a34a" opacity="0.2"/>
            <path d="M1 10C1 5.03 5.03 1 10 1h0l-2 2H6C3.79 3 2 4.79 2 7v6c0 2.21 1.79 4 4 4h2l2 2h0C5.03 19 1 14.97 1 10z" fill="#22c55e"/>
          </svg>
          <span className="text-white font-black text-xl tracking-tight">
            BOOKING<span className="text-green-400">CART</span>
          </span>
        </div>
        <p className="text-slate-400 text-[10px] tracking-[0.25em] uppercase font-medium">Compare . Book . Instant</p>
      </div>

      {/* ── Banner Image with Overlay ── */}
      <div className="relative h-56 overflow-hidden">
        {bannerImg ? (
          <img
            src={bannerImg}
            alt={eventName}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-green-700 to-emerald-500 flex items-center justify-center">
            <i className="ph ph-ticket text-white/30 text-8xl" />
          </div>
        )}
        {/* Dark overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Booking Ref top-right */}
        <div className="absolute top-3 right-4">
          <span className="text-white font-black text-sm tracking-wider drop-shadow-lg">{bookingRef}</span>
        </div>

        {/* Venue/Event Name bottom-left */}
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-green-400 text-xs font-bold mb-1">Venue</p>
          <h2 className="text-white font-black text-2xl leading-tight drop-shadow-lg">
            {venueName || eventName}
          </h2>
        </div>

        {/* Location bottom-right */}
        {location && (
          <div className="absolute bottom-4 right-4 text-right">
            <p className="text-green-400 text-xs font-bold mb-0.5">Location</p>
            <p className="text-white text-xs font-medium">{location}</p>
          </div>
        )}
      </div>

      {/* ── Tear line (the notch effect) ── */}
      <div className="relative flex items-center" style={{ background: '#e8e8e8' }}>
        <div className="absolute -left-4 w-8 h-8 rounded-full" style={{ background: '#f0f0f0' }} />
        <div className="flex-1 border-t-2 border-dashed mx-6" style={{ borderColor: '#c0c0c0' }} />
        <div className="absolute -right-4 w-8 h-8 rounded-full" style={{ background: '#f0f0f0' }} />
      </div>

      {/* ── Ticket Info Bar ── */}
      <div className="px-6 py-4 grid grid-cols-2 gap-4" style={{ background: '#e8e8e8' }}>
        <div>
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Ticket No:</p>
          <p className="text-slate-900 font-black text-xs">{ticketNo}</p>
        </div>
        <div>
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-0.5">Issue Date:</p>
          <p className="text-slate-900 font-black text-xs">{issueDate}</p>
        </div>
      </div>

      {/* ── Client Section (dark) ── */}
      <div className="mx-4 mb-4 rounded-2xl p-5 flex items-center justify-between gap-4" style={{ background: '#2d2d2d' }}>
        <div className="flex-1 min-w-0">
          <p className="text-green-400 text-xs font-bold mb-1">Clients Name</p>
          <p className="text-white font-bold text-base leading-snug mb-3">{clientName}</p>
          <p className="text-green-400 text-xs font-bold mb-1">Entrance</p>
          <p className="text-white font-bold text-base leading-snug">{entrance || ticketType || 'Main Entrance Gate'}</p>
        </div>
        <div className="shrink-0">
          <QRCode value={qrData} size={100} />
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
    document.title = 'BookingCart — Booking Confirmed';

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
      const canvas = await window.html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null });
      const link = document.createElement('a');
      link.download = `ticket-${b.bookingRef || 'booking'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
      alert('Could not download ticket. Please screenshot it instead.');
    } finally {
      setDownloading(false);
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

  // Demo / fallback booking data
  const b = booking || {
    bookingRef: queryRef || 'B009865456t',
    ticketNo: '08839373t3e352627',
    issueDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(',', '.'),
    clientName: 'Guest User',
    eventName: 'Your Event',
    venueName: 'Event Venue',
    location: 'Main Street, City',
    entrance: 'Main Entrance Gate',
    ticketType: 'General Admission',
    bannerImage: '',
    total: 0,
    currency: 'USD',
    status: 'confirmed',
  };

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
          <div className="flex-shrink-0 w-full max-w-[380px] mx-auto lg:mx-0">
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
