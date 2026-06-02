import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BookingCartNavbar from '../components/BookingCartNavbar.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

function passwordStrength(p) {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 8)  score++;
  if (p.length >= 12) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#16a34a'];

/* ─── Password strength bar ──────────────────────────────────────────────── */
function StrengthBar({ strength }) {
  if (!strength) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1 h-1.5">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= strength ? STRENGTH_COLORS[strength] : '#e2e8f0' }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold mt-1" style={{ color: STRENGTH_COLORS[strength] }}>
        {STRENGTH_LABELS[strength]} password
      </p>
    </div>
  );
}

/* ─── Input field with icon + error ─────────────────────────────────────── */
function Field({ id, label, type = 'text', value, onChange, error, icon, placeholder, hint, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
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
          className={`w-full rounded-xl border py-3 text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-all duration-150 focus:outline-none focus:ring-2
            ${icon ? 'pl-11 pr-4' : 'px-4'}
            ${error
              ? 'border-red-400 bg-red-50 focus:ring-red-200'
              : 'border-slate-200 bg-white dark:bg-slate-800 focus:ring-green-200 focus:border-green-500'
            }`}
        />
        {children}
      </div>
      {error && (
        <p className="text-xs text-red-500 font-medium flex items-center gap-1 animate-[slideDown_0.15s_ease]">
          <i className="ph ph-warning-circle" />{error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-slate-400 font-medium">{hint}</p>}
    </div>
  );
}

/* ─── Main AuthPage ──────────────────────────────────────────────────────── */
export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, googleLogin, forgotPassword, isAuthenticated, loading: authLoading, user } = useAuth();
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
    }, 160);
  }

  /* ── Boot Google Sign-In button ── */
  useEffect(() => {
    document.title = 'Sign In | BookingCart';
    const timer = setTimeout(() => {
      if (typeof window.bootGoogle === 'function') window.bootGoogle();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  /* Re-render Google button when switching back to sign-in tab */
  useEffect(() => {
    if (tab === 'signin') {
      setTimeout(() => {
        if (typeof window.renderGoogleSignInButton === 'function') {
          window.renderGoogleSignInButton();
        } else if (typeof window.bootGoogle === 'function') {
          window.bootGoogle();
        }
      }, 250);
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
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed.');
      // Use AuthContext login function which handles storage and state
      await login({ email: form.email, token: data.token, user: data.user, rememberMe: form.remember });
      // Immediate redirect to home page - must happen after successful login
      const redirectTo = searchParams.get('redirect') || '/';
      console.log('[AuthPage] Login successful, redirecting to:', redirectTo);
      navigate(redirectTo, { replace: true });
      // Force navigation in case react-router delays
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
      // Use AuthContext register function which handles storage and state
      await register({ email: form.email, token: data.token, user: data.user });
      // Immediate redirect to home page
      const redirectTo = searchParams.get('redirect') || '/';
      console.log('[AuthPage] Registration successful, redirecting to:', redirectTo);
      navigate(redirectTo, { replace: true });
      // Force navigation in case react-router delays
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
      className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-200
        ${tab === id ? 'bg-white dark:bg-slate-800 text-green-700 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'}`}
    >
      {label}
    </button>
  );

  const cardClass = `transition-all duration-150 ${animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900">
      {/* ── Left panel — decorative ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative flex-col justify-between overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #14532d 0%, #166534 40%, #16a34a 100%)' }}>
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #4ade80, transparent)' }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #86efac, transparent)' }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #bbf7d0, transparent)' }} />
        </div>

        <div className="relative z-10 p-10 pt-14">
          <Link to="/" className="flex items-center gap-2.5 mb-16">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800/20 flex items-center justify-center">
              <i className="ph-fill ph-airplane-tilt text-white text-xl" />
            </div>
            <span className="text-white font-extrabold text-xl tracking-tight">BookingCart</span>
          </Link>

          <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-5">
            Your next<br />adventure<br />
            <span className="text-green-300">starts here.</span>
          </h1>
          <p className="text-green-100/80 text-lg font-medium leading-relaxed max-w-xs">
            Search, compare and book flights to anywhere in the world — all in one place.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 p-10 pb-14 space-y-3">
          {[
            { icon: 'shield-check', text: 'Secure payments via Stripe' },
            { icon: 'airplane', text: 'Real-time Duffel flight data' },
            { icon: 'clock', text: 'Hold orders & pay later' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-white dark:bg-slate-800/10 backdrop-blur-sm rounded-xl px-4 py-3">
              <i className={`ph-fill ph-${icon} text-green-300 text-xl flex-shrink-0`} />
              <span className="text-white/90 text-sm font-semibold">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        {/* Mobile logo */}
        <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-green-600 flex items-center justify-center">
            <i className="ph-fill ph-airplane-tilt text-white" />
          </div>
          <span className="text-slate-900 dark:text-slate-100 font-extrabold text-lg">BookingCart</span>
        </Link>

        <div className="w-full max-w-md">
          {/* ── Tab switcher (Sign In / Register) ── */}
          {tab !== 'forgot' && tab !== 'reset' && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-8 gap-1">
              <TabBtn id="signin" label="Sign In" />
              <TabBtn id="register" label="Create Account" />
            </div>
          )}

          {/* ── SIGN IN ── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} noValidate className={cardClass}>
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Welcome back</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Sign in to manage your bookings.</p>
              </div>

              {/* Google Sign-In */}
              <div className="mb-6">
                <div
                  className="g_id_signin w-full flex justify-center"
                  ref={googleBtnRef}
                  style={{ minHeight: 44 }}
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">or continue with email</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              <div className="space-y-4">
                <Field id="email" label="Email address" type="email" value={form.email}
                  onChange={e => set('email', e.target.value)} error={errors.email}
                  icon="envelope" placeholder="you@example.com" />

                <Field id="password" label="Password" type={form.showPass ? 'text' : 'password'}
                  value={form.password} onChange={e => set('password', e.target.value)}
                  error={errors.password} icon="lock-simple" placeholder="Your password">
                  <button type="button" tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors"
                    onClick={() => set('showPass', !form.showPass)}>
                    <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between mt-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.remember}
                    onChange={e => set('remember', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 accent-green-600" />
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Remember me</span>
                </label>
                <button type="button" onClick={() => switchTab('forgot')}
                  className="text-sm text-green-600 font-semibold hover:text-green-700 transition-colors">
                  Forgot password?
                </button>
              </div>

              {globalError && <ErrorBanner msg={globalError} />}

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-green-600/25 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <><Spinner />Signing in…</> : <><i className="ph-bold ph-sign-in" />Sign In</>}
              </button>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-5">
                Don't have an account?{' '}
                <button type="button" onClick={() => switchTab('register')}
                  className="text-green-600 font-bold hover:text-green-700">
                  Create one free
                </button>
              </p>
            </form>
          )}

          {/* ── REGISTER ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} noValidate className={cardClass}>
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Create your account</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Free forever. No credit card required.</p>
              </div>

              {/* Google Sign-In */}
              <div className="mb-6">
                <div className="g_id_signin w-full flex justify-center" style={{ minHeight: 44 }} />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">or use email</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              <div className="space-y-4">
                <Field id="name" label="Full name" type="text" value={form.name}
                  onChange={e => set('name', e.target.value)} error={errors.name}
                  icon="user" placeholder="Jane Smith" />

                <Field id="register-email" label="Email address" type="email" value={form.email}
                  onChange={e => set('email', e.target.value)} error={errors.email}
                  icon="envelope" placeholder="you@example.com" />

                <div>
                  <Field id="register-password" label="Password"
                    type={form.showPass ? 'text' : 'password'}
                    value={form.password} onChange={e => set('password', e.target.value)}
                    error={errors.password} icon="lock-simple"
                    placeholder="Min. 8 chars, 1 number, 1 symbol"
                    hint="At least 8 characters, 1 number and 1 special character.">
                    <button type="button" tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400"
                      onClick={() => set('showPass', !form.showPass)}>
                      <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                    </button>
                  </Field>
                  <StrengthBar strength={form.password ? strength : 0} />
                </div>

                <Field id="confirm" label="Confirm password"
                  type={form.showConfirm ? 'text' : 'password'}
                  value={form.confirm} onChange={e => set('confirm', e.target.value)}
                  error={errors.confirm} icon="lock-key" placeholder="Re-enter password">
                  <button type="button" tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400"
                    onClick={() => set('showConfirm', !form.showConfirm)}>
                    <i className={`ph ph-${form.showConfirm ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-green-600/25 mt-6 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <><Spinner />Creating account…</> : <><i className="ph-bold ph-user-plus" />Create Account</>}
              </button>

              <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
                By creating an account you agree to our{' '}
                <Link to="/terms" className="text-green-600 font-semibold hover:underline">Terms</Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-green-600 font-semibold hover:underline">Privacy Policy</Link>.
              </p>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-4">
                Already have an account?{' '}
                <button type="button" onClick={() => switchTab('signin')}
                  className="text-green-600 font-bold hover:text-green-700">Sign in</button>
              </p>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} noValidate className={cardClass}>
              <button type="button" onClick={() => switchTab('signin')}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 font-semibold mb-6 transition-colors">
                <i className="ph ph-arrow-left" /> Back to Sign In
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
                  <i className="ph-fill ph-key text-green-600 text-2xl" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Reset your password</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <Field id="forgot-email" label="Email address" type="email" value={form.email}
                onChange={e => set('email', e.target.value)} error={errors.email}
                icon="envelope" placeholder="you@example.com" />

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}
              {successMsg && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                  <i className="ph-fill ph-check-circle text-green-600 text-xl flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800 font-semibold">{successMsg}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !!successMsg}
                className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-green-600/25 mt-6 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <><Spinner />Sending…</> : <><i className="ph-bold ph-paper-plane-tilt" />Send Reset Link</>}
              </button>
            </form>
          )}

          {/* ── RESET PASSWORD ── */}
          {tab === 'reset' && (
            <form onSubmit={handleReset} noValidate className={cardClass}>
              <button type="button" onClick={() => switchTab('signin')}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 font-semibold mb-6 transition-colors">
                <i className="ph ph-arrow-left" /> Back to Sign In
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
                  <i className="ph-fill ph-lock-key text-green-600 text-2xl" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Create a new password</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                  Use at least 8 characters with a number and a special character.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Field id="reset-password" label="New password"
                    type={form.showPass ? 'text' : 'password'}
                    value={form.password} onChange={e => set('password', e.target.value)}
                    error={errors.password} icon="lock-simple"
                    placeholder="Min. 8 chars, 1 number, 1 symbol">
                    <button type="button" tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400"
                      onClick={() => set('showPass', !form.showPass)}>
                      <i className={`ph ph-${form.showPass ? 'eye-slash' : 'eye'} text-lg`} />
                    </button>
                  </Field>
                  <StrengthBar strength={form.password ? strength : 0} />
                </div>

                <Field id="reset-confirm" label="Confirm password"
                  type={form.showConfirm ? 'text' : 'password'}
                  value={form.confirm} onChange={e => set('confirm', e.target.value)}
                  error={errors.confirm} icon="lock-key" placeholder="Re-enter password">
                  <button type="button" tabIndex={-1}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400"
                    onClick={() => set('showConfirm', !form.showConfirm)}>
                    <i className={`ph ph-${form.showConfirm ? 'eye-slash' : 'eye'} text-lg`} />
                  </button>
                </Field>
              </div>

              {globalError && <ErrorBanner msg={globalError} className="mt-4" />}
              {successMsg && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                  <i className="ph-fill ph-check-circle text-green-600 text-xl flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800 font-semibold">{successMsg}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !!successMsg}
                className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-green-600/25 mt-6 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <><Spinner />Updating…</> : <><i className="ph-bold ph-check" />Update Password</>}
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
    <div className={`flex items-start gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200 ${className}`}>
      <i className="ph-fill ph-warning-circle text-red-500 text-lg flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 font-semibold">{msg}</p>
    </div>
  );
}
