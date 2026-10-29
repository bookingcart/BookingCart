import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, cinemaGet, cinemaPost, clockLabel, money, shortDate, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Field, Notice, Pill, cx, inputCls } from './ui.jsx';

const WEEKDAYS = [
  { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' }, { id: 3, label: 'Wed' }, { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' }, { id: 0, label: 'Sun' },
];

const STATUS_TONE = { on_sale: 'green', scheduled: 'sky', completed: 'slate', cancelled: 'rose' };

/** Every date between two ISO dates whose weekday is in `days`. */
function expandSchedule(from, to, days) {
  const dates = [];
  if (!from || !to || !days.length) return dates;
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 120) {
    const weekday = new Date(`${cursor}T00:00:00`).getDay();
    if (days.includes(weekday)) dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

function ScheduleForm({ screens, movies, attractionId, headers, currency, onScheduled }) {
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState({
    screenId: screens[0]?.id || 0,
    movieId: movies[0]?.id || 0,
    showDate: todayISO(),
    startTime: '18:00',
    basePrice: movies[0]?.basePrice || 10,
    salesCloseTime: '',
    notes: '',
  });
  const [recurring, setRecurring] = useState({
    from: todayISO(),
    to: addDays(todayISO(), 6),
    days: [5, 6, 0],
    times: '14:00, 18:00, 21:00',
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setRec = (key, value) => setRecurring((current) => ({ ...current, [key]: value }));

  const selectedMovie = movies.find((movie) => Number(movie.id) === Number(form.movieId));
  const duration = Number(selectedMovie?.durationMin || 0);

  const preview = useMemo(() => {
    if (mode !== 'recurring') return [];
    const times = String(recurring.times || '').split(',').map((value) => value.trim()).filter(Boolean);
    return expandSchedule(recurring.from, recurring.to, recurring.days)
      .slice(0, 60)
      .flatMap((date) => times.filter((time) => /^\d{2}:\d{2}$/.test(time)).map((time) => ({ date, time })));
  }, [mode, recurring]);

  const submitSingle = async (event) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const payload = await cinemaPost('showtime-save', {
      attractionId,
      showtime: {
        screenId: Number(form.screenId),
        movieId: Number(form.movieId),
        showDate: form.showDate,
        startTime: form.startTime,
        basePrice: Number(form.basePrice) || 0,
        salesCloseTime: form.salesCloseTime || '',
        status: 'on_sale',
        notes: form.notes,
      },
    }, headers);
    setBusy(false);
    if (!payload.ok) { setResult({ ok: false, message: payload.error }); return; }
    setResult({ ok: true, message: `Screening scheduled for ${shortDate(form.showDate)} at ${clockLabel(form.startTime)}.` });
    onScheduled?.();
  };

  const submitRecurring = async (event) => {
    event.preventDefault();
    if (!preview.length) { setResult({ ok: false, message: 'Pick at least one day and one time.' }); return; }
    setBusy(true);
    const failures = [];
    let created = 0;
    for (const entry of preview) {
      const payload = await cinemaPost('showtime-save', {
        attractionId,
        showtime: {
          screenId: Number(form.screenId),
          movieId: Number(form.movieId),
          showDate: entry.date,
          startTime: entry.time,
          basePrice: Number(form.basePrice) || 0,
          status: 'on_sale',
          notes: form.notes,
        },
      }, headers);
      if (payload.ok) created += 1;
      else failures.push(`${shortDate(entry.date)} ${entry.time} — ${payload.error}`);
    }
    setBusy(false);
    setResult({
      ok: created > 0,
      message: `${created} screening${created === 1 ? '' : 's'} created${failures.length ? `, ${failures.length} skipped.` : '.'}`,
      failures: failures.slice(0, 6),
    });
    onScheduled?.();
  };

  if (!screens.length || !movies.length) {
    return (
      <EmptyState
        icon="ph-calendar-plus"
        title={!screens.length ? 'Add a screen first' : 'Add a movie first'}
        message={!screens.length
          ? 'A screening needs a screen with a seat layout and a movie with a runtime.'
          : 'Create the movie in the Movies tab, then schedule it here.'}
      />
    );
  }

  return (
    <form onSubmit={mode === 'single' ? submitSingle : submitRecurring} className="space-y-4">
      <div className="flex gap-1.5">
        {[['single', 'Single screening', 'ph-calendar-blank'], ['recurring', 'Recurring schedule', 'ph-arrows-clockwise']].map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black transition-colors',
              mode === key ? 'bg-green-600 text-white shadow-sm shadow-green-600/25' : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            )}
          >
            <i className={cx('ph', icon)} /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Screen" required>
          <select value={form.screenId} onChange={(event) => set('screenId', event.target.value)} className={inputCls}>
            {screens.map((screen) => (
              <option key={screen.id} value={screen.id}>{screen.name} · {screen.screenType} · {screen.seatCount || 0} seats</option>
            ))}
          </select>
        </Field>
        <Field label="Movie" required hint={duration ? `${duration} min runtime` : 'Set a runtime on the movie first'}>
          <select value={form.movieId} onChange={(event) => set('movieId', event.target.value)} className={inputCls}>
            {movies.map((movie) => (
              <option key={movie.id} value={movie.id}>{movie.title} · {movie.durationMin} min</option>
            ))}
          </select>
        </Field>
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date" required>
            <input type="date" required value={form.showDate} onChange={(event) => set('showDate', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Start time" required>
            <input type="time" required value={form.startTime} onChange={(event) => set('startTime', event.target.value)} className={inputCls} />
          </Field>
          <Field label={`Base price (${currency})`} required hint="Category multipliers apply on top">
            <input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => set('basePrice', event.target.value)} className={inputCls} />
          </Field>
          <Field label="Sales close" hint="Default: at start time">
            <input type="time" value={form.salesCloseTime} onChange={(event) => set('salesCloseTime', event.target.value)} className={inputCls} />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First date" required>
              <input type="date" required value={recurring.from} onChange={(event) => setRec('from', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Last date" required>
              <input type="date" required value={recurring.to} onChange={(event) => setRec('to', event.target.value)} className={inputCls} />
            </Field>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const active = recurring.days.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setRec('days', active ? recurring.days.filter((value) => value !== day.id) : [...recurring.days, day.id])}
                    className={cx(
                      'h-9 w-11 rounded-xl text-[11px] font-black transition-colors',
                      active ? 'bg-green-600 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Times" required hint="Comma separated, 24h — e.g. 14:00, 18:30, 21:00">
              <input value={recurring.times} onChange={(event) => setRec('times', event.target.value)} className={inputCls} />
            </Field>
            <Field label={`Base price (${currency})`}>
              <input type="number" min="0" step="0.01" value={form.basePrice} onChange={(event) => set('basePrice', event.target.value)} className={inputCls} />
            </Field>
          </div>

          <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {preview.length
              ? `${preview.length} individual screenings will be created (${shortDate(preview[0].date)} → ${shortDate(preview[preview.length - 1].date)}). Times that clash with an existing booking, or with the cleaning buffer, are skipped.`
              : 'Pick a date range, at least one weekday and one time.'}
          </p>
        </>
      )}

      <Field label="Internal note">
        <input value={form.notes} onChange={(event) => set('notes', event.target.value)} className={inputCls} placeholder="e.g. Dolby calibration, private hire" />
      </Field>

      {result && (
        <Notice tone={result.ok ? 'success' : 'error'} onClose={() => setResult(null)}>
          <p>{result.message}</p>
          {result.failures?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-medium">
              {result.failures.map((failure) => <li key={failure}>· {failure}</li>)}
            </ul>
          )}
        </Notice>
      )}

      <div className="flex justify-end">
        <Button type="submit" icon={busy ? 'ph-circle-notch' : 'ph-calendar-plus'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Scheduling…' : mode === 'single' ? 'Schedule screening' : `Create ${preview.length || ''} screenings`}
        </Button>
      </div>
    </form>
  );
}

export default function CinemaShowtimesPanel({ attractionId, headers, currency = 'USD' }) {
  const [screens, setScreens] = useState([]);
  const [movies, setMovies] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadReference = useCallback(async () => {
    const [screensRes, moviesRes] = await Promise.all([
      cinemaGet('screens', { attractionId }, headers),
      cinemaGet('movies', { attractionId }, headers),
    ]);
    if (screensRes.ok) setScreens((screensRes.screens || []).filter((screen) => screen.status === 'active'));
    if (moviesRes.ok) setMovies((moviesRes.movies || []).filter((movie) => movie.status === 'active'));
  }, [attractionId, headers]);

  const loadShowtimes = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('showtimes', { attractionId, from: date, to: date, includeCancelled: true }, headers);
    if (payload.ok) { setShowtimes(payload.showtimes || []); setError(''); }
    else setError(payload.error || 'Could not load the schedule');
    setLoading(false);
  }, [attractionId, headers, date]);

  useEffect(() => { loadReference(); }, [loadReference]);
  useEffect(() => { loadShowtimes(); }, [loadShowtimes]);

  const cancel = async (showtime) => {
    const reason = window.prompt(`Cancel ${showtime.movieTitle} on ${showtime.screenName} at ${clockLabel(showtime.startTime)}?\n\nReason (optional):`, '');
    if (reason === null) return;
    const payload = await cinemaPost('showtime-cancel', { attractionId, showtimeId: showtime.id, reason }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    setNotice('Screening cancelled and its seat holds released.');
    loadShowtimes();
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const show of showtimes) {
      const key = show.screenName || `Screen ${show.screenId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(show);
    }
    return Array.from(map.entries()).map(([screen, shows]) => ({
      screen,
      shows: shows.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))),
    }));
  }, [showtimes]);

  return (
    <div className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayISO())}
            className={cx(inputCls, 'w-auto py-2')}
          />
          <Button size="sm" variant="ghost" icon="ph-arrow-left" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" />
          <Button size="sm" variant="ghost" icon="ph-arrow-right" onClick={() => setDate(addDays(date, 1))} aria-label="Next day" />
          <Button size="sm" variant="ghost" onClick={() => setDate(todayISO())}>Today</Button>
        </div>
        <Button icon={showForm ? 'ph-x' : 'ph-calendar-plus'} variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Close' : 'Schedule screening'}
        </Button>
      </div>

      {showForm && (
        <Card title="Schedule screenings" subtitle="Overlaps and the cleaning buffer are checked by the server before anything is created" icon="ph-calendar-plus">
          <ScheduleForm
            screens={screens}
            movies={movies}
            attractionId={attractionId}
            headers={headers}
            currency={currency}
            onScheduled={loadShowtimes}
          />
        </Card>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="ph-calendar-x"
          title={`No screenings on ${shortDate(date)}`}
          message="Schedule a screening, or move to another day to see what is already programmed."
          action={<Button icon="ph-calendar-plus" onClick={() => setShowForm(true)}>Schedule screening</Button>}
        />
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <Card key={group.screen} title={group.screen} subtitle={`${group.shows.length} screenings`} icon="ph-monitor-play" bodyClass="p-4">
              <div className="space-y-2">
                {group.shows.map((show) => {
                  const sold = Number(show.seatsSold || 0);
                  const total = Number(show.seatsTotal || 0);
                  const occupancy = total ? Math.round((sold / total) * 100) : 0;
                  const cancelled = show.status === 'cancelled';
                  return (
                    <div
                      key={show.id}
                      className={cx(
                        'flex flex-wrap items-center gap-3 rounded-2xl border p-3',
                        cancelled
                          ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-800/40'
                          : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <span className="w-[74px] shrink-0">
                        <span className="block text-sm font-black tabular-nums text-slate-900 dark:text-white">{clockLabel(show.startTime)}</span>
                        <span className="block text-[10px] font-bold text-slate-400">→ {clockLabel(show.endTime)}</span>
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className={cx('truncate text-xs font-black text-slate-900 dark:text-white', cancelled && 'line-through')}>
                          {show.movieTitle}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold text-slate-400">
                          <span>{show.format}</span>
                          <span>{money(show.basePrice, show.currency || currency)} base</span>
                          {show.notes && <span className="truncate">· {show.notes}</span>}
                        </p>
                      </div>

                      <div className="w-28 shrink-0">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
                          <span>{sold}/{total}</span>
                          <span>{occupancy}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, occupancy)}%` }} />
                        </div>
                      </div>

                      <Pill tone={STATUS_TONE[show.status] || 'slate'}>{show.status.replace('_', ' ')}</Pill>

                      {!cancelled && (
                        <Button size="sm" variant="danger" icon="ph-prohibit" onClick={() => cancel(show)}>Cancel</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
