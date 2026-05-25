import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── ADSB Proxy (via our own server to avoid CORS) ────────────────────────────
const ADSB_PROXY = '/api/adsb';
const REFRESH_INTERVAL = 15000; // 15 seconds

// ─── Build a rotated aircraft SVG icon ────────────────────────────────────────
const createPlaneIcon = (heading = 0, isSelected = false) => {
  const color = isSelected ? '#16a34a' : '#0ea5e9'; // Green if selected, blue otherwise
  const size = isSelected ? 28 : 20;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      style="transform:rotate(${heading}deg);transform-origin:center;display:block;">
      <filter id="shadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
      <path filter="url(#shadow)"
        fill="${color}"
        stroke="${isSelected ? '#fff' : '#fff'}"
        stroke-width="${isSelected ? 2 : 1.5}"
        d="M12 2.5L8.5 10H5l1.5 2.5H10l-1 5H7l1 2 4-1 4 1 1-2h-2l-1-5h3.5L17 10h-3.5L12 2.5z"/>
    </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

// ─── Airline code → name lookup ───────────────────────────────────────────────
const AIRLINE_NAMES = {
  RWD:'RwandAir', ETH:'Ethiopian Airlines', KQA:'Kenya Airways',
  UAE:'Emirates', QTR:'Qatar Airways', BAW:'British Airways',
  DLH:'Lufthansa', AFR:'Air France', KLM:'KLM', DAL:'Delta',
  AAL:'American Airlines', UAL:'United Airlines', RYR:'Ryanair',
  EZY:'easyJet', TUR:'Turkish Airlines', MSR:'EgyptAir',
  SAA:'South African', MGL:'Air Madagascar', CCA:'Air China',
  SIA:'Singapore Airlines', THA:'Thai Airways', VIR:'Virgin Atlantic',
  AIC:'Air India', EIN:'Aer Lingus', IBE:'Iberia', AZA:'Alitalia',
  SWR:'Swiss', AUA:'Austrian', FIN:'Finnair', SAS:'Scandinavian',
  THY:'Turkish Airlines',
};
const getAirlineName = (callsign) => {
  if (!callsign) return 'Unknown';
  const code = callsign.trim().substring(0, 3).toUpperCase();
  return AIRLINE_NAMES[code] || callsign.trim();
};

const IATA_TO_ICAO = {
  'RW': 'RWD', 'WB': 'RWD', 'ET': 'ETH', 'KQ': 'KQA', 'EK': 'UAE',
  'QR': 'QTR', 'BA': 'BAW', 'LH': 'DLH', 'AF': 'AFR', 'KL': 'KLM',
  'DL': 'DAL', 'AA': 'AAL', 'UA': 'UAL', 'FR': 'RYR', 'U2': 'EZY',
  'TK': 'THY', 'MS': 'MSR', 'SA': 'SAA', 'SQ': 'SIA', 'AI': 'AIC'
};

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmtAlt = (m) => m != null ? `${Math.round(m * 3.281)}ft / ${Math.round(m)}m` : 'N/A';
const fmtSpd = (ms) => ms != null ? `${Math.round(ms * 1.944)} kt` : 'N/A';
const fmtHead = (deg) => {
  if (deg == null) return 'N/A';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return `${dirs[Math.round(deg / 45) % 8]} ${Math.round(deg)}°`;
};

// ─── Viewport tracker ─────────────────────────────────────────────────────────
function BoundsTracker({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  });
  useEffect(() => { onBoundsChange(map.getBounds()); }, []);
  return null;
}

// ─── Map center jump ──────────────────────────────────────────────────────────
function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.0 });
  }, [target]);
  return null;
}

// ─── Removed Static Schedule Board ──────────────────────────────────────────────

// ─── Quick-jump airports ──────────────────────────────────────────────────────
const AIRPORTS = [
  { city: 'New York', code: 'JFK', lat: 40.6413, lng: -73.7781, zoom: 10 },
  { city: 'New York', code: 'EWR', lat: 40.6925, lng: -74.1686, zoom: 10 },
  { city: 'Los Angeles', code: 'LAX', lat: 33.9416, lng: -118.4085, zoom: 10 },
  { city: 'Chicago', code: 'ORD', lat: 41.9742, lng: -87.9073, zoom: 10 },
  { city: 'San Francisco', code: 'SFO', lat: 37.6213, lng: -122.3790, zoom: 10 },
  { city: 'Miami', code: 'MIA', lat: 25.7959, lng: -80.2870, zoom: 10 },
  { city: 'London', code: 'LHR', lat: 51.4700, lng: -0.4543, zoom: 10 },
  { city: 'London', code: 'LGW', lat: 51.1537, lng: -0.1821, zoom: 10 },
  { city: 'Paris', code: 'CDG', lat: 49.0097, lng: 2.5479, zoom: 10 },
  { city: 'Amsterdam', code: 'AMS', lat: 52.3105, lng: 4.7683, zoom: 10 },
  { city: 'Frankfurt', code: 'FRA', lat: 50.0379, lng: 8.5622, zoom: 10 },
  { city: 'Dubai', code: 'DXB', lat: 25.2532, lng: 55.3657, zoom: 10 },
  { city: 'Doha', code: 'DOH', lat: 25.2730, lng: 51.6080, zoom: 10 },
  { city: 'Cairo', code: 'CAI', lat: 30.1219, lng: 31.4056, zoom: 10 },
  { city: 'Mumbai', code: 'BOM', lat: 19.0902, lng: 72.8628, zoom: 10 },
  { city: 'Delhi', code: 'DEL', lat: 28.5562, lng: 77.1000, zoom: 10 },
  { city: 'Tokyo', code: 'HND', lat: 35.5494, lng: 139.7798, zoom: 10 },
  { city: 'Tokyo', code: 'NRT', lat: 35.7720, lng: 140.3929, zoom: 10 },
  { city: 'Seoul', code: 'ICN', lat: 37.4602, lng: 126.4407, zoom: 10 },
  { city: 'Singapore', code: 'SIN', lat: 1.3644, lng: 103.9915, zoom: 10 },
  { city: 'Hong Kong', code: 'HKG', lat: 22.3080, lng: 113.9185, zoom: 10 },
  { city: 'Bangkok', code: 'BKK', lat: 13.6900, lng: 100.7501, zoom: 10 },
  { city: 'Sydney', code: 'SYD', lat: -33.9461, lng: 151.1772, zoom: 10 },
  { city: 'Toronto', code: 'YYZ', lat: 43.6777, lng: -79.6248, zoom: 10 },
  { city: 'São Paulo', code: 'GRU', lat: -23.4356, lng: -46.4731, zoom: 10 },
  { city: 'Nairobi', code: 'NBO', lat: -1.3192, lng: 36.9278, zoom: 10 },
  { city: 'Entebbe', code: 'EBB', lat: 0.0424, lng: 32.4435, zoom: 10 },
  { city: 'Kigali', code: 'KGL', lat: -1.9686, lng: 30.1395, zoom: 10 },
  { city: 'Addis Ababa', code: 'ADD', lat: 8.9778, lng: 38.7993, zoom: 10 },
  { city: 'Johannesburg', code: 'JNB', lat: -26.1367, lng: 28.2411, zoom: 10 },
  { city: 'Lagos', code: 'LOS', lat: 6.5774, lng: 3.3215, zoom: 10 }
];

function getNearestAirport(lat, lng) {
  let minD = Infinity;
  let nearest = AIRPORTS[6]; // default LHR
  const toRad = x => x * Math.PI / 180;
  for (const ap of AIRPORTS) {
    const R = 6371;
    const dLat = toRad(ap.lat - lat);
    const dLon = toRad(ap.lng - lng);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat)) * Math.cos(toRad(ap.lat)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    if (d < minD) {
      minD = d;
      nearest = ap;
    }
  }
  return nearest;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FlightTrackerPage() {
  const [flights, setFlights] = useState([]);
  const [selected, setSelected] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [boardTab, setBoardTab] = useState('dep');
  const [trackerTab, setTrackerTab] = useState('flight');
  const [nearestAirport, setNearestAirport] = useState(AIRPORTS[6]);
  const [flightSearch, setFlightSearch] = useState({ airline: '', flightNumber: '', date: '2026-05-24' });
  const [airportSearch, setAirportSearch] = useState({ airport: '', airline: '', date: '2026-05-24', time: 'Morning 6:00am - 12:00pm' });
  const [searchLoading, setSearchLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [searchVal, setSearchVal] = useState('');
  const [totalInView, setTotalInView] = useState(0);
  const timerRef = useRef(null);
  const animRef = useRef(null);
  const countRef = useRef(null);
  const boundsRef = useRef(null);
  const flightsRef = useRef([]); // To hold the latest flights for the animation loop

  const handleTrackFlight = async () => {
    setFormError('');
    if (trackerTab === 'flight') {
      let air = flightSearch.airline.trim().toUpperCase();
      if (IATA_TO_ICAO[air]) air = IATA_TO_ICAO[air];
      const num = flightSearch.flightNumber.trim().toUpperCase();
      const callsign = air + num;
      if (!callsign) {
        setFormError('Please enter a flight number.');
        return;
      }
      
      setSearchLoading(true);
      try {
        const res = await fetch(`${ADSB_PROXY}/callsign/${encodeURIComponent(callsign)}`);
        if (!res.ok) throw new Error('Live data not found for this flight.');
        const data = await res.json();
        const plane = data.ac && data.ac.length > 0 ? data.ac[0] : null;
        if (plane && plane.lat && plane.lon) {
           setFlyTarget({ lat: plane.lat, lng: plane.lon, zoom: 8 });
           setSearchVal(callsign);
        } else {
           setFormError('Flight not currently airborne or in coverage.');
        }
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSearchLoading(false);
      }
    } else {
      const code = airportSearch.airport.trim().toUpperCase();
      if (!code) {
        setFormError('Please enter an airport.');
        return;
      }
      
      setSearchLoading(true);
      try {
        const found = AIRPORTS.find(a => a.code === code || a.city.toUpperCase().startsWith(code));
        if (found) {
          setFlyTarget(found);
        } else {
          // Global airport search via Nominatim
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(airportSearch.airport + ' airport')}&format=json&limit=1`);
          const data = await res.json();
          if (data && data.length > 0) {
            setFlyTarget({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), zoom: 10 });
          } else {
            setFormError(`Airport not found: ${airportSearch.airport}`);
          }
        }
      } catch (err) {
        setFormError('Error searching for airport.');
      } finally {
        setSearchLoading(false);
      }
    }
  };

  // Fetch from ADSB.lol
  const fetchFlights = useCallback(async () => {
    if (!boundsRef.current) return;
    setLoading(true);
    setError(null);
    const b = boundsRef.current;
    
    // Calculate center and radius (nautical miles)
    const center = b.getCenter();
    const latDiff = Math.abs(b.getNorth() - b.getSouth());
    const lngDiff = Math.abs(b.getEast() - b.getWest());
    // 1 degree is roughly 60 nautical miles. Max ADSB.lol radius is 250nm.
    const radiusNm = Math.min(Math.ceil(Math.max(latDiff, lngDiff) * 30), 250);

    let parsed = [];
    try {
      const url = `${ADSB_PROXY}/area?lat=${center.lat.toFixed(3)}&lon=${center.lng.toFixed(3)}&dist=${radiusNm}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      parsed = (data.ac || [])
        .filter(s => s.lat != null && s.lon != null) // has position
        .map(s => ({
          icao24: s.hex,
          callsign: (s.flight || '').trim() || s.r || s.hex, // fallback to registration or hex
          origin: s.type || '', // ADSB.lol doesn't provide origin country, so use aircraft type
          lng: s.lon,
          lat: s.lat,
          alt: s.alt_baro != null && s.alt_baro !== 'ground' ? s.alt_baro * 0.3048 : 0, // convert feet to meters
          onGround: s.alt_baro === 'ground',
          speed: s.gs != null ? s.gs * 0.514444 : 0, // convert knots to m/s
          heading: s.track || s.mag_heading || s.true_heading || 0,
          vertRate: s.baro_rate || 0,
          isSim: false
        }));
    } catch (err) {
      console.warn('ADSB API failed.', err);
      setError('Live data temporarily unavailable. Retrying…');
    }

    flightsRef.current = parsed;
    setFlights(parsed);
    setTotalInView(parsed.length);
    setLastUpdate(new Date());
    setCountdown(REFRESH_INTERVAL / 1000);
    setLoading(false);
  }, []);

  // Smooth local animation loop (updates positions locally every 1 second based on speed/heading)
  useEffect(() => {
    animRef.current = setInterval(() => {
      setFlights(currentFlights => {
        const nextFlights = currentFlights.map(f => {
          if (!f.speed || !f.heading || f.onGround) return f;
          // Speed is m/s. 1 degree lat is approx 111km.
          const distKm = (f.speed * 1) / 1000; // dist in 1 sec
          const latRad = f.lat * (Math.PI / 180);
          const deltaLat = (distKm * Math.cos(f.heading * (Math.PI / 180))) / 111.32;
          const deltaLng = (distKm * Math.sin(f.heading * (Math.PI / 180))) / (111.32 * Math.cos(latRad));
          return { ...f, lat: f.lat + deltaLat, lng: f.lng + deltaLng };
        });
        flightsRef.current = nextFlights;
        
        // Update selected if it moved
        setSelected(s => {
          if (!s) return null;
          const updated = nextFlights.find(nf => nf.icao24 === s.icao24);
          return updated || s;
        });
        return nextFlights;
      });
    }, 1000);
    return () => clearInterval(animRef.current);
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    timerRef.current = setInterval(fetchFlights, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchFlights]);

  // Geolocation on load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 9 });
        },
        (err) => console.warn('Geolocation failed or denied', err)
      );
    }
  }, []);

  // Countdown ticker
  useEffect(() => {
    countRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? REFRESH_INTERVAL / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(countRef.current);
  }, []);

  // Fetch when bounds change
  const handleBoundsChange = useCallback((b) => {
    boundsRef.current = b;
    setBounds(b);
    fetchFlights();
    
    const center = b.getCenter();
    setNearestAirport(getNearestAirport(center.lat, center.lng));
  }, [fetchFlights]);

  // Filter by search
  const displayed = searchVal.trim()
    ? flights.filter(f => f.callsign.toLowerCase().includes(searchVal.toLowerCase()))
    : flights;

  const handleSelectFlight = (f) => setSelected(s => s?.icao24 === f.icao24 ? null : f);

  const handleAirportJump = (ap) => {
    setFlyTarget(ap);
    setTimeout(() => setFlyTarget(null), 100);
  };

  return (
    <div className="flex flex-col bg-slate-50" style={{ height: 'calc(100vh - 80px)' }}>

      {/* ── Top control bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Title + live badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shadow-md shadow-green-200">
              <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2L8.5 10H5l1.5 2.5H10l-1 5H7l1 2 4-1 4 1 1-2h-2l-1-5h3.5L17 10h-3.5L12 2.5z"/></svg>
            </div>
            <div>
              <p className="text-slate-900 font-black text-sm leading-tight">Live Radar</p>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-green-600 font-bold">
                  {loading ? 'Updating…' : `${totalInView} aircraft in view`}
                </span>
              </div>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200 hidden sm:block" />

          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-[220px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder="Search callsign…"
              className="w-full bg-slate-100 border border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-green-500/60"
            />
          </div>

          {/* Quick-jump airports */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
            {AIRPORTS.map(ap => (
              <button
                key={ap.code}
                onClick={() => handleAirportJump(ap)}
                className="flex-shrink-0 bg-white hover:bg-green-50 border border-slate-200 hover:border-green-300 text-slate-600 hover:text-green-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-sm"
              >
                {ap.code}
              </button>
            ))}
          </div>

          {/* Refresh button + countdown */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {countdown}s
            </div>
            <button
              onClick={fetchFlights}
              disabled={loading}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm disabled:opacity-50"
            >
              <svg className={loading ? 'animate-spin' : ''} width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.1"/></svg>
              Refresh
            </button>
          </div>

          {/* Last update */}
          {lastUpdate && (
            <span className="hidden md:block text-[10px] text-slate-500 font-semibold flex-shrink-0">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-1.5 flex items-center gap-2 text-amber-600 text-[10px] font-semibold">
            <svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>
            {error}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── Left Tracker Search Overlay ── */}
        <div className="absolute top-6 left-6 z-[1000] w-[400px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
          <div className="p-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-5">Flight Tracker</h2>
            
            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-5">
              <button
                onClick={() => setTrackerTab('flight')}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors mr-6 ${trackerTab === 'flight' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Flight number
              </button>
              <button
                onClick={() => setTrackerTab('airport')}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${trackerTab === 'airport' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Airport
              </button>
            </div>

            {/* Flight number tab */}
            {trackerTab === 'flight' && (
              <div className="space-y-3">
                <input type="text" placeholder="Airline" value={flightSearch.airline} onChange={e => setFlightSearch({...flightSearch, airline: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" />
                <input type="text" placeholder="Flight Number" value={flightSearch.flightNumber} onChange={e => setFlightSearch({...flightSearch, flightNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" />
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H32V48ZM208,208H48V96H208V208Z"></path></svg>
                  <input type="date" value={flightSearch.date} onChange={e => setFlightSearch({...flightSearch, date: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-11 pr-4 py-3.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" style={{ colorScheme: 'light' }} />
                </div>
              </div>
            )}

            {/* Airport tab */}
            {trackerTab === 'airport' && (
              <div className="space-y-3">
                <input type="text" placeholder="Airport (required)" value={airportSearch.airport} onChange={e => setAirportSearch({...airportSearch, airport: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" />
                <input type="text" placeholder="Airline (optional)" value={airportSearch.airline} onChange={e => setAirportSearch({...airportSearch, airline: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" />
                <div className="flex gap-3">
                  <div className="relative w-1/2">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H32V48ZM208,208H48V96H208V208Z"></path></svg>
                    <input type="date" value={airportSearch.date} onChange={e => setAirportSearch({...airportSearch, date: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-11 pr-2 py-3.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors" style={{ colorScheme: 'light' }} />
                  </div>
                  <div className="w-1/2 relative">
                    <select value={airportSearch.time} onChange={e => setAirportSearch({...airportSearch, time: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-3.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-colors appearance-none">
                      <option>Morning 6:00am - 12:00pm</option>
                      <option>Afternoon 12:00pm - 6:00pm</option>
                      <option>Evening 6:00pm - 12:00am</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            )}

            {formError && (
              <div className="mt-3 text-red-500 text-xs font-semibold px-1">{formError}</div>
            )}

            <button onClick={handleTrackFlight} disabled={searchLoading} className="w-full bg-[#ff5a30] hover:bg-[#ff4515] text-white font-bold py-3.5 rounded-lg mt-5 transition-colors shadow-md disabled:opacity-70 flex items-center justify-center gap-2">
              {searchLoading ? <svg className="animate-spin" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.1"/></svg> : null}
              Track Flight
            </button>
          </div>
        </div>

        {/* ── Live Radar Map ── */}
        <div className="flex-1 relative z-0">
          <MapContainer
            center={[51.48, -0.46]}
            zoom={8}
            style={{ width: '100%', height: '100%', background: '#e2e8f0' }}
            zoomControl={false}
          >
            {/* Light map tiles */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> | Flight data: <a href="https://opensky-network.org">OpenSky Network</a>'
              subdomains="abcd"
              maxZoom={19}
            />

            <BoundsTracker onBoundsChange={handleBoundsChange} />
            <MapFlyTo target={flyTarget} />

            {/* Aircraft markers */}
            {displayed.map(f => (
              <Marker
                key={f.icao24}
                position={[f.lat, f.lng]}
                icon={createPlaneIcon(f.heading, selected?.icao24 === f.icao24)}
                eventHandlers={{ click: () => handleSelectFlight(f) }}
              />
            ))}
          </MapContainer>

          {/* Zoom controls */}
          <div className="absolute bottom-6 right-4 flex flex-col bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 overflow-hidden z-[1000]">
            <button onClick={() => document.querySelector('.leaflet-control-zoom-in')?.click()} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-b border-slate-200 text-xl font-light transition-colors">+</button>
            <button onClick={() => document.querySelector('.leaflet-control-zoom-out')?.click()} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xl font-light transition-colors">−</button>
          </div>

          {/* Hide default zoom */}
          <style>{`.leaflet-control-zoom{display:none!important}.leaflet-attribution-flag{display:none!important}`}</style>

          {/* Legend */}
          <div className="absolute bottom-6 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-slate-200 px-3 py-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#0ea5e9" d="M12 2.5L8.5 10H5l1.5 2.5H10l-1 5H7l1 2 4-1 4 1 1-2h-2l-1-5h3.5L17 10h-3.5L12 2.5z"/></svg>
              <span className="text-[10px] text-slate-600 font-semibold">Aircraft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#16a34a" d="M12 2.5L8.5 10H5l1.5 2.5H10l-1 5H7l1 2 4-1 4 1 1-2h-2l-1-5h3.5L17 10h-3.5L12 2.5z"/></svg>
              <span className="text-[10px] text-slate-600 font-semibold">Selected</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
                        <span className="text-[10px] text-slate-500 font-medium">OpenSky · Live</span>
          </div>

          {/* Selected flight popup */}
          {selected && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-4 w-[300px]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-slate-900 font-black text-lg tracking-tight">{selected.callsign}</p>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">{getAirlineName(selected.callsign)}</p>
                  {selected.origin && <p className="text-slate-400 text-[10px] mt-0.5">Aircraft Type: {selected.origin}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Altitude',  value: fmtAlt(selected.alt),    icon:'M5 12h14M12 5l7 7-7 7' },
                  { label:'Speed',     value: fmtSpd(selected.speed),   icon:'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
                  { label:'Heading',   value: fmtHead(selected.heading),icon:'M12 2L12 22M2 12L22 12' },
                  { label:'Position',  value: `${selected.lat.toFixed(2)}°, ${selected.lng.toFixed(2)}°`, icon:'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-slate-900 text-xs font-bold leading-tight">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium">ICAO24: <span className="font-mono text-slate-700">{selected.icao24}</span></span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selected.onGround ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                  {selected.onGround ? 'On Ground' : 'Airborne'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Live Area Traffic Board ── */}
        <div className="w-[300px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden relative z-10 pointer-events-auto">

          {/* Board header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg width="13" height="13" fill="#16a34a" viewBox="0 0 24 24"><path d="M12 2.5L8.5 10H5l1.5 2.5H10l-1 5H7l1 2 4-1 4 1 1-2h-2l-1-5h3.5L17 10h-3.5L12 2.5z"/></svg>
                </div>
                <div>
                  <p className="text-slate-900 font-black text-sm leading-tight">{nearestAirport ? `${nearestAirport.city} ${nearestAirport.code}` : 'Live Area Traffic'}</p>
                  <p className="text-slate-500 text-[9px] font-medium">Nearest airport to map center</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[9px] text-green-700 font-bold">LIVE</span>
              </div>
            </div>
          </div>

          {/* Column labels */}
          <div className="grid grid-cols-[60px_1fr_40px] gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50">
            {['FLIGHT', 'DETAILS', 'ALT'].map(h => (
              <span key={h} className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {/* Flights list */}
          <div className="flex-1 overflow-y-auto">
            {displayed.length === 0 ? (
               <div className="p-8 text-center text-slate-400 text-xs font-medium">No aircraft detected in this area.</div>
            ) : displayed.map(f => (
                <div
                  key={f.icao24}
                  onClick={() => handleSelectFlight(f)}
                  className={`grid grid-cols-[60px_1fr_40px] gap-2 items-center px-4 py-3 border-b border-slate-50 transition-colors cursor-pointer group ${selected?.icao24 === f.icao24 ? 'bg-green-50' : 'hover:bg-slate-50'}`}
                >
                  <div>
                    <div className={`text-xs font-black leading-tight ${selected?.icao24 === f.icao24 ? 'text-green-700' : 'text-slate-800 group-hover:text-green-600'}`}>{f.callsign}</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">{f.icao24}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-700 truncate" title={getAirlineName(f.callsign)}>{getAirlineName(f.callsign)}</div>
                    <div className="text-[9px] text-slate-500 truncate">{fmtSpd(f.speed)} • {fmtHead(f.heading)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-slate-800">{f.onGround ? 'GND' : Math.round(f.alt * 3.281)}</div>
                    {!f.onGround && <div className="text-[8px] text-slate-400">ft</div>}
                  </div>
                </div>
            ))}
          </div>

          {/* Board footer stats */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <div className="grid grid-cols-2 gap-2 text-center mb-2">
              <div className="bg-white border border-slate-100 shadow-sm rounded-lg py-1.5">
                <p className="text-green-600 font-black text-sm">{totalInView}</p>
                <p className="text-[8px] text-slate-500 font-bold">In Area</p>
              </div>
              <div className="bg-white border border-slate-100 shadow-sm rounded-lg py-1.5">
                <p className="text-blue-600 font-black text-sm">{displayed.filter(f => !f.onGround).length}</p>
                <p className="text-[8px] text-slate-500 font-bold">Airborne</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-500 font-medium text-center">
              Aircraft data: <span className="text-slate-400">OpenSky Network</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
