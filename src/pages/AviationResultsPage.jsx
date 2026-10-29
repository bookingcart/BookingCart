import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import AircraftCard from "../components/aviation/AircraftCard.jsx";
import { AMENITY_LABELS, CATEGORY_LABELS, aviationRequest, categoryLabel, searchQuery } from "../lib/aviationClient.js";

const EMPTY = {
  origin: "EBB", destination: "MFU", tripType: "oneway", departDate: "", returnDate: "",
  passengers: 1, category: "", budgetMin: "", budgetMax: "", manufacturer: "", minRange: "",
  amenities: "", petFriendly: "", smoking: "", scope: "",
};

const CATEGORY_GROUPS = [
  {
    group: "Private Jets",
    options: ["light_jet", "midsize_jet", "super_midsize_jet", "heavy_jet", "ultra_long_range", "business_jet", "executive_jet", "vip_jet"],
  },
  {
    group: "Air Charters",
    options: ["on_demand", "corporate", "group", "medevac", "government", "tourism", "safari", "island"],
  },
  {
    group: "Helicopter Services",
    options: ["scenic", "aerial_tour", "vip_transfer", "airport_transfer", "emergency", "corporate_flight"],
  },
];

const FIELD_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";

const QUICK_CATEGORIES = ["private_jet", "air_charter", "helicopter", "safari", "medevac", "scenic"];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(String(value).slice(0, 10) + "T12:00:00");
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function AviationResultsPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ ...EMPTY, ...Object.fromEntries(params.entries()) });
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("price");

  useEffect(() => {
    document.title = "Aircraft results | BookingCart";
    const query = { ...EMPTY, ...Object.fromEntries(params.entries()) };
    setFilters(query);
    setLoading(true);
    aviationRequest("search", { query })
      .then((data) => {
        setResults(data.results);
        setRoute({ origin: data.origin, destination: data.destination });
        setError("");
      })
      .catch((err) => { setResults([]); setError(err.message); })
      .finally(() => setLoading(false));
  }, [params]);

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function apply(event) {
    event.preventDefault();
    setParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")));
    setFiltersOpen(false);
  }

  function pickCategory(category) {
    update("category", category);
    const next = Object.fromEntries(params.entries());
    if (category) next.category = category;
    else delete next.category;
    setParams(next);
  }

  const search = searchQuery(Object.fromEntries(params.entries()));
  // Keep the active category visible even when it is more specific than the quick-filter groups.
  const quickCategories = [
    "",
    ...(filters.category && !QUICK_CATEGORIES.includes(filters.category) ? [filters.category] : []),
    ...QUICK_CATEGORIES,
  ];

  const sorted = [...results].sort((a, b) => {
    if (sortBy === "price") return (a.quote?.price || 0) - (b.quote?.price || 0);
    if (sortBy === "price_desc") return (b.quote?.price || 0) - (a.quote?.price || 0);
    if (sortBy === "range") return (b.aircraft?.rangeNm || 0) - (a.aircraft?.rangeNm || 0);
    if (sortBy === "capacity") return (b.aircraft?.passengers || 0) - (a.aircraft?.passengers || 0);
    return 0;
  });

  const routeLabel = route ? `${route.origin.city} → ${route.destination.city}` : "Aircraft search";
  const metaChips = [
    formatDate(params.get("departDate")),
    params.get("passengers") ? `${params.get("passengers")} passenger${Number(params.get("passengers")) === 1 ? "" : "s"}` : "",
    params.get("tripType") === "round" ? "Round trip" : "One way",
    params.get("category") ? categoryLabel(params.get("category")) : "",
  ].filter(Boolean);

  return (
    <AviationLayout>
      {/* ── ROUTE BAND ── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-64 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-9 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-300/90">Charter search</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-[34px]">
                {routeLabel}
              </h1>
              {metaChips.length > 0 && (
                <ul className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-white/70">
                  {metaChips.map((chip, index) => (
                    <li key={chip} className="flex items-center gap-3">
                      {index > 0 && <span className="h-1 w-1 rounded-full bg-white/25" aria-hidden="true" />}
                      {chip}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/aviation${search}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
              >
                <i className="ph ph-pencil-simple text-sm" aria-hidden="true" />
                Modify search
              </Link>
              <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-[11px] font-medium text-white/70 ring-1 ring-inset ring-white/10">
                <i className="ph ph-shield-check text-sm text-emerald-400" aria-hidden="true" />
                AOC-verified operators only
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[288px_minmax(0,1fr)]">
          {/* ── FILTER RAIL ── */}
          <form
            onSubmit={apply}
            className={`-mt-10 h-fit rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain ${filtersOpen ? "block" : "hidden lg:block"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Refine</h2>
              <button
                type="button"
                onClick={() => { setFilters({ ...EMPTY }); setParams({}); }}
                className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              <FilterSection label="Route">
                <div className="grid gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Departure</span>
                    <input className={FIELD_CLASS} value={filters.origin} onChange={(e) => update("origin", e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Arrival</span>
                    <input className={FIELD_CLASS} value={filters.destination} onChange={(e) => update("destination", e.target.value)} />
                  </label>
                </div>
              </FilterSection>

              <FilterSection label="Aircraft category">
                <select className={FIELD_CLASS} value={filters.category} onChange={(e) => update("category", e.target.value)}>
                  <option value="">All categories</option>
                  {CATEGORY_GROUPS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((id) => (
                        <option key={id} value={id}>{CATEGORY_LABELS[id] || id}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </FilterSection>

              <FilterSection label="Manufacturer">
                <input className={FIELD_CLASS} placeholder="Gulfstream, Cessna…" value={filters.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
              </FilterSection>

              <FilterSection label="Budget (USD)">
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="Min" className={FIELD_CLASS} value={filters.budgetMin} onChange={(e) => update("budgetMin", e.target.value)} />
                  <input type="number" placeholder="Max" className={FIELD_CLASS} value={filters.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} />
                </div>
              </FilterSection>

              <FilterSection label="Flight range (nm min)">
                <input type="number" className={FIELD_CLASS} value={filters.minRange} onChange={(e) => update("minRange", e.target.value)} />
              </FilterSection>

              <FilterSection label="Luxury amenities">
                <select className={FIELD_CLASS} value={filters.amenities} onChange={(e) => update("amenities", e.target.value)}>
                  <option value="">Any amenity</option>
                  {Object.entries(AMENITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </FilterSection>

              <FilterSection label="Flight scope">
                <select className={FIELD_CLASS} value={filters.scope} onChange={(e) => update("scope", e.target.value)}>
                  <option value="">Any scope</option>
                  <option value="domestic">Domestic only</option>
                  <option value="international">International</option>
                </select>
              </FilterSection>

              <FilterSection label="Advanced">
                <div className="space-y-2">
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={filters.petFriendly === "true"} onChange={(e) => update("petFriendly", e.target.checked ? "true" : "")} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
                    <i className="ph ph-paw-print text-base text-slate-400" aria-hidden="true" />
                    Pet friendly
                  </label>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={filters.smoking === "true"} onChange={(e) => update("smoking", e.target.checked ? "true" : "")} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
                    <i className="ph ph-cigarette text-base text-slate-400" aria-hidden="true" />
                    Smoking allowed
                  </label>
                </div>
              </FilterSection>
            </div>

            <button className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">
              Apply filters
            </button>
          </form>

          {/* ── RESULTS ── */}
          <section className="-mt-10 min-w-0">
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 pb-3 pt-3.5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Available</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {loading ? "Searching aircraft…" : `${results.length} aircraft · ${filters.category ? categoryLabel(filters.category) : "all categories"}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
                  >
                    <i className="ph ph-faders-horizontal text-sm" aria-hidden="true" />
                    Filters
                  </button>
                  <label className="relative">
                    <span className="sr-only">Sort aircraft</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="min-h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="price">Price: Low to high</option>
                      <option value="price_desc">Price: High to low</option>
                      <option value="range">Longest range</option>
                      <option value="capacity">Most passengers</option>
                    </select>
                    <i className="ph ph-caret-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" aria-hidden="true" />
                  </label>
                </div>
              </div>

              <div className="mt-3 -mx-4 flex gap-2 overflow-x-auto border-t border-slate-100 px-4 pt-3 [scrollbar-width:none] dark:border-slate-800" role="group" aria-label="Quick category filters">
                {quickCategories.map((cat) => {
                  const active = filters.category === cat;
                  return (
                    <button
                      key={cat || "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pickCategory(cat)}
                      className={`min-h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
                      }`}
                    >
                      {cat ? (CATEGORY_LABELS[cat] || cat) : "All aircraft"}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                <i className="ph ph-warning-circle mt-0.5 text-lg text-rose-500" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">We could not load aircraft for this route</p>
                  <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && results.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <i className="ph ph-airplane-tilt text-2xl text-slate-400" aria-hidden="true" />
                </span>
                <p className="mt-4 text-lg font-semibold tracking-tight">No compliant aircraft on this route yet</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Widen the filters, or let verified operators quote a custom itinerary within two hours.
                </p>
                <Link to={`/aviation/charter${search}`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">
                  <i className="ph ph-paper-plane-tilt text-base" aria-hidden="true" />
                  Request a charter quote
                </Link>
              </div>
            )}

            {!loading && !error && results.length > 0 && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {sorted.map((item) => (
                  <AircraftCard key={item.aircraft.id} item={item} search={search} />
                ))}
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-slate-950 p-6 text-white">
                <div className="max-w-md">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">Custom itinerary</p>
                  <p className="mt-1.5 text-lg font-semibold tracking-tight">Nothing fits? Operators will quote your route.</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/60">
                    Multi-stop trips, cabin preferences and ground transfers handled in one request.
                  </p>
                </div>
                <Link to={`/aviation/charter${search}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100">
                  Request a quote
                  <i className="ph ph-arrow-right text-sm" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </AviationLayout>
  );
}

function FilterSection({ label, children }) {
  return (
    <div className="py-4 first:pt-2">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      {children}
    </div>
  );
}
