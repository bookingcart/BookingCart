import { useEffect, useState } from 'react';
import { FlightFooter } from '../components/FlightFooter.jsx';

/* ─── tiny helpers ─────────────────────────────────────────── */
function Badge({ children, variant = 'gray' }) {
  const cls = {
    red: 'bg-red-50 text-red-600 border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-slate-100 text-slate-600 border-slate-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>
      {children}
    </span>
  );
}

function Divider() {
  return <hr className="border-slate-100 my-5" />;
}

/* ─── mock data ─────────────────────────────────────────────── */
const booking = {
  status: 'Canceled',
  reason: 'Payment failed',
  bookingRef: 'BC-20240423-8812',
  pin: '7734',
  totalUsd: 2101.0,
  ticketFare: 1820.0,
  taxesFees: 341.0,
  discount: 60.0,
  passenger: { name: 'Jordan M. Nakamura', nationality: 'Canadian', gender: 'Male' },
  outbound: {
    from: 'Entebbe', fromCode: 'EBB', fromFull: 'Entebbe International Airport',
    to: 'Toronto', toCode: 'YYZ', toFull: 'Toronto Pearson International Airport',
    date: 'Thu, 12 Jun 2025',
    segments: [
      {
        dep: '03:45', depAirport: 'EBB', depTerminal: 'Terminal 1',
        arr: '08:55', arrAirport: 'DXB', arrTerminal: 'Terminal 3',
        duration: '5h 10m', airline: 'Emirates', flightNo: 'EK 723',
        aircraft: 'Boeing 777-300ER', stops: 0,
      },
      {
        dep: '10:25', depAirport: 'DXB', depTerminal: 'Terminal 3',
        arr: '21:05', arrAirport: 'YYZ', arrTerminal: 'Terminal 1',
        duration: '14h 40m', airline: 'Emirates', flightNo: 'EK 241',
        aircraft: 'Airbus A380-800', stops: 0,
      },
    ],
    layovers: [
      { at: 'DXB', duration: '1h 30m', warnings: ['Terminal change required', 'Check visa requirements for UAE transit'] },
    ],
  },
  inbound: {
    from: 'Toronto', fromCode: 'YYZ', fromFull: 'Toronto Pearson International Airport',
    to: 'Entebbe', toCode: 'EBB', toFull: 'Entebbe International Airport',
    date: 'Sun, 22 Jun 2025',
    segments: [
      {
        dep: '22:30', depAirport: 'YYZ', depTerminal: 'Terminal 1',
        arr: '16:50+1', arrAirport: 'DXB', arrTerminal: 'Terminal 3',
        duration: '12h 20m', airline: 'Emirates', flightNo: 'EK 242',
        aircraft: 'Airbus A380-800', stops: 0,
      },
      {
        dep: '18:40', depAirport: 'DXB', depTerminal: 'Terminal 3',
        arr: '23:55', arrAirport: 'EBB', arrTerminal: 'Terminal 1',
        duration: '5h 15m', airline: 'Emirates', flightNo: 'EK 724',
        aircraft: 'Boeing 777-300ER', stops: 0,
      },
    ],
    layovers: [
      { at: 'DXB', duration: '1h 50m', warnings: ['Overnight transfer', 'Terminal change required'] },
    ],
  },
};

/* ─── FlightSegment ──────────────────────────────────────────── */
function FlightSegment({ seg }) {
  return (
    <div className="flex gap-4 items-start">
      {/* Airline logo placeholder */}
      <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0 mt-0.5">
        <i className="ph ph-airplane-tilt text-green-600 text-lg" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Times row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-center">
            <div className="text-xl font-extrabold text-slate-900 leading-none">{seg.dep}</div>
            <div className="text-xs font-bold text-slate-500 mt-0.5">{seg.depAirport}</div>
          </div>

          <div className="flex-1 flex flex-col items-center min-w-[80px]">
            <div className="text-xs font-semibold text-slate-400 mb-1">{seg.duration}</div>
            <div className="relative w-full flex items-center">
              <div className="h-px bg-slate-200 flex-1" />
              <i className="ph ph-airplane-tilt text-green-500 text-sm mx-1" />
              <div className="h-px bg-slate-200 flex-1" />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Direct</div>
          </div>

          <div className="text-center">
            <div className="text-xl font-extrabold text-slate-900 leading-none">{seg.arr}</div>
            <div className="text-xs font-bold text-slate-500 mt-0.5">{seg.arrAirport}</div>
          </div>
        </div>

        {/* Details row */}
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1"><i className="ph ph-tag" />{seg.airline} · {seg.flightNo}</span>
          <span className="flex items-center gap-1"><i className="ph ph-airplane" />{seg.aircraft}</span>
          <span className="flex items-center gap-1"><i className="ph ph-map-pin" />Dep: {seg.depTerminal}</span>
          <span className="flex items-center gap-1"><i className="ph ph-map-pin" />Arr: {seg.arrTerminal}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── LayoverBadge ───────────────────────────────────────────── */
function LayoverBadge({ layover }) {
  return (
    <div className="relative flex items-start gap-3 py-3 px-4 rounded-xl bg-amber-50 border border-amber-100 my-3">
      <div className="mt-0.5">
        <i className="ph ph-clock-countdown text-amber-500 text-lg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-800">
          Layover at {layover.at} · {layover.duration}
        </p>
        <ul className="mt-1 space-y-0.5">
          {layover.warnings.map((w, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
              <i className="ph ph-warning-circle shrink-0" />{w}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── FlightLeg ──────────────────────────────────────────────── */
function FlightLeg({ leg, label }) {
  return (
    <div className="space-y-4">
      {/* Leg header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold">
          <i className={label === 'Return' ? 'ph ph-airplane-landing' : 'ph ph-airplane-takeoff'} />
          {label}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 font-semibold">
          <span className="font-extrabold text-slate-900">{leg.fromCode}</span>
          <span className="text-slate-400">→</span>
          <span className="font-extrabold text-slate-900">{leg.toCode}</span>
          <span className="text-slate-400">·</span>
          <span className="font-medium text-slate-500">{leg.date}</span>
        </div>
      </div>

      {/* Airports */}
      <div className="flex gap-4 text-xs text-slate-500 font-medium">
        <span><span className="text-slate-700 font-semibold">{leg.from}:</span> {leg.fromFull}</span>
        <span className="text-slate-300">|</span>
        <span><span className="text-slate-700 font-semibold">{leg.to}:</span> {leg.toFull}</span>
      </div>

      {/* Segments + layovers interleaved */}
      <div className="space-y-0">
        {leg.segments.map((seg, idx) => (
          <div key={idx}>
            <FlightSegment seg={seg} />
            {leg.layovers && leg.layovers[idx] && (
              <LayoverBadge layover={leg.layovers[idx]} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── RatingWidget ───────────────────────────────────────────── */
function RatingWidget() {
  const [selected, setSelected] = useState(null);
  const emojis = ['😞', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩', '🥰', '😍', '🎉'];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <p className="text-sm font-bold text-slate-800 mb-1">
        How likely are you to recommend booking flights on BookingCart?
      </p>
      <p className="text-xs text-slate-400 mb-4">0 = Not likely · 10 = Extremely likely</p>

      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`w-9 h-9 rounded-xl text-sm font-bold border transition-all duration-150
              ${selected === i
                ? 'bg-green-600 text-white border-green-600 scale-110 shadow-lg shadow-green-100'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-green-300 hover:bg-green-50'
              }`}
            title={`${i} – ${emojis[i]}`}
          >
            {i}
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700 animate-fade-in">
          <span className="text-2xl">{emojis[selected]}</span>
          <span>Thanks for rating us <strong>{selected}/10</strong>!</span>
        </div>
      )}
    </div>
  );
}

/* ─── PromoBanner ────────────────────────────────────────────── */
function PromoBanner() {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 p-6 text-white shadow-lg shadow-green-100">
      <div className="absolute right-0 top-0 bottom-0 w-48 opacity-10">
        <i className="ph ph-buildings text-[160px] leading-none text-white" />
      </div>

      <Badge variant="blue">
        <i className="ph ph-star-four text-yellow-300" /> Limited Offer
      </Badge>

      <h3 className="text-lg font-extrabold mt-3 mb-1">Book your stay for less 🏨</h3>
      <p className="text-sm text-green-100 mb-4">
        Save up to <span className="font-bold text-white">30% off</span> hotels when you bundle with your next flight.
      </p>

      <button className="inline-flex items-center gap-2 bg-white text-green-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-green-50 transition-all">
        <i className="ph ph-bed" /> Browse Hotels
      </button>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function BookingDetailsPage() {
  useEffect(() => { document.title = 'Booking Details | BookingCart'; }, []);

  const fmt = (n) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">


      {/* ── Main ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-6 flex-wrap">
          <a href="/my-bookings" className="hover:text-green-600 transition-colors">All Bookings</a>
          <i className="ph ph-caret-right text-slate-300" />
          <a href="/my-bookings" className="hover:text-green-600 transition-colors">Flight Bookings</a>
          <i className="ph ph-caret-right text-slate-300" />
          <span className="text-slate-700 font-semibold">Booking Details</span>
        </nav>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── LEFT COLUMN ── */}
          <div className="space-y-5">

            {/* ── Status card ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  {/* Status */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                      <i className="ph ph-x-circle text-red-500 text-lg" />
                    </div>
                    <span className="text-2xl font-extrabold text-red-600 tracking-tight">Canceled</span>
                  </div>

                  {/* Reason */}
                  <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mb-4">
                    <i className="ph ph-info text-slate-400" />
                    <span>Reason for cancellation: <span className="text-slate-700 font-semibold">payment failed</span></span>
                  </div>

                  {/* Booking refs */}
                  <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Booking Number</span>
                      <span className="text-sm font-extrabold text-slate-800 font-mono tracking-wide">{booking.bookingRef}</span>
                    </div>
                    <div className="w-px bg-slate-100 hidden sm:block" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIN Code</span>
                      <span className="text-sm font-extrabold text-slate-800 font-mono tracking-widest">{booking.pin}</span>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <button className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm shadow-green-200 shrink-0 self-start">
                  <i className="ph ph-arrows-clockwise" /> Book Again
                </button>
              </div>
            </div>

            {/* ── Flight Details ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
                  <i className="ph ph-airplane-tilt text-green-600 text-lg" />
                </div>
                <h2 className="text-base font-extrabold text-slate-900">Flight Details</h2>
                <Badge variant="green">Round Trip</Badge>
              </div>

              <FlightLeg leg={booking.outbound} label="Outbound" />

              <div className="my-6 border-t border-dashed border-slate-200" />

              <FlightLeg leg={booking.inbound} label="Return" />
            </div>

            {/* ── Passenger Information ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                  <i className="ph ph-user text-slate-500 text-lg" />
                </div>
                <h2 className="text-base font-extrabold text-slate-900">Passenger Information</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Full Name', value: booking.passenger.name, icon: 'ph-identification-card' },
                  { label: 'Nationality', value: booking.passenger.nationality, icon: 'ph-globe' },
                  { label: 'Gender', value: booking.passenger.gender, icon: 'ph-user-circle' },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <i className={`ph ${icon} text-slate-500`} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Rating ── */}
            <RatingWidget />

            {/* ── Promo ── */}
            <PromoBanner />

          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="space-y-4 lg:sticky lg:top-24">

            {/* Price Summary card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-extrabold text-slate-900 mb-4">Price Summary</h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 font-medium">Ticket Fare</span>
                  <span className="text-sm font-bold text-slate-800">{fmt(booking.ticketFare)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 font-medium">Taxes &amp; Fees</span>
                  <span className="text-sm font-bold text-slate-800">{fmt(booking.taxesFees)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 font-medium flex items-center gap-1">
                    <i className="ph ph-tag text-green-500" /> Discount
                  </span>
                  <span className="text-sm font-bold text-green-600">−{fmt(booking.discount)}</span>
                </div>
              </div>

              <Divider />

              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700">Total Amount</span>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-slate-900">{fmt(booking.totalUsd)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">USD · incl. all taxes</div>
                </div>
              </div>

              <p className="mt-4 text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">
                <i className="ph ph-info-circle mr-1" />
                Refunds are processed to the original payment method only. Prepaid &amp; virtual cards may not be supported.
              </p>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h3>

              {[
                { icon: 'ph-arrows-clockwise', label: 'Book Again', color: 'text-green-600' },
                { icon: 'ph-printer', label: 'Print Booking', color: 'text-slate-600' },
                { icon: 'ph-envelope', label: 'Email Confirmation', color: 'text-slate-600' },
                { icon: 'ph-headset', label: 'Contact Support', color: 'text-slate-600' },
              ].map(({ icon, label, color }) => (
                <button
                  key={label}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                >
                  <i className={`ph ${icon} ${color} text-base`} />
                  {label}
                </button>
              ))}
            </div>

            {/* Need help? */}
            <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <i className="ph ph-headset text-green-600 text-lg" />
                <span className="text-sm font-bold text-green-900">Need help?</span>
              </div>
              <p className="text-xs text-green-700 mb-3 leading-relaxed">
                Our 24/7 support team is ready to assist with your booking.
              </p>
              <button className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-xl transition-all">
                Chat with Support
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── Floating support button ── */}
      <button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-xl shadow-green-200 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        title="Live Support"
      >
        <i className="ph ph-chat-circle-dots text-2xl" />
      </button>
      <FlightFooter />
    </div>
  );
}
    
