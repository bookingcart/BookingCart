import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const SESSION_KEY = 'bc_signin_popup_dismissed';

/**
 * SignInPopup — slides in from the bottom-right corner ~3s after page load
 * for unauthenticated users. Dismissed state is stored in sessionStorage so
 * it won't re-appear during the same browser session.
 */
export function SignInPopup() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const googleBtnRef = useRef(null);
  const timerRef = useRef(null);

  // Boot the Google Sign-In button into the popup container
  const bootGoogleInPopup = () => {
    if (!googleBtnRef.current) return;
    const container = googleBtnRef.current;
    container.innerHTML = '';

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          text: 'signin_with',
          size: 'large',
          logo_alignment: 'left',
          width: 260,
        });
      } catch (e) {}
    } else if (typeof window.bootGoogle === 'function') {
      // Let bootGoogle run — it will find .g_id_signin elements
      window.bootGoogle().catch(() => {});
    }
  };

  useEffect(() => {
    // Don't show if user is already signed in or dismissed this session
    if (user) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Mount the DOM node first (hidden), then reveal after delay
    setMounted(true);
    timerRef.current = setTimeout(() => {
      setVisible(true);
      // Give the DOM a tick to attach the ref before rendering Google button
      setTimeout(bootGoogleInPopup, 100);
    }, 3000);

    return () => clearTimeout(timerRef.current);
  }, [user]);

  // Re-boot Google button if SDK loads after the popup opens
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        bootGoogleInPopup();
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => setMounted(false), 400);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  };

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop (subtle, non-blocking) */}
      <div
        onClick={dismiss}
        className="fixed inset-0 z-40 pointer-events-none"
        aria-hidden="true"
      />

      {/* Popup card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to BookingCart"
        className={`
          fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]
          bg-white dark:bg-slate-800 rounded-3xl shadow-2xl shadow-slate-900/20 dark:shadow-slate-900/60
          border border-slate-100 dark:border-slate-700
          transition-all duration-500 ease-out
          ${visible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-6 scale-95 pointer-events-none'}
        `}
      >
        {/* Green accent header */}
        <div
          className="rounded-t-3xl px-5 pt-5 pb-4 relative"
          style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)' }}
        >
          {/* Close button */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all"
          >
            <i className="ph ph-x text-sm" />
          </button>

          {/* Plane icon */}
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3">
            <i className="ph-fill ph-airplane-tilt text-white text-xl" />
          </div>

          <p className="text-white font-extrabold text-base leading-tight">
            Sign in for the best deals
          </p>
          <p className="text-green-100/80 text-xs font-medium mt-0.5">
            Price alerts, saved trips &amp; faster checkout.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Google button container — rendered directly via ref */}
          <div
            ref={googleBtnRef}
            className="g_id_signin flex justify-center"
            style={{ minHeight: 44 }}
          />

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700" />
          </div>

          {/* Email sign-in link */}
          <Link
            to="/auth"
            onClick={dismiss}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            <i className="ph ph-envelope text-base text-slate-500" />
            Continue with email
          </Link>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Don't have an account?{' '}
            <Link
              to="/auth?tab=register"
              onClick={dismiss}
              className="text-green-600 font-bold hover:text-green-700"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
