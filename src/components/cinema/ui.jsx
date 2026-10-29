// Shared building blocks for the cinema owner console. Kept deliberately small so
// every panel blends into the attraction dashboard it lives inside.

export const inputCls = `w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold
  text-slate-900 placeholder:font-normal placeholder:text-slate-400
  focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20
  dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500`;

export const labelCls = 'mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ title, subtitle, icon, action, children, className = '', bodyClass = 'p-5' }) {
  return (
    <section className={cx('overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              {icon && <i className={cx('ph', icon, 'text-green-600')} />}
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] font-medium text-slate-400">{hint}</p>}
    </div>
  );
}

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = { sm: 'px-3 py-1.5 text-[11px]', md: 'px-4 py-2.5 text-xs', lg: 'px-5 py-3 text-sm' };
  const variants = {
    primary: 'bg-green-600 text-white shadow-sm shadow-green-600/25 hover:bg-green-700',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200',
    ghost: 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
    danger: 'border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30',
  };
  return (
    <button type="button" className={cx(base, sizes[size], variants[variant], className)} {...props}>
      {icon && <i className={cx('ph', icon)} />}
      {children}
    </button>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        {icon && <span className={cx('flex h-7 w-7 items-center justify-center rounded-lg text-sm', tones[tone])}><i className={cx('ph', icon)} /></span>}
      </div>
      <p className="mt-1.5 text-2xl font-black tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-[10px] font-semibold text-slate-400">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon = 'ph-film-strip', title, message, action }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800/30">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl text-slate-300 shadow-sm dark:bg-slate-900 dark:text-slate-600">
        <i className={cx('ph', icon)} />
      </div>
      <h4 className="text-sm font-black text-slate-800 dark:text-white">{title}</h4>
      {message && <p className="mx-auto mt-1.5 max-w-sm text-xs font-medium text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', icon, children, onClose }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300',
    success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
    error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
  };
  const icons = { info: 'ph-info', success: 'ph-check-circle', warning: 'ph-warning-circle', error: 'ph-x-circle' };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs font-bold', tones[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <i className={cx('ph', icon || icons[tone], 'mt-0.5 text-base')} />
      <div className="flex-1">{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><i className="ph ph-x" /></button>}
    </div>
  );
}

export function Pill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-400',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}
