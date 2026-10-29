import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, Link } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import BoardingPass from "../components/aviation/BoardingPass.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { aviationRequest, money, durationLabel } from "../lib/aviationClient.js";

const AVIATION_TICKET_PREVIEW = {
  ref: "BC989",
  status: "confirmed",
  name: "James Andrew",
  passengers: 1,
  departDate: "2026-09-21",
  departTime: "09:30",
  createdAt: "2026-05-05T07:00:00.000Z",
  origin: { code: "EBB", name: "Entebbe International Airport" },
  destination: { code: "MRC", name: "Morocco International Airport" },
  aircraftName: "Montieri Private Jet",
  aircraftRegistration: "5X-MTJ",
  operatorName: "Montieri Aviation",
  aircraftImage: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=1200&q=85",
  quote: { durationMinutes: 40, distanceNm: 214, price: 6200, currency: "USD" },
  payment: { sessionId: "08839373t3e3526" },
};

const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.26em]";
const CARD = "rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";
const MICRO = "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

function formatClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(display).padStart(2, "0")}:${match[2]} ${suffix}`;
}

// The pass is captured as a PNG, so fonts and images must be settled first.
async function waitForTicketAssets(node) {
  if (!node) return;
  const images = [...node.querySelectorAll("img")].filter((img) => !img.complete);
  await Promise.all([
    document.fonts?.ready,
    ...images.map(
      (img) =>
        new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })
    ),
  ]);
}

const NEXT_STEPS = [
  { icon: "ph-user-check", text: "The operator will assign a qualified captain and co-pilot to your flight." },
  { icon: "ph-file-text", text: "Flight documents and the crew manifest are issued 24 hours before departure." },
  { icon: "ph-car", text: "If you requested ground transport, your coordinator will confirm pick-up details." },
  { icon: "ph-envelope", text: "A full itinerary confirmation is sent to the email on this booking." },
];

export default function AviationConfirmationPage() {
  const [params] = useSearchParams();
  const { getToken } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [emailEntry, setEmailEntry] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);

  const ref = params.get("ref") || "";

  async function loadBooking(email) {
    const token = getToken();
    const paid = params.get("paid") === "1";
    if (paid) {
      await aviationRequest("booking-confirm", { method: "POST", body: { ref, email, method: "card", sessionId: params.get("session_id") || "" } })
        .catch((err) => setError(err.message || "Payment could not be confirmed"));
    }
    const data = await aviationRequest("booking", { token, query: { ref, email } });
    setBooking(data.booking);
    setNeedsEmail(false);
  }

  useEffect(() => {
    document.title = "Charter confirmed | BookingCart";
    if (import.meta.env.DEV && params.get("preview") === "ticket") {
      setBooking(AVIATION_TICKET_PREVIEW);
      return;
    }
    if (!ref) return;
    // The email is cached on redirect; fall back to localStorage so a reload or a later visit still works.
    const email = sessionStorage.getItem(`aviation-booking-${ref}`) || localStorage.getItem(`aviation-booking-${ref}`) || "";
    if (!email) {
      setNeedsEmail(true);
      return;
    }
    loadBooking(email).catch((err) => {
      if (err.status === 403 || err.status === 401) {
        setNeedsEmail(true);
        return;
      }
      setError(err.message);
    });
  }, [params, getToken]);

  async function submitEmail(event) {
    event.preventDefault();
    const email = emailEntry.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Enter the email address used for this booking");
      return;
    }
    setError("");
    try {
      await loadBooking(email);
      localStorage.setItem(`aviation-booking-${ref}`, email);
    } catch (err) {
      setError(err.status === 403 || err.status === 404 ? "We could not match that email to this booking reference." : err.message);
    }
  }

  async function downloadTicket() {
    const node = document.getElementById("aviation-ticket");
    if (!node) {
      setNotice("The boarding pass is still loading. Please try again in a moment.");
      return;
    }
    setDownloading(true);
    setNotice("");
    try {
      await waitForTicketAssets(node);
      // html2canvas-pro understands Tailwind's oklch() colours; the original build throws on them.
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("the image could not be generated");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `boarding-pass-${booking?.ref || "booking"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setNotice(
        `We could not download the boarding pass (${err.message || "unknown error"}). Use Print, then choose “Save as PDF”.`
      );
    } finally {
      setDownloading(false);
    }
  }

  const departure = formatClock(booking?.departTime);
  const confirmed = booking?.status === "confirmed";

  return (
    <AviationLayout>
      <section className="relative isolate overflow-hidden bg-slate-950">
        <div className="absolute -left-32 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/95 to-slate-900" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6">
          <p className={`${EYEBROW} text-emerald-400`}>{confirmed ? "Charter confirmed" : "Booking received"}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-white tabular-nums sm:text-4xl">
                {booking?.ref || ref || "Your booking"}
              </h1>
              <p className="mt-2 max-w-md text-[12px] leading-relaxed text-white/55">
                Keep this reference for check-in, amendments and support. Your boarding pass is issued in the operator’s name.
              </p>
            </div>
            {booking && (
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white backdrop-blur-sm">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">Route</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {booking.origin?.code}
                    <span className="mx-1.5 text-white/35">→</span>
                    {booking.destination?.code}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    confirmed ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30" : "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30"
                  }`}
                >
                  {booking.status?.replaceAll("_", " ")}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className={`relative z-10 grid gap-6 lg:items-start ${booking ? "lg:grid-cols-[minmax(0,452px)_minmax(0,1fr)]" : ""}`}>
          <div className={`-mt-10 min-w-0 space-y-4 ${booking ? "" : "mx-auto w-full max-w-md"}`}>
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30" role="alert">
                <p className="flex items-start gap-2 text-[13px] font-semibold text-rose-700 dark:text-rose-300">
                  <i className="ph ph-warning-circle mt-0.5 text-base" aria-hidden="true" />
                  {error}
                </p>
              </div>
            )}

            {needsEmail && !booking && (
              <form onSubmit={submitEmail} className={CARD}>
                <div className="flex items-center gap-2.5">
                  <i className="ph ph-envelope-simple text-lg text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Open this boarding pass</h2>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                  For privacy we only show a charter to the email that booked it. Enter that address to continue.
                </p>
                <label htmlFor="av-confirm-email" className={`mt-4 block ${MICRO}`}>
                  Email used for this booking
                </label>
                <input
                  id="av-confirm-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={emailEntry}
                  onChange={(event) => setEmailEntry(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="submit"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  View boarding pass
                  <i className="ph ph-arrow-right text-sm" aria-hidden="true" />
                </button>
              </form>
            )}

            {!booking && !needsEmail && !error && (
              <div className={`${CARD} flex items-center gap-3`}>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600 dark:border-slate-700 dark:border-t-emerald-400" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading your booking details…</p>
              </div>
            )}

            {booking && !confirmed && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <i className="ph ph-hourglass-medium text-lg" aria-hidden="true" />
                  Payment still required
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                  Your request is saved, but a boarding pass is only issued after payment is verified.
                </p>
              </div>
            )}

            {confirmed && (
              <>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-[0_30px_70px_-45px_rgba(2,6,23,0.7)] dark:border-slate-800">
                  <BoardingPass booking={booking} />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={downloadTicket}
                    disabled={downloading}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-progress disabled:opacity-60"
                  >
                    {downloading ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                        Preparing…
                      </>
                    ) : (
                      <>
                        <i className="ph ph-download-simple text-base" aria-hidden="true" />
                        Download boarding pass
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <i className="ph ph-printer text-base" aria-hidden="true" />
                    Print
                  </button>
                </div>

                {notice && (
                  <p
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200"
                  >
                    {notice}
                  </p>
                )}

                <p className="px-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Printing? Turn on “Background graphics” in the print dialog so the pass keeps its colours.
                </p>
              </>
            )}
          </div>

          {booking && (
            <div className="min-w-0 space-y-4 lg:mt-2">
              <div className={CARD}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Trip summary</h2>
                  <Link to="/my-bookings" className="text-[12px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                    My bookings
                  </Link>
                </div>
                <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className={MICRO}>Route</dt>
                    <dd className="mt-1 text-[13px] font-semibold text-slate-900 tabular-nums dark:text-white">
                      {booking.origin?.code} <span className="text-slate-400">→</span> {booking.destination?.code}
                    </dd>
                    <dd className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                      {booking.departDate}
                      {departure ? ` · departs ${departure}` : " · time to be confirmed"}
                    </dd>
                  </div>
                  <div>
                    <dt className={MICRO}>Aircraft</dt>
                    <dd className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-white">{booking.aircraftName}</dd>
                    <dd className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                      {booking.operatorName || booking.aircraftRegistration || "Operator assigned"}
                    </dd>
                  </div>
                  <div>
                    <dt className={MICRO}>Passengers</dt>
                    <dd className="mt-1 text-[13px] font-semibold text-slate-900 tabular-nums dark:text-white">{booking.passengers || 1}</dd>
                  </div>
                  {booking.quote?.durationMinutes ? (
                    <div>
                      <dt className={MICRO}>Flight time</dt>
                      <dd className="mt-1 text-[13px] font-semibold text-slate-900 tabular-nums dark:text-white">
                        {durationLabel(booking.quote.durationMinutes)}
                      </dd>
                      {booking.quote.distanceNm ? (
                        <dd className="mt-0.5 text-[12px] text-slate-500 tabular-nums dark:text-slate-400">{booking.quote.distanceNm} nm</dd>
                      ) : null}
                    </div>
                  ) : null}
                </dl>
                {booking.quote && (
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <p className={MICRO}>Charter price</p>
                    <p className="text-lg font-semibold text-slate-900 tabular-nums dark:text-white">
                      {money(booking.quote.price, booking.quote.currency)}
                    </p>
                  </div>
                )}
              </div>

              <div className={CARD}>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What happens next</h2>
                <ul className="mt-4 space-y-3.5">
                  {NEXT_STEPS.map((step) => (
                    <li key={step.icon} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <i className={`ph ${step.icon} text-[15px]`} aria-hidden="true" />
                      </span>
                      <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">{step.text}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-slate-950 p-6 text-white ring-1 ring-white/10">
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">
                  <i className="ph ph-map-trifold text-sm" aria-hidden="true" />
                  Complete the trip
                </p>
                <h2 className="mt-2 text-base font-semibold">Build your full safari itinerary</h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/60">
                  Add a scenic helicopter tour, a luxury lodge, park entry and a safari transfer to this charter — all on one checkout.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    to="/aviation/itinerary"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-[12px] font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                  >
                    <i className="ph ph-map-trifold text-sm" aria-hidden="true" />
                    Build itinerary
                  </Link>
                  <Link
                    to="/aviation"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    <i className="ph ph-airplane-tilt text-sm" aria-hidden="true" />
                    Book another flight
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmed &&
        createPortal(
          <div className="bp-print-root">
            <BoardingPass booking={booking} id="aviation-ticket-print" />
          </div>,
          document.body
        )}
    </AviationLayout>
  );
}
