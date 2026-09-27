import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, durationLabel, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AviationCheckoutPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [quote, setQuote] = useState(null);
  const [contact, setContact] = useState({ name: user?.name || "", email: user?.email || "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Charter checkout | BookingCart";
    aviationRequest("search", { query: Object.fromEntries(params.entries()) })
      .then((data) => setQuote(data.results.find((item) => item.aircraft.id === params.get("aircraft")) || null))
      .catch((err) => setError(err.message));
  }, [params]);

  async function book(method) {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      const created = await aviationRequest("booking-create", {
        method: "POST",
        body: {
          ...contact,
          aircraftId: quote.aircraft.id,
          origin: params.get("origin"),
          destination: params.get("destination"),
          departDate: params.get("departDate"),
          returnDate: params.get("returnDate"),
          tripType: params.get("tripType"),
          passengers: params.get("passengers"),
        },
      });
      sessionStorage.setItem(`aviation-booking-${created.booking.ref}`, contact.email);
      if (method === "card") {
        const response = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents: created.booking.quote.price * 100,
            currency: "usd",
            description: `Private charter ${created.booking.ref}`,
            bookingRef: created.booking.ref,
            customerEmail: contact.email,
            paymentPurpose: "aviation",
            successPath: `/aviation/confirmation?ref=${created.booking.ref}&paid=1`,
            cancelPath: `/aviation/checkout?${params.toString()}`,
          }),
        });
        const session = await response.json();
        if (!response.ok || !session.url) {
          throw new Error(session.error || "Card checkout could not be started");
        }
        window.location.href = session.url;
        return;
      }
      await aviationRequest("booking-confirm", { method: "POST", body: { ref: created.booking.ref, email: contact.email, method: "invoice" } });
      window.location.href = `/aviation/confirmation?ref=${created.booking.ref}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AviationLayout>
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Step 4 · Payment</p>
          <h1 className="mt-2 text-4xl font-black">Confirm the charter</h1>
          <div className="mt-6 space-y-3">
            {["name", "email", "phone"].map((field) => (
              <label key={field} className="block text-xs font-bold uppercase text-slate-500">
                {field}
                <input className="mt-1 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold normal-case dark:bg-slate-900" value={contact[field]} onChange={(event) => setContact({ ...contact, [field]: event.target.value })} />
              </label>
            ))}
          </div>
          {error && <p className="mt-4 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button disabled={busy || !quote} onClick={() => book("card")} className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Pay now</button>
            <button disabled={busy || !quote} onClick={() => book("invoice")} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black disabled:opacity-50">Request invoice</button>
          </div>
        </section>
        <aside className="rounded-3xl bg-white p-6 dark:bg-slate-900">
          {quote ? (
            <>
              <h2 className="text-2xl font-black">{quote.aircraft.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{quote.origin.code} → {quote.destination.code} · {durationLabel(quote.quote.durationMinutes)}</p>
              <p className="mt-4 text-3xl font-black">{money(quote.quote.price, quote.quote.currency)}</p>
              <p className="mt-2 text-sm text-slate-500">{quote.aircraft.operatorName}. Safety file published as {quote.aircraft.safety?.regulatoryStatus}.</p>
            </>
          ) : <p>Loading quote…</p>}
          <Link to="/aviation/itinerary" className="mt-6 inline-block text-sm font-bold text-emerald-800">Add lodge, park tickets, and ground transfer</Link>
        </aside>
      </div>
    </AviationLayout>
  );
}
