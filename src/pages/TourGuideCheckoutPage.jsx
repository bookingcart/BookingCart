import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function TourGuideCheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const guideId = params.get('guideId') || '';
  const guideName = params.get('guideName') || 'Tour Guide';
  const guidePhoto = params.get('guidePhoto') || '';
  const startDate = params.get('startDate') || '';
  const endDate = params.get('endDate') || '';
  const nights = parseInt(params.get('nights') || '1');
  const guests = parseInt(params.get('guests') || '1');
  const pricePerDay = parseFloat(params.get('pricePerDay') || '0');
  const total = parseFloat(params.get('total') || '0');
  const currency = params.get('currency') || 'USD';
  const ref = params.get('ref') || `GUIDE-${Date.now()}`;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { document.title = `BookingCart — Book ${guideName}`; }, [guideName]);

  function validate() {
    const e = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim()) e.lastName = 'Required';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Valid email required';
    if (!phone.trim()) e.phone = 'Required';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      // Update booking with contact info
      await fetch('/api/guide-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          booking: {
            ref, guideId,
            startDate, endDate, guests, total,
            status: 'pending',
            contact: { firstName, lastName, email, phone, notes }
          }
        })
      });

      // Stripe checkout
      const amountCents = Math.round(total * 100);
      const stripeRes = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          currency: currency.toLowerCase(),
          description: `Tour Guide: ${guideName} · ${nights} day${nights !== 1 ? 's' : ''} · ${startDate}`,
          bookingRef: ref,
          paymentPurpose: 'guide-booking',
          customerEmail: email,
          successPath: `/tour-guides/confirmation?ref=${ref}&guideName=${encodeURIComponent(guideName)}&guideId=${guideId}&startDate=${startDate}&endDate=${endDate}`,
          cancelPath: `/tour-guides/${guideId}`
        })
      });

      const stripeData = await stripeRes.json();
      if (stripeData.ok && stripeData.url) {
        window.location.href = stripeData.url;
      } else {
        // Stripe not configured — go to confirmation directly (demo mode)
        navigate(`/tour-guides/confirmation?ref=${ref}&guideName=${encodeURIComponent(guideName)}&guideId=${guideId}&startDate=${startDate}&endDate=${endDate}&demo=1`);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      navigate(`/tour-guides/confirmation?ref=${ref}&guideName=${encodeURIComponent(guideName)}&guideId=${guideId}&startDate=${startDate}&endDate=${endDate}&demo=1`);
    } finally {
      setLoading(false);
    }
  }

  const subtotal = pricePerDay * nights;
  const serviceFee = Math.round(subtotal * 0.1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pt-24 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-semibold mb-6 transition-colors">
          <i className="ph ph-arrow-left" /> Back
        </button>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-8 flex items-center gap-3">
          <i className="ph ph-credit-card text-green-600" /> Complete Your Booking
        </h1>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">

          {/* ── Contact Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-extrabold text-slate-900 dark:text-white text-lg mb-5 flex items-center gap-2">
                <i className="ph ph-user text-green-600" /> Your Information
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">First Name *</label>
                  <input
                    id="checkout-firstname"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className={`field-input ${errors.firstName ? 'error' : ''}`}
                  />
                  {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Last Name *</label>
                  <input
                    id="checkout-lastname"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    className={`field-input ${errors.lastName ? 'error' : ''}`}
                  />
                  {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Email *</label>
                  <input
                    id="checkout-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className={`field-input ${errors.email ? 'error' : ''}`}
                  />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Phone *</label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 234 567 890"
                    className={`field-input ${errors.phone ? 'error' : ''}`}
                  />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Special Requests / Notes</label>
                <textarea
                  id="checkout-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Dietary requirements, mobility needs, specific interests…"
                  rows={3}
                  className="field-input resize-none"
                />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-extrabold text-slate-900 dark:text-white text-lg mb-4 flex items-center gap-2">
                <i className="ph ph-shield-check text-green-600" /> Safe & Secure Payment
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                You'll be redirected to our secure Stripe payment gateway. Your card details are never stored by BookingCart.
              </p>
              <div className="flex flex-wrap gap-3 mb-5">
                {['VISA', 'MC', 'AMEX', 'Apple Pay', 'Google Pay'].map(p => (
                  <span key={p} className="text-xs font-bold px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400">{p}</span>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading}
                id="guide-checkout-submit"
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-600/25 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-3 text-base"
              >
                {loading ? (
                  <><i className="ph ph-spinner-gap animate-spin text-xl" /> Processing…</>
                ) : (
                  <><i className="ph ph-lock text-lg" /> Pay {currency} {total.toFixed(0)}</>
                )}
              </button>
            </div>
          </form>

          {/* ── Booking Summary ──────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <h3 className="font-extrabold text-slate-900 dark:text-white mb-4">Booking Summary</h3>
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100 dark:border-slate-700">
                {guidePhoto && (
                  <img src={guidePhoto} alt={guideName} className="w-14 h-14 rounded-xl object-cover object-top shrink-0" />
                )}
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{guideName}</p>
                  <p className="text-xs text-green-600 font-semibold">Tour Guide</p>
                </div>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i className="ph ph-calendar" /> Start</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{startDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i className="ph ph-calendar-check" /> End</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i className="ph ph-moon" /> Duration</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{nights} day{nights !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i className="ph ph-users" /> Guests</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{guests}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">${pricePerDay}/day × {nights}</span>
                  <span className="font-semibold">${subtotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Service fee</span>
                  <span className="font-semibold">${serviceFee}</span>
                </div>
                <div className="flex justify-between font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-600">
                  <span>Total</span>
                  <span className="text-green-600">{currency} {total.toFixed(0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
              <div className="flex items-start gap-3 text-sm">
                <i className="ph-fill ph-lock-key text-xl text-green-600 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Payment secured by platform</p>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">Your funds are held securely in escrow until the tour is successfully completed. This protects you against no-shows and last-minute cancellations.</p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-2">
                  <i className="ph ph-info" /> Cancellation Policy
                </p>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                  <li className="flex justify-between"><span>More than 7 days before:</span> <span className="font-bold text-green-600">100% refund</span></li>
                  <li className="flex justify-between"><span>24 - 48 hours before:</span> <span className="font-bold text-amber-600">50% refund</span></li>
                  <li className="flex justify-between"><span>Less than 24 hours:</span> <span className="font-bold text-red-500">No refund</span></li>
                </ul>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Ref: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{ref}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
