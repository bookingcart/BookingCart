import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

  const handleBook = async () => {
    const existingQuoteId = searchParams.get('quote_id');
    const searchResultId = searchParams.get('search_result_id');
    
    if (existingQuoteId && existingQuoteId !== 'quo_pending') {
      navigate(`/stays/checkout?quote_id=${existingQuoteId}&accommodation_id=${accommodationId}`);
      return;
    }

    if (!searchResultId) {
      // fallback if user visited directly without search params
      navigate(`/stays/checkout?quote_id=quo_pending&accommodation_id=${accommodationId}`);
      return;
    }

    try {
      setBookingLoading(true);
      // 1. Get rates for search result
      const ratesRes = await fetch(`/api/stays-rates?search_result_id=${encodeURIComponent(searchResultId)}`);
      const ratesData = await ratesRes.json();
      const rateId = ratesData.rates?.[0]?.id; // Pick cheapest rate
      
      if (!rateId) throw new Error("No rates found");

      // 2. Create quote
      const quoteRes = await fetch('/api/stays-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate_id: rateId })
      });
      const quoteData = await quoteRes.json();
      
      if (quoteData.ok && quoteData.quote?.id) {
        navigate(`/stays/checkout?quote_id=${quoteData.quote.id}&accommodation_id=${accommodationId}`);
      } else {
        throw new Error("Failed to create quote");
      }
    } catch (err) {
      console.error('Booking quote error:', err);
      // fallback
      navigate(`/stays/checkout?quote_id=quo_pending&accommodation_id=${accommodationId}`);
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
            {['Overview', 'Prices', 'Amenities', 'Reviews', 'Location'].map((item, idx) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                onClick={() => setActiveSection(item.toLowerCase())}
                className={`flex items-center text-sm font-bold border-b-2 transition-colors ${activeSection === item.toLowerCase() ? 'border-green-600 text-green-700 dark:text-green-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
              >
                {item}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-4">
            {hotel && (
              <div className="text-right hidden sm:block">
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  {hotel.cheapest_rate_total_amount
                    ? `${hotel.cheapest_rate_currency || '$'}${hotel.cheapest_rate_total_amount}`
                    : 'View rates'}
                </div>
                <div className="text-[10px] text-slate-500">{rating && `${Number(rating).toFixed(1)} · `}{reviewCount} reviews</div>
              </div>
            )}
            <button disabled={bookingLoading} onClick={handleBook} className="px-6 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors disabled:opacity-70">
              {bookingLoading ? 'Reserving...' : 'Reserve'}
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

            {/* Deals/Prices Section */}
            <section id="prices" className="mb-12">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Book Your Stay at {hotel.name}</h2>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{hotel.name}</h3>
                    {hotel.check_in_information && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Check-in: {hotel.check_in_information.check_in_after_time || '3:00 PM'} · Check-out: {hotel.check_in_information.check_out_before_time || '12:00 PM'}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">Best available rate</div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      {hotel.cheapest_rate_total_amount ? (
                        <>
                          <div className="text-2xl font-black text-slate-900 dark:text-white">{hotel.cheapest_rate_currency || '$'}{hotel.cheapest_rate_total_amount}</div>
                          <div className="text-[10px] text-slate-500">Total before taxes</div>
                        </>
                      ) : (
                        <div className="text-base font-semibold text-slate-500">Check availability</div>
                      )}
                    </div>
                    <button disabled={bookingLoading} onClick={handleBook} className="px-6 py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors shadow-sm disabled:opacity-70">
                      {bookingLoading ? 'Reserving...' : 'Reserve your stay'}
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
                      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                      <Marker position={[lat, lng]} icon={customMarkerIcon} />
                    </MapContainer>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-2">{address}</p>
                </section>
              </>
            )}

            {/* Policies Section */}
            {hotel.check_in_information && (
              <>
                <div className="border-t border-slate-200 dark:border-slate-700 my-8" />
                <section className="mb-12">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Policies</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white mb-2">Check-in / Check-out</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Check in after {hotel.check_in_information.check_in_after_time || '3:00 PM'},
                        check out before {hotel.check_in_information.check_out_before_time || '12:00 PM'}
                      </p>
                    </div>
                    {hotel.cancellation_timeline && (
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white mb-2">Cancellation</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {hotel.cancellation_timeline.cancel_by ? `Free cancellation until ${new Date(hotel.cancellation_timeline.cancel_by).toLocaleDateString()}` : 'Cancellation policies vary by rate.'}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
      <FlightFooter />
    </div>
  );
}
