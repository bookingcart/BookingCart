import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { AMENITY_LABELS, aviationRequest, categoryLabel, durationLabel, money, searchQuery } from "../lib/aviationClient.js";

export default function AviationDetailsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [aircraft, setAircraft] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Aircraft details | BookingCart";
    aviationRequest("aircraft", { query: { id } })
      .then((data) => setAircraft(data.aircraft))
      .catch((err) => setError(err.message));
    if (params.get("origin") && params.get("destination")) {
      aviationRequest("search", { query: Object.fromEntries(params.entries()) })
        .then((data) => setQuote(data.results.find((item) => item.aircraft.id === id)?.quote || null))
        .catch(() => setQuote(null));
    }
  }, [id, params]);

  if (error) return <AviationLayout><p className="mx-auto max-w-3xl px-4 py-16">{error}</p></AviationLayout>;
  if (!aircraft) return <AviationLayout><p className="mx-auto max-w-3xl px-4 py-16">Loading aircraft…</p></AviationLayout>;

  const checkout = `/aviation/checkout${searchQuery({ ...Object.fromEntries(params.entries()), aircraft: id })}`;
  const specs = [
    ["Registration", aircraft.registration],
    ["Year", aircraft.year],
    ["Base", aircraft.baseAirport],
    ["Guests", aircraft.passengers],
    ["Crew", aircraft.crew],
    ["Range", `${aircraft.rangeNm} nm`],
    ["Cruise", `${aircraft.cruiseSpeedKt} kt`],
    ["Altitude", `${aircraft.maxAltitudeFt} ft`],
    ["Baggage", `${aircraft.baggageCuFt} cu ft`],
    ["Cabin", `${aircraft.cabin?.lengthFt || "—"} × ${aircraft.cabin?.widthFt || "—"} × ${aircraft.cabin?.heightFt || "—"} ft`],
  ];

  return (
    <AviationLayout>
      <article className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.4fr_.8fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{categoryLabel(aircraft.category)}</p>
          <h1 className="mt-2 text-4xl font-black">{aircraft.name}</h1>
          <p className="mt-2 text-slate-500">{aircraft.manufacturer} {aircraft.model} · Operated by {aircraft.operatorName}</p>
          <img src={aircraft.images?.[0]} alt="" className="mt-6 h-80 w-full rounded-3xl object-cover" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {specs.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-4 dark:bg-slate-900">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 font-bold">{value}</p>
              </div>
            ))}
          </div>
          <h2 className="mt-8 text-xl font-black">Cabin amenities</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(aircraft.amenities || []).map((amenity) => <span key={amenity} className="rounded-full bg-white px-3 py-1 text-sm font-semibold dark:bg-slate-900">{AMENITY_LABELS[amenity] || amenity}</span>)}
          </div>
          <h2 className="mt-8 text-xl font-black">Safety and compliance</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["AOC", aircraft.safety?.aoc],
              ["Certification", aircraft.safety?.certification],
              ["Insurance", aircraft.safety?.insurance],
              ["Maintenance", aircraft.safety?.maintenanceCurrent ? "Current" : "Review"],
              ["Crew", (aircraft.safety?.pilotCertifications || []).join(", ")],
              ["Regulatory status", aircraft.safety?.regulatoryStatus],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
                <dd className="mt-1 font-semibold">{value || "Not published"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <aside className="h-fit rounded-3xl bg-slate-950 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Quote</p>
          {quote ? (
            <>
              <p className="mt-3 text-4xl font-black">{money(quote.price, quote.currency)}</p>
              <p className="mt-2 text-sm text-slate-300">{durationLabel(quote.durationMinutes)} airborne · {quote.distanceNm} nm · {quote.flightHours} block hours</p>
              {quote.positioningNm > 0 && <p className="mt-2 text-sm text-amber-200">Includes {quote.positioningNm} nm positioning from {aircraft.baseAirport}.</p>}
              <Link to={checkout} className="mt-6 block rounded-2xl bg-white py-3 text-center text-sm font-black text-slate-950">Continue to booking</Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Choose a route to price this aircraft. Empty legs and custom itineraries can be quoted by the operator.</p>
          )}
          <Link to={`/aviation/charter${searchQuery({ ...Object.fromEntries(params.entries()), preferredAircraftId: id })}`} className="mt-3 block text-center text-sm font-bold text-amber-200">Request a custom charter</Link>
        </aside>
      </article>
    </AviationLayout>
  );
}
