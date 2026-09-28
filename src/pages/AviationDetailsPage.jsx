import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { AMENITY_LABELS, aviationRequest, categoryLabel, durationLabel, money, searchQuery } from "../lib/aviationClient.js";

const AMENITY_ICONS = {
  wifi: "ph-wifi-high",
  entertainment: "ph-monitor-play",
  conference: "ph-chalkboard",
  private_bedrooms: "ph-bed",
  premium_catering: "ph-fork-knife",
  luxury_seating: "ph-couch",
  flight_attendant: "ph-person-simple-walk",
  vip_ground: "ph-car",
};

export default function AviationDetailsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [aircraft, setAircraft] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [activeImg, setActiveImg] = useState(0);

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

  if (error) return <AviationLayout><p className="mx-auto max-w-3xl px-4 py-16 text-rose-600">{error}</p></AviationLayout>;
  if (!aircraft) return (
    <AviationLayout>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 grid gap-8 lg:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-4">
          <div className="h-6 w-32 rounded-xl bg-slate-200 animate-pulse dark:bg-slate-800" />
          <div className="h-10 w-64 rounded-xl bg-slate-200 animate-pulse dark:bg-slate-800" />
          <div className="h-80 w-full rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />
        </div>
        <div className="h-64 rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />
      </div>
    </AviationLayout>
  );

  const checkout = `/aviation/checkout${searchQuery({ ...Object.fromEntries(params.entries()), aircraft: id })}`;
  const specs = [
    ["Registration", aircraft.registration],
    ["Year", aircraft.year],
    ["Base airport", aircraft.baseAirport],
    ["Passengers", `${aircraft.passengers} guests`],
    ["Crew", `${aircraft.crew} crew`],
    ["Range", `${aircraft.rangeNm?.toLocaleString()} nm`],
    ["Cruise speed", `${aircraft.cruiseSpeedKt} kt`],
    ["Max altitude", `${aircraft.maxAltitudeFt?.toLocaleString()} ft`],
    ["Baggage", `${aircraft.baggageCuFt} cu ft`],
    ["Cabin (L×W×H)", `${aircraft.cabin?.lengthFt || "—"} × ${aircraft.cabin?.widthFt || "—"} × ${aircraft.cabin?.heightFt || "—"} ft`],
  ];

  const images = aircraft.images?.length ? aircraft.images : [];
  const safetyStatus = aircraft.safety?.regulatoryStatus;
  const isCompliant = safetyStatus === "compliant";

  return (
    <AviationLayout>
      {/* Breadcrumb */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 text-sm">
          <Link to="/aviation" className="text-slate-400 hover:text-slate-600">Aviation</Link>
          <span className="mx-2 text-slate-300">›</span>
          <Link to={`/aviation/results${searchQuery(Object.fromEntries(params.entries()))}`} className="text-slate-400 hover:text-slate-600">Results</Link>
          <span className="mx-2 text-slate-300">›</span>
          <span className="font-semibold">{aircraft.name}</span>
        </div>
      </div>

      <article className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.4fr_.8fr]">
        {/* ── LEFT COLUMN ── */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              {categoryLabel(aircraft.category)}
            </span>
            {isCompliant && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-bold text-white">
                <i className="ph ph-shield-check text-sm" />
                AOC Compliant
              </span>
            )}
          </div>

          <h1 className="mt-3 text-4xl font-black tracking-tight">{aircraft.name}</h1>
          <p className="mt-2 text-slate-500">
            {aircraft.manufacturer} {aircraft.model} · Operated by <strong className="text-slate-700 dark:text-slate-300">{aircraft.operatorName}</strong>
          </p>

          {/* Image gallery */}
          <div className="mt-6">
            {images.length > 0 ? (
              <>
                <div className="relative h-80 w-full overflow-hidden rounded-3xl">
                  <img
                    src={images[activeImg]}
                    alt={aircraft.name}
                    className="h-full w-full object-cover transition-opacity duration-300"
                  />
                  {images.length > 1 && (
                    <>
                      <button onClick={() => setActiveImg((v) => (v - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-md">
                        <i className="ph ph-caret-left text-lg text-slate-800" />
                      </button>
                      <button onClick={() => setActiveImg((v) => (v + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-md">
                        <i className="ph ph-caret-right text-lg text-slate-800" />
                      </button>
                    </>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {images.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImg(i)}
                        className={`shrink-0 h-16 w-24 overflow-hidden rounded-xl border-2 transition-all ${activeImg === i ? "border-emerald-500" : "border-transparent opacity-70"}`}
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-80 w-full items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800">
                <i className="ph ph-airplane-tilt text-6xl text-slate-300" />
              </div>
            )}
          </div>

          {/* Aircraft specifications */}
          <section className="mt-8">
            <h2 className="text-xl font-black">Aircraft specifications</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {specs.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white p-4 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 font-bold text-sm">{value || "—"}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Luxury amenities */}
          <section className="mt-8">
            <h2 className="text-xl font-black">Cabin amenities</h2>
            {(aircraft.amenities || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No amenities listed.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(aircraft.amenities || []).map((amenity) => (
                  <div key={amenity} className="flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                      <i className={`ph ${AMENITY_ICONS[amenity] || "ph-star"} text-base text-emerald-700`} />
                    </div>
                    <p className="text-xs font-bold">{AMENITY_LABELS[amenity] || amenity}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Charter services */}
          {(aircraft.charterServices?.length > 0 || aircraft.helicopterServices?.length > 0) && (
            <section className="mt-8">
              <h2 className="text-xl font-black">Service types</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...(aircraft.charterServices || []), ...(aircraft.helicopterServices || [])].map((svc) => (
                  <span key={svc} className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                    {svc.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Safety & compliance */}
          <section className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-black">Safety &amp; compliance</h2>
              {isCompliant && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <i className="ph ph-shield-check" /> Verified
                </span>
              )}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Air Operator Certificate (AOC)", aircraft.safety?.aoc],
                ["Aircraft certification", aircraft.safety?.certification],
                ["Insurance coverage", aircraft.safety?.insurance],
                ["Maintenance records", aircraft.safety?.maintenanceCurrent ? "Current ✓" : "Pending review"],
                ["Pilot certifications", (aircraft.safety?.pilotCertifications || []).join(", ")],
                ["Regulatory status", aircraft.safety?.regulatoryStatus],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className={`mt-1 font-semibold text-sm ${!value || value === "Pending review" ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>
                    {value || "Not published"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="space-y-4 lg:sticky lg:top-20 h-fit">
          {/* Quote card */}
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Charter quote</p>
            {quote ? (
              <>
                <p className="mt-3 text-4xl font-black">{money(quote.price, quote.currency)}</p>
                <div className="mt-3 space-y-1.5 text-sm text-slate-300">
                  <p className="flex items-center gap-2"><i className="ph ph-clock text-emerald-400" />{durationLabel(quote.durationMinutes)} airborne</p>
                  <p className="flex items-center gap-2"><i className="ph ph-arrows-horizontal text-emerald-400" />{quote.distanceNm} nm · {quote.flightHours} block hours</p>
                  {quote.positioningNm > 0 && (
                    <p className="flex items-center gap-2 text-amber-300"><i className="ph ph-warning text-sm" />+{quote.positioningNm} nm positioning from {aircraft.baseAirport}</p>
                  )}
                </div>
                <Link to={checkout} className="mt-5 block rounded-2xl bg-white py-3 text-center text-sm font-black text-slate-950 hover:bg-slate-100 transition-colors shadow-lg">
                  Continue to booking
                </Link>
              </>
            ) : (
              <>
                <p className="mt-4 text-2xl font-black">{money(aircraft.hourlyRate)}<span className="text-sm font-semibold text-slate-400">/hr</span></p>
                <p className="mt-2 text-sm text-slate-300">Set a route to get a full price quote including positioning and block hours.</p>
                <Link to="/aviation" className="mt-4 block rounded-2xl border border-white/20 py-3 text-center text-sm font-bold hover:bg-white/10 transition-colors">
                  Set route →
                </Link>
              </>
            )}
            <Link to={`/aviation/charter${searchQuery({ ...Object.fromEntries(params.entries()), preferredAircraftId: id })}`} className="mt-3 block text-center text-sm font-bold text-amber-200 hover:text-amber-100">
              Request a custom charter
            </Link>
          </div>

          {/* Quick operator info */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-black">About the operator</h3>
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{aircraft.operatorName}</p>
            <p className="text-xs text-slate-500 mt-1">Based at {aircraft.baseAirport}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {aircraft.domestic && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">Domestic</span>}
              {aircraft.international && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">International</span>}
              {aircraft.petFriendly && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Pet friendly</span>}
            </div>
          </div>

          {/* Itinerary upsell */}
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
            <i className="ph ph-map-trifold text-xl text-emerald-700" />
            <p className="mt-2 font-black text-sm">Building a safari package?</p>
            <p className="text-xs text-emerald-700 mt-1 dark:text-emerald-400">Combine this jet with a helicopter, lodge, park entry, and safari transfer.</p>
            <Link to="/aviation/itinerary" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-emerald-800 hover:underline dark:text-emerald-300">
              Build full itinerary →
            </Link>
          </div>
        </aside>
      </article>
    </AviationLayout>
  );
}
