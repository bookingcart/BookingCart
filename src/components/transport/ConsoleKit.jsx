import { useEffect } from 'react';

// Shared building blocks for the transport console (operator dashboard and the
// platform admin page). Tailwind classes are kept as complete strings so the
// compiler can see every variant.

export const inputCls = `w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900
  placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20
  dark:border-slate-700 dark:bg-slate-900 dark:text-white`;

export const labelCls = 'block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5';

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] font-medium text-slate-400">{hint}</span>}
    </label>
  );
}

export function Panel({ title, subtitle, actions, children, className = '', padded = true }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function StatCard({ icon = 'ph-chart-line-up', label, value, hint, tone = 'emerald' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${TONES[tone] || TONES.emerald}`}>
          <i className={`ph ${icon}`} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{hint}</p>}
    </div>
  );
}

const STATUS_TONES = {
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  scheduled: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  valid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  used: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  unpaid: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  inactive: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  completed: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  suspended: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  refunded: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  expired: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
};

export function Badge({ status, label }) {
  const key = String(status || '').toLowerCase();
  const tone = STATUS_TONES[key] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone}`}>
      {label || String(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-6 w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <i className="ph ph-x text-sm" aria-hidden="true" />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'ph-tray', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-slate-700">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400 dark:bg-slate-800">
        <i className={`ph ${icon}`} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      {message}
    </p>
  );
}

export function Note({ children, tone = 'emerald' }) {
  return (
    <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${TONES[tone] || TONES.emerald}`}>{children}</p>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-400">
      <i className="ph ph-spinner-gap animate-spin text-base" aria-hidden="true" /> {label}
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

export const btn = {
  primary: 'inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50',
  secondary: 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50',
  danger: 'inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-50',
  ghost: 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
};

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-800">
            {head.map((cell) => <th key={cell} className="px-2 py-2 font-black">{cell}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}
