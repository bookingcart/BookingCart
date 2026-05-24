import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── ADSB.lol API — real live flight data, excellent global coverage ──────────
const ADSB_URL = 'https://api.adsb.lol/v2';
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

// ─── Static EBB schedule board ────────────────────────────────────────────────
const EBB_BOARD = [
  { flight:'RW101', airline:'RwandAir',          dest:'Kigali',      code:'KGL', time:'06:30', status:'On Time',  type:'dep', logo:'🇷🇼' },
  { flight:'ET311', airline:'Ethiopian Airlines', dest:'Addis Ababa', code:'ADD', time:'07:15', status:'On Time',  type:'dep', logo:'🇪🇹' },
  { flight:'QR543', airline:'Qatar Airways',      dest:'Doha',        code:'DOH', time:'08:00', status:'Boarding', type:'dep', logo:'🇶🇦' },
  { flight:'KQ441', airline:'Kenya Airways',      dest:'Nairobi',     code:'NBO', time:'09:20', status:'On Time',  type:'dep', logo:'🇰🇪' },
  { flight:'EK729', airline:'Emirates',           dest:'Dubai',       code:'DXB', time:'10:45', status:'On Time',  type:'dep', logo:'🇦🇪' },
  { flight:'RW204', airline:'RwandAir',           dest:'Nairobi',     code:'NBO', time:'11:30', status:'Delayed',  type:'dep', logo:'🇷🇼' },
  { flight:'ET847', airline:'Ethiopian',          dest:'London',      code:'LHR', time:'13:00', status:'On Time',  type:'dep', logo:'🇪🇹' },
  { flight:'RW102', airline:'RwandAir',           dest:'Kigali',      code:'KGL', time:'06:10', status:'Landed',   type:'arr', logo:'🇷🇼' },
  { flight:'ET312', airline:'Ethiopian Airlines', dest:'Addis Ababa', code:'ADD', time:'06:55', status:'Landed',   type:'arr', logo:'🇪🇹' },
  { flight:'KQ442', airline:'Kenya Airways',      dest:'Nairobi',     code:'NBO', time:'08:40', status:'Arrived',  type:'arr', logo:'🇰🇪' },
  { flight:'EK730', airline:'Emirates',           dest:'Dubai',       code:'DXB', time:'09:50', status:'On Time',  type:'arr', logo:'🇦🇪' },
  { flight:'QR545', airline:'Qatar Airways',      dest:'Doha',        code:'DOH', time:'11:15', status:'On Time',  type:'arr', logo:'🇶🇦' },
  { flight:'MS789', airline:'EgyptAir',           dest:'Cairo',       code:'CAI', time:'15:20', status:'On Time',  type:'arr', logo:'🇪🇬' },
];
const STATUS_S = {
  'On Time':  { bg:'bg-green-100',  text:'text-green-700',  dot:'bg-green-500'  },
  'Boarding': { bg:'bg-blue-100',   text:'text-blue-700',   dot:'bg-blue-500'   },
  'Delayed':  { bg:'bg-amber-100',  text:'text-amber-700',  dot:'bg-amber-500'  },
  'Landed':   { bg:'bg-slate-100',  text:'text-slate-500',  dot:'bg-slate-400'  },
  'Arrived':  { bg:'bg-slate-100',  text:'text-slate-500',  dot:'bg-slate-400'  },
};

// ─── Quick-jump airports ──────────────────────────────────────────────────────
const AIRPORTS = [
  { code:'EBB', city:'Entebbe',     lat: 0.04,  lng:32.44, zoom:9  },
  { code:'NBO', city:'Nairobi',     lat:-1.32,  lng:36.82, zoom:9  },
  { code:'KGL', city:'Kigali',      lat:-1.97,  lng:30.14, zoom:10 },
  { code:'ADD', city:'Addis Ababa', lat: 8.98,  lng:38.80, zoom:9  },
  { code:'DXB', city:'Dubai',       lat:25.25,  lng:55.36, zoom:9  },
  { code:'LHR', city:'London',      lat:51.48,  lng:-0.46, zoom:9  },
  { code:'JFK', city:'New York',    lat:40.64,  lng:-73.78, zoom:9 },
  { code:'CDG', city:'Paris',       lat:49.00,  lng: 2.55, zoom:9  },
];

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
  const [flyTarget, setFlyTarget] = useState(null);
  const [searchVal, setSearchVal] = useState('');
  const [totalInView, setTotalInView] = useState(0);
  const timerRef = useRef(null);
  const animRef = useRef(null);
  const countRef = useRef(null);
  const boundsRef = useRef(null);
  const flightsRef = useRef([]); // To hold the latest flights for the animation loop

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
      const url = `${ADSB_URL}/lat/${center.lat.toFixed(3)}/lon/${center.lng.toFixed(3)}/dist/${radiusNm}`;
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
      <div className="flex-1 flex overflow-hidden">

        {/* ── Live Radar Map ── */}
        <div className="flex-1 relative">
          <MapContainer
            center={[0.04, 32.44]}
            zoom={6}
            style={{ width: '100%', height: '100%', background: '#e2e8f0' }}
            zoomControl={false}
          >
            {/* Light map tiles */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> | Flight data: <a href="https://adsb.lol">adsb.lol</a>'
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
            <span className="text-[10px] text-slate-500 font-medium">adsb.lol · Live</span>
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

        {/* ── Right: EBB Flight Board ── */}
        <div className="w-[300px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 overflow-hidden">

          {/* Board header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                <svg width="13" height="13" fill="#16a34a" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-black text-sm">Entebbe <span className="text-green-600">EBB</span></p>
                <p className="text-slate-500 text-[9px] font-medium">Entebbe International · EAT (UTC+3)</p>
              </div>
              <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[9px] text-green-700 font-bold">LIVE</span>
              </div>
            </div>

            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {[{key:'dep', label:'✈ Departures'},{key:'arr', label:'🛬 Arrivals'}].map(t => (
                <button
                  key={t.key}
                  onClick={() => setBoardTab(t.key)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${boardTab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column labels */}
          <div className="grid grid-cols-[36px_1fr_44px_52px] gap-1 px-3 py-1.5 border-b border-slate-100">
            {['FLT', boardTab === 'dep' ? 'TO' : 'FROM', 'TIME', 'STATUS'].map(h => (
              <span key={h} className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {/* Flights */}
          <div className="flex-1 overflow-y-auto">
            {EBB_BOARD.filter(f => f.type === boardTab).map((f, i) => {
              const s = STATUS_S[f.status] || STATUS_S['On Time'];
              return (
                <div
                  key={i}
                  className="grid grid-cols-[36px_1fr_44px_52px] gap-1 items-center px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-default group"
                >
                  <div>
                    <div className="text-[9px] font-black text-slate-800 group-hover:text-green-600 leading-tight">{f.flight}</div>
                    <div className="text-[10px]">{f.logo}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-900 truncate">{f.dest}</div>
                    <div className="text-[9px] text-slate-500 font-mono">{f.code}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-slate-800 font-mono">{f.time}</div>
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black ${s.bg} ${s.text}`}>
                      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${s.dot}`} />
                      {f.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Board footer stats */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <div className="grid grid-cols-3 gap-2 text-center mb-2">
              <div className="bg-white border border-slate-100 shadow-sm rounded-lg py-1.5">
                <p className="text-green-600 font-black text-sm">{totalInView}</p>
                <p className="text-[8px] text-slate-500 font-bold">In Air</p>
              </div>
              <div className="bg-white border border-slate-100 shadow-sm rounded-lg py-1.5">
                <p className="text-blue-600 font-black text-sm">{EBB_BOARD.filter(f=>f.type==='dep').length}</p>
                <p className="text-[8px] text-slate-500 font-bold">Departing</p>
              </div>
              <div className="bg-white border border-slate-100 shadow-sm rounded-lg py-1.5">
                <p className="text-amber-600 font-black text-sm">{EBB_BOARD.filter(f=>f.status==='Delayed').length}</p>
                <p className="text-[8px] text-slate-500 font-bold">Delayed</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-500 font-medium text-center">
              Aircraft data: <span className="text-slate-400">adsb.lol API</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
