import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { aviationRequest, money, durationLabel } from "../lib/aviationClient.js";

const AVIATION_TICKET_PREVIEW = {
  ref: "BC989",
  status: "confirmed",
  name: "James Andrew",
  passengers: 1,
  departDate: "2026-09-21",
  createdAt: "2026-05-05T07:00:00.000Z",
  origin: { code: "EBB", name: "Entebbe International Airport" },
  destination: { code: "MRC", name: "Morocco International Airport" },
  aircraftName: "Montieri Private Jet",
  aircraftImage: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=85",
  quote: { durationMinutes: 40, distanceNm: 214, price: 6200, currency: "USD" },
  payment: { sessionId: "08839373t3e3526" },
};

function TicketQr({ value }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(value)}&bgcolor=171917&color=ffffff&format=svg&margin=5`;
  return <img src={src} alt="Booking QR code" width="112" height="112" className="rounded-[12px] bg-black p-1.5" />;
}

function formatTicketDate(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(',', '.').toUpperCase();
}

function AviationTicket({ booking }) {
  const qrData = JSON.stringify({ ref: booking.ref, route: `${booking.origin?.code}-${booking.destination?.code}`, passenger: booking.name });
  const ticketNumber = booking.payment?.sessionId || booking.ref;
  return <div id="aviation-ticket" className="relative mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] bg-white shadow-2xl" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
    <header className="flex h-[92px] flex-col items-center justify-center bg-[#292b28] px-8"><img src="/images/logo%20.png" alt="BookingCart" className="h-auto w-[245px] brightness-0 invert" /><p className="mt-1 text-[10px] font-medium tracking-[0.34em] text-white/75">Compare. Book. instant</p></header>
    <section className="relative h-[250px] overflow-hidden bg-slate-800">
      <img src={booking.aircraftImage || 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=85'} alt={booking.aircraftName || 'Private aircraft'} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />
      <p className="absolute right-6 top-5 text-[17px] font-black text-white">Boarding <span className="text-[#00dc58]">Pass</span></p>
      <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between text-white"><div><p className="text-[42px] font-black leading-none">{booking.origin?.code}</p><p className="mt-1 max-w-[120px] text-[10px] leading-[1.05]">{booking.origin?.name || booking.origin?.city}</p></div><i className="ph-fill ph-airplane-tilt mb-5 text-2xl" /><div className="text-right"><p className="text-[42px] font-black leading-none">{booking.destination?.code}</p><p className="mt-1 ml-auto max-w-[120px] text-[10px] leading-[1.05]">{booking.destination?.name || booking.destination?.city}</p></div></div>
    </section>
    <section className="relative grid grid-cols-3 gap-5 border-t-2 border-dashed border-[#00d454] bg-[#292b28] px-9 py-5 text-white before:absolute before:-left-5 before:-top-5 before:h-10 before:w-10 before:rounded-full before:bg-[#00bd49] after:absolute after:-right-5 after:-top-5 after:h-10 after:w-10 after:rounded-full after:bg-[#00bd49]"><div><p className="text-[12px] font-black text-[#00d454]">FLIGHT</p><p className="mt-1 text-[22px] font-light">{booking.ref?.slice(-6).toUpperCase()}</p></div><div><p className="text-[12px] font-black text-[#00d454]">GATE</p><p className="mt-1 text-[22px] font-light">VIP</p></div><div><p className="text-[12px] font-black text-[#00d454]">SEAT</p><p className="mt-1 text-[22px] font-light">{booking.passengers || 1} PAX</p></div></section>
    <section className="mx-4 rounded-b-[24px] bg-[#00c950] px-5 py-5 text-[#20231f]"><div className="grid grid-cols-2 gap-x-7 gap-y-5"><div><p className="text-[11px] font-black text-white">PASSENGER</p><p className="text-[18px] leading-tight">{booking.name || 'Lead passenger'}</p></div><div><p className="text-[11px] font-black text-white">TICKET NO:</p><p className="break-all text-[14px] leading-tight">{ticketNumber}</p></div><div><p className="text-[11px] font-black text-white">BOARDING TIME</p><p className="text-[16px]">07:00 AM</p></div><div><p className="text-[11px] font-black text-white">EST. FLIGHT TIME</p><p className="text-[16px]">{durationLabel(booking.quote?.durationMinutes || 0)}</p></div></div></section>
    <footer className="relative mt-3 flex min-h-[136px] items-center justify-between border-t-2 border-dashed border-[#00c950] px-8 py-5 before:absolute before:-left-5 before:-top-5 before:h-10 before:w-10 before:rounded-full before:bg-[#00bd49] after:absolute after:-right-5 after:-top-5 after:h-10 after:w-10 after:rounded-full after:bg-[#00bd49]"><div><p className="text-[11px] font-black text-[#00b846]">ISSUE DATE</p><p className="text-[14px] text-[#292b28]">{formatTicketDate(booking.createdAt?.slice(0, 10))}</p><p className="mt-4 text-[11px] font-black text-[#00b846]">BOARDING</p><p className="text-[14px] text-[#292b28]">07:00 AM {formatTicketDate(booking.departDate)}</p></div><TicketQr value={qrData} /></footer>
  </div>;
}

export default function AviationConfirmationPage() {
  const [params] = useSearchParams();
  const { getToken } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    document.title = "Charter confirmed | BookingCart";
    if (import.meta.env.DEV && params.get("preview") === "ticket") {
      setBooking(AVIATION_TICKET_PREVIEW);
      return;
    }
    const ref = params.get("ref");
    if (!ref) return;
    const email = sessionStorage.getItem(`aviation-booking-${ref}`) || "";
    const token = getToken();
    const finish = params.get("paid") === "1" && email
      ? aviationRequest("booking-confirm", { method: "POST", body: { ref, email, method: "card", sessionId: params.get("session_id") || "" } })
      : Promise.resolve();
    finish
      .catch((err) => setError(err.message || "Payment could not be confirmed"))
      .then(() => aviationRequest("booking", { token, query: { ref, email } }))
      .then((data) => setBooking(data.booking))
      .catch((err) => setError(err.message));
  }, [params, getToken]);

  async function downloadTicket() {
    setDownloading(true);
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
      }
      const canvas = await window.html2canvas(document.getElementById('aviation-ticket'), { scale: 3, useCORS: true, backgroundColor: null });
      const link = document.createElement('a'); link.download = `boarding-pass-${booking.ref}.png`; link.href = canvas.toDataURL('image/png'); link.click();
    } catch {
      setError('Could not download the boarding pass. Please try printing it instead.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AviationLayout>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {/* Success animation */}
        <div className="text-center mb-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
            <i className="ph ph-airplane-takeoff text-4xl text-emerald-700" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{booking?.status === 'confirmed' ? 'Charter confirmed' : 'Booking received'}</p>
          <h1 className="mt-2 text-4xl font-black">{booking ? booking.ref : "Booking received"}</h1>
          {!booking && !error && <p className="mt-3 text-slate-500">Loading your booking details…</p>}
        </div>

        {error && (
          <div className="rounded-3xl bg-rose-50 border border-rose-200 p-5 mb-6 text-center">
            <i className="ph ph-warning-circle text-2xl text-rose-500 mb-2" />
            <p className="font-bold text-rose-700">{error}</p>
          </div>
        )}

        {booking && booking.status !== "confirmed" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900"><h2 className="text-xl font-black">Payment still required</h2><p className="mt-2 text-sm">Your request is saved, but a boarding pass will only be issued after payment is verified.</p></div>
        )}

        {booking && booking.status === "confirmed" && (
          <>
            <AviationTicket booking={booking} />
            <div className="mx-auto mb-8 mt-4 flex max-w-[430px] gap-3"><button onClick={downloadTicket} disabled={downloading} className="flex-1 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60"><i className="ph ph-download-simple mr-2" />{downloading ? 'Preparing…' : 'Download boarding pass'}</button><button onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-3 text-white" aria-label="Print boarding pass"><i className="ph ph-printer text-xl" /></button></div>
            {/* Booking card */}
            <div className="rounded-3xl bg-slate-950 text-white p-6 shadow-2xl mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Reference</p>
                  <p className="text-2xl font-black mt-0.5">{booking.ref}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-black ${booking.status === "confirmed" ? "bg-emerald-600" : "bg-amber-600"}`}>
                  {booking.status?.replaceAll("_", " ")}
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Route</p>
                  <p className="font-black">{booking.origin?.code} <i className="ph ph-arrow-right" /> {booking.destination?.code}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{booking.departDate}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Aircraft</p>
                  <p className="font-black">{booking.aircraftName}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{booking.operatorName}</p>
                </div>
                {booking.quote && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Charter price</p>
                    <p className="text-2xl font-black text-emerald-300">{money(booking.quote.price, booking.quote.currency)}</p>
                  </div>
                )}
                {booking.quote?.durationMinutes && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Flight time</p>
                    <p className="font-black">{durationLabel(booking.quote.durationMinutes)}</p>
                    <p className="text-sm text-slate-400 mt-0.5">{booking.quote.distanceNm} nm</p>
                  </div>
                )}
              </div>
            </div>

            {/* What happens next */}
            <div className="rounded-3xl bg-white border border-slate-100 p-6 mb-6 dark:bg-slate-900 dark:border-slate-800">
              <h2 className="font-black mb-4">What happens next</h2>
              <div className="space-y-4">
                {[
                  { icon: "ph-user-check", text: "The operator will assign a qualified captain and co-pilot to your flight.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
                  { icon: "ph-file-text", text: "Flight documents and crew manifest will be issued 24 hours before departure.", color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40" },
                  { icon: "ph-car", text: "If you requested ground transport, your coordinator will confirm pick-up details.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
                  { icon: "ph-envelope", text: "A full itinerary confirmation will be sent to your email address.", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40" },
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`h-9 w-9 shrink-0 rounded-xl ${step.color} flex items-center justify-center`}>
                      <i className={`ph ${step.icon} text-base`} />
                    </div>
                    <p className="text-sm leading-relaxed pt-1">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Upsell CTA */}
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 mb-6 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <i className="ph ph-map-trifold text-2xl text-emerald-700 mt-0.5" />
                <div>
                  <p className="font-black">Build your full safari itinerary</p>
                  <p className="text-sm text-emerald-700 mt-1 dark:text-emerald-400">Add a helicopter scenic tour, luxury lodge, national park entry, and safari transfer to this booking. All under one checkout.</p>
                  <Link to="/aviation/itinerary" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white hover:bg-emerald-800 transition-colors">
                    <i className="ph ph-map-trifold text-sm" />
                    Build full itinerary
                  </Link>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to="/my-bookings" className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold dark:border-slate-700">
                <i className="ph ph-ticket text-base" />
                My bookings
              </Link>
              <Link to="/aviation" className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold dark:border-slate-700">
                <i className="ph ph-airplane-tilt text-base" />
                Book another flight
              </Link>
              <Link to="/aviation/charter" className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 transition-colors">
                <i className="ph ph-paper-plane-tilt text-base" />
                Request a charter
              </Link>
            </div>
          </>
        )}
      </section>
    </AviationLayout>
  );
}
