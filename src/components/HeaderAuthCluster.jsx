import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { HeaderProfileDropdown } from './HeaderProfileDropdown.jsx';

/**
 * Unified Auth Cluster: Handles Google Sign-In button rendering and Profile dropdown.
 */
export function HeaderAuthCluster({ className = '' }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) return;

    // Small delay so React commits the .g_id_signin div to the DOM first
    const timer = setTimeout(() => {
      if (typeof window.bootGoogle === 'function') {
        window.bootGoogle();
      } else if (typeof window.renderGoogleSignInButton === 'function') {
        window.renderGoogleSignInButton();
      } else if (typeof window.applyAuthUI === 'function') {
        window.applyAuthUI();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [user]);

  return (
    <div className={`bc-header-auth flex items-center gap-3 flex-shrink-0 ${className}`.trim()}>
      {!user && (
        <div 
          className="g_id_signin" 
          style={{ minWidth: '200px', minHeight: '40px' }}
        ></div>
      )}
      {user && <HeaderProfileDropdown />}
    </div>
  );
}
