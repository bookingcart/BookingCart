import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";

const TYPES = ["", "airport", "airstrip", "heliport", "private_terminal", "vip_lounge"];

export default function AviationAirportsPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [airports, setAirports] = useState([]);

  useEffect(() => {
    document.title = "Airports and airstrips | BookingCart";
    aviationRequest("airports", { query: { q, type } }).then((data) => setAirports(data.airports)).catch(() => setAirports([]));
  }, [q, type]);

  return (
    <AviationLayout>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-4xl font-black">Airports, airstrips, and lounges</h1>
        <p className="mt-2 max-w-2xl text-slate-500">Runway, customs, and ground services for the charter network, including safari strips and private terminals.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search city or code" className="rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900" />
          <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900">
            {TYPES.map((item) => <option key={item || "all"} value={item}>{item || "All types"}</option>)}
          </select>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {airports.map((airport) => (
            <article key={airport.code} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">{airport.code} · {airport.type.replaceAll("_", " ")}</p>
                  <h2 className="mt-1 text-xl font-black">{airport.name}</h2>
                  <p className="text-sm text-slate-500">{airport.city}, {airport.country}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${airport.customs ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{airport.customs ? "Customs" : "No customs"}</span>
              </div>
              {airport.runway && <p className="mt-3 text-sm">Runway {airport.runway.lengthM} m · {airport.runway.surface}</p>}
              <p className="mt-2 text-sm text-slate-500">{airport.info}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(airport.groundServices || []).map((service) => <span key={service} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold dark:bg-slate-800">{service.replaceAll("_", " ")}</span>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </AviationLayout>
  );
}
