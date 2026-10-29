import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";

const TYPES = [
  { value: "", label: "All types", icon: "ph-air-traffic-control" },
  { value: "airport", label: "Airports", icon: "ph-airplane-tilt" },
  { value: "airstrip", label: "Airstrips", icon: "ph-road-horizon" },
  { value: "heliport", label: "Heliports", icon: "ph-fan" },
  { value: "private_terminal", label: "Private Terminals", icon: "ph-buildings" },
  { value: "vip_lounge", label: "VIP Lounges", icon: "ph-armchair" },
];

const TYPE_NOTES = {
  airport: "Full-service international & domestic",
  airstrip: "Remote grass or gravel strips",
  heliport: "Dedicated helicopter landing pads",
  private_terminal: "Exclusive FBO & private terminals",
  vip_lounge: "Premium departure & arrival lounges",
};

const SURFACE_CLASSES = {
  asphalt: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  gravel: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  grass: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  concrete: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
};

function typeIcon(value) {
  return TYPES.find((t) => t.value === value)?.icon || "ph-map-pin";
}

export default function AviationAirportsPage() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [selected, setSelected] = useState(null);

  // Debounce typing so the directory is not queried on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    document.title = "Airports, airstrips & VIP lounges | BookingCart";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    aviationRequest("airports", { query: { q, type } })
      .then((data) => {
        if (cancelled) return;
        setAirports(data.airports);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setAirports([]);
        setError(err.message || "Could not load the airport directory");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, type, nonce]);

  return (
    <AviationLayout>
      {/* ── HEADER BAND ── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-9 sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-300/90">Charter network</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-[34px]">
            Airports, airstrips &amp; lounges
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
            Runway details, customs availability, VIP ground services, and FBO information for the full charter network —
            including remote safari strips and private terminals.
          </p>

          <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl bg-white/5 px-3.5 ring-1 ring-inset ring-white/15 transition-colors focus-within:ring-emerald-400/60 lg:max-w-sm">
              <i className="ph ph-magnifying-glass text-sm text-white/50" aria-hidden="true" />
              <span className="sr-only">Search the airport directory</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search city, code, or name"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <i className="ph ph-x text-sm" aria-hidden="true" />
                </button>
              )}
            </label>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by location type">
              {TYPES.map((t) => {
                const active = type === t.value;
                return (
                  <button
                    key={t.value || "all"}
                    type="button"
                    onClick={() => setType(t.value)}
                    aria-pressed={active}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors ${
                      active
                        ? "bg-white text-slate-950"
                        : "bg-white/5 text-white/70 ring-1 ring-inset ring-white/15 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <i className={`ph ${t.icon} text-[13px]`} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {loading
              ? "Searching the network"
              : error
                ? "Directory unavailable"
                : type
                  ? `${airports.length} ${TYPES.find((t) => t.value === type)?.label}`
                  : `${airports.length} locations`}
          </p>
          {q && <p className="truncate text-[11px] text-slate-400">Results for “{q}”</p>}
        </div>

        {loading ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
            <i className="ph ph-warning-circle mt-0.5 text-lg text-rose-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">We could not load the airport directory</p>
              <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">{error}</p>
              <button
                type="button"
                onClick={() => setNonce((v) => v + 1)}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-700 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-rose-600"
              >
                <i className="ph ph-arrow-clockwise text-sm" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        ) : airports.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <i className="ph ph-air-traffic-control text-2xl text-slate-400" aria-hidden="true" />
            </span>
            <p className="mt-4 text-lg font-semibold tracking-tight">No airports match this search</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Try a different city or code, or widen the location type.
            </p>
            {(q || type) && (
              <button
                type="button"
                onClick={() => { setQuery(""); setType(""); }}
                className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {airports.map((airport) => {
              const open = selected?.code === airport.code;
              const detailsId = `airport-${airport.code}`;
              return (
                <article
                  key={airport.code}
                  className={`flex flex-col rounded-2xl border bg-white p-5 transition-colors dark:bg-slate-900 ${
                    open
                      ? "border-slate-300 dark:border-slate-600"
                      : "border-slate-200/80 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                        <i className={`ph ${typeIcon(airport.type)} text-lg text-slate-600 dark:text-slate-300`} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                            {airport.code}
                          </span>
                          <span className="text-[11px] capitalize text-slate-400">{airport.type?.replaceAll("_", " ")}</span>
                        </div>
                        <h2 className="mt-0.5 truncate text-[15px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
                          {airport.name}
                        </h2>
                        <p className="mt-0.5 truncate text-[13px] text-slate-500 dark:text-slate-400">
                          {airport.city}, {airport.country}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        airport.customs
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {airport.customs ? "Customs" : "No customs"}
                    </span>
                  </div>

                  {airport.runway && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-slate-100 py-2.5 text-[13px] dark:border-slate-800">
                      <i className="ph ph-road-horizon text-slate-400" aria-hidden="true" />
                      <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
                        {airport.runway.lengthM?.toLocaleString()} m runway
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${SURFACE_CLASSES[airport.runway.surface] || "bg-slate-100 text-slate-600"}`}>
                        {airport.runway.surface}
                      </span>
                    </div>
                  )}

                  {(airport.groundServices || []).length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {(airport.groundServices || []).map((svc) => (
                        <li
                          key={svc}
                          className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-medium capitalize text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        >
                          {svc.replaceAll("_", " ")}
                        </li>
                      ))}
                    </ul>
                  )}

                  {open && airport.info && (
                    <p id={detailsId} className="mt-3 rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {airport.info}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <Link
                      to={`/aviation/results?origin=${airport.code}`}
                      className="group inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      Search flights from {airport.code}
                      <i className="ph ph-arrow-right text-[12px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                    {airport.info && (
                      <button
                        type="button"
                        onClick={() => setSelected(open ? null : airport)}
                        aria-expanded={open}
                        aria-controls={detailsId}
                        className="shrink-0 text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {open ? "Hide info" : "More info"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Location type guide */}
        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">About the charter network</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {TYPES.filter((t) => t.value).map((t) => (
              <div key={t.value} className="flex items-start gap-2.5">
                <i className={`ph ${t.icon} mt-0.5 text-base text-emerald-700 dark:text-emerald-400`} aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{TYPE_NOTES[t.value]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AviationLayout>
  );
}
