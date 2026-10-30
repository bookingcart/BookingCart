import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cinemaGet, money, todayISO } from '../lib/cinemaClient.js';
import { buildPlayingFilms, movieMeta, nextShowLabel, rankFilms } from '../lib/cinemaMovies.js';

const FALLBACK_CINEMA = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80';
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80';

const PANEL_CLASS = 'rounded-3xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900';

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

function filmHref(cinemaId, movieId) {
  return `/attractions/cinemas/${cinemaId}/movie/${movieId}`;
}

/** Backdrop hero for the top film, with a slide per featured movie. */
function HeroSpotlight({ cinema, entries, index, onIndexChange }) {
  const hero = entries[index] || null;
  const meta = movieMeta(hero);
  const total = entries.length;

  return (
    <section className="relative isolate overflow-hidden bg-slate-950">
      <div aria-hidden="true" className="absolute inset-0">
        {total === 0 ? (
          <img
            src={cinema.image || FALLBACK_CINEMA}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            onError={(event) => { event.currentTarget.src = FALLBACK_CINEMA; }}
          />
        ) : (
          entries.map((entry, position) => (
            <img
              key={entry.id}
              src={entry.posterUrl || entry.backdropUrl || cinema.image || FALLBACK_CINEMA}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover object-[50%_22%] transition-opacity duration-700 ${
                position === index ? 'opacity-95' : 'opacity-0'
              }`}
              onError={(event) => { event.currentTarget.src = FALLBACK_CINEMA; }}
            />
          ))
        )}
        {/* On phones the hero copy spans the full width, so a light scrim keeps it legible over bright posters. */}
        <div className="absolute inset-0 bg-slate-950/35 sm:hidden" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-slate-950/60" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col justify-end px-4 pb-12 pt-6 sm:min-h-[540px] sm:px-6 sm:pb-14">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/attractions/cinemas"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur transition-colors hover:border-white/35 hover:text-white"
          >
            <i className="ph ph-arrow-left" /> All cinemas
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur">
            <i className="ph ph-map-pin text-emerald-400" />
            {[cinema.city, cinema.country].filter(Boolean).join(', ') || 'Location to be confirmed'}
          </span>
        </div>

        <p className="mt-8 text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300">
          {hero ? `#${String(index + 1).padStart(2, '0')} · Now playing at ${cinema.name}` : cinema.name}
        </p>

        <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl">
          <span className="bg-gradient-to-r from-white via-emerald-100 to-sky-200 bg-clip-text text-transparent">
            {hero?.title || 'Screenings at this cinema'}
          </span>
        </h1>

        {hero ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold text-slate-300 sm:text-xs">
              {meta.map((entry, position) => (
                <span
                  key={`${entry}-${position}`}
                  className={position === 0 && hero.ageRating ? 'rounded-md border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-white' : ''}
                >
                  {entry}
                </span>
              ))}
            </div>

            {hero.synopsis && (
              <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-slate-300 line-clamp-3">
                {hero.synopsis}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link
                to={filmHref(cinema.id, hero.id)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/40 transition-transform hover:scale-[1.02]"
              >
                <i className="ph-fill ph-ticket text-base text-emerald-600" /> Book tickets
              </Link>
              {hero.trailerUrl && (
                <a
                  href={hero.trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:border-white/50 hover:bg-white/15"
                >
                  <i className="ph-fill ph-play-circle text-lg" /> Watch trailer
                </a>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] font-bold text-slate-200 backdrop-blur">
                {hero.fromPrice
                  ? <><span className="text-slate-400">from</span> {money(hero.fromPrice, cinema.currency)}</>
                  : 'See showtimes'}
              </span>
            </div>
          </>
        ) : (
          <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-slate-300">
            {cinema.description || 'Browse what is playing here and pick a screening to lock your seats.'}
          </p>
        )}

        {total > 1 && (
          <div className="mt-8 flex items-center gap-3">
            <div className="flex flex-1 items-center gap-1.5" role="tablist" aria-label="Featured films">
              {entries.map((entry, position) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={position === index}
                  aria-label={`Feature ${entry.title}`}
                  onClick={() => onIndexChange(position)}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    position === index
                      ? 'w-10 bg-gradient-to-r from-emerald-400 to-sky-400'
                      : 'w-10 bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous featured film"
                onClick={() => onIndexChange((index - 1 + total) % total)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:border-white/50 hover:bg-white/10"
              >
                <i className="ph ph-caret-left" />
              </button>
              <button
                type="button"
                aria-label="Next featured film"
                onClick={() => onIndexChange((index + 1) % total)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:border-white/50 hover:bg-white/10"
              >
                <i className="ph ph-caret-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Ranked poster, streaming-app style: the numeral sits behind the artwork. */
function RankCard({ movie, rank, cinemaId }) {
  return (
    <Link
      to={filmHref(cinemaId, movie.id)}
      className="group flex shrink-0 snap-start items-end text-left"
    >
      <span
        aria-hidden="true"
        className="w-[72px] shrink-0 select-none pb-1 text-center text-[96px] font-black leading-[0.68] tracking-tighter text-transparent [-webkit-text-stroke:2px_rgba(148,163,184,0.6)] dark:[-webkit-text-stroke:2px_rgba(203,213,225,0.45)]"
      >
        {rank}
      </span>
      <span className="relative -ml-5 block w-[124px] overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-200 shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl dark:border-slate-800 dark:bg-slate-800">
        <span className="block aspect-[2/3]">
          <Poster src={movie.posterUrl} title={movie.title} className="h-full w-full object-cover" />
        </span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-2 pb-2 pt-6">
          <span className="line-clamp-2 block text-[10px] font-black leading-tight text-white">{movie.title}</span>
        </span>
      </span>
    </Link>
  );
}

/** Plain poster tile used by the "every film" rail. */
function MovieTile({ movie, today, currency, cinemaId }) {
  return (
    <Link
      to={filmHref(cinemaId, movie.id)}
      className="group w-[132px] shrink-0 snap-start text-left sm:w-[148px]"
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-200 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl dark:border-slate-800 dark:bg-slate-800">
        <Poster src={movie.posterUrl} title={movie.title} className="h-full w-full object-cover" />
        {movie.ageRating && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-black text-white">
            {movie.ageRating}
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent px-2 pb-2 pt-8">
          <span className="block text-[10px] font-black text-emerald-300">
            {movie.fromPrice ? `from ${money(movie.fromPrice, currency)}` : 'See times'}
          </span>
        </span>
      </span>
      <p className="mt-2 line-clamp-2 text-[11px] font-black leading-tight text-slate-900 dark:text-white">{movie.title}</p>
      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
        {nextShowLabel(movie.nextShow, today) || `${movie.shows.length} screenings`}
      </p>
    </Link>
  );
}

export default function CinemaDetailsPage() {
  const { cinemaId } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);

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

  const today = todayISO();
  const movies = page?.movies || [];
  const showtimes = page?.showtimes || [];

  const playing = useMemo(() => buildPlayingFilms(movies, showtimes, today), [movies, showtimes, today]);
  const ranked = useMemo(() => rankFilms(playing), [playing]);
  const heroEntries = useMemo(() => ranked.slice(0, 5), [ranked]);
  const safeHeroIndex = Math.min(heroIndex, Math.max(0, heroEntries.length - 1));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="h-[420px] animate-pulse bg-slate-900/90 sm:h-[540px]" />
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-6 flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="h-44 w-28 shrink-0 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
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
  const screeningCount = showtimes.length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <HeroSpotlight
        cinema={cinema}
        entries={heroEntries}
        index={safeHeroIndex}
        onIndexChange={setHeroIndex}
      />

      {/* Venue bar — the cinema keeps its identity under the film hero. */}
      <div className="relative z-10 mx-auto -mt-9 max-w-6xl px-4 sm:px-6">
        <div className={`${PANEL_CLASS} p-4 shadow-xl shadow-slate-900/5 sm:p-5`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">{cinema.name}</h2>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <i className="ph ph-map-pin text-emerald-600" />
              {[cinema.address, cinema.city, cinema.country].filter(Boolean).join(' · ') || 'Location to be confirmed'}
            </p>
            {screens.length > 0 && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <i className="ph ph-monitor-play text-emerald-600" />
                {screens.length} {screens.length === 1 ? 'screen' : 'screens'}
              </p>
            )}
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <i className="ph ph-film-strip text-emerald-600" />
              {playing.length} {playing.length === 1 ? 'film' : 'films'} · {screeningCount}{' '}
              {screeningCount === 1 ? 'screening' : 'screenings'}
            </p>
            {cinema.openingHours?.open && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <i className="ph ph-clock text-emerald-600" />
                Box office {cinema.openingHours.open}–{cinema.openingHours.close || 'late'}
              </p>
            )}
            <Link
              to="/attractions/cinemas"
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <i className="ph ph-arrow-left" /> All cinemas
            </Link>
          </div>

          {cinema.amenities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cinema.amenities.slice(0, 8).map((amenity) => (
                <span
                  key={amenity}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                >
                  <i className={`ph ${amenityIcon(amenity)} text-xs text-emerald-600 dark:text-emerald-400`} />
                  {amenity}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {playing.length === 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className={`${PANEL_CLASS} px-6 py-16 text-center`}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400 dark:bg-slate-800">
              <i className="ph ph-calendar-x" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">No screenings in the next 14 days</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Nothing is scheduled at {cinema.name} yet. Check back soon, or browse another cinema nearby.
            </p>
            <Link
              to="/attractions/cinemas"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <i className="ph ph-film-strip" /> Browse cinemas
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Top 10 rail */}
          <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Top 10 this week</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Most screenings at {cinema.name} over the next seven days.
                </p>
              </div>
              <span className="hidden text-[10px] font-black uppercase tracking-widest text-slate-400 sm:inline">
                Tap a poster for showtimes
              </span>
            </div>
            <div className="flex snap-x gap-1 overflow-x-auto pb-2 no-scrollbar">
              {ranked.slice(0, 10).map((movie, position) => (
                <RankCard
                  key={movie.id}
                  movie={movie}
                  rank={position + 1}
                  cinemaId={cinema.id}
                />
              ))}
            </div>
          </section>

          {/* Every film rail */}
          <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Select a movie to watch</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {playing.length} {playing.length === 1 ? 'film' : 'films'} playing here · live seat availability.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-400">Next 14 days</span>
            </div>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3 no-scrollbar">
              {[...playing]
                .sort((a, b) => String(a.title).localeCompare(String(b.title)))
                .map((movie) => (
                  <MovieTile
                    key={movie.id}
                    movie={movie}
                    today={today}
                    currency={cinema.currency}
                    cinemaId={cinema.id}
                  />
                ))}
            </div>
          </section>
        </>
      )}

      {/* Practical info */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${PANEL_CLASS} p-5`}>
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <i className="ph ph-info text-emerald-600" /> Good to know
            </h3>
            <ul className="mt-3 space-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <li className="flex gap-2"><i className="ph ph-timer mt-0.5 text-emerald-600" /> Seats are held for a limited time while you pay.</li>
              <li className="flex gap-2"><i className="ph ph-qr-code mt-0.5 text-emerald-600" /> Each seat gets its own QR ticket.</li>
              <li className="flex gap-2"><i className="ph ph-printer mt-0.5 text-emerald-600" /> Show the QR on your phone or print it at home.</li>
            </ul>
          </div>

          <div className={`${PANEL_CLASS} p-5`}>
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
        </div>

        {cinema.description && (
          <div className={`${PANEL_CLASS} mt-4 p-5`}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">About this cinema</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{cinema.description}</p>
          </div>
        )}
      </section>
    </div>
  );
}
