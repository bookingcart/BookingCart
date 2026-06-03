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

function money(amount, currency) {
  if (amount == null || isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

function getBaseFare(state) {
  const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
  const totalPax = (pax.adults || 0) + (pax.children || 0) + (pax.infants || 0) || 1;
  const flight = (state.flights || []).find(f => f.id === state.selectedFlightId)
    || state.selectedFlight
    || (state.flights || [])[0];
  if (!flight) return { base: 0, currency: 'USD', totalPax };
  const price = typeof flight.price === 'object' ? parseFloat(flight.price.amount || 0) : Number(flight.price || 0);
  return { base: price * totalPax, currency: flight.currency || 'USD', totalPax };
}

export default function ExtrasPage() {
  const navigate = useNavigate();
  const [clientKey, setClientKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [offerId, setOfferId] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [servicesReady, setServicesReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Loading available extras...');
  const [summary, setSummary] = useState(null); // { base, extras, taxes, total, currency }

  useLegacyScripts(SCRIPTS, 'extras');

  useEffect(() => {
    document.title = 'BookingCart — Extras';

    const state = readState();

    // Get selected flight ID (must be a Duffel off_ ID)
    const selectedId = state.selectedFlightId ||
      (state.flights && state.flights[0]?.id);

    if (!selectedId || !selectedId.startsWith('off_')) {
      setErrorMsg('No valid flight selected. Please go back and select a flight.');
      return;
    }

    setOfferId(selectedId);

    // Build formatted passengers from duffelPassengers + traveler details
    const duffelPax = state.duffelPassengers || [];
    const travelers = state.travelers || [];

    if (duffelPax.length === 0) {
      setErrorMsg('Passenger information is missing. Please go back to the Passengers step.');
      return;
    }

    const formattedPassengers = duffelPax.map((dp, idx) => {
      const t = travelers[idx] || {};
      let phone = String(state.contact?.phone || '+10000000000').trim();
      if (!phone.startsWith('+')) phone = '+' + phone.replace(/[^0-9]/g, '');
      if (phone === '+') phone = '+10000000000';
      return {
        id: dp.id,
        given_name: (t.firstName || '').trim() || 'Guest',
        family_name: (t.lastName || '').trim() || 'User',
        born_on: t.dob || '1990-01-01',
        title: t.title || (dp.type === 'infant_without_seat' ? 'miss' : 'mr'),
        gender: t.gender || (dp.type === 'infant_without_seat' ? 'f' : 'm'),
        email: state.contact?.email || 'guest@bookingcart.com',
        phone_number: phone,
      };
    });

    setPassengers(formattedPassengers);

    // Set initial price summary (base fare only, no extras yet)
    const fareInfo = getBaseFare(state);
    const initialTaxes = Math.round(fareInfo.base * 0.11);
    setSummary({
      base: fareInfo.base,
      extras: 0,
      taxes: initialTaxes + 25, // includes $25 platform fee
      total: fareInfo.base + initialTaxes + 25,
      currency: fareInfo.currency,
    });

    // Fetch Duffel Client Key
    setLoadingMsg('Connecting to Duffel...');
    fetch('/api/duffel-client-key', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setClientKey(data.clientKey);
          setLoadingMsg(null);
        } else {
          setErrorMsg(data.error || 'Failed to initialize extras system.');
        }
      })
      .catch(() => setErrorMsg('Network error: Failed to initialize extras system.'));

  }, []);

  const handlePayloadReady = (payload, metadata) => {
    // Duffel calls onPayloadReady(payload, metadata)
    // payload = { services: [{id, quantity}, ...], passengers: [...] }
    // metadata contains pricing breakdown per service type
    const state = readState();
    const fareInfo = getBaseFare(state);
    let extrasCost = 0;

    // Try all known Duffel metadata structures for the total ancillary cost
    if (metadata?.total?.amount != null) {
      // { total: { amount: "66.00", currency: "USD" } }
      extrasCost = Number(metadata.total.amount);
    } else if (metadata?.total_amount != null) {
      // { total_amount: "66.00" }
      extrasCost = Number(metadata.total_amount);
    } else {
      // Sum bags + seats + cfar separately
      if (metadata?.bags?.total?.amount) extrasCost += Number(metadata.bags.total.amount);
      if (metadata?.seats?.total?.amount) extrasCost += Number(metadata.seats.total.amount);
      if (metadata?.cancel_for_any_reason?.total?.amount) extrasCost += Number(metadata.cancel_for_any_reason.total.amount);
    }

    const services = Array.isArray(payload) ? payload : (payload?.services || []);
    writeState({ 
      _selectedServices: services, 
      _servicesMetadata: metadata,
      _ancillariesCost: extrasCost 
    });
    setServicesReady(true);

    const subtotal = fareInfo.base + extrasCost;
    const taxes = Math.round(subtotal * 0.11);
    setSummary({
      base: fareInfo.base,
      extras: extrasCost,
      taxes: taxes + 25,
      total: subtotal + taxes + 25,
      currency: fareInfo.currency,
    });
  };


  const handleContinue = (e) => {
    e.preventDefault();
    // Allow continuing even if user skips extras
    navigate('/payment');
  };

  const isReady = clientKey && offerId && passengers.length > 0;

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
                  <div className="mt-3">
                    <a href="/passengers" className="text-sm font-bold underline">← Go back to Passengers</a>
                  </div>
                </div>
              )}

              <form onSubmit={handleContinue} className="space-y-6">
                
                {isReady ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                    <DuffelAncillaries
                      client_key={clientKey}
                      offer_id={offerId}
                      passengers={passengers}
                      services={['bags', 'seats', 'cancel_for_any_reason']}
                      onPayloadReady={handlePayloadReady}
                    />
                  </div>
                ) : !errorMsg ? (
                  <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm">
                    <i className="ph-bold ph-circle-notch animate-spin text-3xl mb-4 text-green-600 block"></i>
                    <p>{loadingMsg || 'Loading available extras...'}</p>
                  </div>
                ) : null}
      
                <div className="flex justify-between items-center pt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/payment')}
                    className="text-slate-500 hover:text-slate-700 font-medium py-3 px-6 rounded-xl border border-slate-200 hover:border-slate-300 transition-all">
                    Skip Extras
                  </button>
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    type="submit">
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
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {summary ? money(summary.base, summary.currency) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Extras</span>
                    <span className={`font-bold ${summary?.extras > 0 ? 'text-green-700' : 'text-slate-900 dark:text-slate-100'}`}>
                      {summary ? (summary.extras > 0 ? money(summary.extras, summary.currency) : 'None') : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Taxes & Fees</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {summary ? money(summary.taxes, summary.currency) : '—'}
                    </span>
                  </div>
                </div>
      
                <hr className="border-slate-100 my-4" />
      
                <div className="flex justify-between items-end mb-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Total Due</span>
                  <span className="text-2xl font-extrabold text-green-600">
                    {summary ? money(summary.total, summary.currency) : '—'}
                  </span>
                </div>
                <div className="text-xs text-right text-slate-400">Updates automatically</div>

                {servicesReady && (
                  <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-100 text-xs text-green-700 flex items-center gap-2">
                    <i className="ph-bold ph-check-circle text-base"></i>
                    Extras saved! Continue to payment.
                  </div>
                )}
                
                {/* TEMPORARY DEBUG BLOCK TO SEE METADATA SHAPE */}
                <div className="mt-4 p-2 bg-slate-100 rounded text-[10px] text-slate-700 overflow-x-auto">
                  <p className="font-bold mb-1">Debug Info (Please Screenshot this):</p>
                  <pre>{JSON.stringify(readState()._servicesMetadata, null, 2)}</pre>
                  <pre>{JSON.stringify(readState()._selectedServices, null, 2)}</pre>
                </div>
      
              </div>
            </aside>
      
          </div>
        </main>
      <FlightFooter />
    </>
  );
}
