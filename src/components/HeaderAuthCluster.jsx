import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { HeaderProfileDropdown } from './HeaderProfileDropdown.jsx';

/**
 * Unified Auth Cluster: Sign-In link + Google button (unauthenticated)
 *                       or Profile dropdown (authenticated).
 */
export function HeaderAuthCluster({ className = '' }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) return;
    const timer = setTimeout(() => {
      if (window.google?.accounts?.id) {
        if (typeof window.renderGoogleSignInButton === 'function') {
          window.renderGoogleSignInButton();
        }
      } else if (typeof window.bootGoogle === 'function') {
        window.bootGoogle();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [user]);

  return (
    <div className={`bc-header-auth flex items-center gap-3 flex-shrink-0 ${className}`.trim()}>
      {!user && (
        <>
          {/* Email/password sign-in link */}
          <Link
            to="/auth"
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-sm font-bold text-slate-700 dark:text-slate-300 transition-all duration-150 hover:border-slate-300 dark:hover:border-slate-600"
          >
            <i className="ph ph-sign-in text-base text-slate-500" />
            Sign In
          </Link>
          {/* Google One-Tap / button */}
          <div className="g_id_signin" style={{ minWidth: '40px', minHeight: '40px' }} />
        </>
      )}
      {user && <HeaderProfileDropdown />}
    </div>
  );
}

