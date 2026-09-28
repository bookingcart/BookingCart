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
  const effectiveTicketNo = ticketNo || bookingRef;
  const effectiveIssueDate = issueDate || new Date(booking.createdAt || Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(',', '.');
  const qrData = JSON.stringify({ ref: bookingRef, ticket: effectiveTicketNo, event: eventName });

  return <div id="event-ticket" className="relative mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] bg-white shadow-2xl" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
    <header className="flex h-[92px] flex-col items-center justify-center bg-[#292b28] px-8">
      <img src="/images/logo%20.png" alt="BookingCart" className="h-auto w-[245px] brightness-0 invert" />
      <p className="mt-1 text-[10px] font-medium tracking-[0.34em] text-white/75">Compare. Book. instant</p>
    </header>
    <section className="relative h-[246px] overflow-hidden bg-slate-800">
      {bannerImg ? <img src={bannerImg} alt={eventName} className="absolute inset-0 h-full w-full object-cover" /> : <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=85" alt="Event venue" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-black/35" />
      <p className="absolute right-7 top-5 text-[18px] font-black tracking-wide text-white">{bookingRef}</p>
      <div className="absolute bottom-10 left-9 max-w-[66%]">
        <p className="text-[12px] font-bold text-[#00d454]">Venue</p>
        <h2 className="mt-0.5 text-[31px] font-black leading-[0.98] text-white">{venueName || eventName}</h2>
      </div>
      {location ? <div className="absolute bottom-11 right-6 max-w-[38%]"><p className="text-[12px] font-bold text-[#00d454]">Location</p><p className="text-[12px] leading-tight text-white">{location}</p></div> : null}
    </section>
    <div className="relative border-t-2 border-dashed border-[#00c94f] bg-[#ededed] px-12 pb-5 pt-8 before:absolute before:-left-5 before:-top-5 before:h-10 before:w-10 before:rounded-full before:bg-[#00bd49] after:absolute after:-right-5 after:-top-5 after:h-10 after:w-10 after:rounded-full after:bg-[#00bd49]">
      <div className="grid grid-cols-2 gap-8 text-[#292b28]"><div><p className="text-[12px]">Ticket No:</p><p className="text-[15px] font-black tracking-wide">{effectiveTicketNo}</p></div><div><p className="text-[12px]">Issue Date:</p><p className="text-[15px] font-black">{effectiveIssueDate}</p></div></div>
      <div className="mt-5 flex min-h-[142px] items-center justify-between gap-5 rounded-[18px] bg-[#292b28] px-7 py-5">
        <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-[#00d454]">Clients Name</p><p className="mt-1 text-[20px] leading-[1.05] text-white">{clientName}</p><p className="mt-4 text-[12px] font-bold text-[#00d454]">Entrance</p><p className="mt-1 text-[18px] leading-[1.05] text-white">{entrance || ticketType || 'Main Entrance Gate'}</p></div>
        <QRCode value={qrData} size={112} />
      </div>
    </div>
  </div>;
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

  if (!booking) {
    return <main className="min-h-screen bg-slate-950 px-4 pt-32 text-center text-white"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8"><i className="ph ph-warning-circle text-4xl text-amber-400" /><h1 className="mt-4 text-2xl font-black">No confirmed booking found</h1><p className="mt-2 text-slate-400">A valid reservation must be created before a confirmation or ticket can be shown.</p><Link to="/?mode=attractions" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">Browse events</Link></div></main>;
  }

  if (booking.status !== 'confirmed') {
    const total = new Intl.NumberFormat(undefined, { style: 'currency', currency: booking.currency || 'USD' }).format(Number(booking.total) || 0);
    return <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-28 text-white"><section className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-7 sm:p-10"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 text-3xl text-amber-400"><i className="ph ph-clock-countdown" /></div><p className="mt-6 text-sm font-bold text-amber-400">Reservation created</p><h1 className="mt-1 text-3xl font-black">Payment still required</h1><p className="mt-3 max-w-xl text-slate-300">Your place is not confirmed and no ticket has been issued. Complete payment when the organizer’s payment option is available; BookingCart will only issue a ticket after verification.</p><dl className="mt-8 divide-y divide-slate-800 rounded-xl bg-slate-950/60 px-5"><div className="flex justify-between gap-4 py-4"><dt className="text-slate-400">Reference</dt><dd className="font-mono font-bold">{booking.bookingRef}</dd></div><div className="flex justify-between gap-4 py-4"><dt className="text-slate-400">Event</dt><dd className="text-right font-bold">{booking.eventName}</dd></div><div className="flex justify-between gap-4 py-4"><dt className="text-slate-400">Tickets</dt><dd className="text-right font-bold">{booking.ticketName} × {booking.quantity}</dd></div><div className="flex justify-between gap-4 py-4"><dt className="text-slate-400">Amount due</dt><dd className="font-black text-emerald-400">{total}</dd></div><div className="flex justify-between gap-4 py-4"><dt className="text-slate-400">Status</dt><dd className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase text-amber-300">Pending payment</dd></div></dl><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Link to="/?mode=attractions" className="rounded-xl bg-emerald-600 px-5 py-3 text-center font-bold">Find more experiences</Link><Link to="/support" className="rounded-xl border border-slate-700 px-5 py-3 text-center font-bold text-slate-200">Contact support</Link></div></section></main>;
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
