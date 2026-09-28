import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { aviationRequest, money, durationLabel } from "../lib/aviationClient.js";

export default function AviationConfirmationPage() {
  const [params] = useSearchParams();
  const { getToken } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Charter confirmed | BookingCart";
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

  return (
    <AviationLayout>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {/* Success animation */}
        <div className="text-center mb-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
            <i className="ph ph-airplane-takeoff text-4xl text-emerald-700" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Charter confirmed</p>
          <h1 className="mt-2 text-4xl font-black">{booking ? booking.ref : "Booking received"}</h1>
          {!booking && !error && <p className="mt-3 text-slate-500">Loading your booking details…</p>}
        </div>

        {error && (
          <div className="rounded-3xl bg-rose-50 border border-rose-200 p-5 mb-6 text-center">
            <i className="ph ph-warning-circle text-2xl text-rose-500 mb-2" />
            <p className="font-bold text-rose-700">{error}</p>
          </div>
        )}

        {booking && (
          <>
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
