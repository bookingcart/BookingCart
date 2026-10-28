import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, categoryLabel, durationLabel, money, searchQuery, stripeCheckoutOutcome } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const STEPS = ["Route", "Aircraft", "Review & pay"];

function formatDate(value) {
  if (!value) return "Date to be confirmed";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Some accounts only store their email, which should never prefill "Full name".
function personName(user) {
  const name = String(user?.name || "").trim();
  return name && !/^[^@\s]+@[^@\s]+$/.test(name) ? name : "";
}

export default function AviationCheckoutPage() {
  const [params] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({ name: personName(user), email: user?.email || "", phone: "" });
  const [departTime, setDepartTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("card");
  const [accepted, setAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const query = Object.fromEntries(params.entries());
  const aircraftId = params.get("aircraft") || "";
  const backToAircraft = `/aviation/aircraft/${aircraftId}${searchQuery(query)}`;

  useEffect(() => {
    document.title = "Review & pay | BookingCart Aviation";
    setLoading(true);
    aviationRequest("search", { query })
      .then((data) => {
        setQuote(data.results.find((item) => item.aircraft.id === aircraftId) || null);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => {
    // Keep contact details in sync once the session resolves after a refresh.
    setContact((current) => ({
      name: current.name || personName(user),
      email: current.email || user?.email || "",
      phone: current.phone,
    }));
  }, [user?.name, user?.email]);

  const fare = quote?.quote;
  const lines = useMemo(() => {
    if (!fare) return [];
    const breakdown = fare.breakdown || {};
    const rows = [
      { label: `Aircraft time · ${fare.flightHours}h`, value: breakdown.aircraftTime ?? fare.price },
      { label: "Landing & handling", value: breakdown.landingFees || 0 },
      { label: "International surcharge", value: breakdown.internationalSurcharge || 0 },
      { label: "Pet handling", value: breakdown.petFee || 0 },
      { label: "Overnight crew", value: breakdown.overnightFee || 0 },
    ].filter((row) => row.value > 0);
    const summed = rows.reduce((total, row) => total + row.value, 0);
    if (summed !== fare.price) rows.unshift({ label: "Charter subtotal", value: fare.price });
    return rows;
  }, [fare]);

  function validate() {
    const next = {};
    if (contact.name.trim().length < 2) next.name = "Enter the lead passenger's full name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) next.email = "Enter an email we can send the charter documents to";
    const digits = contact.phone.replace(/[^\d]/g, "");
    if (digits.length < 7) next.phone = "Enter a phone number the operator can reach you on";
    if (!accepted) next.terms = "Accept the charter terms to continue";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function book(event) {
    event.preventDefault();
    if (!quote || busy) return;
    setError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const created = await aviationRequest("booking-create", {
        method: "POST",
        body: {
          name: contact.name.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          departTime,
          notes: notes.trim(),
          aircraftId: quote.aircraft.id,
          origin: params.get("origin"),
          destination: params.get("destination"),
          departDate: params.get("departDate"),
          returnDate: params.get("returnDate"),
          tripType: params.get("tripType"),
          passengers: params.get("passengers"),
        },
      });
      const ref = created.booking.ref;
      const email = contact.email.trim().toLowerCase();
      // sessionStorage covers the redirect; localStorage survives a tab reload or a later visit.
      sessionStorage.setItem(`aviation-booking-${ref}`, email);
      localStorage.setItem(`aviation-booking-${ref}`, email);

      if (method === "card") {
        const response = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents: created.booking.quote.price * 100,
            currency: "usd",
            description: `Private charter ${ref}`,
            bookingRef: ref,
            customerEmail: email,
            paymentPurpose: "aviation",
            successPath: `/aviation/confirmation?ref=${ref}&paid=1`,
            cancelPath: `/aviation/checkout?${params.toString()}`,
          }),
        });
        const session = await response.json().catch(() => ({}));
        const outcome = stripeCheckoutOutcome({ ok: response.ok, status: response.status, url: session.url, error: session.error });
        if (outcome.action === "redirect") {
          window.location.href = outcome.url;
          return;
        }
        if (outcome.action === "error") throw new Error(outcome.error);
        // Stripe is not configured in this environment — fall back to the invoice flow.
      }

      await aviationRequest("booking-confirm", { method: "POST", body: { ref, email, method: "invoice" } });
      window.location.href = `/aviation/confirmation?ref=${ref}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AviationLayout>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {/* Progress */}
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold">
          {STEPS.map((label, index) => {
            const state = index < STEPS.length - 1 ? "done" : "current";
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
                    state === "done" ? "bg-emerald-600 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  }`}
                  aria-hidden="true"
                >
                  {state === "done" ? <i className="ph ph-check text-xs" /> : index + 1}
                </span>
                <span className={state === "done" ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"} aria-current={state === "current" ? "step" : undefined}>
                  {label}
                </span>
                {index < STEPS.length - 1 && <i className="ph ph-caret-right text-slate-300 dark:text-slate-600" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── FORM ── */}
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Review &amp; confirm</h1>
            <p className="mt-2 max-w-prose text-sm text-slate-500 dark:text-slate-400">
              Check your charter details and add the lead passenger's contact information. The operator confirms departure slots and crew once the booking is accepted.
            </p>

            {!isAuthenticated && (
              <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                <i className="ph ph-lock-key mt-0.5 text-lg text-amber-700 dark:text-amber-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-black text-amber-900 dark:text-amber-200">Sign in required to complete this booking</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">Your charter and boarding pass are tied to your account so you can retrieve them later. You can fill in the passenger details now.</p>
                </div>
              </div>
            )}

            {/* Trip summary */}
            <section aria-labelledby="trip-heading" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h2 id="trip-heading" className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Your charter</h2>
                {aircraftId && (
                  <Link to={backToAircraft} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400">
                    Change aircraft
                  </Link>
                )}
              </div>

              {loading ? (
                <div className="space-y-3 p-5">
                  <div className="h-5 w-2/3 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : !quote ? (
                <div className="p-5">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">This charter is no longer available.</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The aircraft may have been booked or suspended since you searched.</p>
                  <Link to={`/aviation/results${searchQuery({ ...query, aircraft: undefined })}`} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-800">
                    <i className="ph ph-arrow-left text-sm" aria-hidden="true" />
                    Back to results
                  </Link>
                </div>
              ) : (
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">{categoryLabel(quote.aircraft.category)}</p>
                      <p className="mt-1 text-xl font-black leading-tight">{quote.aircraft.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {quote.aircraft.manufacturer} {quote.aircraft.model} · {quote.aircraft.registration}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black tabular-nums">{money(quote.quote.price, quote.quote.currency)}</p>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{durationLabel(quote.quote.durationMinutes)} airborne</p>
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                    {[
                      ["From", quote.origin?.code, quote.origin?.city],
                      ["To", quote.destination?.code, quote.destination?.city],
                      ["Date", formatDate(params.get("departDate")), params.get("tripType") === "round" ? `Returns ${formatDate(params.get("returnDate"))}` : "One way"],
                      ["Passengers", `${params.get("passengers") || 1}`, `Operated by ${quote.aircraft.operatorName}`],
                    ].map(([label, value, hint]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                        <dd className="mt-0.5 truncate font-black">{value}</dd>
                        <dd className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>

            {/* Passenger details */}
            <form onSubmit={book} noValidate className="mt-6 space-y-6">
              <fieldset disabled={busy} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <legend className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Lead passenger</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" id="av-name" error={fieldErrors.name} className="sm:col-span-2">
                    <input
                      id="av-name"
                      name="name"
                      autoComplete="name"
                      value={contact.name}
                      onChange={(event) => setContact({ ...contact, name: event.target.value })}
                      aria-invalid={Boolean(fieldErrors.name)}
                      className={inputClass(fieldErrors.name)}
                      placeholder="As printed on the passenger's ID"
                    />
                  </Field>
                  <Field label="Email" id="av-email" error={fieldErrors.email}>
                    <input
                      id="av-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={contact.email}
                      onChange={(event) => setContact({ ...contact, email: event.target.value })}
                      aria-invalid={Boolean(fieldErrors.email)}
                      className={inputClass(fieldErrors.email)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field label="Phone" id="av-phone" error={fieldErrors.phone} hint="Used by the operator for crew and slot updates.">
                    <input
                      id="av-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={contact.phone}
                      onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      className={inputClass(fieldErrors.phone)}
                      placeholder="+256 700 000 000"
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Preferred departure time" id="av-time" hint="The operator confirms the final slot after booking.">
                    <input
                      id="av-time"
                      name="departTime"
                      type="time"
                      value={departTime}
                      onChange={(event) => setDepartTime(event.target.value)}
                      className={inputClass()}
                    />
                  </Field>
                  <Field label="Notes for the operator" id="av-notes" hint="Catering, pets, ground transfer — anything the crew should know.">
                    <textarea
                      id="av-notes"
                      name="notes"
                      rows={2}
                      maxLength={600}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={inputClass()}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </fieldset>

              {/* Payment method */}
              <fieldset disabled={busy} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <legend className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Payment</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    { id: "card", icon: "ph-credit-card", title: "Pay by card", text: "Secure Stripe checkout. Confirmation is instant." },
                    { id: "invoice", icon: "ph-receipt", title: "Request an invoice", text: "Pay by bank transfer within the invoice terms." },
                  ].map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                        method === option.id
                          ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 dark:border-emerald-500 dark:bg-emerald-950/30 dark:ring-emerald-500"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                      }`}
                    >
                      <input type="radio" name="method" value={option.id} checked={method === option.id} onChange={() => setMethod(option.id)} className="mt-1 h-4 w-4 accent-emerald-600" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-black">
                          <i className={`ph ${option.icon} text-base text-slate-500 dark:text-slate-400`} aria-hidden="true" />
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{option.text}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="mt-4 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded accent-emerald-600"
                  />
                  <span>
                    I accept the <Link to="/terms" className="font-bold text-emerald-700 hover:underline dark:text-emerald-400">charter terms</Link> and the operator's cancellation policy.
                    {fieldErrors.terms && <span role="alert" className="mt-1 block font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.terms}</span>}
                  </span>
                </label>
              </fieldset>

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <i className="ph ph-warning-circle mt-0.5 text-base" aria-hidden="true" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link to={backToAircraft} className="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                  <i className="ph ph-arrow-left text-sm" aria-hidden="true" />
                  Back to aircraft
                </Link>
                {isAuthenticated ? (
                  <button
                    type="submit"
                    disabled={busy || !quote || loading}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-700/20 transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <i className="ph ph-circle-notch animate-spin text-base" aria-hidden="true" />
                        {method === "card" ? "Opening secure payment…" : "Creating invoice…"}
                      </>
                    ) : (
                      <>
                        {method === "card" ? `Pay ${fare ? money(fare.price, fare.currency) : ""} by card` : "Request invoice"}
                        <i className="ph ph-arrow-right text-sm" aria-hidden="true" />
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    to={`/auth?redirect=${encodeURIComponent(`/aviation/checkout?${params.toString()}`)}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-700/20 transition-colors hover:bg-emerald-800"
                  >
                    Sign in to book
                    <i className="ph ph-arrow-right text-sm" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </form>
          </div>

          {/* ── PRICE SUMMARY ── */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Fare summary</h2>
              </div>

              {loading ? (
                <div className="space-y-2 p-5">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : quote ? (
                <div className="p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{quote.origin?.code} → {quote.destination?.code}</span>
                    <span className="font-bold tabular-nums">{quote.quote.distanceNm} nm</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{formatDate(params.get("departDate"))}</span>
                    <span className="font-bold tabular-nums">{formatTime(departTime) || "Time TBC"}</span>
                  </div>

                  <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                    {lines.map((line) => (
                      <div key={line.label} className="flex items-start justify-between gap-3">
                        <dt className="text-slate-600 dark:text-slate-300">{line.label}</dt>
                        <dd className="font-semibold tabular-nums">{money(line.value, quote.quote.currency)}</dd>
                      </div>
                    ))}
                    {quote.quote.positioningNm > 0 && (
                      <p className="flex items-start gap-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">
                        <i className="ph ph-info mt-0.5 text-sm shrink-0" aria-hidden="true" />
                        Includes {quote.quote.positioningNm} nm positioning from {quote.aircraft.baseAirport}.
                      </p>
                    )}
                  </dl>

                  <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Total</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">No hidden fees — this quote is the total</p>
                    </div>
                    <p className="text-2xl font-black tabular-nums">{money(quote.quote.price, quote.quote.currency)}</p>
                  </div>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500 dark:text-slate-400">Fare unavailable.</p>
              )}

              <ul className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                {[
                  "AOC-verified operator with a complete safety file",
                  "Captain, co-pilot and cabin crew included",
                  "No card fees or hidden booking charges",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <i className="ph ph-check-circle mt-0.5 text-sm text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-3 flex items-start gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
              <i className="ph ph-lifebuoy mt-0.5 text-sm shrink-0" aria-hidden="true" />
              Questions before you pay? <Link to="/support" className="font-bold text-emerald-700 hover:underline dark:text-emerald-400">Talk to a charter specialist</Link>
            </p>

            {quote && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                  {quote.aircraft.images?.[0] ? (
                    <img src={quote.aircraft.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <i className="ph ph-airplane-tilt text-xl text-slate-400" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black">{quote.aircraft.name}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{quote.aircraft.operatorName} · base {quote.aircraft.baseAirport}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{quote.aircraft.passengers} seats · {Number(quote.aircraft.rangeNm || 0).toLocaleString()} nm range</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AviationLayout>
  );
}

function inputClass(error) {
  return `mt-1 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${
    error
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/30 dark:border-rose-700"
      : "border-slate-200 focus:border-emerald-600 focus:ring-emerald-600/25 dark:border-slate-700"
  }`;
}

function Field({ label, id, error, hint, className = "", children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
