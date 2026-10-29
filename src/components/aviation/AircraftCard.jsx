import { Link } from "react-router-dom";
import { categoryLabel, durationLabel, money } from "../../lib/aviationClient.js";

const CATEGORY_ICONS = {
  light_jet: "ph-airplane",
  midsize_jet: "ph-airplane-tilt",
  super_midsize_jet: "ph-airplane-tilt",
  heavy_jet: "ph-airplane-in-flight",
  ultra_long_range: "ph-globe-hemisphere-east",
  business_jet: "ph-briefcase",
  executive_jet: "ph-crown",
  vip_jet: "ph-star",
  helicopter: "ph-fan",
  scenic: "ph-mountains",
  aerial_tour: "ph-camera",
  vip_transfer: "ph-crown",
  airport_transfer: "ph-airplane-landing",
  emergency: "ph-siren",
  corporate_flight: "ph-briefcase",
  safari: "ph-paw-print",
  medevac: "ph-first-aid-kit",
  on_demand: "ph-lightning",
  corporate: "ph-buildings",
  group: "ph-users-three",
  tourism: "ph-map-trifold",
  island: "ph-island",
  government: "ph-shield",
};

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

export default function AircraftCard({ item, search = "" }) {
  const aircraft = item.aircraft || item;
  const quote = item.quote;
  const icon = CATEGORY_ICONS[aircraft.category] || "ph-airplane-tilt";
  const amenities = aircraft.amenities || [];

  const stats = [
    [aircraft.passengers, "guests", "ph-users"],
    [aircraft.rangeNm?.toLocaleString(), "nm range", "ph-arrows-horizontal"],
    [aircraft.cruiseSpeedKt ? `${aircraft.cruiseSpeedKt} kt` : "", "cruise", "ph-gauge"],
  ].filter(([value]) => value);

  return (
    <Link
      to={`/aviation/aircraft/${aircraft.id}${search}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800">
        {aircraft.images?.[0] ? (
          <img
            src={aircraft.images[0]}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 pb-14 dark:from-slate-800 dark:to-slate-900">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 ring-1 ring-inset ring-white/80 dark:bg-white/5 dark:ring-white/10">
              <i className={`ph ${icon} text-xl text-slate-500 dark:text-slate-400`} aria-hidden="true" />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Photo on request</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-slate-950/5" />

        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-900 shadow-sm backdrop-blur-sm">
          <i className={`ph ${icon} text-[11px]`} aria-hidden="true" />
          {categoryLabel(aircraft.category)}
        </span>

        {aircraft.complianceReady && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-white shadow-sm backdrop-blur-sm">
            <i className="ph ph-shield-check text-[11px]" aria-hidden="true" />
            AOC
          </span>
        )}

        <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3 text-white">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {quote ? "Total charter" : "Hourly rate"}
            </p>
            <p className="mt-0.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
              {quote ? money(quote.price, quote.currency) : money(aircraft.hourlyRate)}
              {!quote && <span className="ml-1 text-xs font-medium text-white/70">/hr</span>}
            </p>
          </div>
          {quote && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
              <i className="ph ph-clock text-[11px]" aria-hidden="true" />
              {durationLabel(quote.durationMinutes)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">{aircraft.name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
          <span>{[aircraft.manufacturer, aircraft.model].filter(Boolean).join(" ")}</span>
          {aircraft.operatorName && <span className="text-slate-300 dark:text-slate-600">·</span>}
          {aircraft.operatorName && <span>{aircraft.operatorName}</span>}
          {aircraft.baseAirport && <span className="text-slate-300 dark:text-slate-600">·</span>}
          {aircraft.baseAirport && <span>{aircraft.baseAirport}</span>}
        </p>

        {stats.length > 0 && (
          <dl className="mt-3.5 grid grid-cols-3 divide-x divide-slate-100 border-y border-slate-100 py-2.5 dark:divide-slate-800 dark:border-slate-800">
            {stats.map(([value, label, statIcon]) => (
              <div key={label} className="px-1 text-center">
                <dt className="sr-only">{label}</dt>
                <dd className="flex items-center justify-center gap-1 text-[12px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  <i className={`ph ${statIcon} text-[12px] text-slate-400`} aria-hidden="true" />
                  {value}
                </dd>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-slate-400">{label}</p>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="flex items-center gap-2 text-slate-400">
            {amenities.slice(0, 4).map((amenity) => (
              <i
                key={amenity}
                className={`ph ${AMENITY_ICONS[amenity] || "ph-star"} text-[15px]`}
                title={amenity.replaceAll("_", " ")}
                aria-hidden="true"
              />
            ))}
            {amenities.length > 4 && <span className="text-[11px] font-semibold">+{amenities.length - 4}</span>}
            {amenities.length === 0 && <span className="text-[11px] text-slate-400">Cabin details on request</span>}
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 transition-colors group-hover:text-emerald-800 dark:text-emerald-400">
            View
            <i className="ph ph-arrow-right text-[13px] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
