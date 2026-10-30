// Shared derivations for the cinema browse page and the film page: turn the raw
// movies + showtimes payload into per-film entries, and format the film copy
// both pages print. Keeping them here stops the two pages drifting apart.

import { addDays, clockLabel, shortDate } from './cinemaClient.js';

export function chronological(a, b) {
  return `${a.showDate} ${a.startTime}`.localeCompare(`${b.showDate} ${b.startTime}`);
}

/** Rating, year, runtime, genre and language, in that order, skipping blanks. */
export function movieMeta(movie) {
  const year = String(movie?.releaseDate || '').slice(0, 4);
  return [
    movie?.ageRating,
    /^\d{4}$/.test(year) ? year : '',
    movie?.durationMin > 0 ? `${movie.durationMin} min` : '',
    movie?.genre,
    movie?.language,
  ].filter(Boolean);
}

/** "Today 7:30 PM" / "Tomorrow 9:00 PM" / "Sat 2 Nov 9:00 PM". */
export function nextShowLabel(show, today) {
  if (!show) return '';
  const time = clockLabel(show.startTime);
  if (show.showDate === today) return `Today ${time}`;
  if (show.showDate === addDays(today, 1)) return `Tomorrow ${time}`;
  return `${shortDate(show.showDate)} ${time}`;
}

/** One entry per film with its screenings, next showing and cheapest seat. */
export function buildPlayingFilms(movies, showtimes, today) {
  const grouped = new Map();
  for (const show of showtimes) {
    if (!grouped.has(show.movieId)) grouped.set(show.movieId, []);
    grouped.get(show.movieId).push(show);
  }

  const weekEnd = addDays(today, 7);
  return movies
    .map((movie) => {
      const shows = (grouped.get(Number(movie.id)) || []).sort(chronological);
      if (!shows.length) return null;

      const upcoming = shows.filter((show) => show.status !== 'completed' && show.status !== 'cancelled');
      const priced = upcoming.filter((show) => show.basePrice > 0);

      return {
        ...movie,
        shows,
        nextShow: upcoming[0] || shows[0],
        weeklyShows: shows.filter((show) => show.showDate >= today && show.showDate < weekEnd).length
          || shows.length,
        fromPrice: priced.length
          ? priced.reduce((low, show) => Math.min(low, show.basePrice), Infinity)
          : null,
      };
    })
    .filter(Boolean);
}

/** Busiest film first — the "Top 10 this week" order and the hero reel. */
export function rankFilms(films) {
  return [...films].sort(
    (a, b) => b.weeklyShows - a.weeklyShows
      || b.shows.length - a.shows.length
      || String(a.title).localeCompare(String(b.title))
  );
}
