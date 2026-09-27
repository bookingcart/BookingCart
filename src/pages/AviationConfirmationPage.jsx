import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, money } from "../lib/aviationClient.js";

export default function AviationConfirmationPage() {
  const [params] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Charter confirmed | BookingCart";
    const ref = params.get("ref");
    if (!ref) return;
    const email = sessionStorage.getItem(`aviation-booking-${ref}`) || "";
    const finish = params.get("paid") === "1" && email
      ? aviationRequest("booking-confirm", { method: "POST", body: { ref, email, method: "card", sessionId: params.get("session_id") || "" } })
      : Promise.resolve();
    finish
      .catch(() => {})
      .then(() => aviationRequest("booking", { query: { ref } }))
      .then((data) => setBooking(data.booking))
      .catch((err) => setError(err.message));
  }, [params]);

  return (
    <AviationLayout>
      <section className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Booking received</p>
        <h1 className="mt-2 text-4xl font-black">{booking ? booking.ref : "Charter reservation"}</h1>
        {error && <p className="mt-4 text-rose-600">{error}</p>}
        {booking && (
          <div className="mt-6 rounded-3xl bg-white p-6 dark:bg-slate-900">
            <p className="text-sm text-slate-500">{booking.origin.code} → {booking.destination.code} · {booking.departDate}</p>
            <p className="mt-2 text-2xl font-black">{booking.aircraftName}</p>
            <p className="mt-2 font-semibold">{money(booking.quote.price, booking.quote.currency)} · {booking.status.replaceAll("_", " ")}</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">Operator {booking.operatorName} will assign crew and issue the flight documents. You can add a lodge, scenic helicopter, park tickets, and safari transfer to the same itinerary.</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold">
              <a href="/aviation/itinerary" className="rounded-full bg-emerald-700 px-4 py-2 text-white">Build the full itinerary</a>
              <a href="/my-bookings" className="rounded-full border px-4 py-2">My bookings</a>
            </div>
          </div>
        )}
      </section>
    </AviationLayout>
  );
}
