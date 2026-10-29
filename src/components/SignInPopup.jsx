import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../lib/theme.js';

const SESSION_KEY = 'bc_signin_popup_dismissed';

/**
 * SignInPopup — a compact sign-in prompt that slides into the bottom-right
 * corner a few seconds after load for visitors who are not signed in.
 * Dismissing it lasts for the browser session (sessionStorage).
 */
export function SignInPopup() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const googleBtnRef = useRef(null);
  const timerRef = useRef(null);

  // Google renders its own button, so it has to be told which theme to match.
  const bootGoogle = useCallback(() => {
    const container = googleBtnRef.current;
    if (!container) return;
    container.innerHTML = '';

    if (window.google?.accounts?.id) {
      const width = Math.min(400, Math.max(200, Math.round(container.clientWidth || 280)));
      try {
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: 'rectangular',
          theme: isDark ? 'filled_black' : 'outline',
          text: 'signin_with',
          size: 'large',
          logo_alignment: 'left',
          width,
        });
      } catch {
        // SDK still warming up — the retry effect below runs again.
      }
    } else if (typeof window.bootGoogle === 'function') {
      window.bootGoogle().catch(() => {});
    }
  }, [isDark]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setMounted(false), 400);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
  }, []);

  useEffect(() => {
    // Don't show if the visitor is signed in or already dismissed this session.
    if (user) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Mount hidden first, then reveal so the slide-in still animates.
    setMounted(true);
    timerRef.current = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timerRef.current);
  }, [user]);

  // Boot on reveal, then keep retrying until the Google SDK is ready. Re-runs
  // when the theme changes so the button repaints in the matching style.
  useEffect(() => {
    if (!visible) return;
    bootGoogle();
    const retry = setInterval(() => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        bootGoogle();
        clearInterval(retry);
      }
    }, 500);
    return () => clearInterval(retry);
  }, [visible, bootGoogle]);

  // Escape closes it like any other dialog.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-label="Sign in to BookingCart"
      className={`
        fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl
        border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10
        transition-all duration-500 ease-out
        dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50
        ${visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss sign-in prompt"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <i className="ph ph-x text-sm" aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400">
          <i className="ph-fill ph-airplane-tilt text-lg" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-slate-900 dark:text-white">Sign in to BookingCart</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Save your trips and check out faster.
          </p>
        </div>
      </div>

      {/* Google renders its own button into this node. */}
      <div ref={googleBtnRef} className="g_id_signin mt-4 flex justify-center" style={{ minHeight: 40 }} />

      <div className="my-3 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">or</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <Link
        to="/auth"
        onClick={dismiss}
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <i className="ph ph-envelope-simple text-base text-slate-400 dark:text-slate-500" aria-hidden="true" />
        Continue with email
      </Link>

      <p className="mt-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
        New here?{' '}
        <Link
          to="/auth?tab=register"
          onClick={dismiss}
          className="font-semibold text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
