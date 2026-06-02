import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { HeaderProfileDropdown } from './HeaderProfileDropdown.jsx';

/**
 * Unified Auth Cluster: Get Started button (unauthenticated)
 *                       or Profile dropdown (authenticated).
 */
export function HeaderAuthCluster({ className = '' }) {
  const { user } = useAuth();

  return (
    <div className={`bc-header-auth flex items-center gap-3 flex-shrink-0 ${className}`.trim()}>
      {!user && (
        <Link
          to="/auth"
          className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-sm font-bold text-white transition-all duration-150 shadow-md shadow-green-600/25 hover:shadow-green-600/40"
        >
          <i className="ph ph-rocket-launch text-base" />
          Get Started
        </Link>
      )}
      {user && <HeaderProfileDropdown />}
    </div>
  );
}

