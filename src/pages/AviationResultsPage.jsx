import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import AircraftCard from "../components/aviation/AircraftCard.jsx";
import { AMENITY_LABELS, aviationRequest, searchQuery } from "../lib/aviationClient.js";

const EMPTY = {
  origin: "EBB", destination: "MFU", tripType: "oneway", departDate: "", returnDate: "",
  passengers: 1, category: "", budgetMin: "", budgetMax: "", manufacturer: "", minRange: "",
  amenities: "", petFriendly: "", smoking: "", scope: "",
};

export default function AviationResultsPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ ...EMPTY, ...Object.fromEntries(params.entries()) });
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(null);

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

  return (
    <AviationLayout>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[280px_1fr]">
        <form onSubmit={apply} className="h-fit space-y-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-black">Refine charter</h1>
          <label className="block text-xs font-bold text-slate-500">Departure<input className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.origin} onChange={(event) => update("origin", event.target.value)} /></label>
          <label className="block text-xs font-bold text-slate-500">Arrival<input className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.destination} onChange={(event) => update("destination", event.target.value)} /></label>
          <label className="block text-xs font-bold text-slate-500">Category
            <select className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.category} onChange={(event) => update("category", event.target.value)}>
              <option value="">Any</option>
              <option value="private_jet">Private jets</option>
              <option value="air_charter">Air charters</option>
              <option value="helicopter">Helicopters</option>
              <option value="safari">Safari transfers</option>
              <option value="medevac">Medical evacuation</option>
              <option value="scenic">Scenic flights</option>
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">Manufacturer<input className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.manufacturer} onChange={(event) => update("manufacturer", event.target.value)} /></label>
          <label className="block text-xs font-bold text-slate-500">Minimum range (nm)<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.minRange} onChange={(event) => update("minRange", event.target.value)} /></label>
          <label className="block text-xs font-bold text-slate-500">Budget max<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.budgetMax} onChange={(event) => update("budgetMax", event.target.value)} /></label>
          <label className="block text-xs font-bold text-slate-500">Amenities
            <select className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.amenities} onChange={(event) => update("amenities", event.target.value)}>
              <option value="">Any</option>
              {Object.entries(AMENITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={filters.petFriendly === "true"} onChange={(event) => update("petFriendly", event.target.checked ? "true" : "")} /> Pet friendly</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={filters.smoking === "true"} onChange={(event) => update("smoking", event.target.checked ? "true" : "")} /> Smoking allowed</label>
          <label className="block text-xs font-bold text-slate-500">Flight scope
            <select className="mt-1 w-full rounded-xl border px-3 py-2" value={filters.scope} onChange={(event) => update("scope", event.target.value)}>
              <option value="">Any</option>
              <option value="domestic">Domestic</option>
              <option value="international">International</option>
            </select>
          </label>
          <button className="w-full rounded-2xl bg-emerald-700 py-2.5 text-sm font-black text-white">Apply filters</button>
        </form>
        <section>
          <p className="text-sm text-slate-500">{route ? `${route.origin.city} to ${route.destination.city}` : "Searching"} · {results.length} aircraft</p>
          <h2 className="mt-1 text-3xl font-black">Available aircraft</h2>
          {loading && <p className="mt-8 text-slate-500">Checking range, availability, and compliance…</p>}
          {error && <p className="mt-8 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 p-8">
              <p className="font-bold">No compliant aircraft match this route.</p>
              <a href={`/aviation/charter${search}`} className="mt-3 inline-block text-sm font-bold text-emerald-800">Request a custom charter instead</a>
            </div>
          )}
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {results.map((item) => <AircraftCard key={item.aircraft.id} item={item} search={search} />)}
          </div>
        </section>
      </div>
    </AviationLayout>
  );
}
