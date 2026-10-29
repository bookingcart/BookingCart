import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TRANSPORT_PHOTOS,
  TRANSPORT_TYPES,
  addDays,
  clockLabel,
  durationLabel,
  money,
  shortDate,
  todayISO,
  transportGet,
  typeMeta,
} from '../lib/transportClient.js';
import ModeSwitcher from '../components/ModeSwitcher.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const TYPE_ACTIVE = {
  emerald: 'bg-green-600 text-white shadow-md shadow-green-600/30',
  sky: 'bg-sky-600 text-white shadow-md shadow-sky-600/30',
  violet: 'bg-violet-600 text-white shadow-md shadow-violet-600/30',
};

const TYPE_SOFT = {
  emerald: 'text-green-600 dark:text-green-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
};

/** Station picker: type a name, pick from the live list, keep the id. */
function StationPicker({ label, icon, placeholder, value, onChange, type }) {
  const [term, setTerm] = useState(value?.name || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => { setTerm(value?.name || ''); }, [value?.name]);

  const search = useCallback((text) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const result = await transportGet('locations', { type, term: text });
      if (result.ok) setOptions(result.locations || []);
    }, 180);
  }, [type]);

  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
  }, [search]);

  return (
    <div className="relative min-w-0">
      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {label}
      </label>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-transparent bg-slate-50 px-3 transition-colors focus-within:border-green-500/50 dark:bg-slate-700">
        <i className={`ph ${icon} shrink-0 text-lg text-green-600`} aria-hidden="true" />
        <input
          type="text"
          value={term}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base font-bold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none dark:text-white sm:text-sm"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const text = event.target.value;
            setTerm(text);
            onChange({ id: 0, name: text });
            setOpen(true);
            search(text);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>
      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === option.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange({ id: option.id, name: option.name, city: option.city, label: option.label });
                  setTerm(option.name);
                  setOpen(false);
                }}
              >
                <i className="ph ph-map-pin text-base text-green-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{option.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {[option.city, option.country].filter(Boolean).join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JourneyCard({ journey, passengers, date }) {
  const meta = typeMeta(journey.transportType);
  const soldOut = journey.capacity > 0 && journey.seatsAvailable < passengers;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide dark:bg-slate-700 ${TYPE_SOFT[meta.accent]}`}>
              <i className={`ph ${meta.icon} text-sm`} aria-hidden="true" />
              {journey.transportLabel}
            </span>
            <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{journey.operatorName}</span>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-center">
              <p className="text-xl font-black leading-none text-slate-900 dark:text-white">{clockLabel(journey.departTime)}</p>
              <p className="mt-1 max-w-[9rem] truncate text-xs text-slate-500 dark:text-slate-400">{journey.fromStop.name}</p>
            </div>
            <div className="flex flex-1 flex-col items-center pt-1.5">
              <span className="text-[11px] font-semibold text-slate-400">{durationLabel(journey.durationMinutes)}</span>
              <span className="my-1 flex w-full items-center gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                <i className="ph ph-arrow-right text-[10px] text-slate-400" />
              </span>
              <span className="text-[11px] text-slate-400">direct</span>
            </div>
            <div className="text-center">
              <p className="text-xl font-black leading-none text-slate-900 dark:text-white">{clockLabel(journey.arriveTime)}</p>
              <p className="mt-1 max-w-[9rem] truncate text-xs text-slate-500 dark:text-slate-400">{journey.toStop.name}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><i className="ph ph-road-horizon" aria-hidden="true" /> {journey.vehicleName || journey.routeName}</span>
            {journey.capacity > 0 && (
              <span className={`inline-flex items-center gap-1 ${soldOut ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                <i className="ph ph-armchair" aria-hidden="true" />
                {soldOut ? 'Not enough seats left' : `${journey.seatsAvailable} left`}
              </span>
            )}
            {journey.seating === 'capacity' && (
              <span className="inline-flex items-center gap-1"><i className="ph ph-users" aria-hidden="true" /> General admission</span>
            )}
          </div>

          {journey.amenities?.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {journey.amenities.slice(0, 4).map((amenity) => (
                <li key={amenity} className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                  {amenity}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-dashed border-slate-200 pt-3 dark:border-slate-700 sm:w-40 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">From</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{money(journey.priceFrom, journey.currency)}</p>
            <p className="text-[11px] text-slate-400">per passenger</p>
          </div>
          {soldOut ? (
            <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-400 dark:bg-slate-700">Sold out</span>
          ) : (
            <Link
              to={`/transport/seats/${journey.id}?from=${journey.fromStop.order}&to=${journey.toStop.order}&pax=${passengers}&date=${date}`}
              className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              Select
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
      <div className="mb-3 h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="flex gap-4">
        <div className="h-10 w-20 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-10 flex-1 rounded bg-slate-100 dark:bg-slate-700/60" />
        <div className="h-10 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

export default function TransportPage() {
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState(params.get('type') || 'bus');
  const [from, setFrom] = useState({ id: Number(params.get('from')) || 0, name: '' });
  const [to, setTo] = useState({ id: Number(params.get('to')) || 0, name: '' });
  const [date, setDate] = useState(params.get('date') || todayISO());
  const [passengers, setPassengers] = useState(Number(params.get('pax')) || 1);
  const [journeys, setJourneys] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('depart');
  const [classFilter, setClassFilter] = useState('');

  const meta = typeMeta(type);

  const runSearch = useCallback(async () => {
    if (!from.id || !to.id) {
      setError('Choose where you are travelling from and to.');
      return;
    }
    if (from.id === to.id) {
      setError('Origin and destination must be different.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await transportGet('search', { type, fromId: from.id, toId: to.id, date, passengers });
    setLoading(false);
    if (!result.ok) {
      setJourneys([]);
      setSearched(true);
      setError(result.error || 'Search failed. Please try again.');
      return;
    }
    setJourneys(result.journeys || []);
    setSearched(true);
    const next = new URLSearchParams({ type, from: String(from.id), to: String(to.id), date, pax: String(passengers) });
    setParams(next, { replace: true });
  }, [type, from.id, to.id, date, passengers, setParams]);

  // A deep link such as /transport?type=bus&from=1&to=3&date=… searches on load.
  useEffect(() => {
    if (Number(params.get('from')) && Number(params.get('to'))) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classes = useMemo(() => {
    const seen = new Map();
    journeys.forEach((journey) => journey.classes?.forEach((entry) => seen.set(entry.code, entry.name)));
    return Array.from(seen, ([code, name]) => ({ code, name }));
  }, [journeys]);

  const visible = useMemo(() => {
    const list = classFilter
      ? journeys.filter((journey) => journey.classes?.some((entry) => entry.code === classFilter))
      : journeys.slice();
    if (sort === 'price') list.sort((a, b) => a.priceFrom - b.priceFrom);
    else if (sort === 'duration') list.sort((a, b) => a.durationMinutes - b.durationMinutes);
    else list.sort((a, b) => a.departTime.localeCompare(b.departTime));
    return list;
  }, [journeys, classFilter, sort]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Hero: the same shell the flights, guides and stays pages use ── */}
      <section
        className="relative flex min-h-[520px] flex-col items-center justify-center px-4 pb-12 pt-16 text-center transition-colors dark:bg-slate-950 lg:pb-16 lg:pt-20"
        data-step="search"
      >
        <div className="pointer-events-none absolute inset-0 z-0 select-none">
          <div className="absolute inset-0 z-10 rounded-b-[40px] bg-gradient-to-b from-white/90 via-white/60 to-white/30 dark:from-slate-950/95 dark:via-slate-950/75 dark:to-slate-950/40" />
          <img
            key={type}
            src={TRANSPORT_PHOTOS[type]}
            className="absolute inset-0 h-full w-full rounded-b-[40px] object-cover object-center transition-opacity duration-700 ease-in-out"
            alt=""
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-4xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white lg:text-6xl">
            Book bus, boat &amp; train tickets
          </h1>
          <p className="mt-3 text-base font-medium text-slate-600 dark:text-slate-300 lg:text-lg">
            Compare every operator, pick your seat and get a QR ticket by email.
          </p>

          <div className="mt-6 flex justify-center">
            <ModeSwitcher active="transport" />
          </div>

          {/* Vehicle type — mirrors the Round Trip / One-Way tabs on the flights hero */}
          <div className="mt-4 inline-flex gap-1 overflow-x-auto rounded-xl border border-white/80 bg-white p-1 shadow-sm no-scrollbar dark:border-slate-700/80 dark:bg-slate-800/80" role="tablist" aria-label="Transport type">
            {TRANSPORT_TYPES.map((entry) => {
              const active = entry.key === type;
              return (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setType(entry.key); setJourneys([]); setSearched(false); setError(''); }}
                  className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold transition-all sm:flex-none sm:px-4 ${
                    active ? TYPE_ACTIVE[entry.accent] : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
                  }`}
                >
                  <i className={`ph ${entry.icon} text-base`} aria-hidden="true" />
                  {entry.label}
                </button>
              );
            })}
          </div>

          <form
            className="mt-3 grid grid-cols-1 gap-2 rounded-2xl bg-white p-2 text-left shadow-lg ring-1 ring-slate-100/80 transition-colors dark:bg-slate-800 dark:ring-slate-700/80 sm:p-2.5 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]"
            onSubmit={(event) => { event.preventDefault(); runSearch(); }}
          >
            <StationPicker
              label="From"
              icon="ph-circle-notch"
              placeholder={meta.stopLabel}
              type={type}
              value={from}
              onChange={setFrom}
            />
            <StationPicker
              label="To"
              icon="ph-map-pin"
              placeholder={meta.stopLabel}
              type={type}
              value={to}
              onChange={setTo}
            />

            <div className="min-w-0">
              <label htmlFor="transport-date" className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Travel date
              </label>
              <input
                id="transport-date"
                type="date"
                value={date}
                min={todayISO()}
                max={addDays(todayISO(), 120)}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 w-full rounded-lg border border-transparent bg-slate-50 px-3 text-base font-bold text-slate-900 transition-colors focus:border-green-500/50 focus:outline-none dark:bg-slate-700 dark:text-white dark:[&::-webkit-calendar-picker-indicator]:invert sm:text-sm"
              />
            </div>

            <div className="min-w-0">
              <label htmlFor="transport-pax" className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Passengers
              </label>
              <select
                id="transport-pax"
                value={passengers}
                onChange={(event) => setPassengers(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-transparent bg-slate-50 px-3 text-base font-bold text-slate-900 transition-colors focus:border-green-500/50 focus:outline-none dark:bg-slate-700 dark:text-white sm:text-sm"
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count} {count === 1 ? 'passenger' : 'passengers'}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end md:col-span-2 lg:col-span-1">
              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-lg bg-green-600 px-6 text-sm font-bold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
              >
                <i className={`ph ${loading ? 'ph-circle-notch animate-spin' : 'ph-magnifying-glass'} mr-1.5 align-middle`} aria-hidden="true" />
                {loading ? 'Searching' : 'Search'}
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              <i className="ph ph-warning-circle text-base" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
      </section>

      {/* ── Results ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {searched && journeys.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {journeys.length} {journeys.length === 1 ? 'journey' : 'journeys'} on {shortDate(date)}
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                {from.name || journeys[0]?.fromStop?.name || 'origin'} → {to.name || journeys[0]?.toStop?.name || 'destination'}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="transport-sort" className="sr-only">Sort journeys</label>
              <select
                id="transport-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="depart">Earliest departure</option>
                <option value="price">Lowest price</option>
                <option value="duration">Shortest journey</option>
              </select>
            </div>
          </div>
        )}

        {classes.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setClassFilter('')}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                classFilter ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-green-600 text-white'
              }`}
            >
              All classes
            </button>
            {classes.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => setClassFilter(classFilter === entry.code ? '' : entry.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  classFilter === entry.code ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="space-y-3">
            {visible.map((journey) => (
              <JourneyCard key={journey.id} journey={journey} passengers={passengers} date={date} />
            ))}
          </div>
        )}

        {!loading && searched && journeys.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
            <i className={`ph ${meta.icon} mx-auto mb-3 block text-4xl text-slate-300 dark:text-slate-600`} aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">No {meta.plural.toLowerCase()} on this date</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Try another date, or check a nearby {meta.stopLabel.toLowerCase()} — operators publish new departures daily.
            </p>
          </div>
        )}

        {!searched && !loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            {TRANSPORT_TYPES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => { setType(entry.key); setJourneys([]); setSearched(false); }}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <i className={`ph ${entry.icon} text-2xl ${TYPE_SOFT[entry.accent]}`} aria-hidden="true" />
                <h2 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{entry.plural}</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{entry.blurb}</p>
              </button>
            ))}
          </div>
        )}

        {searched && journeys.length > 0 && (
          <p className="mt-6 text-center text-xs text-slate-400">
            Prices are per passenger and confirmed at checkout. Seats are held for 15 minutes while you pay.
          </p>
        )}
      </section>

      <FlightFooter />
    </main>
  );
}
