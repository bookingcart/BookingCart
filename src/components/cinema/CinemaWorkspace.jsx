import { useCallback, useEffect, useMemo, useState } from 'react';
import TicketValidationPanel from '../TicketValidationPanel.jsx';
import { cinemaGet, formatDate, money, todayISO } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Notice, Pill, StatTile, cx } from './ui.jsx';
import CinemaScreensPanel from './CinemaScreensPanel.jsx';
import CinemaPricingPanel from './CinemaPricingPanel.jsx';
import CinemaMoviesPanel from './CinemaMoviesPanel.jsx';
import CinemaShowtimesPanel from './CinemaShowtimesPanel.jsx';
import CinemaBookingsPanel from './CinemaBookingsPanel.jsx';
import CinemaBoxOfficePanel from './CinemaBoxOfficePanel.jsx';
import CinemaReportsPanel from './CinemaReportsPanel.jsx';
import CinemaSettingsPanel from './CinemaSettingsPanel.jsx';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'ph-squares-four' },
  { id: 'screens', label: 'Auditoriums', icon: 'ph-monitor-play' },
  { id: 'pricing', label: 'Seat pricing', icon: 'ph-tag' },
  { id: 'movies', label: 'Movies', icon: 'ph-film-slate' },
  { id: 'showtimes', label: 'Showtimes', icon: 'ph-calendar-blank' },
  { id: 'bookings', label: 'Bookings', icon: 'ph-receipt' },
  { id: 'box-office', label: 'Box office', icon: 'ph-cash-register' },
  { id: 'reports', label: 'Reports', icon: 'ph-chart-line-up' },
  { id: 'validate', label: 'Scan tickets', icon: 'ph-qr-code' },
  { id: 'settings', label: 'Cinema settings', icon: 'ph-sliders-horizontal' },
];

function SetupChecklist({ overview, screensCount, moviesCount, onGo }) {
  const showtimesReady = Number(overview?.upcomingShowtimes || 0) > 0;
  const steps = [
    { done: screensCount > 0, label: 'Add an auditorium and design its seat layout', section: 'screens', icon: 'ph-monitor-play' },
    { done: moviesCount > 0, label: 'Add at least one movie with a runtime', section: 'movies', icon: 'ph-film-slate' },
    { done: showtimesReady, label: 'Schedule screenings for the coming days', section: 'showtimes', icon: 'ph-calendar-plus' },
    { done: Boolean(overview?.revenue?.bookings), label: 'Sell your first seat online or at the box office', section: 'box-office', icon: 'ph-cash-register' },
  ];
  if (steps.every((step) => step.done)) return null;

  return (
    <Card title="Finish setting up this cinema" subtitle="Each step unlocks the next one" icon="ph-flag-checkered">
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.label} className={cx('flex items-center gap-3 rounded-2xl border p-3', step.done ? 'border-green-200 bg-green-50/50 dark:border-green-900/60 dark:bg-green-950/20' : 'border-slate-200 dark:border-slate-700')}>
            <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black', step.done ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>
              {step.done ? <i className="ph ph-check" /> : index + 1}
            </span>
            <span className={cx('flex-1 text-xs font-bold', step.done ? 'text-green-800 line-through dark:text-green-300' : 'text-slate-700 dark:text-slate-200')}>
              {step.label}
            </span>
            {!step.done && <Button size="sm" variant="ghost" onClick={() => onGo(step.section)}>Open</Button>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Overview({ attractionId, headers, cinema, role, onGo }) {
  const [overview, setOverview] = useState(null);
  const [counts, setCounts] = useState({ screens: 0, movies: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [overviewRes, screensRes, moviesRes] = await Promise.all([
      cinemaGet('overview', { attractionId }, headers),
      cinemaGet('screens', { attractionId }, headers),
      cinemaGet('movies', { attractionId }, headers),
    ]);
    if (overviewRes.ok) setOverview(overviewRes.overview);
    else setError(overviewRes.error || 'Could not load the overview');
    setCounts({
      screens: (screensRes.screens || []).length,
      movies: (moviesRes.movies || []).filter((movie) => movie.status === 'active').length,
    });
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
      </div>
    );
  }

  const currency = cinema?.currency || 'USD';

  return (
    <div className="space-y-4">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue (30 days)" value={money(overview?.revenue?.paid || 0, currency)} hint={`${overview?.revenue?.bookings || 0} paid bookings`} icon="ph-currency-circle-dollar" tone="green" />
        <StatTile label="Pending at counter" value={money(overview?.revenue?.pending || 0, currency)} hint="Reserved, not yet paid" icon="ph-hourglass-medium" tone="amber" />
        <StatTile label="Screens" value={`${overview?.screens?.active || 0}/${overview?.screens?.total || 0}`} hint={`${overview?.occupancy?.seats || 0} seats installed`} icon="ph-monitor-play" tone="sky" />
        <StatTile label="Occupancy" value={`${overview?.occupancy?.percent || 0}%`} hint={`${overview?.occupancy?.sold || 0} seats sold`} icon="ph-armchair" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Today's screenings" value={overview?.todayShowtimes || 0} icon="ph-calendar-check" tone="green" />
        <StatTile label="Upcoming screenings" value={overview?.upcomingShowtimes || 0} icon="ph-calendar-blank" />
        <StatTile label="Counter sales" value={overview?.revenue?.counterBookings || 0} hint="Paid at the box office" icon="ph-storefront" tone="sky" />
      </div>

      <SetupChecklist overview={overview} screensCount={counts.screens} moviesCount={counts.movies} onGo={onGo} />

      <Card title="Quick actions" icon="ph-lightning">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" icon="ph-calendar-plus" onClick={() => onGo('showtimes')}>Schedule a screening</Button>
          <Button variant="ghost" icon="ph-cash-register" onClick={() => onGo('box-office')}>Sell seats at the counter</Button>
          <Button variant="ghost" icon="ph-qr-code" onClick={() => onGo('validate')}>Scan tickets</Button>
          <Button variant="ghost" icon="ph-chart-line-up" onClick={() => onGo('reports')}>Open reports</Button>
          {role !== 'scanner' && (
            <a
              href={`/attractions/cinemas/${attractionId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <i className="ph ph-arrow-square-out" /> View public page
            </a>
          )}
        </div>
      </Card>

      <p className="px-1 text-[11px] font-medium text-slate-400">
        Seat revenue is only counted once a payment is verified. Reservations waiting for the box office stay in
        “pending” and release themselves automatically if nobody pays.
      </p>
    </div>
  );
}

export default function CinemaWorkspace({ headers, onOpenVenueSettings }) {
  const [cinemas, setCinemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(0);
  const [access, setAccess] = useState(null);
  const [section, setSection] = useState('overview');

  const loadCinemas = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('my-cinemas', {}, headers);
    if (payload.ok) {
      const list = payload.cinemas || [];
      setCinemas(list);
      setActiveId((current) => (list.some((cinema) => Number(cinema.id) === Number(current)) ? current : list[0]?.id || 0));
      setError('');
    } else {
      setError(payload.error || 'Could not load your cinemas');
    }
    setLoading(false);
  }, [headers]);

  useEffect(() => { loadCinemas(); }, [loadCinemas]);

  const loadAccess = useCallback(async (cinemaId) => {
    if (!cinemaId) { setAccess(null); return; }
    const payload = await cinemaGet('access', { attractionId: cinemaId }, headers);
    setAccess(payload.ok ? payload : { ok: false, error: payload.error });
  }, [headers]);

  useEffect(() => { loadAccess(activeId); }, [activeId, loadAccess]);

  const active = useMemo(() => cinemas.find((cinema) => Number(cinema.id) === Number(activeId)) || null, [cinemas, activeId]);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }

  if (!cinemas.length) {
    return (
      <EmptyState
        icon="ph-film-strip"
        title="No cinema listings yet"
        message="A cinema is an attraction with the category “Cinema”. Create one in My Attractions, set its category to Cinema, then come back here to add screens, movies and showtimes."
        action={<a
          href="/list-your-event"
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-green-700"
        >
          <i className="ph ph-plus" /> Create a cinema listing
        </a>}
      />
    );
  }

  if (access && access.ok === false) {
    return <Notice tone="error">{access.error || 'You do not have access to this cinema'}</Notice>;
  }

  const role = access?.role || active?.role || 'owner';
  const cinema = access?.cinema || active || {};
  const currency = cinema.currency || active?.currency || 'USD';

  return (
    <div className="space-y-4">
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      {/* Cinema switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          {active?.featured_image ? (
            <img src={active.featured_image} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-lg text-green-600 dark:bg-green-950/50">
              <i className="ph ph-film-strip" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">{active?.name}</h2>
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
              <span>{[active?.city, active?.country].filter(Boolean).join(', ')}</span>
              <Pill tone={role === 'owner' ? 'green' : 'sky'}>{role}</Pill>
              <span>{active?.screens || 0} screens</span>
              {active?.status && <span className="capitalize">· {active.status}</span>}
            </p>
          </div>
        </div>

        {cinemas.length > 1 && (
          <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
            Switch
            <select
              value={activeId}
              onChange={(event) => { setActiveId(Number(event.target.value)); setSection('overview'); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {cinemas.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Section nav */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {SECTIONS.map((entry) => {
          const disabled = role === 'scanner' && !['overview', 'validate', 'bookings'].includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              onClick={() => setSection(entry.id)}
              className={cx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black transition-colors',
                section === entry.id
                  ? 'bg-green-600 text-white shadow-sm shadow-green-600/25'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <i className={cx('ph', entry.icon)} /> {entry.label}
            </button>
          );
        })}
      </div>

      {!activeId ? null : section === 'overview' ? (
        <Overview attractionId={activeId} headers={headers} cinema={{ ...cinema, currency }} role={role} onGo={setSection} />
      ) : section === 'screens' ? (
        <CinemaScreensPanel attractionId={activeId} headers={headers} currency={currency} />
      ) : section === 'pricing' ? (
        <CinemaPricingPanel attractionId={activeId} headers={headers} currency={currency} />
      ) : section === 'movies' ? (
        <CinemaMoviesPanel attractionId={activeId} headers={headers} />
      ) : section === 'showtimes' ? (
        <CinemaShowtimesPanel attractionId={activeId} headers={headers} currency={currency} />
      ) : section === 'bookings' ? (
        <CinemaBookingsPanel attractionId={activeId} headers={headers} />
      ) : section === 'box-office' ? (
        <CinemaBoxOfficePanel attractionId={activeId} headers={headers} currency={currency} />
      ) : section === 'reports' ? (
        <CinemaReportsPanel attractionId={activeId} headers={headers} currency={currency} />
      ) : section === 'validate' ? (
        <TicketValidationPanel operatorType="attraction" />
      ) : section === 'settings' ? (
        <CinemaSettingsPanel
          attractionId={activeId}
          headers={headers}
          onSaved={() => loadAccess(activeId)}
          onOpenVenueSettings={() => onOpenVenueSettings?.()}
        />
      ) : null}

      <p className="px-1 pt-2 text-[10px] font-medium text-slate-400">
        {cinema.name || active?.name} · seats are validated with the same QR scanner as attraction tickets
        {access?.settings ? ` · ${access.settings.holdMinutes} min holds · ${access.settings.cleaningMinutes} min turnaround` : ''}
        {' '}· {formatDate(todayISO())}
      </p>
    </div>
  );
}
