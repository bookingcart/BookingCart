import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FlightFooter } from '../components/FlightFooter.jsx';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createPriceIcon = (price, isSelected) => {
  const bg = isSelected ? '#1e293b' : 'white';
  const color = isSelected ? 'white' : '#1e293b';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:${color};border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:system-ui,-apple-system,sans-serif;cursor:pointer;">$${price}</div>`,
    iconSize: [null, null],
    iconAnchor: [0, 0],
  });
};

function MapFlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 1.2 });
  }, [center, map]);
  return null;
}

// Dummy data matching the Kayak screenshot
const DUMMY_HOTELS = [
  {
    id: 'h1',
    name: 'Kimpton Clocktower Hotel',
    brand: 'By IHG',
    price: 154,
    rating: 8.8,
    reviews: 5032,
    address: 'Petersfield, Manchester',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    lat: 53.4745,
    lng: -2.2415
  },
  {
    id: 'h2',
    name: 'The Rex - formerly Hotel Gotham',
    brand: '',
    price: 158,
    rating: 8.9,
    reviews: 3586,
    address: 'Central Retail District, Manchester',
    image: 'https://images.unsplash.com/photo-1551882547-ff40eb591366?auto=format&fit=crop&w=800&q=80',
    lat: 53.4812,
    lng: -2.2423
  },
  {
    id: 'h3',
    name: 'The Edwardian Manchester, A Radisson Collection Hotel',
    brand: '',
    price: 184,
    rating: 8.8,
    reviews: 3892,
    address: 'Petersfield, Manchester',
    image: 'https://images.unsplash.com/photo-1542314831-c6a4d27ce003?auto=format&fit=crop&w=800&q=80',
    lat: 53.4776,
    lng: -2.2461
  },
  {
    id: 'h4',
    name: 'Leonardo Hotel Manchester Central',
    brand: '',
    price: 101,
    rating: 8.3,
    reviews: 6615,
    address: 'Petersfield, Manchester',
    image: 'https://images.unsplash.com/photo-1590490359683-658d3d23f972?auto=format&fit=crop&w=800&q=80',
    lat: 53.4740,
    lng: -2.2468
  },
  {
    id: 'h5',
    name: 'The Lowry Hotel',
    brand: '',
    price: 104,
    rating: 8.7,
    reviews: 2104,
    address: 'Salford, Manchester',
    image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
    lat: 53.4831,
    lng: -2.2519
  },
  {
    id: 'h6',
    name: 'The Midland',
    brand: '',
    price: 90,
    rating: 8.5,
    reviews: 4521,
    address: 'Petersfield, Manchester',
    image: 'https://images.unsplash.com/photo-1618773928120-2946cd16492b?auto=format&fit=crop&w=800&q=80',
    lat: 53.4764,
    lng: -2.2442
  }
];

export default function StaysResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Calculate valid default dates (YYYY-MM-DD format) for Duffel API
  const defaultCheckinDate = new Date();
  defaultCheckinDate.setDate(defaultCheckinDate.getDate() + 7);
  const defaultCheckinStr = defaultCheckinDate.toISOString().split('T')[0];
  
  const defaultCheckoutDate = new Date();
  defaultCheckoutDate.setDate(defaultCheckoutDate.getDate() + 14);
  const defaultCheckoutStr = defaultCheckoutDate.toISOString().split('T')[0];

  const destination = searchParams.get('destination') || 'Manchester';
  const checkin = searchParams.get('stays-checkin') || searchParams.get('checkin') || defaultCheckinStr;
  const checkout = searchParams.get('stays-checkout') || searchParams.get('checkout') || defaultCheckoutStr;
  const guests = searchParams.get('guests') || '1';
  const rooms = searchParams.get('rooms') || '1';

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [mapCenter, setMapCenter] = useState([53.478, -2.242]);
  const [hoveredHotel, setHoveredHotel] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Corporate code / Negotiated rates
  const [corporateCode, setCorporateCode] = useState('');
  const [corpCodeApplied, setCorpCodeApplied] = useState(false);
  const [corpCodeLoading, setCorpCodeLoading] = useState(false);
  const [corpCodeError, setCorpCodeError] = useState('');

  useEffect(() => {
    document.title = `Stays in ${destination} | BookingCart`;
    setSearchError('');

    const runSearch = async () => {
      setLoading(true);
      setResults([]);
      try {
        const res = await fetch('/api/stays-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination, checkin, checkout, guests: Number(guests) || 1, rooms: Number(rooms) || 1 })
        });
        const data = await res.json();

        if (data.ok && data.results && data.results.length > 0) {
          // Map Duffel API results to our display format
          const mapped = data.results.map((r, i) => {
            const acc = r.accommodation || {};
            const geo = acc.geographic_coordinates || {};
            const photoUrl = (acc.photos && acc.photos[0]?.url) 
              ? acc.photos[0].url 
              : `https://loremflickr.com/800/500/hotel,luxury?random=${i + 1}`;
            return {
              id: acc.id || r.id || `r${i}`,
              duffelResultId: r.id,
              name: acc.name || 'Hotel',
              brand: acc.chain?.name || '',
              price: r.cheapest_rate ? Number(r.cheapest_rate).toFixed(0) : '—',
              currency: r.currency || 'USD',
              rating: acc.review_score ? Number(acc.review_score) : Number(acc.rating || 8.0),
              reviews: acc.review_count || Math.floor(Math.random() * 5000 + 500),
              address: [acc.location?.address?.line_one, acc.location?.address?.city_name, acc.location?.address?.country_code].filter(Boolean).join(', ') || [acc.city_name, acc.country_code].filter(Boolean).join(', '),
              image: photoUrl,
              lat: (acc.location?.geographic_coordinates?.latitude) || geo.latitude || 0,
              lng: (acc.location?.geographic_coordinates?.longitude) || geo.longitude || 0,
              // Keep full data for checkout page
              checkin,
              checkout,
              guests,
              rooms,
              // Full accommodation details for Details/Checkout pages
              fullAccommodation: acc,
            };
          });
          setResults(mapped);
          // Re-center map: Prioritize the geocoded city center from the API, fallback to first result
          if (data.centerCoordinates) {
            setMapCenter([data.centerCoordinates.latitude, data.centerCoordinates.longitude]);
          } else if (mapped[0]) {
            setMapCenter([mapped[0].lat, mapped[0].lng]);
          }
        } else {
          // Fall back to dummy data so the page doesn't look empty
          setResults(DUMMY_HOTELS);
          // If we have center coordinates but no results, still center the map there!
          if (data && data.centerCoordinates) {
            setMapCenter([data.centerCoordinates.latitude, data.centerCoordinates.longitude]);
          }
          if (data.ok && data.results?.length === 0) {
            setSearchError(`No stays found in "${destination}" for those dates. Showing sample results.`);
          }
        }
      } catch (err) {
        console.error('Stays search failed:', err);
        setResults(DUMMY_HOTELS);
        setSearchError('Could not connect to search. Showing sample results.');
      } finally {
        setLoading(false);
      }
    };

    runSearch();
  }, [destination, checkin, checkout, guests, rooms]);

  const handleApplyCorporateCode = async () => {
    if (!corporateCode.trim()) return;
    setCorpCodeLoading(true);
    setCorpCodeError('');
    setCorpCodeApplied(false);
    try {
      const res = await fetch('/api/stays-negotiated-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_access_code: corporateCode.trim(),
          display_name: `Corporate Rate (${corporateCode.trim()})`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCorpCodeApplied(true);
      } else {
        setCorpCodeError(data.error || 'Invalid code. Please try again.');
      }
    } catch {
      setCorpCodeError('Network error. Please try again.');
    } finally {
      setCorpCodeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Top Bar with Search Summary */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-3 px-4 sm:px-6 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200">
              <i className="ph ph-bed" /> {destination}
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200">
              <i className="ph ph-calendar-blank" /> {checkin} to {checkout}
            </div>
            <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200">
              <i className="ph ph-users" /> {guests} Guest{guests !== '1' ? 's' : ''}, {rooms} Room{rooms !== '1' ? 's' : ''}
            </div>
            <Link to="/" className="text-sm font-bold text-white bg-green-600 hover:bg-green-700 px-5 py-2 rounded-xl transition-colors shadow-sm">
              Search
            </Link>
          </div>
        </div>

        {/* Horizontal Filters Bar (for mobile/tablet) */}
        <div className="lg:hidden max-w-[1600px] mx-auto flex items-center gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          <button className="whitespace-nowrap flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            <i className="ph ph-sliders-horizontal" /> All filters
          </button>
          <button className="whitespace-nowrap flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            Price <i className="ph ph-caret-down text-xs text-slate-400" />
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6 relative">
        
        {/* Left Sidebar (Filters) */}
        <div className="hidden lg:block w-64 shrink-0 space-y-6 pt-2">
          {/* Stops / Property Type Filter */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Property type</h3>
            <div className="space-y-2">
              {['Hotels', 'Resorts', 'Apartments', 'Villas', 'Hostels'].map((type) => (
                <label key={type} className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded checked:bg-green-600 checked:border-green-600 transition-colors" defaultChecked={type === 'Hotels'} />
                    <i className="ph ph-check absolute text-white text-sm opacity-0 peer-checked:opacity-100 pointer-events-none" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

          {/* Price Filter */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Price per night</h3>
            <input type="range" min="50" max="1000" defaultValue="1000" className="w-full accent-green-600" />
            <div className="flex justify-between text-xs text-slate-500 font-medium mt-2">
              <span>$50</span>
              <span>$1000+</span>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

          {/* Amenities Filter */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Amenities</h3>
            <div className="space-y-2">
              {['Free WiFi', 'Pool', 'Breakfast included', 'Parking', 'Gym'].map((amenity) => (
                <label key={amenity} className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="checkbox" className="peer appearance-none w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded checked:bg-green-600 checked:border-green-600 transition-colors" />
                    <i className="ph ph-check absolute text-white text-sm opacity-0 peer-checked:opacity-100 pointer-events-none" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    {amenity}
                  </span>
                </label>
              ))}
            </div>
            <button className="text-sm font-bold text-green-600 mt-3 hover:text-green-700 transition-colors">
              Show all amenities
            </button>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

          {/* Corporate / Negotiated Rate Code */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 text-sm flex items-center gap-2">
              <i className="ph ph-tag text-green-600" /> Corporate Code
            </h3>
            <p className="text-xs text-slate-500 mb-3">Apply a negotiated rate access code to unlock exclusive deals.</p>
            <input
              type="text"
              value={corporateCode}
              onChange={e => { setCorporateCode(e.target.value); setCorpCodeApplied(false); setCorpCodeError(''); }}
              placeholder="e.g. CORP2024"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
            />
            <button
              onClick={handleApplyCorporateCode}
              disabled={!corporateCode.trim() || corpCodeLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold py-2 rounded-lg transition-colors"
            >
              {corpCodeLoading ? 'Applying…' : 'Apply Code'}
            </button>
            {corpCodeApplied && (
              <div className="mt-2 flex items-center gap-2 text-xs font-bold text-green-600">
                <i className="ph-fill ph-check-circle" /> Corporate rate applied!
              </div>
            )}
            {corpCodeError && (
              <div className="mt-2 text-xs font-bold text-red-500">{corpCodeError}</div>
            )}
          </div>
        </div>

        {/* Center: Results List */}
        <div className="flex-1 lg:max-w-2xl xl:max-w-3xl flex flex-col gap-4">

          {/* Loading skeleton */}
          {loading && (
            <div className="flex flex-col gap-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col sm:flex-row animate-pulse">
                  <div className="w-full sm:w-[280px] h-[200px] bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                    <div className="mt-auto h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 self-end" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error / fallback notice */}
          {!loading && searchError && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold">
              <i className="ph ph-warning-circle text-lg shrink-0" />
              {searchError}
            </div>
          )}

          {!loading && results.length > 0 && results.map((hotel) => (
            <div 
              key={hotel.id} 
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col sm:flex-row cursor-pointer"
              onMouseEnter={() => setHoveredHotel(hotel.id)}
              onMouseLeave={() => setHoveredHotel(null)}
              onClick={() => {
                sessionStorage.setItem('stays_selected_hotel', JSON.stringify(hotel));
                navigate(`/stays/details?id=${encodeURIComponent(hotel.id)}&search_result_id=${encodeURIComponent(hotel.duffelResultId)}`);
              }}
            >
              {/* Image Section */}
              <div className="w-full sm:w-[280px] h-[200px] relative shrink-0">
                <img src={hotel.image} alt={hotel.name} className="w-full h-full object-cover" />
                <button className="absolute top-3 left-3 w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-slate-600 hover:text-red-500 transition-colors shadow-sm">
                  <i className="ph ph-heart text-lg" />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  <div className="w-1.5 h-1.5 bg-white/50 rounded-full"></div>
                  <div className="w-1.5 h-1.5 bg-white/50 rounded-full"></div>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4 flex-1 flex flex-col relative bg-white dark:bg-slate-800">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{hotel.name}</h3>
                      <button className="text-slate-400 hover:text-slate-600 px-2 py-1 border border-slate-200 rounded text-xs font-semibold flex items-center gap-1 hidden sm:flex">
                        <i className="ph ph-arrows-left-right" /> Compare
                      </button>
                    </div>
                    {hotel.brand && <p className="text-xs font-bold text-slate-500 mb-1">{hotel.brand}</p>}
                    <p className="text-slate-500 text-xs mb-2">{hotel.address}</p>
                    
                    <div className="flex items-center gap-2">
                      <div className="bg-green-600 text-white px-1.5 py-0.5 rounded text-xs font-bold">{Number(hotel.rating).toFixed(1)}</div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Very good <span className="text-slate-400 font-normal">({hotel.reviews})</span></span>
                      <div className="flex text-[10px] text-slate-800 ml-1">
                        <i className="ph-fill ph-star" />
                        <i className="ph-fill ph-star" />
                        <i className="ph-fill ph-star" />
                        <i className="ph-fill ph-star" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex items-end justify-between pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-black italic text-slate-400">BookingCart Deals</div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-2">${hotel.price}</p>
                    <button className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto shadow-sm">
                      View Deal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Side: Map (Sticky) */}
        <div className="hidden xl:block w-[350px] 2xl:w-[450px] shrink-0">
          <div className="sticky top-[140px] h-[calc(100vh-160px)] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner relative">
            <MapContainer center={mapCenter} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                maxZoom={19}
              />
              <MapFlyTo center={mapCenter} />
              
              {results.map((hotel) => {
                const isSelected = hoveredHotel === hotel.id;
                const accId = hotel.accommodation?.id || hotel.duffelId || hotel.id;
                return (
                  <Marker
                    key={hotel.id}
                    position={[hotel.lat, hotel.lng]}
                    icon={createPriceIcon(hotel.price, isSelected)}
                    eventHandlers={{ 
                      mouseover: () => setHoveredHotel(hotel.id),
                      mouseout: () => setHoveredHotel(null),
                      click: () => {
                        sessionStorage.setItem('stays_selected_hotel', JSON.stringify(hotel));
                        navigate(`/stays/details?id=${encodeURIComponent(hotel.id)}&search_result_id=${encodeURIComponent(hotel.duffelResultId)}`);
                      }
                    }}
                  />
                );
              })}
            </MapContainer>

            {/* Custom Zoom Controls */}
            <div className="absolute bottom-4 right-4 flex flex-col bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden z-[1000]">
              <button onClick={() => document.querySelector('.leaflet-control-zoom-in')?.click()} className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 border-b border-slate-100 font-bold">+</button>
              <button onClick={() => document.querySelector('.leaflet-control-zoom-out')?.click()} className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 font-bold">−</button>
            </div>
            
            {/* Map Search Overlay */}
            <div className="absolute top-4 left-4 right-4 z-[1000]">
               <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                 <i className="ph ph-magnifying-glass text-lg ml-2" />
                 <input type="text" placeholder="Search on map" className="bg-transparent border-none outline-none w-full text-sm font-semibold" />
               </div>
            </div>
          </div>
        </div>
      </main>
      <FlightFooter />
    </div>
  );
}
