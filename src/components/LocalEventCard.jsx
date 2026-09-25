import React from 'react';
import { Link } from 'react-router-dom';

function AttractionImage({ image, name, className }) {
  if (image?.url) return <img src={image.url} alt={image.alt || name} className={className} loading="lazy" />;
  return <div className={`flex items-center justify-center bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 ${className}`}><i className="ph ph-image text-4xl" aria-hidden="true" /></div>;
}

export default function LocalEventCard({ item, onHover = () => {} }) {
  const offer = item.offers?.[0];
  const price = offer?.amount != null && offer?.currency 
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 }).format(offer.amount) 
    : '';

  return (
    <article
      id={`attraction-${item.id.replace(/[^a-z0-9_-]/gi, '-')}`}
      onMouseEnter={() => onHover(item.id)}
      onFocus={() => onHover(item.id)}
      className="group flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer"
    >
      <Link to={offer?.url || '#'} className="contents">
        {/* ── Photo Section ── */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
          <AttractionImage 
            image={item.image} 
            name={item.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/10 to-transparent pointer-events-none" />

          {/* Top Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-2 items-start pointer-events-none">
            <span className="inline-flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-full shadow-md backdrop-blur-md border border-emerald-500/30">
              <i className="ph-fill ph-seal-check text-emerald-500 text-sm" /> Verified
            </span>
          </div>

          <div className="absolute top-3 right-3 bg-emerald-500/95 backdrop-blur-md text-white px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm pointer-events-none">
            <i className="ph-fill ph-ticket text-xs" />
            <span className="text-[10px] font-black uppercase tracking-wider">Bookable</span>
          </div>

          {/* Bottom Info inside Photo */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 pointer-events-none">
            <div className="flex-1 min-w-0" />
            {price && (
              <div className="shrink-0 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-right">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider leading-none mb-1">From</p>
                <p className="text-white font-black text-lg leading-none">{price}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Content Section ── */}
        <div className="p-5 flex flex-col flex-1">
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight group-hover:text-green-600 transition-colors truncate">
                {item.name}
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold flex items-center gap-1.5">
              <i className="ph ph-map-pin text-green-500 text-base shrink-0" />
              <span className="truncate">{[item.city, item.country].filter(Boolean).join(', ')}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
              <i className="ph ph-calendar-check" /> Event
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
              <i className="ph ph-ticket" /> Instant Tickets
            </span>
          </div>

          <div className="mt-auto mb-4 bg-green-50/50 dark:bg-green-950/20 rounded-xl p-2.5 border border-green-100 dark:border-green-900/50">
            <p className="text-[11px] font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5 truncate">
              <i className="ph-fill ph-check-circle" /> {item.category}
            </p>
          </div>

          <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
              <i className="ph-fill ph-trend-up" /> Available
            </span>
            <span className="text-green-600 dark:text-green-500 font-bold text-sm flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Get Tickets <i className="ph-bold ph-arrow-right" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
