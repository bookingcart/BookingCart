import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GuideAvailabilityCalendar from '../components/GuideAvailabilityCalendar.jsx';

function StarRow({ rating, size = 'md' }) {
  const full = Math.floor(rating);
  const hasHalf = (rating % 1) >= 0.5;
  const sz = size === 'lg' ? 'text-lg' : 'text-sm';
  return (
    <div className={`flex items-center gap-0.5 ${sz}`}>
      {Array.from({ length: full }).map((_, i) => <i key={i} className="ph-fill ph-star text-amber-400" />)}
      {hasHalf && <i className="ph-fill ph-star-half text-amber-400" />}
      {Array.from({ length: 5 - full - (hasHalf ? 1 : 0) }).map((_, i) => <i key={`e${i}`} className="ph ph-star text-slate-300 dark:text-slate-600" />)}
    </div>
  );
}

export default function TourGuideProfilePage() {
  const { guideId } = useParams();
  const navigate = useNavigate();

  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);

  // Booking state
  const [selectedStart, setSelectedStart] = useState('');
  const [selectedEnd, setSelectedEnd] = useState('');
  const [pickingEnd, setPickingEnd] = useState(false);
  const [guests, setGuests] = useState(1);
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/guides?slug=${encodeURIComponent(guideId)}`);
        const data = await res.json();
        if (data.ok && data.guide) {
          setGuide(data.guide);
          document.title = `BookingCart — ${data.guide.name}`;

          // Fetch live reviews and stats
          const rRes = await fetch('/api/guide-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'guide-dashboard', guideId: data.guide.slug })
          });
          const rData = await rRes.json();
          if (rData.ok) {
            setReviews(rData.reviews || []);
            setReviewStats(rData.stats || null);
          }
        } else {
          setError('Guide not found');
        }
      } catch {
        setError('Failed to load guide profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [guideId]);

  function handleDateSelect(key) {
    if (!selectedStart || pickingEnd === false) {
      setSelectedStart(key);
      setSelectedEnd('');
      setPickingEnd(true);
    } else {
      if (key < selectedStart) {
        setSelectedStart(key);
        setSelectedEnd('');
        setPickingEnd(true);
      } else {
        setSelectedEnd(key);
        setPickingEnd(false);
      }
    }
  }

  function calcNights() {
    if (!selectedStart || !selectedEnd) return 0;
    const diff = new Date(selectedEnd) - new Date(selectedStart);
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  const nights = calcNights();
  const pricePerDay = parseFloat(guide?.pricing?.perDay || 0);
  const perPerson = parseFloat(guide?.pricing?.perPerson || 0);
  const subtotal = nights * pricePerDay + (perPerson > 0 ? guests * perPerson : 0);
  const serviceFee = Math.round(subtotal * 0.1);
  const total = subtotal + serviceFee;

  async function handleBookNow() {
    if (!selectedStart || !selectedEnd) {
      alert("Please select dates in the calendar first.");
      return;
    }
    setBookingLoading(true);
    try {
      const ref = `GUIDE-${guide.slug.toUpperCase().slice(0, 8)}-${Date.now()}`;
      await fetch('/api/guide-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          booking: { ref, guideId: guide.slug, startDate: selectedStart, endDate: selectedEnd, guests, total }
        })
      });
      const params = new URLSearchParams({
        guideId: guide.slug,
        guideName: guide.name,
        guidePhoto: guide.photo,
        startDate: selectedStart,
        endDate: selectedEnd,
        guests: guests.toString(),
        nights: nights.toString(),
        pricePerDay: pricePerDay.toString(),
        total: total.toString(),
        currency: guide.pricing?.currency || 'USD',
        ref
      });
      navigate(`/tour-guides/checkout?${params.toString()}`);
    } catch (err) {
      console.error(err);
      alert('Failed to initialize booking');
      setBookingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <i className="ph ph-spinner-gap text-4xl text-green-600 animate-spin mb-4 block mx-auto" />
          <p className="text-slate-500 font-bold uppercase tracking-wider">Loading Profile</p>
        </div>
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center shadow-xl border border-slate-200 dark:border-slate-800">
          <i className="ph ph-warning-circle text-5xl text-red-500 mb-4 block mx-auto" />
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Guide Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error || 'This guide profile is unavailable or has been removed.'}</p>
          <button onClick={() => navigate('/tour-guides')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl w-full transition-colors">
            Back to Tour Guides
          </button>
        </div>
      </div>
    );
  }

  // Gallery processing
  const photos = guide.gallery || [];
  const mainPhoto = photos[0] || guide.photo || 'https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=80';
  const smallPhotos = photos.slice(1, 5);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 pt-6 pb-20 px-4 sm:px-6">
      
      {/* ── Breadcrumbs ── */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <a href="/tour-guides" className="hover:text-green-600 transition-colors">Tour Guides</a>
          <i className="ph ph-caret-right text-xs" />
          <span>{guide.country}</span>
          <i className="ph ph-caret-right text-xs" />
          <span className="text-slate-900 dark:text-white">{guide.name}</span>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="max-w-7xl mx-auto mb-6">
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">{guide.name}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <StarRow rating={guide.rating} size="sm" />
            <span className="font-bold text-slate-900 dark:text-white">{Number(guide.rating).toFixed(1)}</span>
            <span className="underline cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">{guide.reviewCount} reviews</span>
          </div>
          {guide.verified ? (
            <span className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full text-xs font-extrabold border border-emerald-200 dark:border-emerald-800 shadow-sm" title="Verified Badge Awarded by Admin">
              <i className="ph-fill ph-seal-check text-emerald-500 text-base" /> Verified by Admin
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 text-xs">
              <i className="ph ph-shield-check text-base" /> Standard Guide
            </span>
          )}
          <span className="flex items-center gap-1.5 underline cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
            <i className="ph ph-map-pin text-base" /> {guide.city}, {guide.country}
          </span>
        </div>
      </div>

      {/* ── Image Gallery (Airbnb Style) ── */}
      <div className="max-w-7xl mx-auto mb-10 h-[50vh] min-h-[300px] max-h-[500px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-full rounded-3xl overflow-hidden">
          {/* Main Photo */}
          <div className="h-full relative group cursor-pointer">
            <img src={mainPhoto} alt={guide.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>
          {/* Grid Photos (Desktop only) */}
          <div className="hidden md:grid grid-cols-2 grid-rows-2 gap-2 h-full">
            {smallPhotos.map((p, i) => (
              <div key={i} className="h-full relative group cursor-pointer overflow-hidden">
                <img src={p.url || p} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>
            ))}
            {/* Fill empty slots if less than 4 small photos */}
            {Array.from({ length: Math.max(0, 4 - smallPhotos.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-slate-100 dark:bg-slate-800 h-full" />
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout ── */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 relative items-start">
        
        {/* LEFT COLUMN: CONTENT */}
        <div className="space-y-10 pb-20">
          
          {/* Overview / Host Info */}
          <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                Guided by {guide.name.split(' ')[0]}
                {guide.verified && <i className="ph-fill ph-seal-check text-emerald-500 text-xl" title="Verified by Admin" />}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                {guide.yearsExp} years experience · {guide.categories?.join(', ')}
              </p>
            </div>
            <img src={guide.photo} alt={guide.name} className="w-14 h-14 rounded-full object-cover ml-4 border-2 border-white dark:border-slate-800 shadow-lg" />
          </div>

          {/* Highlights */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-8 space-y-5">
            {guide.verified && (
              <div className="flex gap-4">
                <i className="ph-fill ph-seal-check text-2xl text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Verified by Admin
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">Awarded</span>
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Identity, professional credentials, licenses, and tour experience officially verified by BookingCart administrators.</p>
                </div>
              </div>
            )}
            <div className="flex gap-4">
              <i className="ph ph-medal text-2xl text-slate-900 dark:text-white shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Top-rated guide</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Highly rated for knowledge and storytelling.</p>
              </div>
            </div>
            {guide.instantBooking && (
              <div className="flex gap-4">
                <i className="ph ph-lightning text-2xl text-slate-900 dark:text-white" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Instant Booking</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Your dates are confirmed instantly.</p>
                </div>
              </div>
            )}
            <div className="flex gap-4">
              <i className="ph ph-calendar-check text-2xl text-slate-900 dark:text-white" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Free cancellation</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Cancel up to 48 hours before for a full refund.</p>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-4">About me</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line text-base">
              {guide.bio || "This guide hasn't added a biography yet, but they are verified and ready to lead your tour!"}
            </p>
          </div>

          {/* Skills & Languages */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Expertise & Languages</h2>
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Skills</h3>
                <ul className="space-y-3">
                  {(guide.skills || []).map(skill => (
                    <li key={skill} className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-semibold">
                      <i className="ph-fill ph-check-circle text-green-500 text-lg" /> {skill}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Languages</h3>
                <ul className="space-y-3">
                  {(guide.languages || []).map(l => (
                    <li key={l.lang} className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="flex items-center gap-3"><i className="ph ph-translate text-lg text-slate-400" /> {l.lang}</span>
                      <span className="text-xs font-bold text-slate-400 uppercase">{l.proficiency}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Reviews Section ── Live from API */}
          <div className="pb-8">
            {/* Rating Header */}
            <div className="flex items-center gap-3 mb-6">
              <i className="ph-fill ph-star text-2xl text-slate-900 dark:text-white" />
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {Number(reviewStats?.averageRating || guide.rating).toFixed(1)} · {reviewStats?.total ?? guide.reviewCount} reviews
              </h2>
            </div>

            {/* Review Badges */}
            {reviewStats && reviewStats.total >= 50 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {reviewStats.total >= 500 && <span className="flex items-center gap-1.5 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 px-3 py-1.5 rounded-full text-xs font-bold"><i className="ph-fill ph-trophy" /> Elite Guide</span>}
                {reviewStats.total >= 250 && reviewStats.total < 500 && <span className="flex items-center gap-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-bold"><i className="ph-fill ph-heart" /> Traveler Favorite</span>}
                {reviewStats.total >= 100 && reviewStats.total < 250 && <span className="flex items-center gap-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1.5 rounded-full text-xs font-bold"><i className="ph-fill ph-star" /> Highly Rated</span>}
                {reviewStats.total >= 50 && reviewStats.total < 100 && <span className="flex items-center gap-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1.5 rounded-full text-xs font-bold"><i className="ph-fill ph-seal-check" /> Trusted Guide</span>}
                {parseFloat(reviewStats.averageRating) >= 4.8 && <span className="flex items-center gap-1.5 bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 px-3 py-1.5 rounded-full text-xs font-bold"><i className="ph-fill ph-sparkle" /> Exceptional Guide</span>}
              </div>
            )}

            {/* AI Summary */}
            {reviewStats && reviewStats.total >= 3 && reviewStats.topTags.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ph-fill ph-sparkle text-green-600" />
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wider">AI Review Summary</h3>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-3">
                  Travelers frequently praise this guide for:
                </p>
                <ul className="space-y-1.5">
                  {reviewStats.topTags.slice(0, 3).map(tag => (
                    <li key={tag} className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <i className="ph-fill ph-check-circle text-green-500" /> {tag}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {reviewStats.total >= 10 ? `Based on ${reviewStats.total} verified reviews` : `Based on ${reviewStats.total} early reviews`}
                  </p>
                </div>
              </div>
            )}

            {/* Reviews Grid */}
            {reviews.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
                {reviews.slice(0, 6).map((r, i) => (
                  <div key={r.id || i} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center font-bold text-green-700 dark:text-green-400 shrink-0">
                          {(r.authorName || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{r.authorName || 'Traveler'}</h4>
                          <p className="text-xs text-slate-500">
                            {r.travelerType && <span>{r.travelerType} · </span>}
                            {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i className="ph-fill ph-seal-check" /> Verified
                      </span>
                    </div>

                    <StarRow rating={r.rating} />
                    <p className="text-slate-700 dark:text-slate-300 text-sm line-clamp-4">{r.text}</p>

                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {r.tags.slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}

                    {r.recommendation === 'Yes' && (
                      <p className="text-xs font-bold text-green-600 flex items-center gap-1">
                        <i className="ph-fill ph-thumbs-up" /> Recommends this guide
                      </p>
                    )}

                    {r.guideResponse && (
                      <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Guide's Response</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{r.guideResponse}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <i className="ph ph-chat-circle text-3xl text-slate-300 mb-2 block" />
                <p className="text-slate-500 font-medium text-sm">No reviews yet. Be the first to book and leave a review!</p>
              </div>
            )}
          </div>
        </div>


        {/* RIGHT COLUMN: STICKY BOOKING WIDGET */}
        <div className="lg:sticky lg:top-24 hidden lg:block">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-slate-950 p-6">
            
            {/* Price Header */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-black text-slate-900 dark:text-white">${pricePerDay}</span>
              <span className="text-slate-500 dark:text-slate-400 font-semibold">/ day</span>
            </div>

            {/* Inputs Container */}
            <div className="border border-slate-300 dark:border-slate-700 rounded-2xl mb-4 overflow-hidden divide-y divide-slate-300 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {/* Dates */}
              <div className="flex divide-x divide-slate-300 dark:divide-slate-700 cursor-pointer">
                <div className="flex-1 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-900 dark:text-white">Start</div>
                  <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {selectedStart || 'Add date'}
                  </div>
                </div>
                <div className="flex-1 p-3">
                  <div className="text-[10px] font-black uppercase text-slate-900 dark:text-white">End</div>
                  <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {selectedEnd || 'Add date'}
                  </div>
                </div>
              </div>
              {/* Guests */}
              <div className="p-3">
                <div className="text-[10px] font-black uppercase text-slate-900 dark:text-white mb-1">Guests</div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setGuests(Math.max(1, guests-1))} className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center hover:border-slate-900 dark:hover:border-white text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <i className="ph ph-minus" />
                  </button>
                  <span className="text-sm font-bold w-4 text-center">{guests}</span>
                  <button onClick={() => setGuests(guests+1)} className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center hover:border-slate-900 dark:hover:border-white text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <i className="ph ph-plus" />
                  </button>
                </div>
              </div>
            </div>

            {/* Mini Calendar injection */}
            <div className="mb-4">
              <GuideAvailabilityCalendar 
                availabilityMap={guide.availability || {}} 
                selectedStart={selectedStart} 
                selectedEnd={selectedEnd} 
                onSelectDate={handleDateSelect} 
                pickingEnd={pickingEnd} 
              />
            </div>

            {/* Button */}
            <button
              onClick={handleBookNow}
              disabled={bookingLoading}
              className={`w-full py-3.5 rounded-xl text-base font-black text-white transition-all ${
                selectedStart && selectedEnd 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 shadow-md shadow-green-500/25 hover:from-green-600 hover:to-emerald-700' 
                  : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-500'
              }`}
            >
              {bookingLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ph ph-spinner-gap animate-spin text-xl" /> Reserving...
                </span>
              ) : selectedStart && selectedEnd ? (
                guide.instantBooking ? 'Instant Book' : 'Request to Book'
              ) : (
                'Select dates'
              )}
            </button>

            {/* Price breakdown */}
            {selectedStart && selectedEnd && (
              <div className="mt-4 space-y-2 text-sm font-semibold">
                <p className="text-center text-slate-500 dark:text-slate-400 text-xs mb-4">You won't be charged yet</p>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span className="underline">${pricePerDay} x {nights} nights</span>
                  <span>${nights * pricePerDay}</span>
                </div>
                {perPerson > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span className="underline">Guest fee (${perPerson} x {guests})</span>
                    <span>${guests * perPerson}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span className="underline">BookingCart fee</span>
                  <span>${serviceFee}</span>
                </div>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between font-black text-slate-900 dark:text-white text-base">
                  <span>Total</span>
                  <span>${total}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Mobile Sticky Footer ── */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-40 flex items-center justify-between">
        <div>
          <span className="text-lg font-black text-slate-900 dark:text-white">${pricePerDay}</span>
          <span className="text-slate-500 text-sm font-semibold"> / day</span>
          <div className="text-xs text-slate-400 font-medium mt-0.5">
            {selectedStart && selectedEnd ? `${selectedStart} – ${selectedEnd}` : 'Select dates'}
          </div>
        </div>
        <button
          onClick={() => {
            if (selectedStart && selectedEnd) handleBookNow();
            else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); // Scroll to calendar
          }}
          disabled={bookingLoading}
          className="bg-green-600 text-white font-black px-6 py-3 rounded-xl"
        >
          {bookingLoading ? '...' : (selectedStart && selectedEnd ? 'Book Now' : 'Check Dates')}
        </button>
      </div>
      
    </div>
  );
}
