import { useEffect } from 'react';

// Small presentational primitives shared by every ticketing panel. They follow
// the same shapes/tokens as the rest of the attraction dashboard.

const TONES = {
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
};

export function Badge({ tone = 'slate', children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${TONES[tone] || TONES.slate}`}>
      {children}
    </span>
  );
}

const STATUS_TONE = {
  active: 'emerald', published: 'emerald', paid: 'emerald', confirmed: 'emerald', valid: 'emerald',
  pending_payment: 'amber', unpaid: 'amber', inactive: 'amber', partially_used: 'amber', paused: 'amber',
  partially_refunded: 'amber', used: 'sky', draft: 'slate', archived: 'slate', not_validated: 'slate',
  capacity: 'sky', price: 'violet', blackout: 'rose',
  cancelled: 'rose', refunded: 'rose', expired: 'rose', failed: 'rose',
};

export function StatusBadge({ status }) {
  const value = String(status || '').toLowerCase();
  const label = value ? value.replace(/_/g, ' ') : 'unknown';
  return <Badge tone={STATUS_TONE[value] || 'slate'}>{label}</Badge>;
}

export function Panel({ title, subtitle, icon = 'ph-ticket', actions, children, className = '' }) {
  return (
    <section className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i className={`ph ${icon} text-green-600`} />
              {title}
            </h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STAT_TONES = {
  green: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function StatCard({ label, value, icon, hint, tone = 'green' }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${STAT_TONES[tone] || STAT_TONES.green}`}>
          <i className={`ph ${icon}`} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500';

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...rest }) {
  const styles = {
    primary: 'bg-green-600 hover:bg-green-700 text-white shadow-sm',
    dark: 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-700 dark:hover:bg-slate-600',
    soft: 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
    danger: 'bg-rose-500 hover:bg-rose-600 text-white',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-800 dark:text-slate-300',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon && <i className={`ph ${icon}`} />}
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, icon = 'ph-ticket', children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div
        className={`relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} my-8 border border-slate-200 dark:border-slate-800`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-3xl z-10">
          <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
            <i className={`ph ${icon} text-green-600`} /> {title}
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
            <i className="ph ph-x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-500 dark:text-slate-400">
      <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-bold">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = 'ph-tray', title, message, action }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-2xl">
        <i className={`ph ${icon}`} />
      </div>
      <h3 className="text-base font-black text-slate-900 dark:text-white">{title}</h3>
      {message && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-3.5 text-sm text-rose-700 dark:text-rose-300">
      <i className="ph ph-warning-circle text-lg mt-0.5" />
      <p className="flex-1 font-semibold">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="font-black text-xs uppercase">Retry</button>}
    </div>
  );
}

export function Notice({ tone = 'emerald', children, onClose }) {
  if (!children) return null;
  const styles = tone === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300';
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3.5 text-sm font-semibold ${styles}`}>
      <i className={`ph ${tone === 'rose' ? 'ph-warning-circle' : 'ph-check-circle'} text-lg mt-0.5`} />
      <p className="flex-1">{children}</p>
      {onClose && (
        <button type="button" onClick={onClose} className="opacity-70 hover:opacity-100">
          <i className="ph ph-x" />
        </button>
      )}
    </div>
  );
}

export function DateRange({ from, to, onChange, label = 'Date range' }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={label}>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} className={`${inputClass} w-[150px]`} />
          <span className="text-xs font-bold text-slate-400">to</span>
          <input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} className={`${inputClass} w-[150px]`} />
        </div>
      </Field>
    </div>
  );
}

export function Th({ children, className = '' }) {
  return <th className={`px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }) {
  return <td className={`px-3 py-3 text-sm text-slate-700 dark:text-slate-300 align-middle ${className}`}>{children}</td>;
}

export function TableWrap({ children }) {
  return <div className="overflow-x-auto -mx-5 px-5">{children}</div>;
}
