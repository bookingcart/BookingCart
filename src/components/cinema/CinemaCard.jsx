// One cinema listing card. Shared by the cinemas index page and the home page's
// "Cinemas near you" rail so both read the exact same fields and link target.
import { Link } from 'react-router-dom';
import { money } from '../../lib/cinemaClient.js';

export const FALLBACK_CINEMA = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80';

export default function CinemaCard({ cinema, currency }) {
  return (
    <Link
      to={`/attractions/cinemas/${cinema.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/40"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-200 dark:bg-slate-800">
        <img
          src={cinema.image || FALLBACK_CINEMA}
          alt={cinema.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={(event) => { event.currentTarget.src = FALLBACK_CINEMA; }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-900 shadow-sm backdrop-blur">
            <i className="ph-fill ph-film-strip text-emerald-600 text-sm" /> Cinema
          </span>
          {cinema.upcomingShowtimes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
              {cinema.upcomingShowtimes} {cinema.upcomingShowtimes === 1 ? 'screening' : 'screenings'}
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="truncate text-lg font-black leading-tight text-white">{cinema.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-white/75">
            <i className="ph ph-map-pin text-[11px]" />
            {[cinema.city, cinema.country].filter(Boolean).join(', ') || 'Location to be confirmed'}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {cinema.description || 'Screens, showtimes and seats for this cinema.'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <i className="ph ph-monitor-play text-sm text-emerald-600" />
            {cinema.screens} {cinema.screens === 1 ? 'screen' : 'screens'}
          </span>
          <span className="text-sm font-black text-slate-900 dark:text-white">
            {cinema.fromPrice ? <><span className="text-[10px] font-bold text-slate-400">from </span>{money(cinema.fromPrice, currency || cinema.currency)}</> : 'See showtimes'}
          </span>
        </div>
      </div>
    </Link>
  );
}
