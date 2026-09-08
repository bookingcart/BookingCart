import { useNavigate } from 'react-router-dom';

const DEMAND_CONFIG = {
  'low': { label: 'Available', color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400' },
  'moderate': { label: 'Popular', color: 'text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400' },
  'high': { label: 'High Demand', color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' },
  'very-high': { label: 'Rare Find', color: 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400' },
};

function StarRating({ rating }) {
  const full = Math.floor(rating);
  const hasHalf = (rating % 1) >= 0.5;
  return (
    <div className="flex items-center gap-0.5 text-sm">
      {Array.from({ length: full }).map((_, i) => (
        <i key={i} className="ph-fill ph-star text-amber-400" />
      ))}
      {hasHalf && <i className="ph-fill ph-star-half text-amber-400" />}
    </div>
  );
}

export default function GuideCard({ guide, matchScore, matchReasons }) {
  const navigate = useNavigate();
  const demand = DEMAND_CONFIG[guide.demandLevel] || DEMAND_CONFIG['moderate'];
  
  // Extract primary category or top skill
  const primaryCategory = (guide.categories && guide.categories.length > 0) 
    ? guide.categories[0] 
    : ((guide.skills && guide.skills.length > 0) ? guide.skills[0] : 'Tour Guide');

  return (
    <article
      className="group flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer"
      onClick={() => navigate(`/tour-guides/${guide.slug}`)}
      role="button"
      aria-label={`View profile of ${guide.name}`}
    >
      {/* ── Photo Section ── */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
        <img
          src={guide.photo || (Array.isArray(guide.gallery) && (guide.gallery[0]?.url || guide.gallery[0])) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
          alt={guide.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/10 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
          {guide.verified && (
            <span className="inline-flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-full shadow-md backdrop-blur-md border border-emerald-500/30" title="Verified Guide">
              <i className="ph-fill ph-seal-check text-emerald-500 text-sm" /> Verified
            </span>
          )}
        </div>

        {matchScore != null && (
          <div className="absolute top-3 right-3 bg-green-500/95 backdrop-blur-md text-white px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
            <i className="ph-fill ph-sparkle text-xs" />
            <span className="text-[10px] font-black uppercase tracking-wider">{matchScore}% Match</span>
          </div>
        )}

        {/* Bottom Info inside Photo */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <StarRating rating={guide.rating || 4.9} />
              <span className="text-white font-bold text-sm leading-none mt-0.5">
                {Number(guide.rating || 4.9).toFixed(1)}
              </span>
              <span className="text-white/70 text-xs font-semibold mt-0.5">
                ({guide.reviewCount?.toLocaleString() || 0})
              </span>
            </div>
          </div>
          
          <div className="shrink-0 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-right">
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider leading-none mb-1">From</p>
            <p className="text-white font-black text-lg leading-none">
              ${guide.pricing?.perDay || 0}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content Section ── */}
      <div className="p-5 flex flex-col flex-1">
        
        {/* Title & Location */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight group-hover:text-green-600 transition-colors truncate">
              {guide.name}
            </h3>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold flex items-center gap-1.5">
            <i className="ph ph-map-pin text-green-500 text-base" />
            <span className="truncate">{guide.city}{guide.city && guide.country ? ', ' : ''}{guide.country}</span>
          </p>
        </div>

        {/* Key Features */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
            <i className="ph ph-briefcase" /> {primaryCategory}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
            <i className="ph ph-clock" /> {guide.yearsExp || 5}y Exp
          </span>
          {guide.languages && guide.languages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
              <i className="ph ph-translate" /> {guide.languages.length} Lang{guide.languages.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Match Reasons */}
        {matchReasons && matchReasons.length > 0 && (
          <div className="mt-auto mb-4 bg-green-50/50 dark:bg-green-950/20 rounded-xl p-2.5 border border-green-100 dark:border-green-900/50">
            <p className="text-[11px] font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5 truncate">
              <i className="ph-fill ph-check-circle" /> {matchReasons[0]}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${demand.color}`}>
            <i className="ph-fill ph-trend-up" /> {demand.label}
          </span>
          
          <span className="text-green-600 dark:text-green-500 font-bold text-sm flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            View Profile <i className="ph-bold ph-arrow-right" />
          </span>
        </div>

      </div>
    </article>
  );
}
