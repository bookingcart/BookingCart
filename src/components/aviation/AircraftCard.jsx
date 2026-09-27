import { Link } from "react-router-dom";
import { categoryLabel, durationLabel, money } from "../../lib/aviationClient.js";

export default function AircraftCard({ item, search = "" }) {
  const aircraft = item.aircraft || item;
  const quote = item.quote;
  return (
    <Link
      to={`/aviation/aircraft/${aircraft.id}${search}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative h-52 overflow-hidden bg-slate-200 dark:bg-slate-800">
        {aircraft.images?.[0] ? (
          <img src={aircraft.images[0]} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><i className="ph ph-airplane-tilt text-4xl" /></div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800">
          {categoryLabel(aircraft.category)}
        </span>
        {aircraft.complianceReady && (
          <span className="absolute right-3 top-3 rounded-full bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white">Compliant</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black tracking-tight">{aircraft.name}</h3>
            <p className="text-sm text-slate-500">{aircraft.manufacturer} {aircraft.model}</p>
          </div>
          {quote && <p className="shrink-0 text-right text-lg font-black text-emerald-800 dark:text-emerald-300">{money(quote.price, quote.currency)}</p>}
        </div>
        <p className="text-sm text-slate-500">{aircraft.operatorName} · {aircraft.baseAirport}</p>
        <div className="mt-auto flex flex-wrap gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{aircraft.passengers} guests</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{aircraft.rangeNm} nm</span>
          {quote && <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{durationLabel(quote.durationMinutes)}</span>}
        </div>
      </div>
    </Link>
  );
}
