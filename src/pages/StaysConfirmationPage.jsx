import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { useBookingSound } from '../lib/sound.js';

// ─── Lightweight QR Code (no extra dependencies) ───────────────────────────────
function QRCode({ value, size = 130 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1a1a2e&format=svg&margin=6`;
  return (
    <img
      src={url}
      alt="Booking QR Code"
      width={size}
      height={size}
      className="rounded-xl border-4 border-white shadow-lg"
    />
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
  const formatDateTime = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
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
  const checkIn = formatDateShort(checkInRaw);
  const checkOut = formatDateShort(checkOutRaw);
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        {/* ── Loading ── */}
        {loading && (
          <div className="text-center py-24">
            <div className="w-14 h-14 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
            <h2 className="mt-8 text-2xl font-black text-slate-900 dark:text-white">Confirming your booking…</h2>
            <p className="text-slate-500 mt-2 text-sm">Please don't close this page. We're securing your reservation.</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 w-full text-red-700 dark:text-red-300 p-10 rounded-2xl border border-red-200 dark:border-red-800 flex flex-col items-center text-center">
            <i className="ph ph-warning-circle text-5xl mb-4" />
            <h2 className="text-xl font-black">Booking Error</h2>
            <p className="mt-2 text-sm">{error}</p>
            <Link to="/support" className="mt-6 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">Contact Support</Link>
          </div>
        )}

        {/* ── Confirmation Letter ── */}
        {!loading && !error && booking && (
          <div className="space-y-0">

            {/* ════════════════════ HEADER BANNER ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-t-3xl border border-b-0 border-slate-200 dark:border-slate-800 overflow-hidden">
              {/* Green success strip */}
              <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-8 py-6 flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm shrink-0">
                  <i className="ph-fill ph-check-circle text-3xl text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">Booking Confirmation</h1>
                  <p className="text-emerald-100 text-sm mt-1">Your stay has been confirmed. A confirmation email will be sent shortly.</p>
                </div>
              </div>

              {/* Booking ref + confirmation number + QR code */}
              <div className="px-8 py-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirmation Number</span>
                  <p className="text-2xl font-mono font-black text-slate-900 dark:text-white tracking-wider mt-0.5">{bookingRef}</p>
                  {confirmedAt && (
                    <p className="text-xs text-slate-500 mt-1">Confirmed {formatDateTime(confirmedAt)}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-200 dark:border-emerald-800">
                      <i className="ph-fill ph-check-circle text-xs" /> Confirmed
                    </span>
                    <span className="text-[10px] text-slate-400">Scan QR code at check-in →</span>
                  </div>
                </div>
                {/* QR Code for check-in scanning */}
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <div className="p-2 bg-white dark:bg-slate-700 rounded-2xl shadow-md border border-slate-200 dark:border-slate-600">
                    <QRCode value={JSON.stringify({ ref: bookingRef, type: 'stay', hotel: accommodationName, checkIn: checkInRaw, checkOut: checkOutRaw })} size={110} />
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Check-in QR</span>
                </div>
              </div>
            </div>

            {/* ════════════════════ PROPERTY + DATES ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 px-8 py-7">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                {/* Property info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ph-fill ph-buildings text-emerald-600 text-xl" />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{accommodationName}</h2>
                  </div>
                  {booking?.accommodation?.address && (
                    <p className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                      <i className="ph ph-map-pin text-emerald-500 shrink-0 mt-0.5" />
                      <span>{typeof booking.accommodation.address === 'string' ? booking.accommodation.address : [booking.accommodation.address?.line_1, booking.accommodation.address?.city_name, booking.accommodation.address?.country_code].filter(Boolean).join(', ')}</span>
                    </p>
                  )}
                  {booking?.accommodation?.phone_numbers?.[0] && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <i className="ph ph-phone text-emerald-500" />
                      {booking.accommodation.phone_numbers[0]}
                    </p>
                  )}
                </div>

                {/* Check-in / Check-out date boxes */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Check-in</div>
                    <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 leading-none">{checkIn.day}</span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{checkIn.month}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 px-1">
                    {nightCount && (
                      <span className="text-[10px] font-black text-slate-400">{nightCount} night{nightCount > 1 ? 's' : ''}</span>
                    )}
                    <i className="ph ph-arrow-right text-slate-300 text-lg" />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Check-out</div>
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-700 dark:text-slate-200 leading-none">{checkOut.day}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{checkOut.month}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ════════════════════ GUEST DETAILS ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="ph ph-user text-emerald-500" /> Guest Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Guest Name</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">{guestName}</p>
                </div>
                {guestEmail && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Email</span>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5 break-all">{guestEmail}</p>
                  </div>
                )}
                {guestPhone && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Phone</span>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">{guestPhone}</p>
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Number of Guests</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">{numGuests} guest{numGuests > 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* ════════════════════ ROOM DETAILS ════════════════════ */}
            {roomInfo && (
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="ph ph-bed text-emerald-500" /> Room Details
                </h3>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{roomInfo.name || roomInfo.room_type || 'Standard Room'}</p>
                  {roomInfo.description && (
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{roomInfo.description}</p>
                  )}
                  {roomInfo.amenities && roomInfo.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {roomInfo.amenities.slice(0, 12).map((a, i) => (
                        <span key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md text-[10px] font-bold">{a}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════════════════ PRICE BREAKDOWN ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="ph ph-receipt text-emerald-500" /> Price Summary
              </h3>

              <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {/* Room rate */}
                <div className="flex justify-between items-center px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Room rate{nightCount ? ` × ${nightCount} night${nightCount > 1 ? 's' : ''}` : ''}</p>
                    {numGuests > 0 && <p className="text-[11px] text-slate-400">For {numGuests} guest{numGuests > 1 ? 's' : ''}</p>}
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">{currency} {totalAmount.toFixed(2)}</span>
                </div>

                {/* Taxes */}
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-slate-500">Taxes & charges</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {taxAmount != null && Number(taxAmount) > 0
                      ? `${currency} ${Number(taxAmount).toFixed(2)}`
                      : <span className="italic font-normal text-slate-400">Included</span>}
                  </span>
                </div>

                {/* Fees */}
                {feeAmount != null && Number(feeAmount) > 0 && (
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-slate-500">Service fees</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{currency} {Number(feeAmount).toFixed(2)}</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center px-5 py-4 bg-slate-50 dark:bg-slate-800/50">
                  <span className="font-black text-slate-900 dark:text-white">Total Paid</span>
                  <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">{currency} {totalAmount.toFixed(2)}</span>
                </div>

                {/* Due at accommodation */}
                <div className="flex justify-between items-center px-5 py-4 bg-emerald-50 dark:bg-emerald-950/30">
                  <div>
                    <span className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">Due at Accommodation</span>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Payable directly to the property</p>
                  </div>
                  <span className="font-black text-emerald-800 dark:text-emerald-300">
                    {dueAtAccAmount != null && Number(dueAtAccAmount) > 0
                      ? `${dueAtAccCurrency} ${Number(dueAtAccAmount).toFixed(2)}`
                      : <span className="text-sm font-semibold italic text-emerald-600">Nothing due</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* ════════════════════ PAYMENT INFO ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="ph ph-credit-card text-emerald-500" /> Payment Information
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment status</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                    <i className="ph-fill ph-check-circle text-xs" /> Paid in full
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment method</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Online Payment</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Booking status</span>
                  <span className="font-bold text-emerald-600 capitalize">{booking?.status || 'Confirmed'}</span>
                </div>
              </div>
            </div>

            {/* ════════════════════ CANCELLATION POLICY ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="ph ph-shield-check text-emerald-500" /> Cancellation Policy
              </h3>
              {cancellationTimeline?.cancel_by ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-5 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold mb-2">
                    <i className="ph-fill ph-check-circle text-lg" />
                    Free cancellation until {formatDate(cancellationTimeline.cancel_by)}
                  </div>
                  {((cancellationTimeline.penalties || cancellationTimeline.periods) || []).length > 0 && (
                    <div className="space-y-1.5 mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Penalty Schedule</p>
                      {(cancellationTimeline.penalties || cancellationTimeline.periods).map((p, i) => (
                        <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <i className="ph ph-caret-right text-slate-400" />
                          After {formatDate(p.start_date || p.starts_at)}:{' '}
                          {p.percentage != null
                            ? `${p.percentage}% of total amount`
                            : p.amount != null
                            ? `${currency} ${Number(p.amount).toFixed(2)}`
                            : 'Penalty applies'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                    <i className="ph ph-warning-circle text-lg" />
                    {rateConditions?.toLowerCase().includes('non-refundable')
                      ? 'Non-refundable – no cancellation available after booking'
                      : 'Cancellation policy varies – please check your confirmation email'}
                  </div>
                </div>
              )}
            </div>

            {/* ════════════════════ RATE CONDITIONS ════════════════════ */}
            {rateConditions && (
              <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="ph ph-info text-emerald-500" /> Rate Conditions
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                  {rateConditions}
                </div>
              </div>
            )}

            {/* ════════════════════ KEY COLLECTION ════════════════════ */}
            {keyCollection && (
              <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="ph ph-key text-emerald-500" /> Key Collection
                </h3>
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold leading-relaxed">
                    <i className="ph-fill ph-key text-blue-500 mr-2" />
                    {keyCollection}
                  </p>
                </div>
              </div>
            )}

            {/* ════════════════════ IMPORTANT INFORMATION ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="ph ph-info text-emerald-500" /> Important Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                    <i className="ph ph-clock text-emerald-500" /> Check-in / Check-out
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">Check-in: <span className="font-bold">from 14:00</span></p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">Check-out: <span className="font-bold">by 11:00</span></p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                    <i className="ph ph-identification-card text-emerald-500" /> At Check-in
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">Please present your <span className="font-bold">booking confirmation</span> and a <span className="font-bold">valid photo ID</span>.</p>
                </div>
              </div>
            </div>

            {/* ════════════════════ NEED HELP ════════════════════ */}
            <div className="bg-white dark:bg-slate-900 border-x border-t border-slate-200 dark:border-slate-800 px-8 py-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <i className="ph ph-headset text-emerald-500" /> Need Help?
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                <p className="font-bold text-sm text-slate-900 dark:text-white mb-3">BookingCart Customer Service</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <a href="mailto:bookingcart.business@gmail.com" className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 hover:underline">
                    <i className="ph ph-envelope text-emerald-500" /> bookingcart.business@gmail.com
                  </a>
                  <a href="tel:+18005550199" className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 hover:underline">
                    <i className="ph ph-phone text-emerald-500" /> +1 (800) 555-0199
                  </a>
                </div>
                <p className="text-[11px] text-slate-400 mt-3">We're available 24 hours a day, 7 days a week.</p>
              </div>
            </div>

            {/* ════════════════════ LEGAL FOOTER ════════════════════ */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-b-3xl px-8 py-5">
              <div className="text-[11px] text-slate-400 leading-relaxed text-center">
                <p>
                  This confirmation contains the most important information about your booking.
                  It can be used to check in when you arrive at the property.
                </p>
                <p className="mt-2">
                  By confirming this booking, you agreed to our{' '}
                  <Link to="/terms" className="text-emerald-600 hover:underline">Terms & Conditions</Link>{' '}and{' '}
                  <Link to="/privacy" className="text-emerald-600 hover:underline">Privacy Policy</Link>,
                  as well as any applicable property terms.
                </p>
                <p className="mt-3 font-bold text-slate-500">BookingCart Inc. · 123 Travel Street, Silicon Valley, CA 94000</p>
              </div>
            </div>

            {/* ════════════════════ ACTION BUTTONS ════════════════════ */}
            <div className="flex flex-col sm:flex-row gap-3 mt-8 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 text-slate-800 dark:text-white font-bold rounded-2xl transition-all hover:shadow-lg"
              >
                <i className="ph ph-printer text-lg text-emerald-600" />
                Print / Save as PDF
              </button>
              <Link to="/my-bookings" className="flex-1 text-center py-4 bg-emerald-600 text-white font-bold rounded-2xl transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/20 flex items-center justify-center gap-2">
                <i className="ph ph-list-checks text-lg" /> View My Bookings
              </Link>
              <Link to="/" className="flex-1 text-center py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2">
                <i className="ph ph-house text-lg" /> Return Home
              </Link>
            </div>
          </div>
        )}
      </main>
      <div className="print:hidden">
        <FlightFooter />
      </div>
    </div>
  );
}
