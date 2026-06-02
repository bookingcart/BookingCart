import { useEffect, useState, useRef } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { DuffelCardForm, useDuffelCardFormActions, createThreeDSecureSession } from '@duffel/components';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js'];

function money(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

function flightPriceAmount(flight) {
  if (!flight || flight.price == null) return 0;
  if (typeof flight.price === "object") {
    return parseFloat(flight.price.amount || 0) || 0;
  }
  return Number(flight.price) || 0;
}

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

function computeTotals(state) {
  const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
  const totalPax = pax.adults + pax.children + pax.infants;
  // Try flights array first, then fall back to the directly stored selectedFlight object
  const flight = (state.flights || []).find((f) => f.id === state.selectedFlightId)
    || state.selectedFlight
    || (state.flights || [])[0];
  const base = flight ? flightPriceAmount(flight) * totalPax : 0;

  const selectedServices = state._selectedServices || [];
  let ancillariesCost = 0;
  if (flight && flight.available_services) {
    selectedServices.forEach(srv => {
      const availableService = flight.available_services.find(s => s.id === srv.id);
      if (availableService && availableService.total_amount) {
        ancillariesCost += Number(availableService.total_amount) * srv.quantity;
      }
    });
  } else if (state._servicesMetadata && state._servicesMetadata.total_amount) {
    ancillariesCost = Number(state._servicesMetadata.total_amount);
  }

  const extras = state.extras || {};
  const insurance = extras.insurance ? 19 * totalPax : 0;
  const meals = extras.meal === "premium" ? 12 * totalPax : extras.meal === "standard" ? 7 * totalPax : 0;
  const platformFee = 25; // Flat $25 BookingCart fee

  const subtotal = base + ancillariesCost + insurance + meals;
  const taxes = Math.round(subtotal * 0.11);
  const total = subtotal + taxes + platformFee;
  const currency = flight ? (flight.currency || "USD") : "USD";

  // Split calculations
  const flightCost = base + ancillariesCost;
  const markupCost = insurance + meals + taxes + platformFee;

  return { totalPax, base, ancillariesCost, insurance, meals, platformFee, taxes, total, flightCost, markupCost, currency };
}

export default function PaymentPage() {
  const [clientKey, setClientKey] = useState(null);
  const [totals, setTotals] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(1); // 1 = Flight, 2 = Markup
  const [errorMsg, setErrorMsg] = useState(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const cardFormRef = useRef(null);
  const { ref, createCardForTemporaryUse } = useDuffelCardFormActions();
  const [cardValid, setCardValid] = useState(false);

  useLegacyScripts(SCRIPTS, 'payment');

  useEffect(() => {
    document.title = 'BookingCart — Secure Payment';
    const state = readState();
    if (!state.bookingRef) {
      writeState({ bookingRef: "BC" + Math.random().toString(36).slice(2, 8).toUpperCase() });
    }
    setTotals(computeTotals(readState()));

    fetch('/api/duffel-client-key', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setClientKey(data.clientKey);
        else setErrorMsg(data.error);
      })
      .catch(e => setErrorMsg('Failed to initialize payment system.'));
  }, []);

  const startPlatformCheckout = async (sourceState = readState()) => {
    const state = sourceState || readState();
    const amountCents = Math.round(Number(totals.markupCost) * 100);
    const bookingRef = state.bookingRef;
    const contactEmail = state.contact?.email || "";

    if (state._platformStripeSessionId && state._platformStripeStatus === 'paid') {
      setErrorMsg('BookingCart payment has already been completed for this booking.');
      return;
    }

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      writeState({ _platformStripeStatus: 'not_required' });
      window.location.href = '/confirmation';
      return;
    }

    setProcessingMessage('Airline payment confirmed. Opening secure BookingCart payment...');
    const resp = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents,
        currency: totals.currency.toLowerCase(),
        description: "BookingCart Fees & Extras " + bookingRef,
        bookingRef,
        customerEmail: contactEmail,
        successPath: "/confirmation",
        cancelPath: "/payment",
        paymentPurpose: "platform_fees",
        duffelOrderId: state._duffelOrderId || ""
      })
    });

    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Unable to create Stripe checkout session");

    writeState({
      _platformStripeSessionId: data.id,
      _platformStripeStatus: 'checkout_started',
      _platformPaymentAmountCents: amountCents
    });
    window.location.href = data.url;
  };

  const handleFlightPayment = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingMessage('Preparing secure airline payment...');
    try {
      const state = readState();
      if (state._duffelOrderId && state._airlinePaymentStatus === 'paid') {
        await startPlatformCheckout(state);
        return;
      }

      // 1. Create card using Duffel Card Form
      await createCardForTemporaryUse();
      // Execution continues in onCreateCardForTemporaryUseSuccess
    } catch (error) {
      console.error(error);
      setErrorMsg('Failed to process card. Please check details.');
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleCardSuccess = async (card) => {
    try {
      const state = readState();
      const flightId = state.selectedFlightId;
      const bookingRef = state.bookingRef || "BC" + Math.random().toString(36).slice(2, 8).toUpperCase();
      if (!state.bookingRef) writeState({ bookingRef });

      if (state._duffelOrderId && state._airlinePaymentStatus === 'paid') {
        await startPlatformCheckout(state);
        return;
      }

      setProcessingMessage('Authenticating card with the airline...');
      
      const services = state._selectedServices || [];

      // 2. 3D Secure Session
      const session = await createThreeDSecureSession(
        clientKey,
        card.id,
        flightId,
        services,
        true
      );

      if (session.status !== 'ready_for_payment') {
        throw new Error('Card authentication failed or was cancelled.');
      }

      setProcessingMessage('Issuing airline ticket. Do not close this page...');
      // 3. Create Duffel Order with card
      // We will create the order with hold = true first, or directly pay it.
      // Wait, we can pass payments directly to duffel-orders!
      const duffelOrderReq = await fetch('/api/duffel-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: flightId,
          totalAmount: totals.flightCost,
          currency: totals.currency,
          bookingRef,
          idempotencyKey: `duffel-order:${bookingRef}`,
          passengers: state.travelers.map((t, idx) => ({
             id: state.duffelPassengers[idx]?.id,
             given_name: t.firstName,
             family_name: t.lastName,
             born_on: t.dob,
             title: t.title,
             gender: t.gender,
             email: state.contact?.email || 'guest@bookingcart.com',
             phone_number: '+10000000000'
          })),
          hold: false,
          services: services.length > 0 ? services : undefined,
          payment: {
            type: 'card',
            currency: totals.currency,
            amount: String(totals.flightCost),
            three_d_secure_session_id: session.id
          }
        })
      });

      const orderData = await duffelOrderReq.json();
      if (!orderData.ok) throw new Error(orderData.error || 'Failed to book flight with airline.');

      const nextState = writeState({
        _duffelOrderId: orderData.orderId,
        _duffelBookingReference: orderData.bookingReference || null,
        _airlinePaymentStatus: 'paid',
        bookingRef
      });

      const s = nextState.search || {};
      const flight = (nextState.flights || []).find(f => f.id === nextState.selectedFlightId) || (nextState.flights || [])[0];
      const booking = {
        ref: bookingRef,
        route: (s.from || "") + " → " + (s.to || ""),
        dates: (s.depart || "") + (s.return ? " → " + s.return : ""),
        flight: flight ? { airline: flight.airline.name, time: flight.departTime + " → " + flight.arriveTime } : null,
        contact: nextState.contact || {},
        passengers: nextState.travelers || nextState.passengers || [],
        total: totals.total,
        extras: nextState.extras || {}
      };

      const saveResp = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", booking })
      });
      const saveData = await saveResp.json().catch(() => null);
      if (!saveResp.ok || !saveData?.ok) {
        throw new Error(saveData?.error || 'Unable to save booking before BookingCart payment.');
      }

      writeState({ _bookingSaved: true });
      await startPlatformCheckout(nextState);
    } catch (e) {
      console.error(e);
      setErrorMsg(e.message || 'Payment failed.');
      const stateAfterError = readState();
      setStep(stateAfterError._duffelOrderId && stateAfterError._airlinePaymentStatus === 'paid' ? 2 : 1);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleCardFailure = (error) => {
    console.error('Card tokenization failed:', error);
    setErrorMsg('Invalid card details provided. Please check and try again.');
    setIsProcessing(false);
  };

  const handleStripePayment = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingMessage('Opening secure BookingCart payment...');
    try {
      const state = readState();
      const bookingRef = state.bookingRef;

      // Save pending booking
      const s = state.search || {};
      const flight = (state.flights || []).find(f => f.id === state.selectedFlightId) || (state.flights || [])[0];

      const booking = {
        ref: bookingRef,
        route: (s.from || "") + " → " + (s.to || ""),
        dates: (s.depart || "") + (s.return ? " → " + s.return : ""),
        flight: flight ? { airline: flight.airline.name, time: flight.departTime + " → " + flight.arriveTime } : null,
        contact: state.contact || {},
        passengers: state.travelers || state.passengers || [],
        total: totals.total,
        extras: state.extras || {}
      };

      const saveResp = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", booking })
      });
      const saveData = await saveResp.json().catch(() => null);
      if (!saveResp.ok || !saveData?.ok) {
        throw new Error(saveData?.error || 'Unable to save booking before payment.');
      }

      await startPlatformCheckout(state);
    } catch (e) {
      console.error(e);
      setErrorMsg(e.message || 'Failed to initialize final payment.');
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  if (!totals) return <div className="p-12 text-center">Loading payment...</div>;

  return (
    <>
      <main className="flex-grow container mx-auto px-6 py-8">
        {isProcessing && processingMessage && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center px-6">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-md text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-4">
                <i className="ph-bold ph-circle-notch animate-spin text-3xl"></i>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-2">Processing payment</h2>
              <p className="text-sm text-slate-600">{processingMessage}</p>
              <p className="text-xs font-semibold text-slate-400 mt-4">Please do not close or refresh this page.</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar steps text-sm font-medium">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white whitespace-nowrap">
            <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">6</span>
            Payment
          </div>
        </div>

        {/* No Booking Data Warning */}
        {totals.total === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3">
              <i className="ph-bold ph-warning-circle text-amber-600 text-2xl"></i>
              <div>
                <h3 className="font-semibold text-amber-900">No Active Booking</h3>
                <p className="text-amber-700 text-sm mt-1">
                  You need to complete a flight search and select a flight before proceeding to payment.
                </p>
              </div>
            </div>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="mt-4 w-full bg-amber-600 text-white py-3 rounded-lg font-medium hover:bg-amber-700 transition-colors"
            >
              Search for Flights
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Secure Payment</h1>
            </div>

            {/* Total Amount Display - Only show if there's a booking */}
            {totals.total > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Total Amount to Pay</span>
                  <span className="text-2xl font-extrabold text-green-700">{money(totals.total, totals.currency)}</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
                <i className="ph-bold ph-warning-circle mr-2"></i>
                {errorMsg}
              </div>
            )}

            {step === 1 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <span className="bg-green-100 text-green-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                  Flight and BookingCart Payment
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Enter your billing information once. The airline charges {money(totals.flightCost, totals.currency)} for the ticket, then BookingCart opens the secure fee payment for {money(totals.markupCost, totals.currency)}.
                </p>

                {clientKey ? (
                  <div className="mb-6">
                    <DuffelCardForm
                      ref={ref}
                      clientKey={clientKey}
                      intent="to-create-card-for-temporary-use"
                      onValidateSuccess={() => setCardValid(true)}
                      onValidateFailure={() => setCardValid(false)}
                      onCreateCardForTemporaryUseSuccess={handleCardSuccess}
                      onCreateCardForTemporaryUseFailure={handleCardFailure}
                    />
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400">Loading secure connection...</div>
                )}

                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={handleFlightPayment}
                    disabled={isProcessing || !cardValid}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center gap-2"
                  >
                    {isProcessing ? 'Processing...' : `Pay and Book ${money(totals.total, totals.currency)}`}
                    {!isProcessing && <i className="ph-bold ph-lock-key"></i>}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6 border-l-4 border-l-green-500">
                <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <span className="bg-green-100 text-green-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                  BookingCart Fees
                </h2>
                <div className="bg-green-50 text-green-800 p-4 rounded-xl mb-6 flex items-start gap-3">
                  <i className="ph-fill ph-check-circle text-green-600 text-xl mt-0.5"></i>
                  <div>
                    <strong className="block mb-1">Airline ticket issued!</strong>
                    <span className="text-sm">Your airline payment is already recorded for this booking. Finish the BookingCart payment to unlock the ticket.</span>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={handleStripePayment}
                    disabled={isProcessing}
                    className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center gap-2"
                  >
                    {isProcessing ? 'Redirecting to Checkout...' : `Pay Fees ${money(totals.markupCost, totals.currency)}`}
                    {!isProcessing && <i className="ph-bold ph-arrow-right"></i>}
                  </button>
                </div>
              </div>
            )}

          </section>

          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-lg p-6 sticky top-24">
              <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-4">Total Due</h2>
              
              <div className="flex justify-between items-center text-sm mb-2 text-slate-600 dark:text-slate-400">
                <span>Flight Cost (Airline)</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{money(totals.flightCost, totals.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-sm mb-4 text-slate-600 dark:text-slate-400 pb-4 border-b border-slate-100">
                <span>Extras & Taxes</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{money(totals.markupCost, totals.currency)}</span>
              </div>

              <div className="flex justify-between items-end mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">Total</span>
                <span className="text-3xl font-extrabold text-green-600">{money(totals.total, totals.currency)}</span>
              </div>

              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                  <i className="ph-fill ph-lock-key text-emerald-500 text-lg"></i> SSL Encrypted
                </div>
                <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                  <i className="ph-fill ph-shield-check text-emerald-500 text-lg"></i> Safe Checkout
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <FlightFooter />
    </>
  );
}
