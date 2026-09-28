import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";

const TYPES = [
  { value: "", label: "All types", icon: "ph-airport" },
  { value: "airport", label: "Airports", icon: "ph-airplane-tilt" },
  { value: "airstrip", label: "Airstrips", icon: "ph-road-horizon" },
  { value: "heliport", label: "Heliports", icon: "ph-fan" },
  { value: "private_terminal", label: "Private Terminals", icon: "ph-buildings" },
  { value: "vip_lounge", label: "VIP Lounges", icon: "ph-armchair" },
];

const SURFACE_COLORS = {
  asphalt: "bg-slate-100 text-slate-700 dark:bg-slate-800",
  gravel: "bg-amber-100 text-amber-800",
  grass: "bg-green-100 text-green-800",
  concrete: "bg-blue-100 text-blue-800",
};

export default function AviationAirportsPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.title = "Airports, airstrips & VIP lounges | BookingCart";
    setLoading(true);
    aviationRequest("airports", { query: { q, type } })
      .then((data) => setAirports(data.airports))
      .catch(() => setAirports([]))
      .finally(() => setLoading(false));
  }, [q, type]);

  return (
    <AviationLayout>
      {/* Header */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Charter network</p>
          <h1 className="mt-2 text-4xl font-black">Airports, airstrips &amp; lounges</h1>
          <p className="mt-3 text-slate-500 max-w-2xl text-sm leading-relaxed">
            Runway details, customs availability, VIP ground services, and FBO information for the full charter network — including remote safari strips and private terminals.
          </p>

          {/* Search + filter */}
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900 min-w-64">
              <i className="ph ph-magnifying-glass text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search city, airport code, or name"
                className="bg-transparent text-sm font-semibold outline-none flex-1 placeholder-slate-400"
              />
              {q && <button onClick={() => setQ("")}><i className="ph ph-x text-slate-400 hover:text-slate-600" /></button>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-all border ${type === t.value ? "bg-emerald-700 text-white border-emerald-700 shadow-sm" : "border-slate-200 text-slate-600 hover:border-emerald-300 bg-white dark:border-slate-700 dark:text-slate-300 dark:bg-slate-900"}`}
                >
                  <i className={`ph ${t.icon} text-sm`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />
            ))}
          </div>
        ) : airports.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
            <i className="ph ph-airport text-4xl text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-black">No airports found</p>
            <p className="text-sm text-slate-500 mt-1">Try a different search term or category filter.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {airports.map((airport) => (
              <article
                key={airport.code}
                onClick={() => setSelected(selected?.code === airport.code ? null : airport)}
                className={`cursor-pointer rounded-3xl border bg-white p-5 transition-all hover:shadow-md dark:bg-slate-900 ${selected?.code === airport.code ? "border-emerald-400 shadow-emerald-100 dark:shadow-emerald-900/20" : "border-slate-200 dark:border-slate-800"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                      <i className={`ph ${TYPES.find((t) => t.value === airport.type)?.icon || "ph-airport"} text-lg text-emerald-700`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-700">{airport.code}</span>
                        <span className="text-xs text-slate-400 capitalize">{airport.type?.replaceAll("_", " ")}</span>
                      </div>
                      <h2 className="text-lg font-black mt-0.5 leading-tight">{airport.name}</h2>
                      <p className="text-sm text-slate-500">{airport.city}, {airport.country}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${airport.customs ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                      {airport.customs ? "Customs ✓" : "No customs"}
                    </span>
                  </div>
                </div>

                {/* Runway */}
                {airport.runway && (
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <i className="ph ph-road-horizon text-slate-400" />
                    <span className="font-semibold">{airport.runway.lengthM?.toLocaleString()} m runway</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SURFACE_COLORS[airport.runway.surface] || "bg-slate-100 text-slate-600"}`}>
                      {airport.runway.surface}
                    </span>
                  </div>
                )}

                {/* Ground services */}
                {(airport.groundServices || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(airport.groundServices || []).map((svc) => (
                      <span key={svc} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {svc.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded info */}
                {selected?.code === airport.code && airport.info && (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-xs font-bold uppercase text-slate-400 mb-1">About</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{airport.info}</p>
                  </div>
                )}

                {/* Quick search link */}
                <div className="mt-3 flex items-center justify-between">
                  <a
                    href={`/aviation/results?origin=${airport.code}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Search flights from {airport.code} →
                  </a>
                  <button className="text-xs text-slate-400 hover:text-slate-600">
                    {selected?.code === airport.code ? "Less info ▲" : "More info ▼"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Airport type guide */}
        <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
          <h2 className="font-black mb-4">About the charter network</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {TYPES.filter((t) => t.value).map((t) => (
              <div key={t.value} className="flex items-start gap-2.5">
                <i className={`ph ${t.icon} text-xl text-emerald-600 mt-0.5`} />
                <div>
                  <p className="text-sm font-black">{t.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t.value === "airport" && "Full-service international & domestic"}
                    {t.value === "airstrip" && "Remote grass or gravel strips"}
                    {t.value === "heliport" && "Dedicated helicopter landing pads"}
                    {t.value === "private_terminal" && "Exclusive FBO & private terminals"}
                    {t.value === "vip_lounge" && "Premium departure & arrival lounges"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AviationLayout>
  );
}
