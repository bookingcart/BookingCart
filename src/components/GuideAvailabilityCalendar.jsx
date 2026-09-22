import { useState } from 'react';

const STATUS_CONFIG = {
  available: { bg: 'bg-emerald-500', text: 'text-white', label: 'Available' },
  pending:   { bg: 'bg-amber-400',   text: 'text-white', label: 'Pending' },
  booked:    { bg: 'bg-red-500',     text: 'text-white', label: 'Booked' },
  blocked:   { bg: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-700 dark:text-slate-300', label: 'Unavailable' },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year, month) {
  // 0=Sun → adjust to Mon-based (0=Mon)
  const d = new Date(year, month, 1).getDay();
  return (d + 6) % 7;
}

export default function GuideAvailabilityCalendar({
  availability = {},
  selectedStart = null,
  selectedEnd = null,
  onDateSelect = () => {},
  readOnly = false,
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);

  function toKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getStatus(day) {
    const key = toKey(viewYear, viewMonth, day);
    return availability[key] || 'available';
  }

  function isSelected(day) {
    const key = toKey(viewYear, viewMonth, day);
    return key === selectedStart || key === selectedEnd;
  }

  function isInRange(day) {
    if (!selectedStart || !selectedEnd) return false;
    const key = toKey(viewYear, viewMonth, day);
    return key > selectedStart && key < selectedEnd;
  }

  function isPast(day) {
    const date = new Date(viewYear, viewMonth, day);
    return date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function handleDayClick(day) {
    if (readOnly) return;
    const status = getStatus(day);
    if (status === 'booked' || status === 'blocked' || isPast(day)) return;
    const key = toKey(viewYear, viewMonth, day);
    onDateSelect(key);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // Count availability stats for the current month
  const available = [], booked = [], pending = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const s = getStatus(d);
    if (s === 'available') available.push(d);
    else if (s === 'booked') booked.push(d);
    else if (s === 'pending') pending.push(d);
  }
  const availRate = Math.round((available.length / daysInMonth) * 100);

  const cells = [];
  // Empty leading cells
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="guide-calendar bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Previous month"
        >
          <i className="ph ph-caret-left" />
        </button>
        <div className="text-center">
          <p className="font-extrabold text-slate-900 dark:text-white">{MONTHS[viewMonth]} {viewYear}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{available.length} days available</p>
        </div>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Next month"
        >
          <i className="ph ph-caret-right" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center px-3 pt-3">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 px-3 pb-3">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const status = getStatus(day);
          const past = isPast(day);
          const sel = isSelected(day);
          const inRange = isInRange(day);
          const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
          const canClick = !readOnly && !past && status !== 'booked' && status !== 'blocked';
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          return (
            <div
              key={day}
              onClick={() => handleDayClick(day)}
              title={`${toKey(viewYear, viewMonth, day)}: ${cfg.label}`}
              className={`
                relative flex flex-col items-center justify-center rounded-xl min-h-[42px] text-sm font-semibold
                transition-all duration-150 select-none
                ${past ? 'opacity-25 cursor-default' : canClick ? 'cursor-pointer' : 'cursor-default'}
                ${sel
                  ? 'bg-green-600 text-white shadow-md shadow-green-600/30 scale-110 z-10'
                  : inRange
                  ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-none'
                  : status === 'available'
                  ? 'hover:bg-green-50 dark:hover:bg-green-950/20 text-slate-700 dark:text-slate-200'
                  : status === 'pending'
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : status === 'booked'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                  : 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500'}
              `}
            >
              {isToday && !sel && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              {day}
              {/* Status dot */}
              {!sel && !past && (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${
                  status === 'available' ? 'bg-emerald-400' :
                  status === 'pending' ? 'bg-amber-400' :
                  status === 'booked' ? 'bg-red-400' :
                  'bg-slate-300'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend + Workload */}
      <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4">
        <div className="flex flex-wrap gap-3 mb-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.bg}`} />
              <span className="text-slate-600 dark:text-slate-400 font-medium">{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Workload bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Monthly Availability</span>
            <span className="text-xs font-bold text-green-600">{availRate}% free</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${availRate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
