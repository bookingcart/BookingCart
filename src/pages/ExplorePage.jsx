import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MOCK_DESTINATIONS = [
  { id: 1, city: 'Kigali', country: 'Rwanda', iata: 'KGL', dates: 'May 30 - Jun 7', duration: '23h 40m', tripType: 'round-trip', stops: '1 stop', price: 372, lat: -1.9441, lng: 30.0619, image: 'https://images.unsplash.com/photo-1620216503831-f2f2165aabfc?q=80&w=600&auto=format&fit=crop' },
  { id: 2, city: 'Dar Es Salaam', country: 'Tanzania', iata: 'DAR', dates: 'Jun 3 - Jun 4', duration: '14h 20m', tripType: 'round-trip', stops: '1 stop', price: 214, lat: -6.7924, lng: 39.2083, image: 'https://images.unsplash.com/photo-1542224566-6e85f2e6772f?q=80&w=600&auto=format&fit=crop' },
  { id: 3, city: 'Nairobi', country: 'Kenya', iata: 'NBO', dates: 'May 25 - May 27', duration: '11h 10m', tripType: 'round-trip', stops: 'Nonstop', price: 320, lat: -1.2921, lng: 36.8219, image: 'https://images.unsplash.com/photo-1614531341773-3bff8b7cb3fc?q=80&w=600&auto=format&fit=crop' },
  { id: 4, city: 'Zanzibar', country: 'Tanzania', iata: 'ZNZ', dates: 'May 31 - Jun 1', duration: '15h 00m', tripType: 'round-trip', stops: '1 stop', price: 291, lat: -6.1659, lng: 39.1989, image: 'https://images.unsplash.com/photo-1586861635167-e5223aadc9fe?q=80&w=600&auto=format&fit=crop' },
  { id: 5, city: 'London', country: 'United Kingdom', iata: 'LHR', dates: 'Jul 10 - Jul 20', duration: '8h 30m', tripType: 'round-trip', stops: 'Nonstop', price: 801, lat: 51.5074, lng: -0.1278, image: 'https://images.unsplash.com/photo-1513635269975-5969336cd182?q=80&w=600&auto=format&fit=crop' },
  { id: 6, city: 'New York', country: 'USA', iata: 'JFK', dates: 'Aug 5 - Aug 12', duration: '14h 45m', tripType: 'round-trip', stops: '1 stop', price: 1435, lat: 40.7128, lng: -74.0060, image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=600&auto=format&fit=crop' },
  { id: 7, city: 'Dubai', country: 'UAE', iata: 'DXB', dates: 'Jun 15 - Jun 22', duration: '6h 20m', tripType: 'round-trip', stops: 'Nonstop', price: 519, lat: 25.2048, lng: 55.2708, image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=600&auto=format&fit=crop' },
  { id: 8, city: 'Bangkok', country: 'Thailand', iata: 'BKK', dates: 'Jul 1 - Jul 14', duration: '12h 05m', tripType: 'round-trip', stops: '1 stop', price: 728, lat: 13.7563, lng: 100.5018, image: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=600&auto=format&fit=crop' },
  { id: 9, city: 'Paris', country: 'France', iata: 'CDG', dates: 'Jun 10 - Jun 17', duration: '9h 15m', tripType: 'round-trip', stops: '1 stop', price: 839, lat: 48.8566, lng: 2.3522, image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=600&auto=format&fit=crop' },
  { id: 10, city: 'Mumbai', country: 'India', iata: 'BOM', dates: 'Aug 10 - Aug 20', duration: '5h 55m', tripType: 'round-trip', stops: 'Nonstop', price: 636, lat: 19.0760, lng: 72.8777, image: 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?q=80&w=600&auto=format&fit=crop' },
  { id: 11, city: 'Accra', country: 'Ghana', iata: 'ACC', dates: 'Jun 20 - Jun 27', duration: '8h 40m', tripType: 'round-trip', stops: '1 stop', price: 547, lat: 5.6037, lng: -0.1870, image: 'https://images.unsplash.com/photo-1555990693-c8b0aca65e2a?q=80&w=600&auto=format&fit=crop' },
  { id: 12, city: 'Johannesburg', country: 'South Africa', iata: 'JNB', dates: 'Jul 5 - Jul 12', duration: '9h 30m', tripType: 'round-trip', stops: '1 stop', price: 497, lat: -26.2041, lng: 28.0473, image: 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?q=80&w=600&auto=format&fit=crop' },
  { id: 13, city: 'Cairo', country: 'Egypt', iata: 'CAI', dates: 'Jun 8 - Jun 15', duration: '5h 10m', tripType: 'round-trip', stops: 'Nonstop', price: 387, lat: 30.0444, lng: 31.2357, image: 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?q=80&w=600&auto=format&fit=crop' },
  { id: 14, city: 'São Paulo', country: 'Brazil', iata: 'GRU', dates: 'Aug 15 - Aug 25', duration: '16h 30m', tripType: 'round-trip', stops: '1 stop', price: 1840, lat: -23.5505, lng: -46.6333, image: 'https://images.unsplash.com/photo-1518639192441-8fce0a366e2e?q=80&w=600&auto=format&fit=crop' },
  { id: 15, city: 'Singapore', country: 'Singapore', iata: 'SIN', dates: 'Sep 1 - Sep 10', duration: '14h 20m', tripType: 'round-trip', stops: '1 stop', price: 807, lat: 1.3521, lng: 103.8198, image: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=600&auto=format&fit=crop' },
  { id: 16, city: 'Addis Ababa', country: 'Ethiopia', iata: 'ADD', dates: 'Jun 5 - Jun 10', duration: '2h 15m', tripType: 'round-trip', stops: 'Nonstop', price: 289, lat: 9.1450, lng: 40.4897, image: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?q=80&w=600&auto=format&fit=crop' },
  { id: 17, city: 'Mombasa', country: 'Kenya', iata: 'MBA', dates: 'Jun 1 - Jun 7', duration: '12h 30m', tripType: 'round-trip', stops: '1 stop', price: 506, lat: -4.0435, lng: 39.6682, image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?q=80&w=600&auto=format&fit=crop' },
  { id: 18, city: 'Casablanca', country: 'Morocco', iata: 'CMN', dates: 'Jul 20 - Jul 27', duration: '7h 45m', tripType: 'round-trip', stops: '1 stop', price: 987, lat: 33.5731, lng: -7.5898, image: 'https://images.unsplash.com/photo-1569383746724-6f1b882b8f46?q=80&w=600&auto=format&fit=crop' },
];

// Custom price marker icon factory
const createPriceIcon = (price, isSelected) => {
  const bg = isSelected ? '#1e293b' : 'white';
  const color = isSelected ? 'white' : '#1e293b';
  const border = isSelected ? '#1e293b' : '#cbd5e1';
  const shadow = isSelected ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.15)';
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      color:${color};
      border:1.5px solid ${border};
      border-radius:6px;
      padding:3px 7px;
      font-size:11px;
      font-weight:700;
      white-space:nowrap;
      box-shadow:${shadow};
      font-family:system-ui,-apple-system,sans-serif;
      position:relative;
      cursor:pointer;
      transition:all 0.15s;
    ">${price}</div>`,
    iconSize: [null, null],
    iconAnchor: [0, 0],
  });
};

// Component to fly map to a position
function MapFlyTo({ dest }) {
  const map = useMap();
  useEffect(() => {
    if (dest) {
      map.flyTo([dest.lat, dest.lng], Math.max(map.getZoom(), 6), { duration: 1.2 });
    }
  }, [dest?.id]);
  return null;
}

export default function ExplorePage() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const [selectedDest, setSelectedDest] = useState(null);

  useEffect(() => {
    if (routeId) {
      const parts = routeId.split('-');
      if (parts.length === 2) {
        const destCode = parts[1].toUpperCase();
        const found = MOCK_DESTINATIONS.find(d => d.iata === destCode);
        if (found) setSelectedDest(found);
      }
    } else {
      setSelectedDest(null);
    }
  }, [routeId]);

  const handleSelectDest = (dest) => {
    if (dest) navigate(`/explore/EBB-${dest.iata}`);
    else navigate('/explore');
  };

  return (
    <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden">
      {/* Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[10, 25]}
          zoom={3}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={true}
        >
          {/* OpenStreetMap Tiles — clean light style without country labels spam */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />

          {/* Fly to selected dest */}
          <MapFlyTo dest={selectedDest} />

          {/* Price markers */}
          {MOCK_DESTINATIONS.map(dest => {
            const isSelected = selectedDest?.id === dest.id;
            return (
              <Marker
                key={dest.id}
                position={[dest.lat, dest.lng]}
                icon={createPriceIcon(`$${dest.price}`, isSelected)}
                eventHandlers={{
                  click: () => handleSelectDest(dest),
                }}
              >
                {isSelected && (
                  <Popup closeButton={false} className="explore-popup" offset={[0, -4]}>
                    <div className="text-xs font-bold text-slate-900">
                      {dest.city} — ${dest.price}
                    </div>
                    <button
                      onClick={() => handleSelectDest(dest)}
                      className="text-[10px] text-blue-600 font-semibold mt-1 hover:underline"
                    >
                      View flights →
                    </button>
                  </Popup>
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Custom Zoom Controls (bottom right) */}
      <div className="absolute bottom-8 right-4 flex flex-col bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden z-[1000]">
        <button
          onClick={() => document.querySelector('.leaflet-control-zoom-in')?.click()}
          className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 border-b border-slate-100 transition-colors text-lg font-light"
        >+</button>
        <button
          onClick={() => document.querySelector('.leaflet-control-zoom-out')?.click()}
          className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 transition-colors text-lg font-light"
        >−</button>
      </div>
      {/* Hidden Leaflet zoom controls (we use our own UI) */}
      <style>{`.leaflet-control-zoom { display:none !important; } .leaflet-popup-content-wrapper { border-radius:10px !important; padding:4px 0 !important; box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important; } .leaflet-popup-content { margin: 8px 12px !important; } .leaflet-popup-tip { display:none !important; }`}</style>

      {/* Floating Sidebar */}
      <div className="absolute top-4 bottom-4 left-4 w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[1000]">
        {!selectedDest ? (
          <>
            {/* Search Header */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex gap-1.5 mb-3">
                <div className="flex-1 bg-slate-100 rounded-lg px-3 py-2.5">
                  <input type="text" defaultValue="Entebbe (EBB)" className="w-full bg-transparent border-none text-sm font-semibold text-slate-900 outline-none" />
                </div>
                <div className="flex-1 bg-slate-100 rounded-lg px-3 py-2.5">
                  <input type="text" placeholder="Where to?" className="w-full bg-transparent border-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none" />
                </div>
              </div>
              <div className="bg-slate-100 rounded-lg px-3 py-2.5 mb-3 cursor-pointer hover:bg-slate-200 transition-colors">
                <span className="text-sm text-slate-600 font-medium">Any time, any duration</span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {['Stops', 'Price', 'Flight duration'].map(f => (
                  <button key={f} className="flex items-center gap-1 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 whitespace-nowrap transition-colors">
                    {f} <span className="text-[10px]">▾</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {MOCK_DESTINATIONS.map(dest => (
                <div key={dest.id} onClick={() => handleSelectDest(dest)} className="flex gap-3 px-3 py-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                  <img src={dest.image} alt={dest.city} className="w-[60px] h-[60px] rounded-xl object-cover flex-shrink-0 bg-slate-200" />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <span className="font-bold text-sm text-slate-900 truncate">{dest.city}</span>
                      <button onClick={e => e.stopPropagation()} className="text-slate-300 hover:text-red-400 transition-colors ml-2 flex-shrink-0">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">{dest.dates}</div>
                    <div className="text-[11px] text-slate-400">{dest.stops}</div>
                  </div>
                  <div className="flex items-end pb-0.5 flex-shrink-0">
                    <span className="font-extrabold text-sm text-slate-900">${dest.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Detail View */}
            <div className="relative h-[180px] flex-shrink-0">
              <img src={selectedDest.image} alt={selectedDest.city} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <button onClick={() => handleSelectDest(null)} className="absolute top-3 left-3 w-8 h-8 bg-white/90 backdrop-blur-sm text-slate-900 rounded-full flex items-center justify-center shadow hover:bg-white transition-colors">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {selectedDest.city}<span className="text-orange-500">.</span>
                  </h2>
                  <p className="text-slate-500 text-sm font-medium">{selectedDest.country}</p>
                </div>
                <button className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-400 bg-slate-50 rounded-full transition-colors">
                  <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
                </button>
              </div>

              {/* Cheapest card */}
              <div className="border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-slate-900 mb-0.5">Cheapest</p>
                    <p className="text-[11px] text-slate-400">{selectedDest.dates} · {selectedDest.duration}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-slate-900">${selectedDest.price}</div>
                    <div className="text-[10px] text-slate-400">{selectedDest.tripType}</div>
                  </div>
                </div>
                <button className="w-full bg-[#FF5C35] hover:bg-[#e04a25] text-white font-bold py-3 rounded-lg transition-colors">
                  View flights
                </button>
              </div>

              {/* Nonstop schedule */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-900">Nonstop flights</span>
                  <div className="flex gap-1 items-center">
                    {['blue','red','green'].map((c,i) => (
                      <div key={i} className={`w-5 h-5 rounded-full bg-${c}-100 text-${c}-500 flex items-center justify-center text-[8px] font-bold`}>✈</div>
                    ))}
                    <span className="text-[10px] text-slate-400 font-bold ml-0.5">+10</span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {[{label:'Outbound', route:`EBB-${selectedDest.iata}`},{label:'Return', route:`${selectedDest.iata}-EBB`}].map(({label, route}) => (
                    <div key={label}>
                      <div className="text-xs font-bold text-slate-800 mb-2">{label} <span className="text-slate-400 font-normal ml-1">{route}</span></div>
                      <div className="grid grid-cols-7 gap-1">
                        {['S','M','T','W','T','F','S'].map((d,i) => (
                          <div key={i} className="aspect-square rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {d}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 p-3">
                  <button className="w-full text-sm font-bold text-slate-800 hover:text-orange-500 transition-colors text-center">
                    View nonstop schedule
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
