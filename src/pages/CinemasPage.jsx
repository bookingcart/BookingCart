import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cinemaGet, money } from '../lib/cinemaClient.js';

const FALLBACK_CINEMA = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80';
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80';

function Poster({ src, title, className = '' }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed || !src ? FALLBACK_POSTER : src}
      alt={title ? `${title} poster` : 'Movie poster'}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function CinemaCard({ cinema, currency }) {
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

export default function CinemasPage() {
  const [cinemas, setCinemas] = useState([]);
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (term) => {
    setLoading(true);
    const payload = await cinemaGet('cinemas', { search: term });
    if (payload.ok) {
      setCinemas(payload.cinemas || []);
      setError('');
    } else {
      setError(payload.error || 'Could not load cinemas');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  useEffect(() => {
    let alive = true;
    cinemaGet('now-showing').then((payload) => {
      if (!alive || !payload.ok) return;
      setMovies(payload.movies || []);
    });
    return () => { alive = false; };
  }, []);

  const cities = useMemo(() => {
    const seen = new Map();
    cinemas.forEach((cinema) => {
      if (cinema.city) seen.set(cinema.city.toLowerCase(), cinema.city);
    });
    return Array.from(seen.values()).slice(0, 6);
  }, [cinemas]);

  const submit = (event) => {
    event.preventDefault();
    const term = search.trim();
    setApplied(term);
    load(term);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Cinematic hero */}
      <section className="relative overflow-hidden bg-slate-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(900px 380px at 18% -10%, rgba(0,196,85,0.35), transparent 65%), radial-gradient(700px 340px at 88% 0%, rgba(56,189,248,0.22), transparent 60%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950 to-transparent"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 backdrop-blur">
            <i className="ph-fill ph-popcorn text-sm" /> Cinema
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
            Pick your screening.
            <span className="block text-emerald-400">Choose your exact seat.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm font-medium text-slate-300 sm:text-base">
            Browse cinemas near you, see what is playing today, and lock the seats you want with a countdown
            that holds them while you pay.
          </p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search cinemas by name or city</span>
              <i className="ph ph-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search a cinema or city…"
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 pl-11 pr-4 text-sm font-semibold text-white placeholder:text-slate-400 backdrop-blur focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-400"
            >
              <i className="ph-bold ph-magnifying-glass" /> Find cinemas
            </button>
          </form>

          {cities.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Popular</span>
              {cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => { setSearch(city); setApplied(city); load(city); }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    applied.toLowerCase() === city.toLowerCase()
                      ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                      : 'border-white/15 text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Now showing */}
      {movies.length > 0 && (
        <section className="mx-auto -mt-8 max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                <i className="ph-fill ph-film-slate text-emerald-600" /> Now showing
              </h2>
              <span className="text-[11px] font-bold text-slate-400">Next 14 days</span>
            </div>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {movies.map((movie) => (
                <div key={movie.id} className="w-[124px] shrink-0 snap-start sm:w-[140px]">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-800">
                    <Poster src={movie.posterUrl} title={movie.title} className="h-full w-full object-cover" />
                    {movie.ageRating && (
                      <span className="absolute right-1.5 top-1.5 rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-black text-white">
                        {movie.ageRating}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] font-black leading-tight text-slate-900 dark:text-white">{movie.title}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                    {movie.showings} {movie.showings === 1 ? 'showing' : 'showings'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Cinema list */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              {applied ? `Cinemas matching “${applied}”` : 'Cinemas on BookingCart'}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Every listing shows live seat availability for each screening.
            </p>
          </div>
          {applied && (
            <button
              type="button"
              onClick={() => { setSearch(''); setApplied(''); load(''); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <i className="ph ph-x" /> Clear search
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            <i className="ph ph-warning-circle text-lg" />
            <p className="flex-1">{error}</p>
            <button type="button" onClick={() => load(applied)} className="text-xs font-black uppercase">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            ))}
          </div>
        ) : cinemas.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600 dark:bg-emerald-950">
              <i className="ph ph-film-strip" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">No cinemas listed yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Cinemas appear here once a venue owner publishes their listing. If you run a cinema, you can add it
              from your attraction dashboard.
            </p>
            <Link
              to="/attraction-dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <i className="ph ph-storefront" /> List your cinema
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cinemas.map((cinema) => <CinemaCard key={cinema.id} cinema={cinema} />)}
          </div>
        )}
      </section>
    </div>
  );
}
