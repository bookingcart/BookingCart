import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { DuffelAncillaries } from '@duffel/components';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js'];
const STORAGE_KEY = 'bookingcart_flights_v1';

function readState() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function writeState(updates) {
  try {
    const s = readState();
    const next = { ...s, ...updates };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return {};
  }
}

export default function ExtrasPage() {
  const navigate = useNavigate();
  const [clientKey, setClientKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [offer, setOffer] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicesReady, setServicesReady] = useState(false);

  useLegacyScripts(SCRIPTS, 'extras');

  useEffect(() => {
    document.title = 'BookingCart — Extras';
    
    // Fetch Duffel Client Key
    fetch('/api/duffel-client-key', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setClientKey(data.clientKey);
        else setErrorMsg(data.error);
      })
      .catch(e => setErrorMsg('Failed to initialize extras system.'));

    // Load offer and format passengers
    const state = readState();
    const currentOffer = (state.flights || []).find((f) => f.id === state.selectedFlightId) || (state.flights || [])[0];
    
    if (currentOffer) {
      setOffer(currentOffer);
      
      // Format passengers for DuffelAncillaries
      if (currentOffer.passengers && currentOffer.passengers.length > 0) {
        const formattedPassengers = currentOffer.passengers.map((op, idx) => {
          const t = state.travelers?.[idx] || {};
          return {
            id: op.id,
            given_name: t.firstName || 'Guest',
            family_name: t.lastName || 'User',
            born_on: t.dob || '1990-01-01',
            title: t.title || 'mr',
            gender: t.gender || 'm',
            email: state.contact?.email || 'guest@bookingcart.com',
            phone_number: state.contact?.phone || '+10000000000'
          };
        });
        setPassengers(formattedPassengers);
      }
    } else {
      setErrorMsg('No flight selected. Please go back to search.');
    }
  }, []);

  const handlePayloadReady = (data, metadata) => {
    setSelectedServices(data.services || []);
    writeState({ _selectedServices: data.services || [], _servicesMetadata: metadata });
    setServicesReady(true);
  };

  const handleContinue = (e) => {
    e.preventDefault();
    navigate('/payment');
  };

  return (
    <>
        <main className="flex-grow container mx-auto px-6 py-8" data-step="extras">
      
          <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar steps text-sm font-medium">
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="search" href="/">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">1</span>
              Search
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="results" href="/results">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">2</span>
              Results
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="details" href="/details">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">3</span>
              Details
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="passengers" href="/passengers">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">4</span>
              Passengers
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white border border-slate-900 whitespace-nowrap"
              data-step-id="extras" href="/extras">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">5</span>
              Extras
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 whitespace-nowrap"
              data-step-id="payment" href="#">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold">6</span>
              Payment
            </a>
          </div>
      
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" data-extras-react>
      
            <section className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Add-ons & Extras</h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Customize your trip with baggage, seats, and more.</p>

              {errorMsg && (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
                  <i className="ph-bold ph-warning-circle mr-2"></i>
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleContinue} className="space-y-6">
                
                {clientKey && offer && passengers.length > 0 ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                    <DuffelAncillaries
                      client_key={clientKey}
                      offer={offer}
                      passengers={passengers}
                      services={['bags', 'seats', 'cancel_for_any_reason']}
                      onPayloadReady={handlePayloadReady}
                    />
                  </div>
                ) : !errorMsg ? (
                  <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm">
                    <i className="ph-bold ph-circle-notch animate-spin text-3xl mb-4 text-green-600"></i>
                    <p>Loading available extras...</p>
                  </div>
                ) : null}
      
                <div className="flex justify-end pt-4">
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    type="submit"
                    disabled={!clientKey || !offer || !servicesReady}>
                    Continue to Payment <i className="ph-bold ph-arrow-right"></i>
                  </button>
                </div>
              </form>
            </section>
      
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-lg p-6 sticky top-24">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">Price Summary</h2>
                </div>
      
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Base Fare</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100" data-sum-base>-</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Extras</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100" data-sum-extras>-</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Taxes & Fees</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100" data-sum-taxes>-</span>
                  </div>
                </div>
      
                <hr className="border-slate-100 my-4" />
      
                <div className="flex justify-between items-end mb-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Total Due</span>
                  <span className="text-2xl font-extrabold text-green-600" data-sum-total>-</span>
                </div>
                <div className="text-xs text-right text-slate-400">Updates automatically</div>
      
              </div>
            </aside>
      
          </div>
        </main>
      <FlightFooter />
    </>
  );
}
