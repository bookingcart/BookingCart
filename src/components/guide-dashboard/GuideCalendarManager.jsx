import { useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function GuideCalendarManager({ availability, onSave, onLogActivity }) {
  const [workingDays, setWorkingDays] = useState(
    Array.isArray(availability?.workingDays) ? availability.workingDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  );

  const [workingHours, setWorkingHours] = useState({
    start: availability?.startTime || '07:00',
    end: availability?.endTime || '19:00'
  });

  const [maxToursPerDay, setMaxToursPerDay] = useState(availability?.maxToursPerDay || 1);

  const [blockedDates, setBlockedDates] = useState(
    Array.isArray(availability?.blockedDates) ? availability.blockedDates : ['2026-12-25', '2026-12-31', '2027-01-01']
  );

  const [vacationRange, setVacationRange] = useState({ start: '', end: '' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Generate next 30 days for visual calendar grid
  const today = new Date();
  const calendarDays = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    calendarDays.push({
      dateStr,
      dayNum: d.getDate(),
      month: d.toLocaleString('default', { month: 'short' }),
      dayName,
      isBlocked: blockedDates.includes(dateStr),
      isWorkingDay: workingDays.includes(dayName)
    });
  }

  const toggleDateBlock = (dateStr) => {
    if (blockedDates.includes(dateStr)) {
      setBlockedDates(blockedDates.filter(d => d !== dateStr));
    } else {
      setBlockedDates([...blockedDates, dateStr]);
    }
  };

  const handleAddVacation = (e) => {
    e.preventDefault();
    if (!vacationRange.start || !vacationRange.end) return;
    const start = new Date(vacationRange.start);
    const end = new Date(vacationRange.end);
    if (start > end) return alert('Start date must be before end date');

    const newBlocked = [...blockedDates];
    const curr = new Date(start);
    while (curr <= end) {
      const s = curr.toISOString().split('T')[0];
      if (!newBlocked.includes(s)) newBlocked.push(s);
      curr.setDate(curr.getDate() + 1);
    }
    setBlockedDates(newBlocked);
    if (onLogActivity) onLogActivity(`Added vacation range ${vacationRange.start} to ${vacationRange.end}`);
    setVacationRange({ start: '', end: '' });
    setMsg('Vacation period added to blocked dates!');
    setTimeout(() => setMsg(''), 4000);
  };

  const handleSaveCalendar = async () => {
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        workingDays,
        startTime: workingHours.start,
        endTime: workingHours.end,
        maxToursPerDay,
        blockedDates
      };
      if (onSave) await onSave('availability', payload);
      if (onLogActivity) onLogActivity('Updated Calendar & Working Hours');
      setMsg('✅ Calendar & Availability settings saved!');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setMsg('❌ Failed to save calendar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-8">
      {/* Toast Notification */}
      {msg && (
        <div className="bg-emerald-500 text-white px-6 py-3 font-bold text-sm rounded-2xl flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="font-black hover:opacity-80">&times;</button>
        </div>
      )}

      <div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <i className="ph-fill ph-calendar-blank text-emerald-500 text-2xl" />
          Calendar & Availability Management
        </h3>
        <p className="text-xs text-slate-500">
          Manage your working days, block vacation dates, and configure tour limits.
        </p>
      </div>

      {/* ── Working Days & Hours ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Standard Working Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => {
              const active = workingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (active) setWorkingDays(workingDays.filter(d => d !== day));
                    else setWorkingDays([...workingDays, day]);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all border ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Max Tours Per Day</label>
          <select
            value={maxToursPerDay}
            onChange={e => setMaxToursPerDay(parseInt(e.target.value))}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold"
          >
            <option value={1}>1 Tour Per Day (Recommended)</option>
            <option value={2}>2 Tours Per Day</option>
            <option value={3}>3+ Tours Per Day</option>
          </select>
        </div>
      </div>

      {/* ── Vacation Days Range ── */}
      <form onSubmit={handleAddVacation} className="p-5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-3">
        <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
          <i className="ph-fill ph-airplane-tilt text-base text-amber-500" />
          Add Vacation / Unavailable Dates Range
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Start Date</label>
            <input
              type="date"
              required
              value={vacationRange.start}
              onChange={e => setVacationRange({ ...vacationRange, start: e.target.value })}
              className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">End Date</label>
            <input
              type="date"
              required
              value={vacationRange.end}
              onChange={e => setVacationRange({ ...vacationRange, end: e.target.value })}
              className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2 text-xs font-bold"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow transition-colors"
          >
            Block Vacation Range
          </button>
        </div>
      </form>

      {/* ── Interactive 30-Day Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-black text-slate-900 dark:text-white">Upcoming 30-Day Grid (Click date to block/unblock)</h4>
          <div className="flex items-center gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Blocked</span>
          </div>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {calendarDays.map((day) => {
            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => toggleDateBlock(day.dateStr)}
                className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center ${
                  day.isBlocked
                    ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                    : day.isWorkingDay
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                }`}
              >
                <span className="text-[10px] font-bold uppercase">{day.dayName}</span>
                <span className="text-base font-black leading-tight">{day.dayNum}</span>
                <span className="text-[9px] font-semibold opacity-75">{day.month}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleSaveCalendar}
        disabled={saving}
        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
      >
        <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Calendar Settings'}
      </button>
    </div>
  );
}
