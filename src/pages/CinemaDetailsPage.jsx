import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { cinemaGet, clockLabel, dayParts, money, shortDate, todayISO } from '../lib/cinemaClient.js';

const FALLBACK_CINEMA = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80';
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80';

const AMENITY_ICONS = {
  parking: 'ph-car-profile',
  'wheelchair access': 'ph-wheelchair',
  wheelchair: 'ph-wheelchair',
  'food court': 'ph-hamburger',
  snacks: 'ph-popcorn',
  'dolby atmos': 'ph-speaker-high',
  imax: 'ph-monitor-play',
  '3d': 'ph-glasses',
  'air conditioning': 'ph-snowflake',
  'card payment': 'ph-credit-card',
  'online booking': 'ph-globe',
  wifi: 'ph-wifi-high',
};

function amenityIcon(label) {
  const key = String(label || '').toLowerCase().trim();
  return AMENITY_ICONS[key] || 'ph-check-circle';
}

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

/** One movie plus every screening it has on the selected day. */
function MovieBlock({ movie, showtimes, currency, cinemaId }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative w-[92px] shrink-0 sm:w-[112px]">
          <div className="aspect-[2/3] overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-800">
            <Poster src={movie?.posterUrl} title={movie?.title} className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-black leading-tight text-slate-900 dark:text-white sm:text-lg">
              {movie?.title || 'Untitled feature'}
            </h3>
            {movie?.ageRating && (
              <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {movie.ageRating}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {movie?.durationMin > 0 && (
              <span className="inline-flex items-center gap-1">
                <i className="ph ph-clock text-[11px]" /> {movie.durationMin} min
              </span>
            )}
            {movie?.genre && (
              <span className="inline-flex items-center gap-1">
                <i className="ph ph-mask-happy text-[11px]" /> {movie.genre}
              </span>
            )}
            {movie?.language && (
              <span className="inline-flex items-center gap-1">
                <i className="ph ph-translate text-[11px]" /> {movie.language}
              </span>
            )}
            {movie?.subtitles && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {movie.subtitles}
              </span>
            )}
          </div>

          {movie?.synopsis && (
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
              {movie.synopsis}
            </p>
          )}

          <div className="mt-3.5 flex flex-wrap gap-2">
            {showtimes.map((show) => {
              const full = show.seatsTotal > 0 && show.seatsSold >= show.seatsTotal;
              const closed = show.status === 'cancelled' || show.status === 'completed';
              const remaining = show.seatsTotal - show.seatsSold;
              const badge = full
                ? 'Sold out'
                : remaining > 0 && remaining <= 20
                  ? `${remaining} left`
                  : null;

              const inner = (
                <>
                  <span className="text-sm font-black tabular-nums">{clockLabel(show.startTime)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                    {show.format || '2D'} · {show.screenName}
                  </span>
                  {badge && (
                    <span
                      className={`text-[9px] font-black uppercase tracking-wide ${
                        full ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </>
              );

              const base =
                'flex min-w-[104px] flex-col items-center gap-0.5 rounded-2xl border px-3 py-2.5 transition-all duration-200';

              if (closed || full) {
                return (
                  <span
                    key={show.id}
                    aria-disabled="true"
                    className={`${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500`}
                  >
                    {inner}
                  </span>
                );
              }

              return (
                <Link
                  key={show.id}
                  to={`/attractions/cinemas/${cinemaId}/seats/${show.id}`}
                  className={`${base} border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-100 hover:shadow-md hover:shadow-emerald-500/10 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/70`}
                >
                  {inner}
                  <span className="text-[10px] font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                    {money(show.basePrice, show.currency || currency)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CinemaDetailsPage() {
  const { cinemaId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('cinema', { cinemaId });
    if (payload.ok) {
      setPage(payload);
      setError('');
    } else {
      setError(payload.error || 'This cinema could not be loaded');
    }
    setLoading(false);
  }, [cinemaId]);

  useEffect(() => { load(); }, [load]);

  const dates = page?.dates || [];
  const requested = searchParams.get('date') || '';
  const today = todayISO();

  // Prefer the requested day, then today, then the first day that has screenings.
  const activeDate = useMemo(() => {
    const known = new Set(dates.map((entry) => entry.date));
    if (requested && known.has(requested)) return requested;
    if (known.has(today)) return today;
    const nextWithShows = dates.find((entry) => entry.shows > 0);
    return nextWithShows?.date || dates[0]?.date || today;
  }, [requested, dates, today]);

  const showtimes = page?.showtimes || [];
  const movies = page?.movies || [];

  const byMovie = useMemo(() => {
    const forDay = showtimes
      .filter((show) => show.showDate === activeDate)
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    const groups = new Map();
    for (const show of forDay) {
      if (!groups.has(show.movieId)) groups.set(show.movieId, []);
      groups.get(show.movieId).push(show);
    }

    return Array.from(groups.entries())
      .map(([movieId, shows]) => {
        const movie = movies.find((entry) => Number(entry.id) === Number(movieId))
          || {
            id: movieId,
            title: shows[0]?.movieTitle,
            posterUrl: shows[0]?.posterUrl,
            durationMin: shows[0]?.durationMin,
            ageRating: shows[0]?.ageRating,
          };
        return { movie, shows };
      })
      .sort((a, b) => String(b.movie?.title || '').localeCompare(String(a.movie?.title || '')));
  }, [showtimes, movies, activeDate]);

  const selectDate = (date) => {
    const next = new URLSearchParams(searchParams);
    next.set('date', date);
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="h-64 animate-pulse bg-slate-900/90" />
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="mb-6 flex gap-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="h-16 w-14 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
          {[0, 1].map((key) => (
            <div key={key} className="mb-4 h-40 animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-rose-500 dark:bg-rose-950/40">
          <i className="ph ph-warning-circle" />
        </div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Cinema unavailable</h1>
        <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{error}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            Try again
          </button>
          <Link
            to="/attractions/cinemas"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            All cinemas
          </Link>
        </div>
      </div>
    );
  }

  const { cinema, screens } = page;
  const dayLabel = activeDate === today ? 'Today' : shortDate(activeDate);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Venue hero */}
      <section className="relative overflow-hidden bg-slate-950">
        <img
          src={cinema.image || FALLBACK_CINEMA}
          alt={cinema.name}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
          onError={(event) => { event.currentTarget.src = FALLBACK_CINEMA; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />
        <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-6 sm:px-6 sm:pb-10">
          <Link
            to="/attractions/cinemas"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur transition-colors hover:border-white/35 hover:text-white"
          >
            <i className="ph ph-arrow-left" /> All cinemas
          </Link>

          <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
            {cinema.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <i className="ph ph-map-pin text-emerald-400" />
              {[cinema.address, cinema.city, cinema.country].filter(Boolean).join(' · ') || 'Location to be confirmed'}
            </span>
            {screens.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <i className="ph ph-monitor-play text-emerald-400" />
                {screens.length} {screens.length === 1 ? 'screen' : 'screens'}
              </span>
            )}
          </p>

          {cinema.amenities.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {cinema.amenities.slice(0, 8).map((amenity) => (
                <span
                  key={amenity}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-100 backdrop-blur"
                >
                  <i className={`ph ${amenityIcon(amenity)} text-xs text-emerald-300`} />
                  {amenity}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {screens.map((screen) => (
              <span
                key={screen.id}
                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-300"
              >
                {screen.name}
                <span className="ml-1 font-bold normal-case tracking-normal text-slate-500">
                  {screen.screenType} · {screen.seatCount} seats
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        {/* Date strip */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200/70 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-6 sm:px-6">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((entry) => {
              const parts = dayParts(entry.date);
              const active = entry.date === activeDate;
              return (
                <button
                  key={entry.date}
                  type="button"
                  onClick={() => selectDate(entry.date)}
                  aria-pressed={active}
                  className={`flex w-[62px] shrink-0 flex-col items-center rounded-2xl border py-2 transition-all duration-200 ${
                    active
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span className={`text-[9px] font-black uppercase tracking-wider ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {parts.weekday}
                  </span>
                  <span className="text-lg font-black leading-tight tabular-nums">{parts.day}</span>
                  <span className={`text-[9px] font-bold uppercase ${active ? 'text-emerald-200' : 'text-slate-400'}`}>
                    {entry.shows > 0 ? `${entry.shows} ${entry.shows === 1 ? 'show' : 'shows'}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Screenings */}
        <section className="pt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              {dayLabel} <span className="text-slate-400">·</span> {byMovie.length} {byMovie.length === 1 ? 'film' : 'films'}
            </h2>
            {cinema.openingHours?.open && (
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <i className="ph ph-clock text-emerald-600" />
                Box office {cinema.openingHours.open}–{cinema.openingHours.close || 'late'}
              </p>
            )}
          </div>

          {byMovie.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-400 dark:bg-slate-800">
                <i className="ph ph-calendar-x" />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">No screenings on {dayLabel.toLowerCase()}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                Try another day — the calendar above shows how many screenings each day has.
              </p>
              {dates.some((entry) => entry.shows > 0) && (
                <button
                  type="button"
                  onClick={() => selectDate(dates.find((entry) => entry.shows > 0).date)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <i className="ph ph-calendar-check" /> Jump to the next screening day
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {byMovie.map((group) => (
                <MovieBlock
                  key={group.movie.id}
                  movie={group.movie}
                  showtimes={group.shows}
                  currency={cinema.currency}
                  cinemaId={cinema.id}
                />
              ))}
            </div>
          )}
        </section>

        {/* Practical info */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <i className="ph ph-info text-emerald-600" /> Good to know
            </h3>
            <ul className="mt-3 space-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <li className="flex gap-2"><i className="ph ph-timer mt-0.5 text-emerald-600" /> Seats are held for a limited time while you pay.</li>
              <li className="flex gap-2"><i className="ph ph-qr-code mt-0.5 text-emerald-600" /> Each seat gets its own QR ticket.</li>
              <li className="flex gap-2"><i className="ph ph-printer mt-0.5 text-emerald-600" /> Show the QR on your phone or print it at home.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <i className="ph ph-phone text-emerald-600" /> Contact the cinema
            </h3>
            <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {cinema.contact?.phone && (
                <p className="flex items-center gap-2">
                  <i className="ph ph-phone-call text-slate-400" />
                  <a href={`tel:${cinema.contact.phone}`} className="hover:text-emerald-600">{cinema.contact.phone}</a>
                </p>
              )}
              {cinema.contact?.email && (
                <p className="flex items-center gap-2">
                  <i className="ph ph-envelope-simple text-slate-400" />
                  <a href={`mailto:${cinema.contact.email}`} className="break-all hover:text-emerald-600">{cinema.contact.email}</a>
                </p>
              )}
              {cinema.contact?.website && (
                <p className="flex items-center gap-2">
                  <i className="ph ph-globe text-slate-400" />
                  <a href={cinema.contact.website} target="_blank" rel="noreferrer" className="break-all hover:text-emerald-600">
                    {cinema.contact.website}
                  </a>
                </p>
              )}
              {!cinema.contact?.phone && !cinema.contact?.email && !cinema.contact?.website && (
                <p className="text-slate-400">No contact details published yet.</p>
              )}
            </div>
          </div>
        </section>

        {cinema.description && (
          <section className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">About this cinema</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{cinema.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
