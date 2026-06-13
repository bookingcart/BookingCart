import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { DuffelCardForm, useDuffelCardFormActions, createThreeDSecureSession } from '@duffel/components';
import { useRef } from 'react';

export default function StaysCheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const quoteId = searchParams.get('quote_id') || 'quo_dummy_12345';

  const [firstName, setFirstName] = useState('Cart');
  const [lastName, setLastName] = useState('Booking');
  const [email, setEmail] = useState('bookingcart.business@gmail.com');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('Uganda');
  const [phoneCode, setPhoneCode] = useState('+256');
  const [phone, setPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [paperless, setPaperless] = useState(true);
  const [addCar, setAddCar] = useState(false);
  const [travelWork, setTravelWork] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Duffel card payment state
  const [clientKey, setClientKey] = useState(null);
  const { ref: formActionsRef, createCardForTemporaryUse } = useDuffelCardFormActions();
  const [cardValid, setCardValid] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  // Payment Instructions state
  const [paymentInstructionAllowed, setPaymentInstructionAllowed] = useState(false);
  const [lodgedCardId, setLodgedCardId] = useState('');
  const [paymentInstructionLoading, setPaymentInstructionLoading] = useState(false);
  const [paymentInstructionResult, setPaymentInstructionResult] = useState(null);
  const [paymentInstructionError, setPaymentInstructionError] = useState('');

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);

  const DUMMY_QUOTE = {
    id: quoteId,
    total_amount: '2742.05',
    tax_amount: '200.00',
    fee_amount: '42.05',
    currency: 'USD',
    check_in_date: '2026-07-16',
    check_out_date: '2026-08-17',
    accommodation: {
      name: 'Kimpton Clocktower Hotel',
      location: {
        address: {
          line_one: 'Oxford Street',
          city_name: 'Manchester',
          postal_code: 'M60 7HA',
          country_code: 'GB'
        }
      },
      rating: 8.8,
      review_count: 5032,
      photos: [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80' }],
      key_collection: {
        instructions: 'Please collect your keys at the main reception desk which is open 24/7.'
      }
    },
    rooms: [
      {
        name: '1 x Apartment',
        rates: [
          {
            due_at_accommodation_amount: '0.00',
            due_at_accommodation_currency: 'USD',
            conditions: 'Cancellations made 7 days or more before the check-in date will receive a 100% refund. Cancellations made within 7 days of the check-in date will incur a 100% penalty of the total booking amount. No-shows will be charged the full amount.'
          }
        ]
      }
    ],
    guests: [
      { given_name: 'Cart', family_name: 'Booking' }
    ]
  };

  // Load selected hotel from sessionStorage (set by StaysResultsPage on click)
  const selectedHotel = (() => {
    try { return JSON.parse(sessionStorage.getItem('stays_selected_hotel') || 'null'); } catch { return null; }
  })();

  // Build a display quote from sessionStorage hotel data so the sidebar always shows correct hotel
  const buildQuoteFromHotel = (hotel) => {
    if (!hotel) return null;
    const acc = hotel.fullAccommodation || {};
    return {
      id: quoteId,
      total_amount: hotel.price ? String(Number(hotel.price)) : '0',
      tax_amount: null,
      fee_amount: null,
      currency: hotel.currency || 'USD',
      check_in_date: hotel.checkin,
      check_out_date: hotel.checkout,
      accommodation: {
        name: hotel.name,
        rating: hotel.rating,
        review_score: hotel.rating,
        review_count: hotel.reviews,
        photos: [{ url: hotel.image }],
        location: acc.location || { address: { line_one: hotel.address } },
        key_collection: acc.key_collection,
        check_in_information: acc.check_in_information,
      },
      rooms: [{ name: acc.rooms?.[0]?.name || 'Standard Room', rates: [{ due_at_accommodation_amount: '0.00', due_at_accommodation_currency: hotel.currency || 'USD', conditions: '' }] }],
      guests: [{ type: 'adult' }],
    };
  };

  useEffect(() => {
    document.title = 'Complete Booking | BookingCart';
    
    // Fetch client key
    fetch('/api/duffel-client-key', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setClientKey(data.clientKey);
      })
      .catch(err => console.error('Failed to get client key:', err));

    // Try to fetch the real quote 
    setLoading(true);
    if (quoteId && quoteId !== 'quo_dummy_12345' && quoteId !== 'quo_pending') {
      fetch(`/api/stays-quote?quote_id=${encodeURIComponent(quoteId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.ok && data.quote) {
            setQuote(data.quote);
            if (data.quote.payment_instruction_allowed) {
              setPaymentInstructionAllowed(true);
            }
          } else {
            // Fall back to building quote from the selected hotel in sessionStorage
            const hotelQuote = buildQuoteFromHotel(selectedHotel) || DUMMY_QUOTE;
            setQuote(hotelQuote);
          }
        })
        .catch(() => {
          const hotelQuote = buildQuoteFromHotel(selectedHotel) || DUMMY_QUOTE;
          setQuote(hotelQuote);
        })
        .finally(() => setLoading(false));
    } else {
      // Use sessionStorage hotel data if available, otherwise dummy
      const hotelQuote = buildQuoteFromHotel(selectedHotel) || DUMMY_QUOTE;
      setQuote(hotelQuote);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const calculateNights = (inDate, outDate) => {
    try {
      const start = new Date(inDate);
      const end = new Date(outDate);
      const diffTime = Math.abs(end - start);
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    } catch { return 1; }
  };

  const finalPrice = quote ? Number(quote.total_amount) : 0;

  const handleNext = (e) => {
    e.preventDefault();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !phone) {
      alert('Please fill out all required fields.');
      return;
    }
    try {
      setLoading(true);
      const bookingData = {
        quote_id: quoteId,
        guests: [{ given_name: firstName, family_name: lastName }],
        email,
        phone_number: `${phoneCode}${phone}`
      };
      sessionStorage.setItem('stays_booking_data', JSON.stringify(bookingData));

      if (!paymentInstructionAllowed) {
        setProcessingMessage('Tokenizing card...');
        const card = await createCardForTemporaryUse();
        if (!card || card.error) {
           throw new Error(card?.error?.message || 'Invalid card details.');
        }

        setProcessingMessage('Authenticating card with the property...');
        const session = await createThreeDSecureSession(
          clientKey,
          card.id,
          quoteId,
          [],
          true
        );

        if (session.status !== 'ready_for_payment') {
          throw new Error('Card authentication failed or was cancelled.');
        }

        setProcessingMessage('Confirming your stay...');
        bookingData.payment = {
          type: 'card',
          currency: 'USD',
          amount: String(finalPrice),
          three_d_secure_session_id: session.id
        };
      } else {
        setProcessingMessage('Confirming your stay...');
      }

      // Create the stays booking
      const bookingRes = await fetch('/api/stays-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      });
      const bookingJson = await bookingRes.json();
      
      if (!bookingJson.ok) {
        throw new Error(bookingJson.error || 'Failed to complete booking');
      }

      sessionStorage.setItem('stays_booking_result', JSON.stringify(bookingJson.booking));

      // If payment instruction is allowed + user provided a card, trigger it
      if (paymentInstructionAllowed && lodgedCardId.trim() && bookingJson.booking?.id) {
        setPaymentInstructionLoading(true);
        try {
          const piRes = await fetch('/api/stays-payment-instruction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingJson.booking.id, card_id: lodgedCardId.trim() }),
          });
          const piData = await piRes.json();
          if (piData.ok) setPaymentInstructionResult(piData.payment_instruction);
          else setPaymentInstructionError(piData.error || 'Payment instruction failed.');
        } catch { setPaymentInstructionError('Network error on payment instruction.'); }
        setPaymentInstructionLoading(false);
      }

      window.location.href = `/stays/confirmation?quote_id=${quoteId}&direct=1`;
    } catch (err) {
      alert(err.message);
      setProcessingMessage('');
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:border-green-500 text-sm text-slate-800 dark:text-white placeholder-slate-400";
  const labelClass = "block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col">
      {/* Progress Steps Header */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-8 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-0">
          {[
            { n: 1, label: 'Your Selection' },
            { n: 2, label: 'Your Details' },
            { n: 3, label: 'Finish booking' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${step >= s.n ? 'text-white bg-green-600' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
                {step > s.n ? <i className="ph-fill ph-check-circle" /> : <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs leading-none">{s.n}</span>}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-slate-200 dark:bg-slate-700 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* LEFT COLUMN – Hotel Summary & Price */}
          <div className="w-full lg:w-80 shrink-0 space-y-4">
            {quote && (
              <>
                {/* Hotel Card */}
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                  <img src={quote.accommodation?.photos?.[0]?.url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80'} alt={quote.accommodation?.name} className="w-full h-44 object-cover" />
                  <div className="p-4">
                    <div className="flex text-yellow-500 text-xs mb-1">
                      <i className="ph-fill ph-star" /><i className="ph-fill ph-star" /><i className="ph-fill ph-star" /><i className="ph-fill ph-star" /><i className="ph-fill ph-star" />
                    </div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-base leading-snug mb-1">{quote.accommodation?.name}</h2>
                    <p className="text-xs text-slate-500 mb-2">
                      {[
                        quote.accommodation?.location?.address?.line_one,
                        quote.accommodation?.location?.address?.city_name,
                        quote.accommodation?.location?.address?.postal_code,
                        quote.accommodation?.location?.address?.country_code
                      ].filter(Boolean).join(', ')}
                    </p>
                    <div className="flex items-center gap-1">
                      {(quote.accommodation?.rating || quote.accommodation?.review_score) && (
                        <div className="bg-green-700 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                          {Number(quote.accommodation?.review_score || quote.accommodation?.rating).toFixed(1)}
                        </div>
                      )}
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Very good</span>
                      <span className="text-xs text-slate-400">· {quote.accommodation?.review_count || 0} reviews</span>
                    </div>
                  </div>
                </div>

                {/* Booking Details */}
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">Your booking details</h3>
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Check-in</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{quote.check_in_date}</div>
                      <div className="text-xs text-slate-500">From 3:00 PM</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Check-out</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{quote.check_out_date}</div>
                      <div className="text-xs text-slate-500">Until 11:00 AM</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">You selected</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{calculateNights(quote.check_in_date, quote.check_out_date)} nights, {quote.rooms?.length || 1} room(s) for {quote.guests?.length || 1} guest(s)</div>
                    <div className="text-xs text-slate-500 mt-1">{quote.rooms?.[0]?.name || 'Standard Room'}</div>
                  </div>
                </div>

                {/* Price Summary */}
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm space-y-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Your price summary</h3>
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3 flex justify-between items-center">
                    <span className="font-black text-base text-slate-900 dark:text-white">Total</span>
                    <span className="font-black text-xl text-slate-900 dark:text-white">{quote.currency} {Number(quote.total_amount).toFixed(2)}</span>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Price information</h4>
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Taxes</span><span>{quote.currency} {Number(quote.tax_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Fees</span><span>{quote.currency} {Number(quote.fee_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <span>Due at accommodation</span>
                      <span>{quote.rooms?.[0]?.rates?.[0]?.due_at_accommodation_currency || quote.currency} {Number(quote.rooms?.[0]?.rates?.[0]?.due_at_accommodation_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">Hotel policy and rate condition</h4>
                    <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                      {quote.rooms?.[0]?.rates?.[0]?.conditions || 'No cancellation conditions specified. Please contact support.'}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* This booking counts */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">This booking counts!</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Stays, flights, rental cars, taxis, and attractions – every booking you complete counts toward your progress in Genius.</p>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-slate-500">BookingCart's loyalty program</span>
                <span className="font-black text-green-600 italic text-sm">Genius</span>
              </div>
            </div>

            {/* Limited supply warning */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border-2 border-red-200 p-4 shadow-sm">
              <div className="flex items-start gap-2 text-red-500">
                <i className="ph ph-warning-circle text-xl shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm text-red-600">Limited supply for your dates:</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">972 apartments like this are already unavailable on our site</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN – Forms */}
          <div className="flex-1 space-y-4">

            {/* Step 1: Enter Details */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              {/* Sign-in prompt */}
              <div className="flex items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-black text-lg">B</div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Please sign in, {firstName} {lastName} <span className="text-green-600 font-normal cursor-pointer hover:underline">Not Cart?</span></div>
                  <div className="text-xs text-slate-500">Save time: Sign in to book with your saved details.</div>
                </div>
                <button className="bg-green-600 text-white text-sm font-bold px-4 py-1.5 rounded hover:bg-green-700 transition-colors">Sign in</button>
              </div>

              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-4">Enter your details</h2>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 mb-6 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <i className="ph ph-info text-green-500 text-lg shrink-0" />
                Almost done! Just fill in the <span className="text-red-500 font-bold ml-1 mr-1">*</span> required info
              </div>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>First name <span className="text-red-500">*</span></label>
                    <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Last name <span className="text-red-500">*</span></label>
                    <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Email address <span className="text-red-500">*</span></label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                  <p className="text-xs text-slate-400 mt-1">Confirmation email sent to this address</p>
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Address <span className="text-red-500">*</span></label>
                  <input type="text" required value={address} onChange={e => setAddress(e.target.value)} className={inputClass} />
                </div>
                <div className="mb-4">
                  <label className={labelClass}>City <span className="text-red-500">*</span></label>
                  <input type="text" required value={city} onChange={e => setCity(e.target.value)} className={inputClass} />
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Zip Code <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="text" value={zip} onChange={e => setZip(e.target.value)} className={`${inputClass} w-32`} />
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Country/Region <span className="text-red-500">*</span></label>
                  <select value={country} onChange={e => setCountry(e.target.value)} className={inputClass}>
                    <option>Uganda</option><option>United States</option><option>United Kingdom</option>
                    <option>Kenya</option><option>Nigeria</option><option>South Africa</option>
                    <option>Germany</option><option>France</option><option>Canada</option>
                    <option>Australia</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className={labelClass}>Phone number <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select value={phoneCode} onChange={e => setPhoneCode(e.target.value)} className={`${inputClass} w-32`}>
                      <option value="+256">UG +256</option>
                      <option value="+1">US +1</option>
                      <option value="+44">UK +44</option>
                      <option value="+254">KE +254</option>
                      <option value="+234">NG +234</option>
                      <option value="+27">ZA +27</option>
                      <option value="+49">DE +49</option>
                    </select>
                    <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className={`${inputClass} flex-1`} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">To verify your booking, and for the property to connect if needed</p>
                </div>
                <div className="mb-6">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={paperless} onChange={e => setPaperless(e.target.checked)} className="mt-1 w-4 h-4 rounded border-slate-300 text-green-600 accent-green-600" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Yes, I want free paperless confirmation (recommended)<br /><span className="text-xs text-slate-400">We'll text you a link to download our app</span></span>
                  </label>
                </div>

                {/* Are you travelling for work? */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Are you traveling for work? <span className="text-slate-400 font-normal">(optional)</span></div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="radio" name="work" checked={travelWork === true} onChange={() => setTravelWork(true)} className="w-4 h-4 accent-green-600" />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      <input type="radio" name="work" checked={travelWork === false} onChange={() => setTravelWork(false)} className="w-4 h-4 accent-green-600" />
                      No
                    </label>
                  </div>
                </div>

                {/* Good to Know / Key Collection */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Key Collection</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph-fill ph-key text-green-600 text-lg shrink-0" />
                      {quote?.accommodation?.key_collection?.instructions || 'Please contact the accommodation directly for key collection instructions.'}
                    </div>
                  </div>
                </div>

                {/* Apartment Section */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Apartment</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph ph-users text-slate-500" />
                      Guests: {quote?.guests?.length || 1}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph ph-user text-slate-500" />
                      Main guest: <span className="font-bold ml-1">{firstName} {lastName}</span> <i className="ph ph-pencil text-blue-500 ml-1 cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph ph-sparkle text-slate-500" />
                      Cleanliness score – 7.1
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph ph-prohibit text-slate-500" />
                      No smoking
                    </div>
                  </div>
                </div>

                {/* Add to your stay */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Add to your stay</h3>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex items-start gap-3">
                    <input type="checkbox" id="addCar" checked={addCar} onChange={e => setAddCar(e.target.checked)} className="mt-1 w-4 h-4 rounded border-slate-300 accent-blue-600" />
                    <label htmlFor="addCar" className="flex-1 cursor-pointer">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">I'm interested in renting a car with up to 15% off</div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">Save up to 15% off select rental cars with your Genius and Trip Savings rewards – we'll add rental car options in your booking confirmation.</div>
                    </label>
                    <i className="ph ph-car text-4xl text-slate-300" />
                  </div>
                </div>

                {/* Included in your stay */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Included in your stay</h3>
                  <div className="flex items-start gap-3">
                    <i className="ph ph-taxi text-slate-500 text-xl mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        Free private airport taxi
                        <i className="ph ph-info text-slate-400 text-sm" />
                        <span className="bg-green-600 text-white text-[10px] font-black px-2 py-0.5 rounded">INCLUDED</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Finish this booking to earn a free private ride from the airport to the property</div>
                    </div>
                  </div>
                </div>

                {/* Special Requests */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Special requests</h3>
                  <p className="text-sm text-slate-500 mb-4 leading-relaxed">Special requests can't be guaranteed, but the property will do its best to meet your needs. You can always make a special request after your booking is complete.</p>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Please write your requests in English. <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={specialRequests}
                    onChange={e => setSpecialRequests(e.target.value)}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {/* Arrival Time */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Your arrival time</h3>
                  <div className="flex items-center gap-2 text-sm text-green-600 font-semibold mb-3">
                    <i className="ph-fill ph-check-circle" />
                    You can check in between 3:00 PM and 10:00 PM
                  </div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Add your estimated arrival time <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className={`${inputClass} max-w-xs`}>
                    <option value="">Please select</option>
                    <option>3:00 PM – 4:00 PM</option>
                    <option>4:00 PM – 5:00 PM</option>
                    <option>5:00 PM – 6:00 PM</option>
                    <option>6:00 PM – 7:00 PM</option>
                    <option>7:00 PM – 8:00 PM</option>
                    <option>8:00 PM – 9:00 PM</option>
                    <option>9:00 PM – 10:00 PM</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Time is for Manchester time zone</p>
                </div>

                {/* Payment Instructions (B2B – Lodged Card) */}
                {paymentInstructionAllowed ? (
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                      <i className="ph ph-credit-card text-green-600" /> Pay on Behalf of Guest
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      This property allows payment to be made on behalf of the guest using a lodged card. Enter your Duffel lodged card ID below to auto-pay at the property.
                    </p>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Lodged Card ID</label>
                    <input
                      type="text"
                      value={lodgedCardId}
                      onChange={e => setLodgedCardId(e.target.value)}
                      placeholder="card_0000A..."
                      className={`${inputClass} font-mono`}
                    />
                    {paymentInstructionError && (
                      <div className="mt-2 text-xs font-bold text-red-500">{paymentInstructionError}</div>
                    )}
                    {paymentInstructionResult && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-bold text-green-600">
                        <i className="ph-fill ph-check-circle" /> Payment instruction created successfully!
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      <i className="ph ph-info mr-1" />
                      The card must be a lodged card (multi_use: true) via the Duffel Cards API.
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-6">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                      <i className="ph ph-credit-card text-green-600" /> Pay securely
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Enter your card details below. We'll securely process your payment directly with the property.
                    </p>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      {clientKey ? (
                        <DuffelCardForm
                          intent="to-create-card-for-temporary-use"
                          clientKey={clientKey}
                          onSubmit={() => {}}
                          onValidate={(valid) => setCardValid(valid)}
                          styles={{
                            input: {
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '14px',
                              color: '#1e293b',
                              padding: '12px'
                            }
                          }}
                        />
                      ) : (
                        <div className="text-sm text-slate-500">Loading secure payment form...</div>
                      )}
                    </div>
                  </div>
                )}

                {/* House Rules */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-8">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Review House Rules</h3>
                  <p className="text-sm text-slate-500 mb-3">Your host would like you to agree to the following house rules:</p>
                  <ul className="space-y-1.5 mb-3 text-sm text-slate-700 dark:text-slate-300">
                    <li className="flex items-center gap-2"><span className="text-slate-400">•</span> No smoking</li>
                    <li className="flex items-center gap-2"><span className="text-slate-400">•</span> No parties/events</li>
                    <li className="flex items-center gap-2"><span className="text-slate-400">•</span> Pets are not allowed</li>
                  </ul>
                  <p className="text-sm text-slate-600 dark:text-slate-400">By continuing to the next step, you agree to these house rules.</p>
                </div>

                {/* Business Details Section */}
                <div className="border-t border-slate-100 dark:border-slate-700 pt-6 mb-8">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Business Details</h3>
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <p><strong>BookingCart Inc.</strong></p>
                    <p>123 Travel Street, Silicon Valley, CA 94000, USA</p>
                    <p><strong>Customer Service:</strong> bookingcart.business@gmail.com | +1 (800) 555-0199</p>
                    <p className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                      By confirming this booking, you agree to our <Link to="/terms" className="text-green-600 hover:underline">Terms & Conditions</Link> and <Link to="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link>, as well as any applicable Booking.com terms and conditions.
                    </p>
                  </div>
                </div>

                {processingMessage && (
                  <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 text-sm font-bold">
                    <i className="ph ph-spinner animate-spin text-xl" />
                    {processingMessage}
                  </div>
                )}

                {/* Bottom CTA Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-6">
                  <button type="button" className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">
                    <i className="ph ph-tag text-lg" /> We Price Match
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (!paymentInstructionAllowed && !cardValid)}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded transition-colors text-sm"
                  >
                    {loading ? 'Processing...' : 'Next: Final details'}
                    {!loading && <i className="ph ph-arrow-right" />}
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <button type="button" className="text-xs text-green-600 hover:underline">What are my booking conditions?</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
      <FlightFooter />
    </div>
  );
}
