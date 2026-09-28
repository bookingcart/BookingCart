import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import AircraftCard from "../components/aviation/AircraftCard.jsx";
import { aviationRequest, searchQuery } from "../lib/aviationClient.js";

const GROUPS = [
  { id: "private_jet", title: "Private Jets", copy: "Light through ultra-long-range cabins for executive and VIP travel.", icon: "ph-airplane-takeoff" },
  { id: "air_charter", title: "Air Charters", copy: "Safari transfers, island hops, group movements, and air ambulance.", icon: "ph-path" },
  { id: "helicopter", title: "Helicopters", copy: "Scenic flights, lodge transfers, and airport connections.", icon: "ph-fan" },
];

export default function AviationPage() {
  const navigate = useNavigate();
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
    document.title = "Private Jets & Charters | BookingCart";
    aviationRequest("search", { query: { origin: "EBB", destination: "MFU", passengers: 4, departDate: "2026-11-12" } })
      .then((data) => setFeatured(data.results.slice(0, 3)))
      .catch(() => setFeatured([]));
    aviationRequest("airports").then((data) => setAirports(data.airports)).catch(() => {});
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    navigate(`/aviation/results${searchQuery(form)}`);
  }

  return (
    <AviationLayout>
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1540962351504-03099e0a754b?auto=format&fit=crop&w=2000&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
          <div className="text-white">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200">Luxury aviation</p>
            <h1 className="mt-3 max-w-xl text-4xl font-black tracking-tight sm:text-6xl">Private jets, charters, and helicopters in one itinerary.</h1>
            <p className="mt-4 max-w-lg text-base text-slate-200">Search by route, cabin, and budget. Every listing carries operator, safety, and range details before you request a quote.</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
              <a href="/aviation/charter" className="rounded-full bg-white px-4 py-2 text-slate-900">Request a charter</a>
              <a href="/aviation/itinerary" className="rounded-full border border-white/30 px-4 py-2">Murchison safari package</a>
            </div>
          </div>
          <form onSubmit={submit} className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white">
            <div className="mb-4 flex gap-2">
              {["oneway", "round"].map((type) => (
                <button key={type} type="button" onClick={() => update("tripType", type)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${form.tripType === type ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {type === "oneway" ? "One-way" : "Round trip"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Departure">
                <input list="aviation-airports" value={form.origin} onChange={(event) => update("origin", event.target.value)} className="field" required />
              </Field>
              <Field label="Arrival">
                <input list="aviation-airports" value={form.destination} onChange={(event) => update("destination", event.target.value)} className="field" required />
              </Field>
              <Field label="Departure date">
                <input type="date" value={form.departDate} onChange={(event) => update("departDate", event.target.value)} className="field" required />
              </Field>
              <Field label="Return date">
                <input type="date" value={form.returnDate} onChange={(event) => update("returnDate", event.target.value)} className="field" disabled={form.tripType !== "round"} />
              </Field>
              <Field label="Passengers">
                <input type="number" min="1" max="80" value={form.passengers} onChange={(event) => update("passengers", event.target.value)} className="field" />
              </Field>
              <Field label="Budget max (USD)">
                <input type="number" min="0" value={form.budgetMax} onChange={(event) => update("budgetMax", event.target.value)} className="field" placeholder="Any" />
              </Field>
            </div>
            <datalist id="aviation-airports">
              {airports.map((airport) => <option key={airport.code} value={airport.code}>{airport.city} — {airport.name}</option>)}
            </datalist>
            <button type="submit" className="mt-4 w-full rounded-2xl bg-emerald-700 py-3 text-sm font-black text-white hover:bg-emerald-800">Search aircraft</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {GROUPS.map((group) => (
            <a key={group.id} href={`/aviation/results${searchQuery({ ...form, category: group.id })}`} className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <i className={`ph ${group.icon} text-2xl text-emerald-700`} />
              <h2 className="mt-3 text-xl font-black">{group.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{group.copy}</p>
            </a>
          ))}
        </div>
        <div className="mt-12 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Entebbe to Murchison</p>
            <h2 className="mt-1 text-3xl font-black">Available for a safari departure</h2>
          </div>
          <a href="/aviation/airports" className="text-sm font-bold text-emerald-800">Airport directory</a>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {featured.map((item) => <AircraftCard key={item.aircraft.id} item={item} search={searchQuery({ origin: "EBB", destination: "MFU", departDate: "2026-11-12", passengers: 4, tripType: "oneway" })} />)}
        </div>
      </section>
      <style>{`.field{width:100%;border-radius:1rem;border:1px solid #e2e8f0;background:#fff;padding:.75rem 1rem;font-size:.875rem;font-weight:600}.dark .field{background:#0f172a;border-color:#1e293b}`}</style>
    </AviationLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
