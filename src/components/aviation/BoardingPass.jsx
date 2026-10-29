import { durationLabel } from "../../lib/aviationClient.js";

// Fixed palette so the pass renders identically on screen, in print and in the
// PNG export (html2canvas cannot resolve CSS colour variables reliably).
const INK = "#26282b";
const GREEN = "#00c455";
const GREEN_INK = "#04361c";
const GREEN_VALUE = "#0a2416";
const DEFAULT_PHOTO =
  "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=85";

const FONT_STACK = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";

function formatClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(display).padStart(2, "0")}:${match[2]} ${suffix}`;
}

function formatTicketDate(value) {
  const date = value ? new Date(String(value).includes("T") ? value : `${value}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "").toUpperCase();
  return date
    .toLocaleDateString("en-US", { weekday: "long", month: "2-digit", day: "2-digit", year: "numeric" })
    .replace(/,/g, ".")
    .toUpperCase();
}

function airportLine(airport) {
  return airport?.name || airport?.city || "";
}

// The perforation bites sit flush against the card edge. Each bite is drawn as
// a half disc rather than a clipped circle, so nothing can paint outside the
// card and print engines keep the edge clean.
function Notches({ side }) {
  const vertical = side === "bottom" ? "-bottom-[18px]" : "-top-[18px]";
  return (
    <>
      <span aria-hidden="true" className={`pointer-events-none absolute ${vertical} left-0 h-9 w-[18px] rounded-r-full bg-white`} />
      <span aria-hidden="true" className={`pointer-events-none absolute ${vertical} right-0 h-9 w-[18px] rounded-l-full bg-white`} />
    </>
  );
}

function BandField({ label, value, compact = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-extrabold uppercase leading-none tracking-[0.16em]" style={{ color: GREEN }}>
        {label}
      </p>
      <p className={`mt-2 break-all font-light leading-[1.15] text-white ${compact ? "text-[12px]" : "text-[16px]"}`}>
        {value}
      </p>
    </div>
  );
}

function DetailField({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-extrabold uppercase leading-none tracking-[0.14em]" style={{ color: GREEN_INK }}>
        {label}
      </p>
      <p
        className={`mt-1.5 break-words leading-[1.2] ${mono ? "font-mono text-[11px] tracking-tight" : "text-[13.5px] font-semibold"}`}
        style={{ color: GREEN_VALUE }}
      >
        {value}
      </p>
    </div>
  );
}

function TicketQr({ value }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&format=png&margin=0`;
  return (
    <span className="flex h-[102px] w-[102px] shrink-0 items-center justify-center rounded-[14px] bg-white p-1.5">
      <img src={src} alt="Boarding pass QR code" width="90" height="90" crossOrigin="anonymous" className="h-full w-full" />
    </span>
  );
}

export default function BoardingPass({ booking, id = "aviation-ticket" }) {
  const photo = booking.aircraftImage || DEFAULT_PHOTO;
  const ticketNumber = booking.payment?.sessionId || booking.ref;
  const departure = formatClock(booking.departTime);
  const qrData = JSON.stringify({
    ref: booking.ref,
    route: `${booking.origin?.code}-${booking.destination?.code}`,
    passenger: booking.name,
  });
  const flightLabel = String(booking.ref || "");

  return (
    <div
      id={id}
      className="bp-ticket relative mx-auto w-[430px] max-w-full overflow-hidden rounded-[26px] bg-white"
      style={{ fontFamily: FONT_STACK }}
    >
      {/* Print rules: hide the app and print only the dedicated pass clone. */}
      <style>{`
        .bp-print-root { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { background: #fff !important; }
          body > #root { display: none !important; }
          .bp-print-root { display: block !important; }
          .bp-ticket {
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            transform: none;
            zoom: 1.3;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .bp-ticket * {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      <header className="flex flex-col items-center px-6 pb-4 pt-6" style={{ backgroundColor: INK }}>
        <p className="text-[22px] font-extrabold italic leading-none tracking-[-0.03em] text-white">
          BOOKING<span style={{ color: GREEN }}>CART</span>
        </p>
        <p className="mt-2.5 text-[8.5px] font-semibold uppercase tracking-[0.4em] text-white/55">Compare · Book · Instant</p>
      </header>

      <section className="relative h-[258px] overflow-hidden" style={{ backgroundColor: INK }}>
        <img
          src={photo}
          alt=""
          onError={(event) => {
            if (event.currentTarget.src !== DEFAULT_PHOTO) event.currentTarget.src = DEFAULT_PHOTO;
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,12,11,0.45) 0%, rgba(10,12,11,0.06) 30%, rgba(10,12,11,0.45) 62%, rgba(10,12,11,0.86) 100%)",
          }}
        />
        <p className="absolute right-6 top-5 text-[16px] font-semibold tracking-tight text-white">
          Boarding <span style={{ color: GREEN }}>Pass</span>
        </p>
        <div className="absolute inset-x-6 bottom-6 grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)] items-end gap-2 text-white">
          <div className="min-w-0">
            <p className="text-[40px] font-extrabold leading-[0.88] tracking-[-0.02em]">{booking.origin?.code}</p>
            <p className="mt-2 text-[10px] font-medium leading-[1.15] text-white/80">{airportLine(booking.origin)}</p>
          </div>
          <div className="mb-7 flex items-center gap-1.5">
            <span className="h-0 flex-1 border-t border-dashed border-white/45" />
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 rotate-45 text-white" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z"
              />
            </svg>
            <span className="h-0 flex-1 border-t border-dashed border-white/45" />
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[40px] font-extrabold leading-[0.88] tracking-[-0.02em]">{booking.destination?.code}</p>
            <p className="ml-auto mt-2 text-[10px] font-medium leading-[1.15] text-white/80">{airportLine(booking.destination)}</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3 px-7 pb-7 pt-6" style={{ backgroundColor: INK }}>
        <BandField label="Flight" value={flightLabel} compact={flightLabel.length > 10} />
        <BandField label="Aircraft" value={booking.aircraftRegistration || booking.aircraftName || "Private jet"} />
        <BandField label="Cabin" value={`${booking.passengers || 1} PAX`} />
        <Notches side="bottom" />
      </section>

      <section className="relative z-10 px-7 pb-7 pt-7" style={{ backgroundColor: GREEN }}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
            <DetailField label="Passenger" value={booking.name || "Lead passenger"} />
            <DetailField label="Ticket no." value={ticketNumber} mono />
            <DetailField label="Boarding time" value={departure || "TBC"} />
            <DetailField label="Flight time" value={durationLabel(booking.quote?.durationMinutes || 0)} />
          </div>
          <TicketQr value={qrData} />
        </div>
        <Notches side="bottom" />
      </section>

      <footer className="relative px-7 pb-6 pt-6 text-white" style={{ backgroundColor: INK }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-extrabold uppercase leading-none tracking-[0.16em]" style={{ color: GREEN }}>
              Issued
            </p>
            <p className="mt-2 text-[11.5px] font-medium leading-tight text-white">{formatTicketDate(booking.createdAt)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-extrabold uppercase leading-none tracking-[0.16em]" style={{ color: GREEN }}>
              Departure
            </p>
            <p className="mt-2 text-[11.5px] font-medium leading-tight text-white">{formatTicketDate(booking.departDate)}</p>
            {departure && <p className="text-[11.5px] font-medium leading-tight text-white/60">{departure}</p>}
          </div>
        </div>
        <p className="mt-5 whitespace-nowrap border-t border-white/10 pt-3 text-[8px] font-semibold uppercase tracking-[0.2em] text-white/40">
          {booking.operatorName || "BookingCart"} · bookingcart.online
        </p>
      </footer>
    </div>
  );
}
