import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import AircraftCard from "../components/aviation/AircraftCard.jsx";
import { AMENITY_LABELS, CATEGORY_LABELS, aviationRequest, searchQuery } from "../lib/aviationClient.js";

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
  }

  const search = searchQuery(Object.fromEntries(params.entries()));

  // Sort results
  const sorted = [...results].sort((a, b) => {
    if (sortBy === "price") return (a.quote?.price || 0) - (b.quote?.price || 0);
    if (sortBy === "price_desc") return (b.quote?.price || 0) - (a.quote?.price || 0);
    if (sortBy === "range") return (b.aircraft?.rangeNm || 0) - (a.aircraft?.rangeNm || 0);
    if (sortBy === "capacity") return (b.aircraft?.passengers || 0) - (a.aircraft?.passengers || 0);
    return 0;
  });

  const currentCategory = filters.category;
  const categoryLabel = CATEGORY_LABELS[currentCategory] || "All aircraft";

  return (
    <AviationLayout>
      {/* Results header bar */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
              {route ? `${route.origin.city} → ${route.destination.city}` : "Aviation search"}
            </p>
            <h1 className="text-2xl font-black mt-0.5">
              {loading ? "Searching aircraft…" : `${results.length} ${categoryLabel} available`}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="price">Price: Low to high</option>
              <option value="price_desc">Price: High to low</option>
              <option value="range">Longest range</option>
              <option value="capacity">Most passengers</option>
            </select>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="lg:hidden inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-900"
            >
              <i className="ph ph-faders-horizontal" />
              Filters
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[300px_1fr]">
        {/* ── SIDEBAR FILTERS ── */}
        <form
          onSubmit={apply}
          className={`h-fit space-y-5 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-20 ${filtersOpen ? "block" : "hidden lg:block"}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black">Refine search</h2>
            <button type="button" onClick={() => { setFilters({ ...EMPTY }); setParams({}); }} className="text-xs font-bold text-slate-400 hover:text-slate-600">
              Reset all
            </button>
          </div>

          <FilterSection label="Route">
            <div className="grid gap-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Departure
                <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.origin} onChange={(e) => update("origin", e.target.value)} />
              </label>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Arrival
                <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.destination} onChange={(e) => update("destination", e.target.value)} />
              </label>
            </div>
          </FilterSection>

          <FilterSection label="Aircraft category">
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
              value={filters.category}
              onChange={(e) => update("category", e.target.value)}
            >
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
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
              placeholder="e.g. Gulfstream, Cessna"
              value={filters.manufacturer}
              onChange={(e) => update("manufacturer", e.target.value)}
            />
          </FilterSection>

          <FilterSection label="Budget (USD)">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Min" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.budgetMin} onChange={(e) => update("budgetMin", e.target.value)} />
              <input type="number" placeholder="Max" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} />
            </div>
          </FilterSection>

          <FilterSection label="Flight range (nm min)">
            <input type="number" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.minRange} onChange={(e) => update("minRange", e.target.value)} />
          </FilterSection>

          <FilterSection label="Luxury amenities">
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.amenities} onChange={(e) => update("amenities", e.target.value)}>
              <option value="">Any amenity</option>
              {Object.entries(AMENITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </FilterSection>

          <FilterSection label="Flight scope">
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" value={filters.scope} onChange={(e) => update("scope", e.target.value)}>
              <option value="">Any scope</option>
              <option value="domestic">Domestic only</option>
              <option value="international">International</option>
            </select>
          </FilterSection>

          <FilterSection label="Advanced filters">
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={filters.petFriendly === "true"} onChange={(e) => update("petFriendly", e.target.checked ? "true" : "")} className="h-4 w-4 rounded accent-green-600" />
                <i className="ph ph-paw-print text-base text-slate-400" />
                Pet friendly
              </label>
              <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={filters.smoking === "true"} onChange={(e) => update("smoking", e.target.checked ? "true" : "")} className="h-4 w-4 rounded accent-green-600" />
                <i className="ph ph-cigarette text-base text-slate-400" />
                Smoking allowed
              </label>
            </div>
          </FilterSection>

          <button className="w-full rounded-2xl bg-green-600 py-2.5 text-sm font-black text-white hover:bg-green-700 transition-colors shadow-md shadow-green-600/20">
            Apply filters
          </button>
        </form>

        {/* ── RESULTS ── */}
        <section>
          {/* Category quick-filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            {["", "private_jet", "air_charter", "helicopter", "safari", "medevac", "scenic"].map((cat) => (
              <button
                key={cat || "all"}
                onClick={() => { update("category", cat); setParams(cat ? { ...Object.fromEntries(params.entries()), category: cat } : Object.fromEntries([...params.entries()].filter(([k]) => k !== "category"))); }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${filters.category === cat ? "bg-green-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:border-green-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"}`}
              >
                {cat ? (CATEGORY_LABELS[cat] || cat) : "All aircraft"}
              </button>
            ))}
          </div>

          {loading && (
            <div className="grid gap-5 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-72 rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6">
              <i className="ph ph-warning-circle text-2xl text-rose-500" />
              <p className="mt-2 font-bold text-rose-700">{error}</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
              <i className="ph ph-airplane-tilt text-4xl text-slate-300" />
              <p className="mt-3 text-lg font-black">No compliant aircraft match this route.</p>
              <p className="mt-2 text-sm text-slate-500">Try adjusting filters or request a custom charter quote.</p>
              <a href={`/aviation/charter${search}`} className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-black text-white hover:bg-green-700 transition-colors shadow-sm">
                <i className="ph ph-paper-plane-tilt text-base" />
                Request a custom charter
              </a>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2">
              {sorted.map((item) => (
                <AircraftCard key={item.aircraft.id} item={item} search={search} />
              ))}
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="mt-8 rounded-3xl border border-green-100 bg-green-50 p-5 dark:border-green-900/30 dark:bg-green-950/20">
              <div className="flex items-start gap-3">
                <i className="ph ph-paper-plane-tilt text-xl text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <p className="font-black text-green-900 dark:text-green-300">Can't find the right aircraft?</p>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400">Submit a custom charter request. Verified operators will quote within 2 hours with alternative aircraft options.</p>
                  <a href={`/aviation/charter${search}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-black text-green-600 hover:underline dark:text-green-400">
                    Request a charter quote →
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AviationLayout>
  );
}

function FilterSection({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{label}</p>
      {children}
    </div>
  );
}
