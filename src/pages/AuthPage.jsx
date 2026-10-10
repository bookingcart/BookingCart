import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

function passwordStrength(p) {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#10b981'];

/* ─── Password strength bar ──────────────────────────────────────────────── */
function StrengthBar({ strength }) {
  if (!strength) return null;
  return (
    <div className="mt-2.5 space-y-1 animate-[fadeIn_0.2s_ease]">
      <div className="flex gap-1.5 h-1.5">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-300"
            style={{
              background: i <= strength ? STRENGTH_COLORS[strength] : 'rgba(226, 232, 240, 0.6)',
              boxShadow: i <= strength ? `0 0 8px ${STRENGTH_COLORS[strength]}40` : 'none',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-400 font-medium">Password strength</span>
        <span className="font-bold" style={{ color: STRENGTH_COLORS[strength] }}>
          {STRENGTH_LABELS[strength]}
        </span>
      </div>
    </div>
  );
}

/* ─── Input field with icon + error ─────────────────────────────────────── */
function Field({ id, label, type = 'text', value, onChange, error, icon, placeholder, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 dark:group-focus-within:text-emerald-400 text-lg transition-colors pointer-events-none">
            <i className={`ph ph-${icon}`} />
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={id}
          className={`w-full rounded-xl border py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 bg-slate-50/70 dark:bg-slate-800/80 transition-all duration-200 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-4
            ${icon ? 'pl-11 pr-4' : 'px-4'}
            ${error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15 text-rose-900 dark:text-rose-100'
              : 'border-slate-200/80 dark:border-slate-700/80 focus:border-emerald-500 focus:ring-emerald-500/15'
            }`}
        />
        {children}
      </div>
      {error && (
        <p className="text-xs text-rose-500 font-semibold flex items-center gap-1.5 pt-0.5 animate-[fadeIn_0.15s_ease]">
          <i className="ph-fill ph-warning-circle text-rose-500" />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-slate-400 font-medium pt-0.5">{hint}</p>}
    </div>
  );
}

/* ─── Main AuthPage ──────────────────────────────────────────────────────── */
export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, user } = useAuth();
  const resetToken = searchParams.get('reset') || '';
  const defaultTab = searchParams.get('tab') === 'register' ? 'register' : 'signin';

  const [tab, setTab] = useState(resetToken ? 'reset' : defaultTab);
  const [animating, setAnimating] = useState(false);
  const googleBtnRef = useRef(null);

  /* ── Redirect authenticated users to home ── */
  useEffect(() => {
    if (user) {
      const redirectTo = searchParams.get('redirect') || '/';
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, searchParams]);

  /* ── Form state ── */
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    remember: false, showPass: false, showConfirm: false,
  });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const strength = passwordStrength(form.password);

  /* ── Clear messages on tab switch ── */
  function switchTab(next) {
    if (next === tab) return;
    setAnimating(true);
    setTimeout(() => {
      setTab(next);
      setErrors({});
      setGlobalError('');
      setSuccessMsg('');
      setAnimating(false);
    }, 150);
  }

  /* ── Boot Google Sign-In button ── */
  useEffect(() => {
    document.title = tab === 'register' ? 'Create Account | BookingCart' : 'Sign In | BookingCart';
    const timer = setTimeout(() => {
      if (typeof window.bootGoogle === 'function') window.bootGoogle();
    }, 300);
    return () => clearTimeout(timer);
  }, [tab]);

  /* Re-render Google button when switching tabs */
  useEffect(() => {
    if (tab === 'signin' || tab === 'register') {
      setTimeout(() => {
        if (typeof window.renderGoogleSignInButton === 'function') {
          window.renderGoogleSignInButton();
        } else if (typeof window.bootGoogle === 'function') {
          window.bootGoogle();
        }
      }, 200);
    }
  }, [tab]);

  /* ── Validation ── */
  const validate = useCallback(() => {
    const e = {};
    if (!isValidEmail(form.email)) e.email = 'Enter a valid email address.';
    if (tab === 'register') {
      if (!form.name.trim()) e.name = 'Full name is required.';
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
      else if (!/[0-9]/.test(form.password)) e.password = 'Add at least one number.';
      else if (!/[^A-Za-z0-9]/.test(form.password)) e.password = 'Add at least one special character.';
      if (form.confirm !== form.password) e.confirm = 'Passwords do not match.';
    }
    if (tab === 'reset') {
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
      else if (!/[0-9]/.test(form.password)) e.password = 'Add at least one number.';
      else if (!/[^A-Za-z0-9]/.test(form.password)) e.password = 'Add at least one special character.';
      if (form.confirm !== form.password) e.confirm = 'Passwords do not match.';
    }
    if (tab === 'signin' && !form.password) e.password = 'Password is required.';
    if (tab === 'forgot' && !isValidEmail(form.email)) e.email = 'Enter a valid email address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, tab]);

  /* ── Submit handlers ── */
  async function handleSignIn(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setGlobalError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), password: form.password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed. Please check your credentials.');
      await login({ email: form.email, token: data.token, user: data.user, rememberMe: form.remember });
      const redirectTo = searchParams.get('redirect') || '/';
      navigate(redirectTo, { replace: true });
      window.location.href = redirectTo;
      return;
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setGlobalError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Registration failed.');
      await register({ email: form.email, token: data.token, user: data.user });
      const redirectTo = searchParams.get('redirect') || '/';
      navigate(redirectTo, { replace: true });
      window.location.href = redirectTo;
      return;
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setGlobalError(''); setSuccessMsg('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed.');
      setSuccessMsg(data.message || 'Reset link sent! Check your inbox.');
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setGlobalError(''); setSuccessMsg('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Password reset failed.');
      setSuccessMsg(data.message || 'Password updated. You can now sign in.');
      setForm(f => ({ ...f, password: '', confirm: '' }));
      setTimeout(() => switchTab('signin'), 1200);
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Tab pill ── */
  const TabBtn = ({ id, label }) => (
    <button
      type="button"
      onClick={() => switchTab(id)}
      className={`flex-1 py-2.5 px-4 text-xs font-bold tracking-wide uppercase rounded-xl transition-all duration-200
        ${tab === id
          ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-md shadow-slate-200/50 dark:shadow-none font-extrabold'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
    >
      {label}
    </button>
  );

  const cardClass = `transition-all duration-200 ${animating ? 'opacity-0 scale-[0.98] translate-y-1' : 'opacity-100 scale-100 translate-y-0'}`;

  return (
    <div className="min-h-[calc(100vh-70px)] flex bg-slate-50 dark:bg-slate-950 font-sans selection:bg-emerald-500 selection:text-white">
      {/* ── Left Hero Side (Luxury Visual Feature Showcase) ── */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[45%] relative flex-col justify-between overflow-hidden p-10 xl:p-14">
        {/* Background Image with Dark Vignette & Emerald Radial Gradients */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105"
          style={{ backgroundImage: 'url("/images/auth-hero.jpg")' }}
        />
        {/* Gradient Layer */}
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/95 via-emerald-950/80 to-slate-900/60 backdrop-blur-[2px]" />
        
        {/* Ambient Glow Orbs */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-teal-400/20 blur-3xl pointer-events-none" />

        {/* Top Header Tag */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 dark:bg-slate-900/40 backdrop-blur-md border border-white/15 text-white text-xs font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Luxury Travel Marketplace
          </div>
          <div className="flex items-center gap-1 text-amber-300 text-xs font-bold bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
            <i className="ph-fill ph-star text-amber-400" />
            <span>4.9 / 5</span>
            <span className="text-white/60 font-normal pl-1">(50k+ Travelers)</span>
          </div>
        </div>

        {/* Center Hero Copy */}
        <div className="relative z-10 my-auto py-12 max-w-lg">
          <span className="inline-block text-emerald-400 font-bold text-xs uppercase tracking-widest mb-3">
            Seamless Bookings Worldwide
          </span>
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.15] tracking-tight mb-5">
            Your next <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300">adventure</span> starts here.
          </h1>
          <p className="text-emerald-100/80 text-base xl:text-lg font-normal leading-relaxed">
            Search, compare, and book flights, luxury stays, and exclusive tour experiences — with zero hidden fees.
          </p>

          {/* Key Feature Cards */}
          <div className="mt-8 space-y-3.5">
            {[
              {
                icon: 'shield-check',
                title: 'Stripe Secured Payments',
                desc: '100% encrypted checkout with instant digital tickets & receipts.',
              },
              {
                icon: 'airplane-takeoff',
                title: 'Real-time Flight Engine',
                desc: 'Live Duffel integrations with instant seat selection and updates.',
              },
              {
                icon: 'clock-clockwise',
                title: 'Flexible Hold & Pay Later',
                desc: 'Lock in price quotes for 24 hours with easy 1-click management.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="group flex items-start gap-4 p-3.5 rounded-2xl bg-white/10 dark:bg-slate-900/40 backdrop-blur-md border border-white/15 hover:border-emerald-400/50 hover:bg-white/15 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-500/20 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`ph-fill ph-${icon}`} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm leading-snug">{title}</h4>
                  <p className="text-slate-200/80 text-xs mt-0.5 leading-relaxed font-medium">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Guarantee */}
        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-emerald-100/70">
          <div className="flex items-center gap-2">
            <i className="ph-fill ph-check-circle text-emerald-400 text-sm" />
            <span>Best price guarantee on 500+ global airlines</span>
          </div>
          <span className="font-mono text-emerald-200/50">v2.4 Pro</span>
        </div>
      </div>

      {/* ── Right Form Container ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 xl:p-16 relative">
        <div className="w-full max-w-md">

          {/* ── Segmented Tab Switcher ── */}
          {tab !== 'forgot' && tab !== 'reset' && (
            <div className="flex bg-slate-200/70 dark:bg-slate-900/80 p-1.5 rounded-2xl mb-8 border border-slate-300/40 dark:border-slate-800">
              <TabBtn id="signin" label="Sign In" />
              <TabBtn id="register" label="Create Account" />
            </div>
          )}

          {/* ── SIGN IN TAB ── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} noValidate className={cardClass}>
              <div className="mb-6 text-center sm:text-left">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Welcome back 👋
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 font-medium">
                  Sign in to access your bookings and travel perks.
                </p>
              </div>

              {/* Google OAuth Button Container */}
              <div className="mb-6">
                <div
                  className="g_id_signin w-full flex justify-center min-h-[46px]"
                  ref={googleBtnRef}
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider px-2">
                  or continue with email
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              <div className="space-y-4">
                <Field
                  id="email"
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  error={errors.email}
                  icon="envelope"
                  placeholder="name@example.com"
                />

                <Field
                  id="password"
                  label="Password"
                  type={form.showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  error={errors.password}
                  icon="lock-simple"
                  placeholder="Enter your password"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
                    onClick={() => set('showPass', !form.showPass)}
                  >
                    <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between mt-5 mb-6">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.remember}
                    onChange={e => set('remember', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => switchTab('forgot')}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline transition-all"
                >
                  Forgot password?
                </button>
              </div>

              {globalError && <ErrorBanner msg={globalError} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <><Spinner /> Signing in…</> : <><i className="ph-bold ph-sign-in" /> Sign In</>}
              </button>

              <p className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 mt-6">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  Create one free
                </button>
              </p>
            </form>
          )}

          {/* ── REGISTER TAB ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} noValidate className={cardClass}>
              <div className="mb-6 text-center sm:text-left">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Create an account ✨
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5 font-medium">
                  Free forever. Exclusive flight deals & instant booking management.
                </p>
              </div>

              {/* Google OAuth Button Container */}
              <div className="mb-6">
                <div className="g_id_signin w-full flex justify-center min-h-[46px]" />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider px-2">
                  or register with email
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              <div className="space-y-4">
                <Field
                  id="name"
                  label="Full name"
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  error={errors.name}
                  icon="user"
                  placeholder="Alex Morgan"
                />

                <Field
                  id="register-email"
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  error={errors.email}
                  icon="envelope"
                  placeholder="name@example.com"
                />

                <div>
                  <Field
                    id="register-password"
                    label="Password"
                    type={form.showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    error={errors.password}
                    icon="lock-simple"
                    placeholder="Min. 8 chars, 1 number, 1 symbol"
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
                      onClick={() => set('showPass', !form.showPass)}
                    >
                      <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                    </button>
                  </Field>
                  <StrengthBar strength={form.password ? strength : 0} />
                </div>

                <Field
                  id="confirm"
                  label="Confirm password"
                  type={form.showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  error={errors.confirm}
                  icon="lock-key"
                  placeholder="Re-enter password"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
                    onClick={() => set('showConfirm', !form.showConfirm)}
                  >
                    <i className={`ph ph-${form.showConfirm ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:scale-[1.01] active:scale-[0.99] mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <><Spinner /> Creating account…</> : <><i className="ph-bold ph-user-plus" /> Create Free Account</>}
              </button>

              <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed font-medium">
                By creating an account, you agree to our{' '}
                <Link to="/terms" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline">Privacy Policy</Link>.
              </p>

              <p className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 mt-4">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── FORGOT PASSWORD TAB ── */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} noValidate className={cardClass}>
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-bold mb-6 transition-colors group"
              >
                <i className="ph ph-arrow-left text-sm group-hover:-translate-x-1 transition-transform" />
                Back to Sign In
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <i className="ph-fill ph-key text-emerald-600 dark:text-emerald-400 text-2xl" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Reset password
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 font-medium leading-relaxed">
                  Enter your account email address and we'll send you instructions to reset your password.
                </p>
              </div>

              <Field
                id="forgot-email"
                label="Email address"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                error={errors.email}
                icon="envelope"
                placeholder="name@example.com"
              />

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}
              {successMsg && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                  <i className="ph-fill ph-check-circle text-emerald-600 dark:text-emerald-400 text-xl flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-900 dark:text-emerald-200 font-semibold leading-relaxed">{successMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !!successMsg}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <><Spinner /> Sending link…</> : <><i className="ph-bold ph-paper-plane-tilt" /> Send Reset Link</>}
              </button>
            </form>
          )}

          {/* ── RESET PASSWORD TAB ── */}
          {tab === 'reset' && (
            <form onSubmit={handleReset} noValidate className={cardClass}>
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-bold mb-6 transition-colors group"
              >
                <i className="ph ph-arrow-left text-sm group-hover:-translate-x-1 transition-transform" />
                Back to Sign In
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <i className="ph-fill ph-lock-key text-emerald-600 dark:text-emerald-400 text-2xl" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  New password
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 font-medium leading-relaxed">
                  Choose a new strong password for your BookingCart account.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Field
                    id="reset-password"
                    label="New password"
                    type={form.showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    error={errors.password}
                    icon="lock-simple"
                    placeholder="Min. 8 chars, 1 number, 1 symbol"
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
                      onClick={() => set('showPass', !form.showPass)}
                    >
                      <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                    </button>
                  </Field>
                  <StrengthBar strength={form.password ? strength : 0} />
                </div>

                <Field
                  id="reset-confirm"
                  label="Confirm password"
                  type={form.showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  error={errors.confirm}
                  icon="lock-key"
                  placeholder="Re-enter password"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
                    onClick={() => set('showConfirm', !form.showConfirm)}
                  >
                    <i className={`ph ph-${form.showConfirm ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}
              {successMsg && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                  <i className="ph-fill ph-check-circle text-emerald-600 dark:text-emerald-400 text-xl flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-900 dark:text-emerald-200 font-semibold leading-relaxed">{successMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !!successMsg}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <><Spinner /> Updating…</> : <><i className="ph-bold ph-check" /> Update Password</>}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Micro-components ─────────────────────────────────────────────────────── */
function Spinner() {
  return <i className="ph-bold ph-circle-notch animate-spin text-base" />;
}

function ErrorBanner({ msg, className = '' }) {
  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 ${className}`}>
      <i className="ph-fill ph-warning-circle text-rose-500 text-lg flex-shrink-0 mt-0.5" />
      <p className="text-xs text-rose-800 dark:text-rose-200 font-semibold leading-relaxed">{msg}</p>
    </div>
  );
}

