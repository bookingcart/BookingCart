import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BookingCartNavbar from '../components/BookingCartNavbar.jsx';
import { useEffect } from 'react';
import { legacyHrefToRoute } from '../lib/legacyRoutes.js';

/** Shell for nested routes — shared navbar + page chrome. */
export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /* Upgrade the global legacy-navigation bridge to use React Router
     so step transitions (Search→Results→…→Confirmation) are SPA navigations
     with no full page reload, which preserves React state and avoids
     re-executing all script tags. */
  useEffect(() => {
    window.__bcNavigate = (href) => {
      const path = legacyHrefToRoute(String(href || ''));
      navigate(path);
    };
  }, [navigate]);

  /* Derive which nav item to highlight */
  let activeNav = 'flights';
  if (pathname.startsWith('/stays')) activeNav = 'stays';
  else if (
    pathname.startsWith('/my-bookings') ||
    pathname.startsWith('/booking-details')
  ) activeNav = 'bookings';
  else if (pathname.startsWith('/events')) activeNav = 'events';
  else if (pathname.startsWith('/tracker')) activeNav = 'tracker';
  else if (pathname.startsWith('/explore')) activeNav = 'explore';

  return (
    <>
      <BookingCartNavbar activeNav={activeNav} />
      <Outlet />
    </>
  );
}
