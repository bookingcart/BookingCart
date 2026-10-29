import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { useBookingSound } from '../lib/sound.js';

// ─── Lightweight QR Code (no extra dependencies) ───────────────────────────────
function QRCode({ value, size = 96 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0f172a&format=svg&margin=4`;
  return (
    <img
      src={url}
      alt="Check-in QR code"
      width={size}
      height={size}
      className="h-24 w-24 rounded-lg bg-white"
    />
  );
}

/**
 * The stay voucher. Same printed artwork as the transport boarding pass and the
 * event pass: brand band, photo band carrying the facts, white ticket face with
 * the check-in QR, then a perforated stub.
 */
function StayPass({
  bookingRef,
  hotelName,
  address,
  photo,
  checkIn,
  checkOut,
  nightCount,
  guestName,
  roomLabel,
  numGuests,
  issued,
  qrValue,
}) {
  return (
    <article className="ticket-print relative mx-auto w-full max-w-[404px] overflow-hidden rounded-[28px] bg-[#1e2226] text-white shadow-2xl">
      {/* Brand band */}
      <header className="px-6 pb-3.5 pt-5 text-center">
        <img
          src="/images/bookingcart-logo-on-dark.png"
          alt="BookingCart"
          width="202"
          height="28"
          className="mx-auto h-7 w-auto"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Compare · Book · Instant</p>
      </header>

      {/* Property photo, with the stay facts laid over it */}
      <section className="relative mx-3.5 overflow-hidden rounded-[22px] bg-slate-900">
        {photo ? (
          <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#1d3b2c,#0b0d0c_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/30 to-slate-950/90" />

        <div className="relative flex min-h-[268px] flex-col justify-between gap-6 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <i className="ph ph-buildings mt-0.5 text-2xl leading-none" aria-hidden="true" />
              <p className="text-[15px] font-extrabold leading-tight text-white">
                Stay<br /><span className="text-green-400">Voucher</span>
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-green-300 backdrop-blur">
              <i className="ph-fill ph-check-circle" aria-hidden="true" /> Confirmed
            </span>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-green-400">Property</p>
            <h2 className="mt-1 line-clamp-2 text-[19px] font-black uppercase leading-tight tracking-tight [text-shadow:0_1px_10px_rgba(0,0,0,0.85)]">{hotelName}</h2>
            {address && (
              <p className="mt-1 flex items-start gap-1.5 text-[10px] font-semibold text-white/70">
                <i className="ph ph-map-pin mt-px shrink-0 text-green-400" aria-hidden="true" />
                <span className="line-clamp-2">{address}</span>
              </p>
            )}

            <dl className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="min-w-0">
                <dt className="text-[9px] font-black uppercase tracking-wider text-green-400">Check-in</dt>
                <dd className="text-[13px] font-bold leading-tight">{checkIn}</dd>
              </div>
              <div className="pb-0.5 text-center">
                {nightCount ? (
                  <p className="text-[9px] font-bold uppercase tracking-wide text-white/60">
                    {nightCount} night{nightCount > 1 ? 's' : ''}
                  </p>
                ) : null}
                <i className="ph ph-arrow-right mt-1 block text-sm text-white/50" aria-hidden="true" />
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-[9px] font-black uppercase tracking-wider text-green-400">Check-out</dt>
                <dd className="text-[13px] font-bold leading-tight">{checkOut}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* White face: the guest's copy */}
      <div className="bg-white px-4 py-4 text-slate-900">
        <div className="flex items-start gap-3">
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
            <div className="col-span-2">
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Guest</dt>
              <dd className="truncate text-sm font-bold">{guestName}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Room</dt>
              <dd className="truncate text-[11px] font-bold leading-snug">{roomLabel}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Guests</dt>
              <dd className="text-[11px] font-bold leading-snug">{numGuests} guest{numGuests > 1 ? 's' : ''}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Booking ref</dt>
              <dd className="truncate font-mono text-[11px] font-bold">{bookingRef}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-wider text-green-600">Issued</dt>
              <dd className="text-[10px] font-bold leading-snug">{issued}</dd>
            </div>
          </dl>

          <div className="shrink-0 rounded-2xl bg-slate-950 p-2">
            <QRCode value={qrValue} />
          </div>
        </div>
        <p className="mt-2 text-[9px] font-semibold text-slate-400">Scan at check-in — one code per stay.</p>
      </div>

      {/* Perforated stub */}
      <div className="relative border-t-2 border-dashed border-slate-300 bg-[#1e2226] px-6 pb-5 pt-4 text-center">
        <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-950 print:bg-white" />
        <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-slate-50 dark:bg-slate-950 print:bg-white" />
        <p className="text-base font-black tracking-tight text-white">{hotelName}</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-500">
          Booked with BookingCart
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[9px] font-bold uppercase tracking-wider">
          <span className="font-mono text-slate-400">{bookingRef}</span>
          <span className="text-green-400">confirmed</span>
        </div>
      </div>
    </article>
  );
}

export default function StaysConfirmationPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const isDirect = searchParams.get('direct');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // Chime once the stay is confirmed — keyed on the booking so a reload of the
  // same confirmation link stays quiet.
  useBookingSound(booking ? booking.reference || booking.id || sessionId : null);

  useEffect(() => {
    document.title = 'Booking Confirmed | BookingCart';

    const confirmBooking = async () => {
      try {
        if (!sessionId && !isDirect) {
          throw new Error('No payment session found.');
        }

        if (isDirect) {
          const rawResult = sessionStorage.getItem('stays_booking_result');
          if (rawResult) {
            const parsed = JSON.parse(rawResult);
            setBooking(parsed);
            sessionStorage.removeItem('stays_booking_result');
            // ── Cache hotel display data in localStorage for MyBookingsPage ──
            try {
              const ref = parsed.reference || parsed.id;
              const accName = parsed.accommodation?.name || '';
              const accImage = parsed.accommodation?.photos?.[0]?.url || '';
              if (ref && (accName || accImage)) {
                const cache = JSON.parse(localStorage.getItem('bc_stays_hotel_cache') || '{}');
                cache[ref] = { name: accName, image: accImage };
                localStorage.setItem('bc_stays_hotel_cache', JSON.stringify(cache));
              }
            } catch (_) {}
            return;
          }
        }

        const rawData = sessionStorage.getItem('stays_booking_data');
        if (!rawData) {
          throw new Error('No booking data found in session.');
        }

        const bookingData = JSON.parse(rawData);

        const res = await fetch('/api/stays-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookingData)
        });

        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to complete booking with provider.');
        }

        setBooking(data.booking);
        sessionStorage.removeItem('stays_booking_data');

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    confirmBooking();
  }, [sessionId, isDirect]);

  // ── Helpers ──────────────────────────────────────────────────
  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return d; }
  };
  const formatDateShort = (d) => {
    if (!d) return { day: '--', month: '---' };
    try {
      const dt = new Date(d);
      return {
        day: String(dt.getDate()).padStart(2, '0'),
        month: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        year: dt.getFullYear(),
        weekday: dt.toLocaleDateString('en-US', { weekday: 'short' })
      };
    } catch { return { day: '--', month: '---' }; }
  };
  // "Thu, 29 Oct" — the shape the ticket faces use.
  const compactDate = (d) => {
    const p = formatDateShort(d);
    return p.day === '--' ? '—' : `${p.weekday}, ${p.day} ${p.month}`;
  };
  // "29 Oct 2026" — short enough for the banner, still year-complete.
  const mediumDate = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  };

  // ── Derived values ──────────────────────────────────────────
  const cancellationTimeline = booking?.quote?.cancellation_timeline
    || booking?.cancellation_timeline
    || booking?._checkoutQuote?.cancellation_timeline
    || null;
  const rateConditions = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.conditions
    || booking?.rooms?.[0]?.rates?.[0]?.conditions
    || booking?._checkoutQuote?.rooms?.[0]?.rates?.[0]?.conditions
    || '';
  const taxAmount = booking?.tax_amount ?? booking?.quote?.tax_amount ?? booking?._checkoutQuote?.tax_amount ?? null;
  const feeAmount = booking?.fee_amount ?? booking?.quote?.fee_amount ?? booking?._checkoutQuote?.fee_amount ?? null;
  const dueAtAccAmount = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? booking?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? booking?._checkoutQuote?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount
    ?? null;
  const dueAtAccCurrency = booking?.accommodation?.rooms?.[0]?.rates?.[0]?.due_at_accommodation_currency
    || booking?.currency
    || booking?._checkoutQuote?.currency
    || 'USD';

  const bookingRef = booking?.reference || booking?.id || '—';
  const confirmedAt = booking?.confirmed_at || booking?.created_at || null;
  const currency = booking?.currency || booking?._checkoutQuote?.currency || 'USD';
  const totalAmount = Number(booking?.total_amount || booking?._checkoutQuote?.total_amount || 0);
  const accommodationName = booking?.accommodation?.name || booking?._checkoutQuote?.accommodation?.name || 'Hotel';
  const checkInRaw = booking?.check_in_date || booking?._checkoutQuote?.check_in_date;
  const checkOutRaw = booking?.check_out_date || booking?._checkoutQuote?.check_out_date;
  const guestName = booking?.guests?.[0]
    ? `${booking.guests[0].given_name || ''} ${booking.guests[0].family_name || ''}`.trim()
    : '—';
  const guestEmail = booking?.email || '';
  const guestPhone = booking?.phone_number || '';
  const numGuests = booking?.guests?.length || 1;

  // Night count
  const nightCount = (() => {
    if (!checkInRaw || !checkOutRaw) return null;
    try {
      const diff = Math.round((new Date(checkOutRaw) - new Date(checkInRaw)) / 86400000);
      return diff > 0 ? diff : null;
    } catch { return null; }
  })();

  const roomInfo = booking?.accommodation?.rooms?.[0] || booking?.rooms?.[0] || booking?._checkoutQuote?.rooms?.[0] || null;
  const keyCollection = booking?.accommodation?.key_collection?.instructions;

  // Hotel owners sometimes name a room just "4"; read it as "Room 4".
  const rawRoomName = String(roomInfo?.name || roomInfo?.room_type || '').trim();
  const roomLabel = !rawRoomName
    ? 'Standard room'
    : /^\d+$/.test(rawRoomName) ? `Room ${rawRoomName}` : rawRoomName;

  // Address shapes differ between local profiles and Duffel quotes.
  const addressObj = booking?.accommodation?.address
    || booking?.accommodation?.location?.address
    || booking?._checkoutQuote?.accommodation?.location?.address
    || null;
  const addressText = typeof addressObj === 'string'
    ? addressObj
    : [addressObj?.line_one || addressObj?.line_1, addressObj?.city_name || addressObj?.city, addressObj?.postal_code, addressObj?.country_code]
        .filter(Boolean)
        .join(', ');
  const phoneNumber = booking?.accommodation?.phone_numbers?.[0] || '';

  const photoEntry = booking?.accommodation?.photos?.[0] || booking?._checkoutQuote?.accommodation?.photos?.[0];
  const photo = typeof photoEntry === 'string' ? photoEntry : photoEntry?.url || '';
  const rating = Number(booking?.accommodation?.rating || 0);

  const qrValue = JSON.stringify({ ref: bookingRef, type: 'stay', hotel: accommodationName, checkIn: checkInRaw, checkOut: checkOutRaw });

  return (
    <main className="min-h-screen bg-slate-50 pb-16 dark:bg-slate-950 print:bg-white print:pb-0">
      {/* Printing keeps the voucher alone: site chrome and the detail panels
          are dropped so the pass never breaks across two pages. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { background: #fff !important; }
          .bookingcart-navbar,
          footer[aria-label="Site Footer"],
          [aria-modal="true"] { display: none !important; }
          .print-hide { display: none !important; }
          .ticket-print {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ticket-print * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        {/* ── Loading ── */}
        {loading && (
          <div className="py-24 text-center">
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
            <h2 className="mt-8 text-2xl font-black text-slate-900 dark:text-white">Confirming your booking…</h2>
            <p className="mt-2 text-sm text-slate-500">Please don't close this page. We're securing your reservation.</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <i className="ph ph-warning-circle mb-3 text-4xl" aria-hidden="true" />
            <h2 className="text-xl font-black">Booking Error</h2>
            <p className="mt-2 text-sm">{error}</p>
            <Link to="/support" className="mt-6 rounded-xl bg-red-600 px-6 py-2.5 font-bold text-white transition-colors hover:bg-red-700">Contact Support</Link>
          </div>
        )}

        {!loading && !error && booking && (
          <>
            {/* ── Success banner ── */}
            <section className="print-hide rounded-2xl border border-green-200 bg-green-50 p-5 text-center dark:border-green-800 dark:bg-green-900/20">
              <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
                <i className="ph ph-check text-2xl" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-black text-slate-900 dark:text-white">You're booked</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {accommodationName}{checkInRaw ? ` · ${mediumDate(checkInRaw)}` : ''}
                {checkOutRaw ? ` → ${mediumDate(checkOutRaw)}` : ''}
                {nightCount ? ` · ${nightCount} night${nightCount > 1 ? 's' : ''}` : ''}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                A confirmation email {guestEmail ? `is on its way to ${guestEmail}` : 'will be sent shortly'}.
              </p>
              <p className="mt-3 inline-block rounded-xl bg-white px-3 py-1.5 font-mono text-sm font-bold text-slate-900 dark:bg-slate-900 dark:text-white">
                {bookingRef}
              </p>
            </section>

            <div className="mt-5 grid gap-6 lg:grid-cols-[404px_1fr] lg:items-start">
              {/* ── The voucher ── */}
              <div className="space-y-4">
                <StayPass
                  bookingRef={bookingRef}
                  hotelName={accommodationName}
                  address={addressText}
                  photo={photo}
                  checkIn={compactDate(checkInRaw)}
                  checkOut={compactDate(checkOutRaw)}
                  nightCount={nightCount}
                  guestName={guestName}
                  roomLabel={roomLabel}
                  numGuests={numGuests}
                  issued={confirmedAt ? formatDate(confirmedAt) : '—'}
                  qrValue={qrValue}
                />

                <div className="print-hide grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    <i className="ph ph-printer text-base" aria-hidden="true" /> Print / save PDF
                  </button>
                  <Link
                    to="/my-bookings"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <i className="ph ph-suitcase text-base" aria-hidden="true" /> My bookings
                  </Link>
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <i className="ph ph-house text-base" aria-hidden="true" /> Home
                  </Link>
                </div>

                <p className="print-hide text-center text-[11px] text-slate-400">
                  Keep this page or the email — the QR code is scanned once at check-in.
                </p>
              </div>

              {/* ── Everything the guest needs to read ── */}
              <div className="space-y-4 print-hide">
                {/* Stay summary */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-black text-slate-900 dark:text-white">{accommodationName}</h2>
                      {addressText && (
                        <p className="mt-0.5 flex items-start gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <i className="ph ph-map-pin mt-0.5 shrink-0 text-green-600" aria-hidden="true" /> {addressText}
                        </p>
                      )}
                      {phoneNumber && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <i className="ph ph-phone text-green-600" aria-hidden="true" /> {phoneNumber}
                        </p>
                      )}
                    </div>
                    {rating > 0 && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        <i className="ph-fill ph-star text-amber-500" aria-hidden="true" /> {rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-700 sm:grid-cols-4">
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Check-in</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{compactDate(checkInRaw)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Check-out</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{compactDate(checkOutRaw)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Nights</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{nightCount || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Guests</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{numGuests}</dd>
                    </div>
                  </dl>

                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Room</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{roomLabel}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Lead guest</dt>
                      <dd className="font-bold text-slate-900 dark:text-white">{guestName}</dd>
                    </div>
                    {guestEmail && (
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                        <dd className="break-all font-bold text-slate-900 dark:text-white">{guestEmail}</dd>
                      </div>
                    )}
                    {guestPhone && (
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
                        <dd className="font-bold text-slate-900 dark:text-white">{guestPhone}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                {/* Price summary */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Price summary</h2>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between gap-3">
                      <span>Room rate{nightCount ? ` × ${nightCount} night${nightCount > 1 ? 's' : ''}` : ''}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">{currency} {totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Taxes &amp; charges</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {taxAmount != null && Number(taxAmount) > 0
                          ? `${currency} ${Number(taxAmount).toFixed(2)}`
                          : <span className="font-normal italic text-slate-400">Included</span>}
                      </span>
                    </div>
                    {feeAmount != null && Number(feeAmount) > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>Service fees</span>
                        <span className="font-bold tabular-nums text-slate-900 dark:text-white">{currency} {Number(feeAmount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-base font-black text-slate-900 dark:border-slate-700 dark:text-white">
                    <span>Total paid</span>
                    <span className="tabular-nums">{currency} {totalAmount.toFixed(2)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-800 dark:bg-green-900/20 dark:text-green-300">
                    <span className="flex items-center gap-1.5">
                      <i className="ph-fill ph-check-circle" aria-hidden="true" /> Paid in full · {booking?.status || 'confirmed'}
                    </span>
                    <span className="font-semibold">
                      {dueAtAccAmount != null && Number(dueAtAccAmount) > 0
                        ? `${dueAtAccCurrency} ${Number(dueAtAccAmount).toFixed(2)} due at the property`
                        : 'Nothing due at the property'}
                    </span>
                  </div>
                </section>

                {/* Cancellation policy */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                    <i className="ph ph-shield-check text-green-600" aria-hidden="true" /> Cancellation
                  </h2>
                  {cancellationTimeline?.cancel_by ? (
                    <div className="mt-3">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-400">
                        <i className="ph-fill ph-check-circle" aria-hidden="true" />
                        Free cancellation until {formatDate(cancellationTimeline.cancel_by)}
                      </p>
                      {((cancellationTimeline.penalties || cancellationTimeline.periods) || []).length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
                          {(cancellationTimeline.penalties || cancellationTimeline.periods).map((p, i) => (
                            <p key={i} className="flex items-center gap-1.5">
                              <i className="ph ph-caret-right text-slate-400" aria-hidden="true" />
                              After {formatDate(p.start_date || p.starts_at)}:{' '}
                              {p.percentage != null
                                ? `${p.percentage}% of the total`
                                : p.amount != null
                                ? `${currency} ${Number(p.amount).toFixed(2)}`
                                : 'Penalty applies'}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-400">
                      {rateConditions?.toLowerCase().includes('non-refundable')
                        ? 'Non-refundable — no cancellation after booking.'
                        : 'The property sets the cancellation policy — check your confirmation email.'}
                    </p>
                  )}
                </section>

                {/* Key collection */}
                {keyCollection && (
                  <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                    <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                      <i className="ph-fill ph-key" aria-hidden="true" /> Key collection
                    </h2>
                    <p className="mt-1.5 leading-relaxed">{keyCollection}</p>
                  </section>
                )}

                {/* Rate conditions */}
                {rateConditions && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                      <i className="ph ph-info text-green-600" aria-hidden="true" /> Rate conditions
                    </h2>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-400">{rateConditions}</p>
                  </section>
                )}

                {/* At check-in */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                    <i className="ph ph-clock text-green-600" aria-hidden="true" /> At check-in
                  </h2>
                  <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <p>Check-in from <span className="font-black text-slate-900 dark:text-white">14:00</span>, check-out by <span className="font-black text-slate-900 dark:text-white">11:00</span>.</p>
                    <p>Bring this voucher and a valid photo ID.</p>
                  </div>
                </section>

                {/* Need help */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                    <i className="ph ph-headset text-green-600" aria-hidden="true" /> Need help?
                  </h2>
                  <div className="mt-2 space-y-1 text-xs font-semibold">
                    <a href="mailto:bookingcart.business@gmail.com" className="flex items-center gap-1.5 text-green-700 hover:underline dark:text-green-400">
                      <i className="ph ph-envelope" aria-hidden="true" /> bookingcart.business@gmail.com
                    </a>
                    <a href="tel:+18005550199" className="flex items-center gap-1.5 text-green-700 hover:underline dark:text-green-400">
                      <i className="ph ph-phone" aria-hidden="true" /> +1 (800) 555-0199
                    </a>
                    <p className="pt-1 text-[11px] font-medium text-slate-400">Open 24 hours a day, 7 days a week.</p>
                  </div>
                </section>

                <p className="px-1 text-[11px] leading-relaxed text-slate-400">
                  This confirmation holds the details of your booking and doubles as your check-in voucher.
                  By booking you agreed to our{' '}
                  <Link to="/terms" className="text-green-600 hover:underline">Terms &amp; Conditions</Link>{' '}and{' '}
                  <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link>,
                  plus the property's own terms.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="print:hidden">
        <FlightFooter />
      </div>
    </main>
  );
}
