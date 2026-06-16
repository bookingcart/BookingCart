import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import PageLoading from './components/PageLoading.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'));
const DetailsPage = lazy(() => import('./pages/DetailsPage.jsx'));
const PassengersPage = lazy(() => import('./pages/PassengersPage.jsx'));
const ExtrasPage = lazy(() => import('./pages/ExtrasPage.jsx'));
const PaymentPage = lazy(() => import('./pages/PaymentPage.jsx'));
const ConfirmationPage = lazy(() => import('./pages/ConfirmationPage.jsx'));
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage.jsx'));
const StaysPage = lazy(() => import('./pages/StaysPage.jsx'));
const StaysResultsPage = lazy(() => import('./pages/StaysResultsPage.jsx'));
const StaysDetailsPage = lazy(() => import('./pages/StaysDetailsPage.jsx'));
const StaysCheckoutPage = lazy(() => import('./pages/StaysCheckoutPage.jsx'));
const StaysConfirmationPage = lazy(() => import('./pages/StaysConfirmationPage.jsx'));
const EventsPage = lazy(() => import('./pages/EventsPage.jsx'));
const VisaNewPage = lazy(() => import('./pages/VisaNewPage.jsx'));
const VisaDashboardPage = lazy(() => import('./pages/VisaDashboardPage.jsx'));
const AdminVisaPage = lazy(() => import('./pages/AdminVisaPage.jsx'));
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'));
const BookingDetailsPage = lazy(() => import('./pages/BookingDetailsPage.jsx'));
const CustomerSupportPage = lazy(() => import('./pages/CustomerSupportPage.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const FlightTrackerPage = lazy(() => import('./pages/FlightTrackerPage.jsx'));
const ExplorePage = lazy(() => import('./pages/ExplorePage.jsx'));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/details" element={<DetailsPage />} />
          <Route path="/passengers" element={<PassengersPage />} />
          <Route path="/extras" element={<ExtrasPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/account-settings" element={<AccountSettingsPage />} />
          <Route path="/account-settings/:section" element={<AccountSettingsPage />} />
          <Route path="/stays" element={<StaysPage />} />
          <Route path="/stays/results" element={<StaysResultsPage />} />
          <Route path="/stays/details" element={<StaysDetailsPage />} />
          <Route path="/stays/checkout" element={<StaysCheckoutPage />} />
          <Route path="/stays/confirmation" element={<StaysConfirmationPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/visa" element={<Navigate to="/visa/new" replace />} />
          <Route path="/visa/new" element={<VisaNewPage />} />
          <Route path="/visa/dashboard" element={<VisaDashboardPage />} />
          <Route path="/admin/visa" element={<AdminVisaPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/booking-details" element={<BookingDetailsPage />} />
          <Route path="/booking-details/:ref" element={<BookingDetailsPage />} />
          <Route path="/support" element={<CustomerSupportPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/sign-in" element={<AuthPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/tracker" element={<FlightTrackerPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/:routeId" element={<ExplorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
