import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import AircraftCard from "../components/aviation/AircraftCard.jsx";
import { aviationRequest, searchQuery } from "../lib/aviationClient.js";

const PRIVATE_JET_TYPES = [
  { id: "light_jet", label: "Light Jet", icon: "ph-airplane", desc: "4–7 seats · Short-haul" },
  { id: "midsize_jet", label: "Mid-Size", icon: "ph-airplane-tilt", desc: "8–9 seats · Regional" },
  { id: "super_midsize_jet", label: "Super Mid", icon: "ph-airplane-tilt", desc: "9–10 seats · Extended" },
  { id: "heavy_jet", label: "Heavy Jet", icon: "ph-airplane-in-flight", desc: "12–16 seats · Long-range" },
  { id: "ultra_long_range", label: "Ultra Long", icon: "ph-globe-hemisphere-east", desc: "14–19 seats · Global" },
  { id: "business_jet", label: "Business", icon: "ph-briefcase", desc: "Executive cabin" },
  { id: "executive_jet", label: "Executive", icon: "ph-crown", desc: "VIP fit-out" },
  { id: "vip_jet", label: "VIP Jet", icon: "ph-star", desc: "Ultra-luxury" },
];

const AIR_CHARTER_TYPES = [
  { id: "on_demand", label: "On-Demand", icon: "ph-lightning", desc: "Book instantly" },
  { id: "corporate", label: "Corporate", icon: "ph-buildings", desc: "Business travel" },
  { id: "group", label: "Group", icon: "ph-users-three", desc: "Team charters" },
  { id: "medevac", label: "Med-Evac", icon: "ph-first-aid-kit", desc: "Emergency flights" },
  { id: "government", label: "Government", icon: "ph-shield", desc: "Official charters" },
  { id: "tourism", label: "Tourism", icon: "ph-map-trifold", desc: "Tour packages" },
  { id: "safari", label: "Safari Air", icon: "ph-paw-print", desc: "Wildlife transfers" },
  { id: "island", label: "Island Hop", icon: "ph-island", desc: "Island transfers" },
];

const HELICOPTER_TYPES = [
  { id: "scenic", label: "Scenic", icon: "ph-mountains", desc: "Aerial sightseeing" },
  { id: "aerial_tour", label: "Aerial Tour", icon: "ph-camera", desc: "Photography tours" },
  { id: "vip_transfer", label: "VIP Transfer", icon: "ph-crown", desc: "Luxury transfers" },
  { id: "airport_transfer", label: "Airport", icon: "ph-airplane-landing", desc: "Airport shuttles" },
  { id: "emergency", label: "Emergency", icon: "ph-siren", desc: "Emergency services" },
  { id: "corporate_flight", label: "Corporate", icon: "ph-briefcase", desc: "Business flights" },
];

const TOP_MODES = [
  { id: "private_jet", label: "Private Jets", icon: "ph-airplane-takeoff", types: PRIVATE_JET_TYPES },
  { id: "air_charter", label: "Air Charters", icon: "ph-path", types: AIR_CHARTER_TYPES },
  { id: "helicopter", label: "Helicopters", icon: "ph-fan", types: HELICOPTER_TYPES },
];

const STATS = [
  { label: "Aircraft listed", value: "120+" },
  { label: "Routes", value: "340+" },
  { label: "Countries", value: "28" },
  { label: "Avg. response", value: "< 2h" },
];

const AMENITIES = [
  { icon: "ph-wifi-high", label: "Wi-Fi" },
  { icon: "ph-monitor-play", label: "Entertainment" },
  { icon: "ph-chalkboard", label: "Conference" },
  { icon: "ph-bed", label: "Private Bedrooms" },
  { icon: "ph-fork-knife", label: "Premium Catering" },
  { icon: "ph-couch", label: "Luxury Seating" },
  { icon: "ph-person-simple-walk", label: "Flight Attendant" },
  { icon: "ph-car", label: "VIP Ground Handling" },
];

const PACKAGE_STEPS = [
  { icon: "ph-airplane-takeoff", label: "Private Jet · Kampala → Murchison" },
  { icon: "ph-fan", label: "Helicopter · Scenic Falls Tour" },
  { icon: "ph-house-simple", label: "Luxury Lodge Reservation" },
  { icon: "ph-paw-print", label: "National Park Entry Tickets" },
  { icon: "ph-van", label: "Safari Van Transfer" },
];

const OPERATOR_TOOLS = [
  { icon: "ph-airplane", label: "Fleet management", desc: "Add, edit, and schedule aircraft" },
  { icon: "ph-clipboard-text", label: "Charter requests", desc: "Receive and quote custom charters" },
  { icon: "ph-chart-line-up", label: "Revenue analytics", desc: "Track flights, revenue, satisfaction" },
  { icon: "ph-shield-check", label: "Compliance tools", desc: "AOC, insurance, pilot records" },
];

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:disabled:bg-slate-900";

const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-600 dark:text-emerald-400";

export default function AviationPage() {
  const navigate = useNavigate();
  const [topMode, setTopMode] = useState("private_jet");
  const [subCategory, setSubCategory] = useState("light_jet");
  const [form, setForm] = useState({
    origin: "EBB",
    destination: "MFU",
    tripType: "oneway",
    departDate: "2026-11-12",
    returnDate: "",
    passengers: 4,
    category: "",
    budgetMax: "",
  });
  const [featured, setFeatured] = useState([]);
  const [airports, setAirports] = useState([]);

  useEffect(() => {
    document.title = "Private Jets & Air Charters | BookingCart";
    aviationRequest("search", { query: { origin: "EBB", destination: "MFU", passengers: 4, departDate: "2026-11-12" } })
      .then((data) => setFeatured(data.results.slice(0, 3)))
      .catch(() => setFeatured([]));
    aviationRequest("airports").then((data) => setAirports(data.airports)).catch(() => {});
  }, []);

  // When top mode changes, select first sub-category of that mode
  useEffect(() => {
    const mode = TOP_MODES.find((m) => m.id === topMode);
    if (mode) setSubCategory(mode.types[0].id);
  }, [topMode]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    navigate(`/aviation/results${searchQuery({ ...form, category: subCategory })}`);
  }

  const activeMode = TOP_MODES.find((m) => m.id === topMode);
  const activeSub = activeMode?.types.find((t) => t.id === subCategory);

  return (
    <AviationLayout>
      {/* ── HERO ── */}
      <section className="relative isolate overflow-hidden bg-slate-950">
        <img
          src="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/85 to-slate-950/40" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-7xl items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_minmax(0,.95fr)] lg:py-24">
          {/* Left copy */}
          <div className="text-white">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 ring-1 ring-inset ring-white/15">
              <i className="ph ph-crown text-xs" aria-hidden="true" />
              Luxury aviation marketplace
            </span>

            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Private jets, charters &amp; helicopters.
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/65">
              Search 120+ aircraft by route, cabin size, and budget. Every listing shows operator credentials, AOC,
              safety records, and compliance status before you book.
            </p>

            <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap text-white/45">{stat.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/aviation/charter"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <i className="ph ph-paper-plane-tilt text-base" aria-hidden="true" />
                Request a charter
              </Link>
              <Link
                to="/aviation/itinerary"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <i className="ph ph-map-trifold text-base" aria-hidden="true" />
                Safari package
              </Link>
              <Link
                to="/aviation/airports"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                <i className="ph ph-air-traffic-control text-base" aria-hidden="true" />
                Airport directory
              </Link>
            </div>
          </div>

          {/* Search card */}
          <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-[0_30px_80px_-40px_rgba(2,6,23,0.9)] ring-1 ring-black/5 dark:bg-slate-900 dark:text-white dark:ring-white/10">
            <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {TOP_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTopMode(mode.id)}
                  aria-pressed={topMode === mode.id}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-semibold transition-colors ${
                    topMode === mode.id
                      ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <i className={`ph ${mode.icon} text-base`} aria-hidden="true" />
                  <span className="leading-none">{mode.label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {activeMode?.types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSubCategory(type.id)}
                  aria-pressed={subCategory === type.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    subCategory === type.id
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                  }`}
                >
                  <i className={`ph ${type.icon} text-[13px]`} aria-hidden="true" />
                  {type.label}
                </button>
              ))}
            </div>

            {activeSub && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <i className={`ph ${activeSub.icon} text-xs`} aria-hidden="true" />
                {activeSub.desc}
              </p>
            )}

            <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {["oneway", "round"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update("tripType", type)}
                  aria-pressed={form.tripType === type}
                  className={`rounded-lg px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    form.tripType === type
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {type === "oneway" ? "One-way" : "Round trip"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Departure airport">
                <input list="aviation-airports" value={form.origin} onChange={(e) => update("origin", e.target.value)} className={FIELD_CLASS} placeholder="EBB" required />
              </Field>
              <Field label="Arrival airport">
                <input list="aviation-airports" value={form.destination} onChange={(e) => update("destination", e.target.value)} className={FIELD_CLASS} placeholder="MFU" required />
              </Field>
              <Field label="Departure date">
                <input type="date" value={form.departDate} onChange={(e) => update("departDate", e.target.value)} className={FIELD_CLASS} required />
              </Field>
              <Field label="Return date">
                <input type="date" value={form.returnDate} onChange={(e) => update("returnDate", e.target.value)} className={FIELD_CLASS} disabled={form.tripType !== "round"} />
              </Field>
              <Field label="Passengers">
                <input type="number" min="1" max="80" value={form.passengers} onChange={(e) => update("passengers", e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="Budget max (USD)">
                <input type="number" min="0" value={form.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} className={FIELD_CLASS} placeholder="Any" />
              </Field>
              <datalist id="aviation-airports">
                {airports.map((a) => <option key={a.code} value={a.code}>{a.city} — {a.name}</option>)}
              </datalist>
              <button
                type="submit"
                className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 sm:col-span-2"
              >
                <i className="ph ph-magnifying-glass text-base" aria-hidden="true" />
                Search {activeMode?.label}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── AVIATION CATEGORIES ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={EYEBROW}>Browse by category</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              All aviation services
            </h2>
          </div>
          <Link
            to="/aviation/results"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            View all aircraft
            <i className="ph ph-arrow-right text-[13px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TOP_MODES.map((mode) => (
            <Link
              key={mode.id}
              to={`/aviation/results?category=${mode.id}`}
              className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <i className={`ph ${mode.icon} text-lg text-slate-700 dark:text-slate-200`} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{mode.label}</h3>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{mode.types.length} service types</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {mode.types.slice(0, 4).map((type) => (
                  <span key={type.id} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {type.label}
                  </span>
                ))}
                {mode.types.length > 4 && (
                  <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    +{mode.types.length - 4} more
                  </span>
                )}
              </div>
              <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                Explore {mode.label}
                <i className="ph ph-arrow-right text-[12px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── AMENITIES STRIP ── */}
      <section className="border-y border-slate-800 bg-slate-950 py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">
            Cabin amenities across our fleet
          </p>
          <div className="mt-7 grid grid-cols-4 gap-6 sm:grid-cols-8">
            {AMENITIES.map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ring-inset ring-white/10">
                  <i className={`ph ${a.icon} text-base text-emerald-400`} aria-hidden="true" />
                </span>
                <p className="text-[10px] font-medium leading-tight text-white/60">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED AIRCRAFT ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={EYEBROW}>Entebbe → Murchison Falls</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Available for a safari departure
            </h2>
          </div>
          <Link
            to="/aviation/airports"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Airport directory
            <i className="ph ph-arrow-right text-[13px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {featured.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            ))
          ) : (
            featured.map((item) => (
              <AircraftCard
                key={item.aircraft.id}
                item={item}
                search={searchQuery({ origin: "EBB", destination: "MFU", departDate: "2026-11-12", passengers: 4, tripType: "oneway" })}
              />
            ))
          )}
        </div>
      </section>

      {/* ── INTEGRATED LUXURY PACKAGE CTA ── */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-7 text-white ring-1 ring-white/10 sm:p-11">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-300/90">
                All-in-one luxury itinerary
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                One checkout for your entire safari experience.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/60">
                Combine a private jet from Kampala, a helicopter scenic tour, luxury lodge reservation, national park
                entry, and safari van — all managed under one booking with a unified travel itinerary.
              </p>
              <Link
                to="/aviation/itinerary"
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <i className="ph ph-map-trifold text-base" aria-hidden="true" />
                Build your itinerary
              </Link>
            </div>

            <ol className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-4">
              {PACKAGE_STEPS.map((step, i) => (
                <li key={step.label} className="flex items-center gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] font-semibold tabular-nums text-white/70">
                    {i + 1}
                  </span>
                  <i className={`ph ${step.icon} text-base text-emerald-400`} aria-hidden="true" />
                  <span className="text-[13px] font-medium text-white/85">{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── LIST YOUR AIRCRAFT CTA ── */}
      <section className="border-t border-slate-200 py-16 dark:border-slate-800">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className={EYEBROW}>For operators</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              List your aircraft. Reach qualified clients.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Join 80+ verified operators. Manage your fleet, receive charter requests, negotiate terms, and track
              revenue — all in one operator dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/aviation/operators/join"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                <i className="ph ph-airplane-tilt text-base" aria-hidden="true" />
                Register as operator
              </Link>
              <Link
                to="/aviation/dashboard"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
              >
                <i className="ph ph-gauge text-base" aria-hidden="true" />
                Operator dashboard
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {OPERATOR_TOOLS.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <i className={`ph ${item.icon} text-lg text-emerald-700 dark:text-emerald-400`} aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AviationLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
