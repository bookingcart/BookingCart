import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { MapContainer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BasemapLayer from '../components/BasemapLayer.jsx';
import InteractiveRoomMap from '../components/InteractiveRoomMap.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const customMarkerIcon = L.divIcon({
  className: '',
  html: `<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const amenityIconMap = {
  wifi: 'ph-wifi-high', pool: 'ph-swimming-pool', gym: 'ph-barbell',
  restaurant: 'ph-fork-knife', bar: 'ph-wine', parking: 'ph-car',
  spa: 'ph-sparkle', breakfast: 'ph-coffee', 'air conditioning': 'ph-thermometer',
  elevator: 'ph-elevator', television: 'ph-television', safe: 'ph-lock',
  default: 'ph-check-circle',
};
const getAmenityIcon = (amenity) => {
  // amenity can be a string or an object with {type, name}
  const str = typeof amenity === 'string'
    ? amenity
    : (amenity?.name || amenity?.type || '');
  const lower = str.toLowerCase();
  return Object.entries(amenityIconMap).find(([k]) => lower.includes(k))?.[1] || amenityIconMap.default;
};

const getAmenityName = (amenity) => {
  if (typeof amenity === 'string') return amenity;
  return amenity?.name || (amenity?.type || '').replace(/_/g, ' ');
};

function StarRating({ score }) {
  const filled = Math.round((score || 0) / 2);
  return (
    <div className="flex">
      {[1,2,3,4,5].map(i => (
        <i key={i} className={`ph-fill ph-star text-xs ${i <= filled ? 'text-amber-400' : 'text-slate-300'}`} />
      ))}
    </div>
  );
}

function ReviewCard({ review }) {
  const score = Number(review.score) || 0;
  const color = score >= 8 ? 'bg-green-600' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`${color} text-white text-sm font-bold px-2 py-0.5 rounded`}>{score.toFixed(1)}</div>
        <div>
          <div className="font-bold text-sm text-slate-900 dark:text-white">{review.reviewer_name || 'Anonymous'}</div>
          <div className="text-xs text-slate-400">{review.created_at ? new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</div>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">{review.text || 'No review text.'}</p>
    </div>
  );
}

export default function StaysDetailsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const accommodationId = searchParams.get('id') || '';
  // Strip 'local_' prefix to get the numeric hotel profile ID for the PMS
  const hotelProfileId = accommodationId.startsWith('local_')
    ? accommodationId.replace('local_', '')
    : accommodationId || '1';

  const [hotel, setHotel] = useState(null);
  const [brand, setBrand] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsMeta, setReviewsMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [reviewPage, setReviewPage] = useState(null);
  // Rate conditions and cancellation timeline from the rates API
  const [rateConditions, setRateConditions] = useState('');
  const [ratesCancellationTimeline, setRatesCancellationTimeline] = useState(null);
  const [availableRates, setAvailableRates] = useState([]);
  const [selectedVisualRoom, setSelectedVisualRoom] = useState(null);
  const [roomSessionId, setRoomSessionId] = useState(null);

  // Dates and calculated nights
  const checkIn = searchParams.get('stays-checkin') || searchParams.get('checkin') || searchParams.get('check_in') || new Date().toISOString().split('T')[0];
  const checkOut = searchParams.get('stays-checkout') || searchParams.get('checkout') || searchParams.get('check_out') || new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const nights = useMemo(() => {
    try {
      const d1 = new Date(checkIn);
      const d2 = new Date(checkOut);
      const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      return Math.max(1, isNaN(diff) ? 1 : diff);
    } catch {
      return 1;
    }
  }, [checkIn, checkOut]);

  // Derived price display reflecting room selection immediately
  const displayedPrice = useMemo(() => {
    const currency = hotel?.cheapest_rate_currency || '$';
    if (selectedVisualRoom) {
      const nightly = Number(selectedVisualRoom.base_price) || 0;
      const total = nightly * nights;
      return {
        nightly,
        total,
        currency,
        isRoomSelected: true,
        roomNumber: selectedVisualRoom.room_number,
        roomType: selectedVisualRoom.room_type || 'Selected Room',
      };
    }
    const cheapest = Number(hotel?.cheapest_rate_total_amount) || 0;
    return {
      nightly: cheapest,
      total: cheapest * nights,
      currency,
      isRoomSelected: false,
      roomNumber: null,
      roomType: null,
    };
  }, [selectedVisualRoom, hotel, nights]);

  const DUMMY_ACCOMMODATIONS = {
    h1: { name: 'Kimpton Clocktower Hotel', description: 'An iconic 5-star hotel in the heart of Manchester, blending historic architecture with modern luxury. Enjoy stunning city views, a world-class spa, and award-winning dining.', address: { line_one: 'Oxford Street', city: 'Manchester', country_code: 'GB' }, star_rating: 5, rating: 8.8, review_count: 5032, photos: [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Pool'},{name:'Spa'},{name:'Restaurant'},{name:'Bar'},{name:'Gym'},{name:'Parking'},{name:'Breakfast'}], check_in_information: { check_in_after_time: '3:00 PM', check_out_before_time: '11:00 AM' }, cheapest_rate_total_amount: '154', cheapest_rate_currency: '$', location: { latitude: 53.4745, longitude: -2.2415 } },
    h2: { name: 'The Rex - formerly Hotel Gotham', description: 'Sophisticated art-deco hotel in Manchester\'s vibrant city centre. The Rex offers an unparalleled experience with rooftop bar access and exquisite rooms.', address: { line_one: 'King Street', city: 'Manchester', country_code: 'GB' }, star_rating: 5, rating: 8.9, review_count: 3586, photos: [{ url: 'https://images.unsplash.com/photo-1551882547-ff40eb591366?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Bar'},{name:'Restaurant'},{name:'Room Service'},{name:'Concierge'}], check_in_information: { check_in_after_time: '3:00 PM', check_out_before_time: '12:00 PM' }, cheapest_rate_total_amount: '158', cheapest_rate_currency: '$', location: { latitude: 53.4812, longitude: -2.2423 } },
    h3: { name: 'The Edwardian Manchester', description: 'Housed in a stunning Grade II listed building, The Edwardian Manchester is a luxury 5-star hotel offering timeless elegance in the heart of Manchester city centre.', address: { line_one: 'Peter Street', city: 'Manchester', country_code: 'GB' }, star_rating: 5, rating: 8.8, review_count: 3892, photos: [{ url: 'https://images.unsplash.com/photo-1542314831-c6a4d27ce003?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Pool'},{name:'Gym'},{name:'Spa'},{name:'Restaurant'},{name:'Bar'},{name:'Parking'}], check_in_information: { check_in_after_time: '2:00 PM', check_out_before_time: '12:00 PM' }, cheapest_rate_total_amount: '184', cheapest_rate_currency: '$', location: { latitude: 53.4776, longitude: -2.2461 } },
    h4: { name: 'Leonardo Hotel Manchester Central', description: 'Modern and stylish hotel perfectly located in Manchester city centre, offering comfortable rooms with great amenities at competitive rates.', address: { line_one: 'Medlock Street', city: 'Manchester', country_code: 'GB' }, star_rating: 4, rating: 8.3, review_count: 6615, photos: [{ url: 'https://images.unsplash.com/photo-1590490359683-658d3d23f972?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Restaurant'},{name:'Bar'},{name:'Gym'},{name:'Parking'}], check_in_information: { check_in_after_time: '3:00 PM', check_out_before_time: '11:00 AM' }, cheapest_rate_total_amount: '101', cheapest_rate_currency: '$', location: { latitude: 53.474, longitude: -2.2468 } },
    h5: { name: 'The Lowry Hotel', description: 'Manchester\'s only 5-star hotel, The Lowry sits on the bank of the River Irwell and offers breathtaking views, Michelin-starred dining, and exceptional service.', address: { line_one: '50 Dearmans Place', city: 'Salford', country_code: 'GB' }, star_rating: 5, rating: 8.7, review_count: 2104, photos: [{ url: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Pool'},{name:'Spa'},{name:'Gym'},{name:'Restaurant'},{name:'Bar'},{name:'Parking'}], check_in_information: { check_in_after_time: '2:00 PM', check_out_before_time: '12:00 PM' }, cheapest_rate_total_amount: '104', cheapest_rate_currency: '$', location: { latitude: 53.4831, longitude: -2.2519 } },
    h6: { name: 'The Midland', description: 'A historic grande dame hotel built in 1903 and now one of Manchester\'s most celebrated destinations, blending Edwardian splendour with modern comforts.', address: { line_one: '16 Peter Street', city: 'Manchester', country_code: 'GB' }, star_rating: 4, rating: 8.5, review_count: 4521, photos: [{ url: 'https://images.unsplash.com/photo-1618773928120-2946cd16492b?auto=format&fit=crop&w=1200&q=80' }], amenities: [{name:'Free WiFi'},{name:'Gym'},{name:'Restaurant'},{name:'Bar'},{name:'Room Service'},{name:'Concierge'}], check_in_information: { check_in_after_time: '3:00 PM', check_out_before_time: '11:00 AM' }, cheapest_rate_total_amount: '90', cheapest_rate_currency: '$', location: { latitude: 53.4764, longitude: -2.2442 } },
  };

  // Fetch accommodation details
  useEffect(() => {
    if (!accommodationId) {
      setLoading(false);
      setError('No accommodation ID provided.');
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/stays-accommodation?id=${encodeURIComponent(accommodationId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.accommodation) {
          setHotel(data.accommodation);
          // Fetch brand if present
          if (data.accommodation.brand_id) {
            fetch(`/api/stays-brands?id=${encodeURIComponent(data.accommodation.brand_id)}`)
              .then(r => r.json())
              .then(bd => { if (bd.ok && bd.brand) setBrand(bd.brand); })
              .catch(() => {});
          }
        } else {
          // Check if we have dummy data for this ID (sample/demo mode)
          const dummy = DUMMY_ACCOMMODATIONS[accommodationId];
          if (dummy) {
            setHotel(dummy);
          } else {
            setError(data.error || 'Failed to load accommodation.');
          }
        }
      })
      .catch(() => {
        // Try dummy fallback on network error too
        const dummy = DUMMY_ACCOMMODATIONS[accommodationId];
        if (dummy) setHotel(dummy);
        else setError('Network error loading accommodation.');
      })
      .finally(() => setLoading(false));

    // Also fetch rates so we can display real rate conditions + cancellation timeline
    const searchResultId = searchParams.get('search_result_id') || accommodationId;
    if (searchResultId) {
      fetch(`/api/stays-rates?search_result_id=${encodeURIComponent(searchResultId)}`)
        .then(r => r.json())
        .then(data => {
          const allRates = data.rates || [];
          if (!allRates.length) return;
          setAvailableRates(allRates);
          // Prefer a refundable rate with cancellation_timeline
          const refundableRate = allRates.find(r =>
            r.cancellation_timeline?.cancel_by ||
            r.refundable === true ||
            (r.conditions && r.conditions.toLowerCase().includes('refund'))
          );
          const bestRate = refundableRate || allRates[0];
          if (bestRate.conditions) setRateConditions(bestRate.conditions);
          if (bestRate.cancellation_timeline) setRatesCancellationTimeline(bestRate.cancellation_timeline);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId]);

  // Fetch reviews
  const fetchReviews = useCallback((after = null) => {
    if (!accommodationId) return;
    setReviewsLoading(true);
    const qs = new URLSearchParams({ id: accommodationId, limit: 6 });
    if (after) qs.set('after', after);
    fetch(`/api/stays-accommodation-reviews?${qs}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setReviews(prev => after ? [...prev, ...(data.reviews?.reviews || [])] : (data.reviews?.reviews || []));
          setReviewsMeta(data.meta);
        }
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [accommodationId]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  useEffect(() => {
    if (hotel) document.title = `${hotel.name} | BookingCart`;
    else document.title = 'Hotel Details | BookingCart';
  }, [hotel]);

  const handleBook = async (overrideRoom = null) => {
    const activeRoom = overrideRoom || selectedVisualRoom;
    const searchResultId = searchParams.get('search_result_id') || accommodationId;
    const nightlyPrice = activeRoom
      ? (Number(activeRoom.base_price) || 0)
      : (Number(hotel?.cheapest_rate_total_amount) || 0);
    const totalPrice = nightlyPrice * nights;
    const qsParts = [];
    if (activeRoom?.id && String(activeRoom.id) !== 'undefined') {
      qsParts.push(`room_id=${encodeURIComponent(activeRoom.id)}`);
    }
    if (activeRoom?.room_number && String(activeRoom.room_number) !== 'undefined') {
      qsParts.push(`room_number=${encodeURIComponent(activeRoom.room_number)}`);
    }
    if (activeRoom?.room_type && String(activeRoom.room_type) !== 'undefined') {
      qsParts.push(`room_type=${encodeURIComponent(activeRoom.room_type)}`);
    }
    if (nightlyPrice > 0) {
      qsParts.push(`room_price=${encodeURIComponent(nightlyPrice)}`);
    }
    if (totalPrice > 0) {
      qsParts.push(`total_price=${encodeURIComponent(totalPrice)}`);
    }
    if (nights > 0) {
      qsParts.push(`nights=${encodeURIComponent(nights)}`);
    }
    const roomQs = qsParts.length ? `&${qsParts.join('&')}` : '';

    try {
      setBookingLoading(true);
      // 1. Get rates for search result
      let rates = availableRates;
      if (!rates.length && searchResultId) {
        try {
          const ratesRes = await fetch(`/api/stays-rates?search_result_id=${encodeURIComponent(searchResultId)}`);
          const ratesData = await ratesRes.json();
          rates = ratesData.rates || [];
        } catch (e) {
          console.warn('Booking rates fetch warning:', e);
        }
      }

      // Match rate against activeRoom
      let selectedRate = null;
      if (activeRoom && rates.length > 0) {
        selectedRate = rates.find(r =>
          (activeRoom.room_type && r.room_name && r.room_name.trim().toLowerCase() === activeRoom.room_type.trim().toLowerCase()) ||
          String(r.id).endsWith(`_${activeRoom.id}`) ||
          Math.abs(Number(r.base_amount || r.total_amount) - nightlyPrice) < 0.01
        );
      }
      if (!selectedRate && rates.length > 0) {
        const refundableRate = rates.find(r =>
          r.cancellation_timeline?.cancel_by ||
          r.refundable === true ||
          (r.conditions && r.conditions.toLowerCase().includes('refund'))
        );
        selectedRate = refundableRate || rates[0];
      }

      if (selectedRate) {
        selectedRate = {
          ...selectedRate,
          base_amount: String(nightlyPrice),
          total_amount: String(totalPrice),
          room_name: activeRoom?.room_type || selectedRate.room_name || 'Standard Room',
        };
      } else {
        selectedRate = {
          id: `rate_local_${hotelProfileId}_${activeRoom?.id || 'sel'}`,
          base_amount: String(nightlyPrice),
          total_amount: String(totalPrice),
          currency: hotel?.cheapest_rate_currency || '$',
          room_name: activeRoom?.room_type || 'Standard Room',
          conditions: rateConditions || 'Free cancellation up to 48 hours before check-in',
          refundable: true,
        };
      }

      // Store selected rate data so checkout page can show accurate price, tax/fee, conditions
      sessionStorage.setItem('stays_selected_rate', JSON.stringify(selectedRate));

      // Also store updated hotel summary
      const currentStoredHotel = (() => {
        try { return JSON.parse(sessionStorage.getItem('stays_selected_hotel') || '{}'); } catch { return {}; }
      })();
      sessionStorage.setItem('stays_selected_hotel', JSON.stringify({
        ...currentStoredHotel,
        id: accommodationId,
        name: hotel?.name || currentStoredHotel?.name,
        price: String(totalPrice),
        nightly_price: String(nightlyPrice),
        currency: hotel?.cheapest_rate_currency || '$',
        checkin: checkIn,
        checkout: checkOut,
        nights: nights,
        image: hotel?.photos?.[0]?.url || hotel?.photos?.[0] || currentStoredHotel?.image,
        address: [hotel?.address?.line_one, hotel?.address?.city, hotel?.address?.city_name, hotel?.address?.country_code].filter(Boolean).join(', ') || hotel?.address || currentStoredHotel?.address || '',
        room_name: activeRoom?.room_type || 'Standard Room',
        room_number: activeRoom?.room_number || null,
      }));

      // 2. Create quote
      const quoteRes = await fetch('/api/stays-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_id: selectedRate.id,
          nights: nights
        })
      });
      const quoteData = await quoteRes.json();

      if (quoteData.ok && quoteData.quote?.id) {
        navigate(`/stays/checkout?quote_id=${quoteData.quote.id}&accommodation_id=${accommodationId}${roomQs}`);
      } else {
        navigate(`/stays/checkout?quote_id=quo_${selectedRate.id}_n${nights}&accommodation_id=${accommodationId}${roomQs}`);
      }
    } catch (err) {
      console.error('Booking quote error:', err);
      navigate(`/stays/checkout?quote_id=quo_pending&accommodation_id=${accommodationId}${roomQs}`);
    } finally {
      setBookingLoading(false);
    }
  };

  const lat = hotel?.location?.latitude || hotel?.latitude || hotel?.geo?.lat;
  const lng = hotel?.location?.longitude || hotel?.longitude || hotel?.geo?.lng;

  const photos = hotel?.photos || hotel?.images || [];
  const amenities = hotel?.amenities || hotel?.facilities || [];
  const displayedAmenities = showAllAmenities ? amenities : amenities.slice(0, 10);

  const rating = hotel?.review_score || hotel?.rating?.overall || hotel?.rating || null;
  const reviewCount = hotel?.review_count || hotel?.total_reviews || reviews.length || 0;

  const address = [hotel?.address?.line_one, hotel?.address?.city_name, hotel?.address?.city, hotel?.address?.country_code]
    .filter(Boolean).join(', ') || hotel?.address || '';

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading hotel details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col font-sans">
      {/* Sticky Header Nav */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex gap-6 h-full">
            {['Overview', 'Pick Room', 'Prices', 'Amenities', 'Reviews', 'Location'].map((item, idx) => {
              const secId = item.toLowerCase().replace(' ', '-');
              return (
                <a
                  key={item}
                  href={`#${secId}`}
                  onClick={() => setActiveSection(secId)}
                  className={`flex items-center text-sm font-bold border-b-2 transition-colors ${activeSection === secId ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {item}
                </a>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            {hotel && (
              <div className="text-right hidden sm:block">
                <div className="text-lg font-black text-slate-900 dark:text-white flex items-baseline justify-end gap-1.5">
                  <span>{displayedPrice.currency}{displayedPrice.total.toFixed(0)}</span>
                  {nights > 1 && (
                    <span className="text-xs font-normal text-slate-500">
                      ({displayedPrice.currency}{displayedPrice.nightly.toFixed(0)}/nt)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  {displayedPrice.isRoomSelected ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      Room {selectedVisualRoom.room_number} · {nights} {nights === 1 ? 'night' : 'nights'}
                    </span>
                  ) : (
                    <span>
                      {nights} {nights === 1 ? 'night' : 'nights'}
                      {rating ? ` · ${Number(rating).toFixed(1)}` : ''}
                      {reviewCount > 0 ? ` (${reviewCount} reviews)` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}
            <button
              disabled={bookingLoading}
              onClick={() => handleBook(selectedVisualRoom)}
              className="px-6 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors disabled:opacity-70 whitespace-nowrap"
            >
              {bookingLoading ? 'Reserving...' : displayedPrice.isRoomSelected ? `Reserve Room ${selectedVisualRoom.room_number}` : 'Reserve'}
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">

        {error && !hotel && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-8">
            <i className="ph ph-warning text-3xl text-red-400 mb-2" />
            <p className="text-red-600 font-medium">{error}</p>
            <button onClick={() => navigate(-1)} className="mt-4 text-sm font-bold text-green-600 hover:underline">← Go back</button>
          </div>
        )}

        {hotel && (
          <>
            {/* Header Section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">
                  {hotel.name}
                </h1>
                {brand && <span className="text-base font-semibold text-slate-500">by {brand.name}</span>}
                {hotel.star_rating && (
                  <div className="flex ml-1">
                    {Array.from({ length: Math.min(Number(hotel.star_rating), 5) }).map((_, i) => (
                      <i key={i} className="ph-fill ph-star text-amber-400 text-sm" />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-slate-500 text-sm mt-1">{address}</p>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  {rating && <div className="bg-green-600 text-white px-2 py-1 rounded font-bold text-sm">{Number(rating).toFixed(1)}</div>}
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {Number(rating) >= 9 ? 'Exceptional' : Number(rating) >= 8 ? 'Very good' : 'Good'}
                    {reviewCount > 0 && <span className="text-slate-500 font-normal ml-1">{reviewCount} reviews</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors">
                    <i className="ph ph-heart text-lg" />
                  </button>
                  <button className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors">
                    <i className="ph ph-share-network text-lg" />
                  </button>
                  <button disabled={bookingLoading} onClick={handleBook} className="px-6 py-2.5 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors ml-2 hidden sm:block disabled:opacity-70">
                    {bookingLoading ? 'Reserving...' : 'Reserve'}
                  </button>
                </div>
              </div>
            </div>

            {/* Image Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-10 h-[400px] md:h-[500px]">
              <div className="md:col-span-2 relative h-full rounded-l-xl overflow-hidden group">
                <img
                  src={photos[0]?.url || photos[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'}
                  alt={hotel.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded">
                  {photos.length > 1 ? `All photos (${photos.length})` : 'View photos'}
                </div>
              </div>
              <div className="hidden md:grid grid-cols-1 grid-rows-2 gap-2 h-full">
                <div className="grid grid-cols-2 gap-2">
                  {[1,2].map(i => (
                    <div key={i} className={`relative overflow-hidden group ${i === 2 ? 'rounded-tr-xl' : ''}`}>
                      <img
                        src={photos[i]?.url || photos[i] || `https://images.unsplash.com/photo-158268301023${i}-d716f9a3f461?auto=format&fit=crop&w=600&q=80`}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80'; }}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[3,4].map(i => (
                    <div key={i} className={`relative overflow-hidden group ${i === 4 ? 'rounded-br-xl' : ''}`}>
                      <img
                        src={photos[i]?.url || photos[i] || `https://images.unsplash.com/photo-16187732812${i}-2946cd16492b?auto=format&fit=crop&w=600&q=80`}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1618773928120-2946cd16492b?auto=format&fit=crop&w=600&q=80'; }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Overview Section */}
            <section id="overview" className="mb-12">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4">Overview</h2>
              {hotel.description && (
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6 max-w-3xl">
                  {hotel.description}
                </p>
              )}
              <div className="flex flex-wrap gap-4">
                {rating && (
                  <div className="bg-green-600 text-white p-4 rounded-lg w-[140px] flex flex-col justify-center">
                    <div className="text-2xl font-black">{Number(rating).toFixed(1)}</div>
                    <div className="text-sm font-bold">{Number(rating) >= 9 ? 'Exceptional' : Number(rating) >= 8 ? 'Very good' : 'Good'}</div>
                    {reviewCount > 0 && <div className="text-[10px] opacity-80">{reviewCount} reviews</div>}
                  </div>
                )}
                {amenities.slice(0, 4).map((amenity, idx) => (
                  <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 w-[160px] flex flex-col justify-between">
                    <i className={`ph ${getAmenityIcon(amenity)} text-2xl text-slate-400 mb-2`} />
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{getAmenityName(amenity)}</div>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-slate-200 dark:border-slate-700 my-8" />

            {/* Visual Room Selection Engine Section */}
            <section id="pick-room" className="mb-12 scroll-mt-20">
              <InteractiveRoomMap
                hotelId={hotelProfileId}
                checkIn={checkIn}
                checkOut={checkOut}
                guests={Number(searchParams.get('guests')) || 2}
                currency={hotel?.cheapest_rate_currency || '$'}
                selectedRoom={selectedVisualRoom}
                onRoomSelect={(room, sid, expiresAt, shouldProceed) => {
                  setSelectedVisualRoom(room);
                  if (sid) setRoomSessionId(sid);
                  // When user clicks "Confirm Selection" in the sticky bottom bar
                  if (shouldProceed && room) {
                    handleBook(room);
                  }
                }}
              />
            </section>

            <div className="border-t border-slate-200 dark:border-slate-700 my-8" />

            {/* Deals/Prices Section */}
            <section id="prices" className="mb-12">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Book Your Stay at {hotel.name}</h2>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                {/* Room selection banner */}
                {displayedPrice.isRoomSelected && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700 px-6 py-3 flex items-center gap-2">
                    <i className="ph-fill ph-check-circle text-emerald-600 dark:text-emerald-400 text-lg" />
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      Room {displayedPrice.roomNumber} — {displayedPrice.roomType} selected
                    </span>
                    <button
                      onClick={() => setSelectedVisualRoom(null)}
                      className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                    >
                      Change room
                    </button>
                  </div>
                )}
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{hotel.name}</h3>
                    {hotel.check_in_information && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Check-in: {hotel.check_in_information.check_in_after_time || '3:00 PM'} · Check-out: {hotel.check_in_information.check_out_before_time || '12:00 PM'}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      {displayedPrice.isRoomSelected ? `${displayedPrice.roomType} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Best available rate'}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-2xl font-black text-slate-900 dark:text-white">
                        {displayedPrice.currency}{displayedPrice.total.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {displayedPrice.currency}{displayedPrice.nightly.toFixed(0)}/night · {nights} {nights === 1 ? 'night' : 'nights'} total
                      </div>
                    </div>
                    <button
                      disabled={bookingLoading}
                      onClick={() => handleBook(selectedVisualRoom)}
                      className="px-6 py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors shadow-sm disabled:opacity-70 whitespace-nowrap"
                    >
                      {bookingLoading
                        ? 'Reserving...'
                        : displayedPrice.isRoomSelected
                          ? `Reserve Room ${displayedPrice.roomNumber}`
                          : 'Reserve your stay'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t border-slate-200 dark:border-slate-700 my-8" />

            {/* Amenities Section */}
            {amenities.length > 0 && (
              <>
                <section id="amenities" className="mb-12">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Amenities at {hotel.name}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 mb-6">
                    {displayedAmenities.map((amenity, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 font-medium">
                        <i className={`ph ${getAmenityIcon(amenity)} text-xl text-slate-500`} />
                        <span className="capitalize">{getAmenityName(amenity)}</span>
                      </div>
                    ))}
                  </div>
                  {amenities.length > 10 && (
                    <button
                      onClick={() => setShowAllAmenities(p => !p)}
                      className="border border-slate-300 dark:border-slate-600 rounded px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                    >
                      {showAllAmenities ? 'Show fewer' : `Show all ${amenities.length} amenities`}
                      <i className={`ph ${showAllAmenities ? 'ph-caret-up' : 'ph-caret-down'} text-xs`} />
                    </button>
                  )}
                </section>
                <div className="border-t border-slate-200 dark:border-slate-700 my-8" />
              </>
            )}

            {/* Reviews Section */}
            <section id="reviews" className="mb-12">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Reviews of {hotel.name}</h2>
              <div className="flex items-center gap-4 mb-8">
                {rating && (
                  <div className="bg-green-600 text-white px-4 py-3 rounded-xl text-center min-w-[80px]">
                    <div className="text-3xl font-black leading-none">{Number(rating).toFixed(1)}</div>
                    <div className="text-xs mt-1 opacity-90">out of 10</div>
                  </div>
                )}
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {Number(rating) >= 9 ? 'Exceptional' : Number(rating) >= 8 ? 'Very good' : 'Good'}
                  </div>
                  {reviewCount > 0 && <div className="text-sm text-slate-500">{reviewCount} verified guest reviews</div>}
                </div>
              </div>

              {reviewsLoading && reviews.length === 0 ? (
                <div className="flex items-center gap-3 text-slate-400 py-8">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  Loading reviews…
                </div>
              ) : reviews.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reviews.map((review, idx) => (
                      <ReviewCard key={idx} review={review} />
                    ))}
                  </div>
                  {reviewsMeta?.after && (
                    <button
                      onClick={() => fetchReviews(reviewsMeta.after)}
                      disabled={reviewsLoading}
                      className="mt-6 border border-slate-200 dark:border-slate-700 px-6 py-2.5 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {reviewsLoading ? 'Loading…' : 'Load more reviews'}
                    </button>
                  )}
                </>
              ) : (
                <div className="text-slate-400 text-sm py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center">
                  <i className="ph ph-chat-dots text-3xl mb-2 block" />
                  No reviews available yet for this property.
                </div>
              )}
            </section>

            {/* Location Section */}
            {lat && lng && (
              <>
                <div className="border-t border-slate-200 dark:border-slate-700 my-8" />
                <section id="location" className="mb-12">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Location</h2>
                  <div className="h-[300px] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-4 z-0 relative">
                    <MapContainer center={[lat, lng]} zoom={15} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
                      <BasemapLayer provider="osm" maxZoom={19} />
                      <Marker position={[lat, lng]} icon={customMarkerIcon} />
                    </MapContainer>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-2">{address}</p>
                </section>
              </>
            )}

            {/* Policies Section */}
            <>
              <div className="border-t border-slate-200 dark:border-slate-700 my-8" />
              <section className="mb-12">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Policies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-2">Check-in / Check-out</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Check in after {hotel.check_in_information?.check_in_after_time || '3:00 PM'},
                      check out before {hotel.check_in_information?.check_out_before_time || '12:00 PM'}
                    </p>
                  </div>
                  {hotel.cancellation_timeline?.cancel_by && (
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white mb-2">Free Cancellation</h3>
                      <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                        <i className="ph-fill ph-check-circle mr-1" />
                        Free cancellation until {new Date(hotel.cancellation_timeline.cancel_by).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Hotel description / general policy */}
                {hotel.description && (
                  <div className="mb-6">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-2">About this property</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{hotel.description}</p>
                  </div>
                )}

                {/* Rate conditions – pulled from the API (always visible, no expand/collapse) */}
                {(rateConditions || hotel.rate_conditions) && (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 mb-6">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3">Rate Conditions</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{rateConditions || hotel.rate_conditions}</p>
                  </div>
                )}

                {/* Cancellation timeline from rates */}
                {ratesCancellationTimeline?.cancel_by && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-5 border border-green-200 dark:border-green-800 mb-6">
                    <h3 className="font-bold text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                      <i className="ph-fill ph-check-circle" />
                      Free Cancellation
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                      Free cancellation until {new Date(ratesCancellationTimeline.cancel_by).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    {((ratesCancellationTimeline.penalties || ratesCancellationTimeline.periods) || []).map((p, i) => (
                      <div key={i} className="text-xs text-slate-600 dark:text-slate-400 mt-2 ml-3">
                        <i className="ph ph-caret-right mr-1" />
                        After {new Date(p.start_date || p.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}:{' '}
                        {p.percentage != null ? `${p.percentage}% penalty` : p.amount != null ? `${p.amount} penalty` : 'Penalty applies'}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>

            {/* Business Details */}
            <>
              <div className="border-t border-slate-200 dark:border-slate-700 my-8" />
              <section className="mb-12">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4">Business Details</h2>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-base text-slate-900 dark:text-white">BookingCart Inc.</p>
                  <p className="flex items-center gap-2"><i className="ph ph-map-pin text-green-600" /> 123 Travel Street, Silicon Valley, CA 94000, USA</p>
                  <p className="flex items-center gap-2"><i className="ph ph-envelope text-green-600" /> bookingcart.business@gmail.com</p>
                  <p className="flex items-center gap-2"><i className="ph ph-phone text-green-600" /> +1 (800) 555-0199</p>
                  <p className="text-xs text-slate-500 pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
                    By completing a booking, you agree to our{' '}
                    <a href="/terms" className="text-green-600 hover:underline">Terms &amp; Conditions</a>{' '}and{' '}
                    <a href="/privacy" className="text-green-600 hover:underline">Privacy Policy</a>.
                  </p>
                </div>
              </section>
            </>
          </>
        )}
      </main>
      <FlightFooter />
    </div>
  );
}
