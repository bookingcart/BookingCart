import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  { id: "private_jet", label: "Private Jets", icon: "ph-airplane-takeoff", color: "text-emerald-700", bg: "bg-emerald-700", types: PRIVATE_JET_TYPES },
  { id: "air_charter", label: "Air Charters", icon: "ph-path", color: "text-amber-600", bg: "bg-amber-600", types: AIR_CHARTER_TYPES },
  { id: "helicopter", label: "Helicopters", icon: "ph-fan", color: "text-sky-600", bg: "bg-sky-600", types: HELICOPTER_TYPES },
];

const STATS = [
  { label: "Aircraft listed", value: "120+" },
  { label: "Routes covered", value: "340+" },
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
      <section className="relative overflow-hidden min-h-[640px] flex items-center">
        <img
          src="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/70 to-emerald-950/60" />

        {/* Floating ambient orbs */}
        <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:py-24 w-full">
          {/* Left copy */}
          <div className="text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-sm mb-4">
              <i className="ph ph-crown text-sm" />
              Luxury Aviation Marketplace
            </div>
            <h1 className="mt-3 max-w-xl text-4xl font-black tracking-tight sm:text-6xl leading-[1.05]">
              Private jets,{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-emerald-100 bg-clip-text text-transparent">charters</span>{" "}
              &amp; helicopters.
            </h1>
            <p className="mt-5 max-w-lg text-base text-slate-200 leading-relaxed">
              Search 120+ aircraft by route, cabin size, and budget. Every listing displays operator credentials, AOC, safety records, and compliance status before you book.
            </p>

            {/* Stats bar */}
            <div className="mt-8 grid grid-cols-4 gap-4 max-w-md">
              {STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
              <a href="/aviation/charter" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-slate-900 hover:bg-slate-100 transition-colors shadow-lg">
                <i className="ph ph-paper-plane-tilt text-base" />
                Request a charter
              </a>
              <a href="/aviation/itinerary" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 backdrop-blur-sm hover:bg-white/20 transition-colors">
                <i className="ph ph-map-trifold text-base" />
                Safari package
              </a>
              <a href="/aviation/airports" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 backdrop-blur-sm hover:bg-white/15 transition-colors">
                <i className="ph ph-airport text-base" />
                Airport directory
              </a>
            </div>
          </div>

          {/* Search card */}
          <div className="rounded-3xl bg-white/95 backdrop-blur-xl p-5 text-slate-900 shadow-2xl ring-1 ring-white/20 dark:bg-slate-900/95 dark:text-white dark:ring-slate-700/30">
            {/* ── Top mode switcher (Jets / Charters / Helicopters) ── */}
            <div className="mb-4 flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {TOP_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTopMode(mode.id)}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 px-2 text-xs font-bold transition-all ${
                    topMode === mode.id
                      ? `${mode.bg} text-white shadow-md`
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  <i className={`ph ${mode.icon} text-lg`} />
                  <span className="leading-none">{mode.label}</span>
                </button>
              ))}
            </div>

            {/* ── Sub-category pills ── */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {activeMode?.types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSubCategory(type.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                    subCategory === type.id
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <i className={`ph ${type.icon} text-sm`} />
                  {type.label}
                </button>
              ))}
            </div>

            {activeSub && (
              <p className="mb-4 text-[11px] font-semibold text-slate-400">
                <i className={`ph ${activeSub.icon} mr-1`} />
                {activeSub.desc}
              </p>
            )}

            {/* ── Trip type ── */}
            <div className="mb-4 flex gap-2">
              {["oneway", "round"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update("tripType", type)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                    form.tripType === type
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {type === "oneway" ? "One-way" : "Round trip"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <Field label="Departure airport">
                <input list="aviation-airports" value={form.origin} onChange={(e) => update("origin", e.target.value)} className="field" placeholder="EBB" required />
              </Field>
              <Field label="Arrival airport">
                <input list="aviation-airports" value={form.destination} onChange={(e) => update("destination", e.target.value)} className="field" placeholder="MFU" required />
              </Field>
              <Field label="Departure date">
                <input type="date" value={form.departDate} onChange={(e) => update("departDate", e.target.value)} className="field" required />
              </Field>
              <Field label="Return date">
                <input type="date" value={form.returnDate} onChange={(e) => update("returnDate", e.target.value)} className="field" disabled={form.tripType !== "round"} />
              </Field>
              <Field label="Passengers">
                <input type="number" min="1" max="80" value={form.passengers} onChange={(e) => update("passengers", e.target.value)} className="field" />
              </Field>
              <Field label="Budget max (USD)">
                <input type="number" min="0" value={form.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} className="field" placeholder="Any" />
              </Field>
              <datalist id="aviation-airports">
                {airports.map((a) => <option key={a.code} value={a.code}>{a.city} — {a.name}</option>)}
              </datalist>
              <button type="submit" className="sm:col-span-2 mt-1 w-full rounded-2xl bg-emerald-700 py-3 text-sm font-black text-white hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/30">
                <i className="ph ph-magnifying-glass text-base" />
                Search {activeMode?.label}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── AVIATION CATEGORIES ── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Browse by category</p>
            <h2 className="mt-1 text-3xl font-black">All aviation services</h2>
          </div>
          <a href="/aviation/results" className="text-sm font-bold text-emerald-800 hover:underline">View all aircraft →</a>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {TOP_MODES.map((mode) => (
            <a
              key={mode.id}
              href={`/aviation/results?category=${mode.id}`}
              className="group rounded-3xl border border-slate-200 bg-white p-6 hover:border-transparent hover:shadow-xl transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-transparent"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${mode.bg} text-white shadow-lg mb-4`}>
                <i className={`ph ${mode.icon} text-xl`} />
              </div>
              <h3 className="text-xl font-black">{mode.label}</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {mode.types.slice(0, 4).map((type) => (
                  <span key={type.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {type.label}
                  </span>
                ))}
                {mode.types.length > 4 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">
                    +{mode.types.length - 4} more
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-emerald-700 font-bold group-hover:underline">Explore {mode.label} →</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── AMENITIES STRIP ── */}
      <section className="bg-slate-950 text-white py-10 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-slate-400 mb-6">Cabin amenities across our fleet</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-4">
            {AMENITIES.map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-2 text-center">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <i className={`ph ${a.icon} text-lg text-emerald-300`} />
                </div>
                <p className="text-[10px] font-semibold text-slate-300 leading-tight">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED AIRCRAFT ── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Entebbe to Murchison Falls</p>
            <h2 className="mt-1 text-3xl font-black">Available for a safari departure</h2>
          </div>
          <a href="/aviation/airports" className="text-sm font-bold text-emerald-800 hover:underline">Airport directory</a>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {featured.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-80 rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />
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
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 mb-10">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 p-8 sm:p-12 text-white">
          <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="relative grid gap-8 lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-300 mb-4">
                <i className="ph ph-package text-sm" />
                All-in-one luxury itinerary
              </div>
              <h2 className="text-3xl font-black sm:text-4xl leading-tight">One checkout for your entire safari experience.</h2>
              <p className="mt-4 text-slate-300 text-sm leading-relaxed">
                Combine a private jet from Kampala, a helicopter scenic tour, luxury lodge reservation, national park entry, and safari van — all managed under one booking with a unified travel itinerary.
              </p>
              <a href="/aviation/itinerary" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-900 hover:bg-slate-100 transition-colors shadow-lg">
                <i className="ph ph-map-trifold text-base" />
                Build your itinerary
              </a>
            </div>
            <div className="space-y-3">
              {[
                { icon: "ph-airplane-takeoff", label: "Private Jet · Kampala → Murchison", color: "text-emerald-400" },
                { icon: "ph-fan", label: "Helicopter · Scenic Falls Tour", color: "text-sky-400" },
                { icon: "ph-house-simple", label: "Luxury Lodge Reservation", color: "text-amber-400" },
                { icon: "ph-paw-print", label: "National Park Entry Tickets", color: "text-green-400" },
                { icon: "ph-van", label: "Safari Van Transfer", color: "text-orange-400" },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black">
                    {i + 1}
                  </div>
                  <i className={`ph ${step.icon} text-lg ${step.color}`} />
                  <p className="text-sm font-semibold">{step.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LIST YOUR AIRCRAFT CTA ── */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-8 lg:grid-cols-2 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 mb-2">For operators</p>
            <h2 className="text-3xl font-black">List your aircraft. Reach qualified clients.</h2>
            <p className="mt-4 text-slate-500 text-sm leading-relaxed">
              Join 80+ verified operators. Manage your fleet, receive charter requests, negotiate terms, and track revenue — all in one operator dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/aviation/operators/join" className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 transition-colors shadow-lg shadow-emerald-700/20">
                <i className="ph ph-airplane-tilt text-base" />
                Register as operator
              </a>
              <a href="/aviation/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-400 transition-colors dark:border-slate-700 dark:text-slate-300">
                <i className="ph ph-gauge text-base" />
                Operator dashboard
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "ph-airplane", label: "Fleet management", desc: "Add, edit, and schedule aircraft" },
              { icon: "ph-clipboard-text", label: "Charter requests", desc: "Receive and quote custom charters" },
              { icon: "ph-chart-line-up", label: "Revenue analytics", desc: "Track flights, revenue, satisfaction" },
              { icon: "ph-shield-check", label: "Compliance tools", desc: "AOC, insurance, pilot records" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white p-4 border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                <i className={`ph ${item.icon} text-xl text-emerald-700`} />
                <p className="mt-2 text-sm font-black">{item.label}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`.field{width:100%;border-radius:0.875rem;border:1px solid #e2e8f0;background:#fff;padding:.65rem 1rem;font-size:.875rem;font-weight:600;transition:border-color .15s}.field:focus{outline:none;border-color:#059669}.dark .field{background:#0f172a;border-color:#1e293b;color:#f1f5f9}.field:disabled{opacity:.45;cursor:not-allowed}`}</style>
    </AviationLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
