import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { cinemaGet, clockLabel, dayParts, money, shortDate, todayISO } from '../lib/cinemaClient.js';
import { chronological } from '../lib/cinemaMovies.js';

const FALLBACK_CINEMA = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=80';
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80';

const PANEL_CLASS = 'rounded-3xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900';

const TIME_BUCKETS = [
  { id: 'all', label: 'Anytime' },
  { id: 'morning', label: 'Before 12:00' },
  { id: 'afternoon', label: '12:00 – 17:00' },
  { id: 'evening', label: 'After 17:00' },
];

/** Cheap bucketing for the "time of day" filter — an unknown time never hides a screening. */
function partOfDay(startTime) {
  const match = /^(\d{1,2}):/.exec(String(startTime || ''));
  if (!match) return '';
  const hour = Number(match[1]);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function Poster({ src, title, className = '' }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed || !src ? FALLBACK_POSTER : src}
      alt={title ? `${title} poster` : 'Movie poster'}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/** Month / day / weekday cards, the way cinema sites lay out the booking run. */
function DateStrip({ dates, activeDate, onSelect }) {
  const today = todayISO();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {dates.map((entry) => {
        const parts = dayParts(entry.date);
        const active = entry.date === activeDate;
        return (
          <button
            key={entry.date}
            type="button"
            onClick={() => onSelect(entry.date)}
            aria-pressed={active}
            aria-label={`${shortDate(entry.date)} · ${entry.shows} ${entry.shows === 1 ? 'show' : 'shows'}`}
            className={`flex w-[72px] shrink-0 flex-col items-center rounded-2xl border px-2 py-2.5 transition-all duration-200 ${
              active
                ? 'border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <span className={`text-[9px] font-black uppercase tracking-[0.16em] ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
              {parts.month}
            </span>
            <span className="text-xl font-black leading-tight tabular-nums">{parts.day}</span>
            <span className={`text-[9px] font-bold uppercase ${active ? 'text-emerald-200' : 'text-slate-400'}`}>
              {entry.date === today ? 'Today' : parts.weekday}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilterChips({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              active
                ? 'border-emerald-500 bg-emerald-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** One screen and every time this film plays there on the selected day. */
function ScreenGroup({ screen, shows, currency, cinemaId }) {
  return (
    <article className={PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800 sm:px-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
            <i className="ph ph-monitor-play text-emerald-600" />
            {screen.name || 'Screen'}
          </h3>
          <p className="mt-0.5 text-[11px] font-bold text-slate-400">
            {[screen.screenType, screen.seatCount > 0 ? `${screen.seatCount} seats` : ''].filter(Boolean).join(' · ') || 'Auditorium'}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-700">
          {shows.length} {shows.length === 1 ? 'time' : 'times'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
        {shows.map((show) => {
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
                {show.format || '2D'} · {money(show.basePrice, show.currency || currency)}
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

          const base = 'flex min-w-[116px] flex-col items-center gap-0.5 rounded-2xl border px-3 py-2.5 transition-all duration-200';

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
            </Link>
          );
        })}
      </div>
    </article>
  );
}

export default function CinemaMoviePage() {
  const { cinemaId, movieId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [format, setFormat] = useState('all');
  const [timeOfDay, setTimeOfDay] = useState('all');

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
  const requestedDate = searchParams.get('date') || '';

  const movie = useMemo(
    () => (page?.movies || []).find((entry) => String(entry.id) === String(movieId)) || null,
    [page, movieId]
  );

  const shows = useMemo(
    () => (page?.showtimes || [])
      .filter((show) => String(show.movieId) === String(movieId))
      .sort(chronological),
    [page, movieId]
  );

  /* The strip counts this film only, not the whole cinema. */
  const dates = useMemo(
    () => (page?.dates || []).map((entry) => ({
      date: entry.date,
      shows: shows.filter((show) => show.showDate === entry.date).length,
    })),
    [page, shows]
  );

  const activeDate = useMemo(() => {
    if (dates.some((entry) => entry.date === requestedDate)) return requestedDate;
    if (dates.find((entry) => entry.date === today)?.shows > 0) return today;
    const nextWithShows = dates.find((entry) => entry.shows > 0);
    return nextWithShows?.date || dates[0]?.date || today;
  }, [dates, requestedDate, today]);

  const dayShows = useMemo(
    () => shows.filter((show) => show.showDate === activeDate).sort(chronological),
    [shows, activeDate]
  );

  const formats = useMemo(() => {
    const seen = new Set();
    for (const show of shows) seen.add(show.format || '2D');
    return Array.from(seen);
  }, [shows]);

  const visibleShows = useMemo(
    () => dayShows.filter((show) => (format === 'all' || (show.format || '2D') === format)
      && (timeOfDay === 'all' || partOfDay(show.startTime) === timeOfDay)),
    [dayShows, format, timeOfDay]
  );

  const screensById = useMemo(() => {
    const map = new Map();
    for (const screen of page?.screens || []) map.set(Number(screen.id), screen);
    return map;
  }, [page]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const show of visibleShows) {
      const key = Number(show.screenId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(show);
    }
    return Array.from(map.entries()).map(([screenId, list]) => ({
      screenId,
      screen: screensById.get(screenId) || {
        name: list[0]?.screenName,
        screenType: list[0]?.screenType,
        seatCount: 0,
      },
      shows: list,
    }));
  }, [visibleShows, screensById]);

  const selectDate = (date) => {
    const next = new URLSearchParams(searchParams);
    next.set('date', date);
    setSearchParams(next, { replace: true });
    setFormat('all');
    setTimeOfDay('all');
  };

  const scrollToBook = () => {
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="h-[420px] animate-pulse bg-slate-900/90" />
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-6 h-24 animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
          {[0, 1].map((key) => (
            <div key={key} className="mb-4 h-32 animate-pulse rounded-3xl bg-white dark:bg-slate-900" />
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
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Film unavailable</h1>
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
            to={`/attractions/cinemas/${cinemaId}`}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Back to the cinema
          </Link>
        </div>
      </div>
    );
  }

  const { cinema } = page;
  const currency = cinema.currency;
  const dayLabel = activeDate === today ? 'Today' : shortDate(activeDate);
  const posterBackground = movie?.posterUrl || movie?.backdropUrl || cinema.image || FALLBACK_CINEMA;
  const priced = shows.filter((show) => show.basePrice > 0);
  const fromPrice = priced.length
    ? priced.reduce((low, show) => Math.min(low, show.basePrice), Infinity)
    : null;

  if (!movie) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400 dark:bg-slate-800">
          <i className="ph ph-film-slash" />
        </div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">This film is not playing here</h1>
        <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          {cinema.name} has no screenings for this title in the next 14 days.
        </p>
        <Link
          to={`/attractions/cinemas/${cinemaId}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <i className="ph ph-arrow-left" /> See what is playing
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Film hero: the poster artwork fills the header, with a dark left fade
          so the title and copy stay readable over it. */}
      <section className="relative overflow-hidden bg-slate-950">
        <div aria-hidden="true" className="absolute inset-0">
          <img
            src={posterBackground}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_22%]"
            onError={(event) => { event.currentTarget.src = FALLBACK_CINEMA; }}
          />
          {/* On phones the copy spans the full width, so a light scrim keeps it legible over bright posters. */}
          <div className="absolute inset-0 bg-slate-950/35 sm:hidden" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/30" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6 sm:pb-16">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/attractions/cinemas/${cinema.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur transition-colors hover:border-white/35 hover:text-white"
            >
              <i className="ph ph-arrow-left" /> {cinema.name}
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur">
              <i className="ph ph-map-pin text-emerald-400" />
              {[cinema.city, cinema.country].filter(Boolean).join(', ') || 'Location to be confirmed'}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="w-[148px] shrink-0 sm:w-[232px]">
              <div className="aspect-[2/3] overflow-hidden rounded-3xl border border-white/10 bg-slate-800 shadow-2xl shadow-black/60">
                <Poster src={movie.posterUrl} title={movie.title} className="h-full w-full object-cover" />
              </div>
            </div>

            <div className="min-w-0 flex-1 sm:pb-2">
              <h1 className="text-3xl font-black leading-[1.02] tracking-tight text-white sm:text-5xl">
                {movie.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {movie.durationMin > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-2 py-1 text-[11px] font-black text-white">
                    <i className="ph ph-clock" /> {movie.durationMin} mins
                  </span>
                )}
                {movie.ageRating && (
                  <span className="rounded-lg border border-white/25 px-2 py-1 text-[11px] font-black text-white">
                    {movie.ageRating}
                  </span>
                )}
                {movie.format && (
                  <span className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-bold text-slate-200">
                    {movie.format}
                  </span>
                )}
              </div>

              {movie.genre && (
                <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  {movie.genre}
                </p>
              )}

              {(movie.language || movie.subtitles) && (
                <p className="mt-1.5 text-xs font-bold text-slate-300">
                  {[
                    movie.language ? `Language: ${movie.language}` : '',
                    movie.subtitles ? `Subtitle: ${movie.subtitles}` : '',
                  ].filter(Boolean).join('   |   ')}
                </p>
              )}

              {movie.synopsis && (
                <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">
                  {movie.synopsis}
                </p>
              )}

              {(movie.castList || movie.director) && (
                <div className="mt-3 max-w-2xl space-y-1 text-xs font-semibold text-slate-400">
                  {movie.director && <p><span className="font-black text-slate-200">Director:</span> {movie.director}</p>}
                  {movie.castList && <p><span className="font-black text-slate-200">Cast:</span> {movie.castList}</p>}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={scrollToBook}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/40 transition-transform hover:scale-[1.02]"
                >
                  <i className="ph-fill ph-ticket text-base text-emerald-600" /> Book Now
                </button>
                {movie.trailerUrl && (
                  <a
                    href={movie.trailerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:border-white/50 hover:bg-white/15"
                  >
                    <i className="ph-fill ph-play-circle text-lg" /> Play Movie Trailer
                  </a>
                )}
                {fromPrice && (
                  <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] font-bold text-slate-200 backdrop-blur">
                    <span className="text-slate-400">from</span> {money(fromPrice, currency)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Date run */}
      <section id="book" className="relative z-10 mx-auto -mt-8 max-w-6xl scroll-mt-24 px-4 sm:px-6">
        <div className={`${PANEL_CLASS} p-4 shadow-xl shadow-slate-900/5 sm:p-5`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">Pick a date</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {shows.length} {shows.length === 1 ? 'screening' : 'screenings'} at {cinema.name} in the next 14 days.
              </p>
            </div>
            {cinema.openingHours?.open && (
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <i className="ph ph-clock text-emerald-600" />
                Box office {cinema.openingHours.open}–{cinema.openingHours.close || 'late'}
              </p>
            )}
          </div>
          <DateStrip dates={dates} activeDate={activeDate} onSelect={selectDate} />
        </div>
      </section>

      {/* Showtimes */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">
              {dayLabel} <span className="text-slate-400">·</span> {visibleShows.length}{' '}
              {visibleShows.length === 1 ? 'showtime' : 'showtimes'}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Screens and times at {cinema.name}. Seats are live — pick a time to choose seats.
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          {formats.length > 1 && (
            <FilterChips
              label="Format"
              value={format}
              onChange={setFormat}
              options={[{ id: 'all', label: 'All' }, ...formats.map((entry) => ({ id: entry, label: entry }))]}
            />
          )}
          <FilterChips
            label="Time"
            value={timeOfDay}
            onChange={setTimeOfDay}
            options={TIME_BUCKETS.map((bucket) => ({ id: bucket.id, label: bucket.label }))}
          />
        </div>

        {visibleShows.length === 0 ? (
          <div className={`${PANEL_CLASS} px-6 py-14 text-center`}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-400 dark:bg-slate-800">
              <i className="ph ph-calendar-x" />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {dayShows.length === 0
                ? `No ${movie.title} screenings ${dayLabel === 'Today' ? 'today' : `on ${dayLabel}`}`
                : 'No times match those filters'}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {dayShows.length === 0
                ? 'Try another date — the strip above marks every day in the run.'
                : 'Clear the filters or pick another date to see all screenings.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {dayShows.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setFormat('all'); setTimeOfDay('all'); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <i className="ph ph-x" /> Clear filters
                </button>
              )}
              {dates.some((entry) => entry.shows > 0 && entry.date !== activeDate) && (
                <button
                  type="button"
                  onClick={() => selectDate(dates.find((entry) => entry.shows > 0 && entry.date !== activeDate).date)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <i className="ph ph-calendar-check" /> Jump to the next screening day
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <ScreenGroup
                key={group.screenId}
                screen={group.screen}
                shows={group.shows}
                currency={currency}
                cinemaId={cinema.id}
              />
            ))}
          </div>
        )}

        <p className="mt-5 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <i className="ph ph-info" /> Each seat gets its own QR ticket — show it on your phone or print it.
        </p>
      </section>
    </div>
  );
}
