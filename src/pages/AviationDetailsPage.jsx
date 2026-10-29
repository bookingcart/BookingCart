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

  if (error) {
    return (
      <AviationLayout>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
            <i className="ph ph-warning-circle text-2xl text-rose-500" aria-hidden="true" />
          </span>
          <p className="mt-4 text-lg font-semibold">This aircraft is no longer available</p>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
          <Link to="/aviation" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white">
            Back to search
          </Link>
        </div>
      </AviationLayout>
    );
  }

  if (!aircraft) {
    return (
      <AviationLayout>
        <div className="h-64 bg-slate-950" />
        <div className="mx-auto -mt-24 max-w-7xl px-4 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,.75fr)]">
            <div className="aspect-[16/9] animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </AviationLayout>
    );
  }

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
  const safety = [
    ["Air operator certificate", aircraft.safety?.aoc],
    ["Aircraft certification", aircraft.safety?.certification],
    ["Insurance coverage", aircraft.safety?.insurance],
    ["Maintenance records", aircraft.safety?.maintenanceCurrent ? "Current" : "Pending review"],
    ["Pilot certifications", (aircraft.safety?.pilotCertifications || []).join(", ")],
    ["Regulatory status", aircraft.safety?.regulatoryStatus],
  ];
  const services = [...(aircraft.charterServices || []), ...(aircraft.helicopterServices || [])];
  const images = aircraft.images?.length ? aircraft.images : [];
  const isCompliant = aircraft.safety?.regulatoryStatus === "compliant";

  return (
    <AviationLayout>
      {/* ── HEADER BAND ── */}
      <section className="relative overflow-hidden bg-slate-950 pb-28 pt-6 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] text-white/50">
            <Link to="/aviation" className="transition-colors hover:text-white">Aviation</Link>
            <i className="ph ph-caret-right text-[10px]" aria-hidden="true" />
            <Link to={`/aviation/results${searchQuery(Object.fromEntries(params.entries()))}`} className="transition-colors hover:text-white">Results</Link>
            <i className="ph ph-caret-right text-[10px]" aria-hidden="true" />
            <span className="font-medium text-white/80">{aircraft.name}</span>
          </nav>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {categoryLabel(aircraft.category)}
            </span>
            {isCompliant && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                <i className="ph ph-shield-check text-[12px]" aria-hidden="true" />
                AOC compliant
              </span>
            )}
          </div>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{aircraft.name}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
            {[aircraft.manufacturer, aircraft.model].filter(Boolean).join(" ")} · Operated by{" "}
            <span className="font-medium text-white/90">{aircraft.operatorName}</span> · Based at {aircraft.baseAirport}
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="-mt-24 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,.75fr)] lg:items-start">
          {/* ── GALLERY ── */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_-40px_rgba(15,23,42,0.55)] ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10 lg:col-start-1 lg:row-start-1">
            {images.length > 0 ? (
              <div className="relative aspect-[16/9] w-full">
                <img src={images[activeImg]} alt={aircraft.name} className="h-full w-full object-cover" />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={() => setActiveImg((v) => (v - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur transition-colors hover:bg-slate-950/80"
                    >
                      <i className="ph ph-caret-left text-lg" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={() => setActiveImg((v) => (v + 1) % images.length)}
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur transition-colors hover:bg-slate-950/80"
                    >
                      <i className="ph ph-caret-right text-lg" aria-hidden="true" />
                    </button>
                    <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      {activeImg + 1} / {images.length}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950">
                <div
                  className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-15"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgb(148 163 184 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.45) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                  }}
                  aria-hidden="true"
                />
                <div className="relative flex h-full flex-col items-center justify-center gap-3 pb-16">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-sm ring-1 ring-inset ring-white dark:bg-white/5 dark:ring-white/10">
                    <i className="ph ph-airplane-tilt text-2xl text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Photo on request</p>
                  <p className="hidden max-w-xs px-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:block">
                    The operator shares cabin photos once the charter is confirmed.
                  </p>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/70 bg-white/70 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/60">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {[aircraft.registration, aircraft.year].filter(Boolean).join(" · ")
                      || categoryLabel(aircraft.category)}
                  </p>
                  <p className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                    {aircraft.passengers} guests · {aircraft.rangeNm?.toLocaleString()} nm range
                  </p>
                </div>
              </div>
            )}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${activeImg === i ? "ring-emerald-600" : "ring-transparent opacity-60 hover:opacity-100"}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── QUOTE / BOOKING CARD ── */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-[0_30px_70px_-40px_rgba(2,6,23,0.9)] ring-1 ring-white/10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">Charter quote</p>
              {quote ? (
                <>
                  <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{money(quote.price, quote.currency)}</p>
                  <p className="mt-1 text-[12px] text-white/60">
                    {quote.flightHours} block hours{quote.hourlyRate ? ` at ${money(quote.hourlyRate)}/hr` : ""} · all fees included
                  </p>
                  <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-[13px] text-white/70">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2"><i className="ph ph-clock text-emerald-400" aria-hidden="true" />Airborne</dt>
                      <dd className="font-medium tabular-nums text-white">{durationLabel(quote.durationMinutes)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2"><i className="ph ph-arrows-horizontal text-emerald-400" aria-hidden="true" />Route distance</dt>
                      <dd className="font-medium tabular-nums text-white">{quote.distanceNm} nm</dd>
                    </div>
                    {quote.positioningNm > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="flex items-center gap-2 text-amber-300"><i className="ph ph-warning text-sm" aria-hidden="true" />Positioning</dt>
                        <dd className="font-medium tabular-nums text-amber-200">+{quote.positioningNm} nm</dd>
                      </div>
                    )}
                  </dl>
                  <Link to={checkout} className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-500">
                    Continue to booking
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                    {money(aircraft.hourlyRate)}
                    <span className="ml-1 text-sm font-medium text-white/50">/hr</span>
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                    Set a route to see the full quote, including positioning and minimum block hours.
                  </p>
                  <Link to="/aviation" className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100">
                    Set a route
                  </Link>
                </>
              )}
              <Link
                to={`/aviation/charter${searchQuery({ ...Object.fromEntries(params.entries()), preferredAircraftId: id })}`}
                className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <i className="ph ph-paper-plane-tilt text-sm" aria-hidden="true" />
                Request a custom charter
              </Link>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white dark:bg-white dark:text-slate-900">
                  {(aircraft.operatorName || "BC").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{aircraft.operatorName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Base {aircraft.baseAirport}</p>
                </div>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {aircraft.domestic && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Domestic</span>}
                {aircraft.international && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">International</span>}
                {aircraft.petFriendly && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Pet friendly</span>}
              </div>
            </div>

            <Link
              to="/aviation/itinerary"
              className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <i className="ph ph-map-trifold text-base text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Build a full itinerary</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Pair this jet with a helicopter, lodge and transfers in one checkout.
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Start
                  <i className="ph ph-arrow-right text-[12px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </aside>

          {/* ── BODY ── */}
          <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
            <section>
              <SectionHeading title="Aircraft specifications" />
              <dl className="mt-2 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
                {specs.map(([label, value]) => (
                  <div key={label} className="border-b border-slate-200/80 py-3.5 dark:border-slate-800">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                    <dd className="mt-1 text-[15px] font-medium tabular-nums text-slate-900 dark:text-white">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <SectionHeading title="Cabin amenities" />
              {(aircraft.amenities || []).length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No amenities listed — ask the operator.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {(aircraft.amenities || []).map((amenity) => (
                    <li key={amenity} className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      <i className={`ph ${AMENITY_ICONS[amenity] || "ph-star"} text-base text-emerald-700 dark:text-emerald-400`} aria-hidden="true" />
                      {AMENITY_LABELS[amenity] || amenity}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {services.length > 0 && (
              <section>
                <SectionHeading title="Service types" />
                <ul className="mt-3 flex flex-wrap gap-2">
                  {services.map((service) => (
                    <li key={service} className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {service.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="flex flex-wrap items-center gap-3">
                <SectionHeading title="Safety & compliance" />
                {isCompliant && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <i className="ph ph-shield-check text-[12px]" aria-hidden="true" />
                    Verified
                  </span>
                )}
              </div>
              <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
                {safety.map(([label, value]) => {
                  const pending = !value || value === "Pending review";
                  return (
                    <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-200/80 py-3.5 dark:border-slate-800">
                      <dt className="text-[13px] text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className={`flex items-center gap-1.5 text-right text-[13px] font-medium capitalize ${pending ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                        <i className={`ph ${pending ? "ph-clock" : "ph-check-circle"} text-[13px]`} aria-hidden="true" />
                        {value || "Not published"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </AviationLayout>
  );
}

function SectionHeading({ title }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</h2>;
}
