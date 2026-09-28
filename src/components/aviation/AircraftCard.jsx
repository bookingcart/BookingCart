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

  return (
    <Link
      to={`/aviation/aircraft/${aircraft.id}${search}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-transparent dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-slate-100 dark:bg-slate-800">
        {aircraft.images?.[0] ? (
          <img
            src={aircraft.images[0]}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <i className={`ph ${icon} text-5xl text-slate-300 dark:text-slate-600`} />
          </div>
        )}

        {/* Category badge */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-sm px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-800 shadow-sm">
          <i className={`ph ${icon} text-xs`} />
          {categoryLabel(aircraft.category)}
        </span>

        {/* Compliant badge */}
        {aircraft.complianceReady && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
            <i className="ph ph-shield-check text-xs" />
            AOC
          </span>
        )}

        {/* Price overlay */}
        {quote && (
          <div className="absolute bottom-0 right-0 m-3 rounded-2xl bg-slate-950/90 backdrop-blur-sm px-3 py-1.5">
            <p className="text-sm font-black text-white">{money(quote.price, quote.currency)}</p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-black tracking-tight group-hover:text-emerald-700 transition-colors">{aircraft.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{aircraft.manufacturer} {aircraft.model}</p>
        </div>

        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <i className="ph ph-buildings text-slate-400" />
          {aircraft.operatorName}
          <span className="mx-1 text-slate-300">·</span>
          <i className="ph ph-airport text-slate-400" />
          {aircraft.baseAirport}
        </p>

        {/* Specs pills */}
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            <i className="ph ph-users text-xs" />{aircraft.passengers} guests
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            <i className="ph ph-arrows-horizontal text-xs" />{aircraft.rangeNm?.toLocaleString()} nm
          </span>
          {quote && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
              <i className="ph ph-clock text-xs" />{durationLabel(quote.durationMinutes)}
            </span>
          )}
          {aircraft.cruiseSpeedKt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
              <i className="ph ph-lightning text-xs" />{aircraft.cruiseSpeedKt} kt
            </span>
          )}
        </div>

        {/* Amenity icons */}
        {(aircraft.amenities || []).length > 0 && (
          <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            {(aircraft.amenities || []).slice(0, 5).map((a) => (
              <i key={a} className={`ph ${AMENITY_ICONS[a] || "ph-star"} text-sm text-slate-400`} title={a.replaceAll("_", " ")} />
            ))}
            {(aircraft.amenities || []).length > 5 && (
              <span className="text-[10px] font-bold text-slate-400">+{aircraft.amenities.length - 5}</span>
            )}
          </div>
        )}

        {/* No-price CTA */}
        {!quote && (
          <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-emerald-700">{money(aircraft.hourlyRate)}/hr · Set route to quote →</p>
          </div>
        )}
      </div>
    </Link>
  );
}
