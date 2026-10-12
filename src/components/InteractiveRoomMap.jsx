import { useState, useEffect, useMemo, useRef } from 'react';

// ─── Status Config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  available: {
    label: 'Available',
    color: 'bg-green-50 border-green-400 text-green-900 hover:border-green-600 hover:shadow-lg hover:shadow-green-500/20 cursor-pointer',
    badge: 'bg-green-600 text-white',
    legendBg: 'bg-green-500',
    icon: 'ph-check'
  },
  selected: {
    label: 'Selected (Held)',
    color: 'bg-green-600 border-green-500 text-white shadow-xl shadow-green-600/40 ring-4 ring-green-300 scale-105 cursor-pointer',
    badge: 'bg-white text-green-700',
    legendBg: 'bg-green-600',
    icon: 'ph-check-circle-fill'
  },
  booked: {
    label: 'Booked',
    color: 'bg-rose-50 border-rose-300 text-rose-800 opacity-60 cursor-not-allowed',
    badge: 'bg-rose-600 text-white',
    legendBg: 'bg-rose-500',
    icon: 'ph-lock-key-fill'
  },
  occupied: {
    label: 'Occupied',
    color: 'bg-amber-50 border-amber-300 text-amber-900 opacity-60 cursor-not-allowed',
    badge: 'bg-amber-500 text-white',
    legendBg: 'bg-amber-500',
    icon: 'ph-user-fill'
  },
  blocked: {
    label: 'Blocked',
    color: 'bg-slate-100 border-slate-300 text-slate-500 opacity-50 cursor-not-allowed',
    badge: 'bg-slate-500 text-white',
    legendBg: 'bg-slate-400',
    icon: 'ph-prohibit-fill'
  },
  maintenance: {
    label: 'Maintenance',
    color: 'bg-yellow-50 border-yellow-400 text-yellow-900 opacity-60 cursor-not-allowed',
    badge: 'bg-yellow-500 text-white',
    legendBg: 'bg-yellow-500',
    icon: 'ph-wrench-fill'
  },
  held: {
    label: 'Reserved (Held)',
    color: 'bg-purple-50 border-purple-300 text-purple-900 opacity-60 cursor-not-allowed',
    badge: 'bg-purple-600 text-white',
    legendBg: 'bg-purple-500',
    icon: 'ph-clock-fill'
  }
};

const VIEW_ICONS = {
  'Sea View': 'ph-waves',
  'Garden View': 'ph-tree-evergreen',
  'City View': 'ph-buildings',
  'Pool View': 'ph-swimming-pool',
  'Sunset View': 'ph-sun-horizon',
  '360 Panoramic View': 'ph-compass',
  'Standard': 'ph-buildings',
  'Courtyard View': 'ph-tree',
  'Mountain View': 'ph-mountains'
};

export default function InteractiveRoomMap({
  hotelId,
  checkIn,
  checkOut,
  guests = 2,
  onRoomSelect,
  selectedRoom: initialSelectedRoom = null,
  currency = '$'
}) {
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active selection & drawer state
  const [selectedRoom, setSelectedRoom] = useState(initialSelectedRoom);
  const [drawerRoom, setDrawerRoom] = useState(null);
  const [holdTimer, setHoldTimer] = useState(0);
  const [holding, setHolding] = useState(false);

  // Anonymous guest session token for 10-minute hold lock
  const [sessionId] = useState(() => {
    let sid = sessionStorage.getItem('bc_pms_guest_sid');
    if (!sid) {
      sid = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem('bc_pms_guest_sid', sid);
    }
    return sid;
  });

  // Dynamic filter state
  const [maxPriceFilter, setMaxPriceFilter] = useState(1000);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [viewFilter, setViewFilter] = useState('all');
  const [balconyOnly, setBalconyOnly] = useState(false);
  const [accessibleOnly, setAccessibleOnly] = useState(false);

  const availableRoomTypes = useMemo(() => {
    return Array.from(new Set(rooms.map(r => r.room_type).filter(Boolean)));
  }, [rooms]);

  const availableViews = useMemo(() => {
    return Array.from(new Set(rooms.map(r => r.view_type).filter(Boolean)));
  }, [rooms]);

  const maxPriceLimit = useMemo(() => {
    if (!rooms.length) return 500;
    const maxP = Math.max(...rooms.map(r => Number(r.base_price) || 0));
    return Math.max(100, Math.ceil(maxP * 1.5));
  }, [rooms]);

  useEffect(() => {
    if (rooms.length) {
      const maxP = Math.max(...rooms.map(r => Number(r.base_price) || 0));
      setMaxPriceFilter(prev => Math.max(prev, Math.ceil(maxP * 1.5)));
    }
  }, [rooms]);

  // Canvas Zoom / Pan State
  const [zoomLevel, setZoomLevel] = useState(1);

  // Calculate nights
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 1;
    const diff = new Date(checkOut) - new Date(checkIn);
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);

  // Load public room map
  const fetchRoomMap = async () => {
    try {
      setLoading(true);
      setError(null);
      const cleanHotelId = String(hotelId || 1).replace(/^local_/, '');
      const res = await fetch(`/api/pms?action=public-room-map&hotel_id=${encodeURIComponent(cleanHotelId)}&check_in=${checkIn || ''}&check_out=${checkOut || ''}&session_id=${sessionId}`);
      const data = await res.json();
      if (data.ok) {
        const fetchedRooms = data.rooms || [];
        setRooms(fetchedRooms);
        if (data.floors?.length) {
          setFloors(data.floors);
          setActiveFloorId(prev => (prev && data.floors.some(f => String(f.id) === String(prev))) ? prev : data.floors[0].id);
        } else if (fetchedRooms.length) {
          setFloors([{ id: 'default', name: 'Main Floor', sort_order: 1 }]);
          setActiveFloorId('default');
        } else {
          setFloors([]);
        }
        if (data.selected_room_id) {
          const r = fetchedRooms.find(x => String(x.id) === String(data.selected_room_id));
          if (r) {
            setSelectedRoom(r);
            if (data.hold_expires_at) {
              const secondsLeft = Math.max(0, Math.round((new Date(data.hold_expires_at) - new Date()) / 1000));
              setHoldTimer(secondsLeft);
            }
          }
        }
      } else {
        setError(data.error || 'Failed to load visual room map.');
      }
    } catch (err) {
      console.error('Failed to load room map:', err);
      setError('Network error loading property layout.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomMap();
    const interval = setInterval(fetchRoomMap, 15000);
    return () => clearInterval(interval);
  }, [hotelId, checkIn, checkOut]);

  // Hold Countdown Timer
  useEffect(() => {
    if (holdTimer <= 0) return;
    const timer = setInterval(() => {
      setHoldTimer(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setSelectedRoom(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [holdTimer]);

  // Handle room selection & 10-minute hold lock
  const handleSelectRoom = async (room) => {
    if (room.live_status !== 'available' && room.live_status !== 'selected') return;

    try {
      setHolding(true);
      if (selectedRoom?.id === room.id) {
        await fetch('/api/pms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release-hold', session_id: sessionId, room_id: room.id })
        });
        setSelectedRoom(null);
        setHoldTimer(0);
        if (onRoomSelect) onRoomSelect(null, sessionId, null, false);
      } else {
        const res = await fetch('/api/pms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'hold-room',
            hotel_id: hotelId || 1,
            room_id: room.id,
            session_id: sessionId,
            check_in: checkIn,
            check_out: checkOut
          })
        });
        const data = await res.json();
        if (data.ok) {
          setSelectedRoom(room);
          setHoldTimer(data.remaining_seconds || 600);
          if (onRoomSelect) onRoomSelect(room, sessionId, data.expires_at);
          fetchRoomMap();
        } else {
          alert(`Could not hold room: ${data.error}`);
        }
      }
    } catch (err) {
      console.error('Hold room error:', err);
    } finally {
      setHolding(false);
    }
  };

  const isRoomMatchingFilter = (room) => {
    const price = Number(room.base_price) || 0;
    if (price > maxPriceFilter) return false;
    if (roomTypeFilter !== 'all' && String(room.room_type || '').toLowerCase() !== roomTypeFilter.toLowerCase()) return false;
    if (viewFilter !== 'all' && String(room.view_type || '').toLowerCase() !== viewFilter.toLowerCase()) return false;
    if (balconyOnly && !room.has_balcony) return false;
    if (accessibleOnly && !room.is_accessible) return false;
    return true;
  };

  const activeFloorRooms = useMemo(() => {
    if (!activeFloorId || activeFloorId === 'default') return rooms;
    const filtered = rooms.filter(r => String(r.floor_id) === String(activeFloorId));
    return filtered.length > 0 ? filtered : rooms;
  }, [rooms, activeFloorId]);

  const wings = useMemo(() => {
    const groups = {};
    activeFloorRooms.forEach(room => {
      const wing = room.wing_section || 'Main Wing';
      if (!groups[wing]) groups[wing] = [];
      groups[wing].push(room);
    });
    return groups;
  }, [activeFloorRooms]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading && !rooms.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-semibold text-sm">Loading interactive floor map…</p>
      </div>
    );
  }

  if (!loading && !rooms.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
        <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
          <i className="ph ph-bed" />
        </div>
        <h3 className="text-base font-black text-slate-800 mb-1">Room Selection Being Prepared</h3>
        <p className="text-slate-500 text-xs max-w-sm mx-auto mb-4">
          This property currently does not have individual rooms listed on the floor map. You can still proceed to reserve below.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden font-sans">

      {/* ── TOP BAR / HEADER ── */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-green-600">
            <i className="ph-fill ph-grid-four text-base" /> Visual Room Selection
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 flex items-center gap-3">
            Pick Your Exact Room
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live Availability
            </span>
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Browse property floors, view room features, and lock your room selection in real time.
          </p>
        </div>

        {/* Hold Countdown */}
        {selectedRoom && (
          <div className="bg-green-50 border border-green-200 px-5 py-3 rounded-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-600 text-white flex items-center justify-center text-xl font-bold shadow-sm">
              <i className="ph-fill ph-clock-countdown" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-green-700">Room Held For You</div>
              <div className="text-lg font-black text-slate-900 flex items-center gap-2">
                Room {selectedRoom.room_number}
                <span className="text-amber-600 font-mono font-bold text-sm bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {formatTimer(holdTimer)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── LEGEND BAR ── */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center gap-4 overflow-x-auto text-xs font-bold scrollbar-none">
        <span className="text-slate-500 text-[11px] uppercase tracking-wider font-extrabold">Legend:</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-3.5 h-3.5 rounded-md ${cfg.legendBg}`} />
            <span className="text-slate-600 text-[12px]">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── FILTERING TOOLBAR ── */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Max Price Slider */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">
            Max Rate: <span className="text-slate-900 font-extrabold">{currency}{maxPriceFilter}/night</span>
          </label>
          <input
            type="range" min="0" max={maxPriceLimit} step="5"
            value={Math.min(maxPriceFilter, maxPriceLimit)}
            onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
            className="w-full accent-green-600 cursor-pointer"
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">Room Type</label>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value)}
            className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 capitalize"
          >
            <option value="all">All Room Types ({rooms.length})</option>
            {availableRoomTypes.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* View Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">View Type</label>
          <select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
            className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 capitalize"
          >
            <option value="all">All Views</option>
            {availableViews.map((view) => (
              <option key={view} value={view} className="capitalize">
                {view}
              </option>
            ))}
          </select>
        </div>

        {/* Toggles + Zoom */}
        <div className="flex items-center gap-4 col-span-1 sm:col-span-2 lg:col-span-2 pt-2 sm:pt-4">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-600 hover:text-slate-900">
            <input
              type="checkbox"
              checked={balconyOnly}
              onChange={(e) => setBalconyOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-green-600 cursor-pointer"
            />
            <span>Balcony</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-600 hover:text-slate-900">
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={(e) => setAccessibleOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-green-600 cursor-pointer"
            />
            <span>Accessible Ramp</span>
          </label>

          {/* Zoom Controls */}
          <div className="ml-auto flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.8, z - 0.1))}
              className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
              title="Zoom out"
            >
              -
            </button>
            <span className="text-[11px] font-mono font-bold px-2 text-slate-700">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(1.4, z + 0.1))}
              className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── FLOOR NAVIGATION TABS ── */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2">
          {floors.map((fl) => {
            const active = String(fl.id) === String(activeFloorId);
            const countOnFloor = rooms.filter(r => String(r.floor_id) === String(fl.id)).length;
            const availCount = rooms.filter(r => String(r.floor_id) === String(fl.id) && r.live_status === 'available').length;
            return (
              <button
                key={fl.id}
                onClick={() => setActiveFloorId(fl.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  active
                    ? 'bg-green-600 text-white shadow-sm shadow-green-600/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <i className="ph-fill ph-layers text-sm" />
                <span>{fl.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${active ? 'bg-white/20 text-white' : 'bg-white text-green-700 border border-green-200'}`}>
                  {availCount}/{countOnFloor}
                </span>
              </button>
            );
          })}
        </div>

        <select
          value={activeFloorId || ''}
          onChange={(e) => setActiveFloorId(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-2 focus:outline-none md:hidden"
        >
          {floors.map(fl => (
            <option key={fl.id} value={fl.id}>{fl.name}</option>
          ))}
        </select>
      </div>

      {/* ── INTERACTIVE VISUAL FLOOR PLAN ── */}
      <div className="p-6 bg-slate-50 min-h-[420px] overflow-auto relative">
        <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }} className="transition-transform duration-200">
          {Object.entries(wings).map(([wingName, wingRooms]) => (
            <div key={wingName} className="mb-8 bg-white border border-slate-200 rounded-2xl p-6 relative shadow-sm">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800 uppercase tracking-wider">
                  <i className="ph-fill ph-buildings text-green-600" />
                  <span>{wingName}</span>
                </div>
                <div className="text-xs text-slate-500 font-semibold">
                  {wingRooms.filter(r => r.live_status === 'available').length} available rooms in wing
                </div>
              </div>

              {/* Room Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {wingRooms.map((room) => {
                  const statusKey = room.live_status || 'available';
                  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.available;
                  const isSelected = selectedRoom?.id === room.id;
                  const matchesFilter = isRoomMatchingFilter(room);
                  const viewIcon = VIEW_ICONS[room.view_type] || 'ph-eye';
                  const roomPhoto = (Array.isArray(room.images) && room.images.length > 0)
                    ? room.images[0]
                    : (typeof room.images === 'string' && room.images.startsWith('http'))
                    ? room.images
                    : null;

                  return (
                    <div
                      key={room.id}
                      onClick={() => matchesFilter && handleSelectRoom(room)}
                      onMouseEnter={() => setDrawerRoom(room)}
                      className={`
                        relative rounded-xl p-4 border-2 transition-all duration-200 flex flex-col justify-between min-h-[155px]
                        ${isSelected ? STATUS_CONFIG.selected.color : cfg.color}
                        ${!matchesFilter ? 'opacity-20 scale-95 grayscale' : ''}
                      `}
                    >
                      {/* Room Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-black tracking-tight">{room.room_number}</span>
                            {room.has_balcony && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-extrabold border border-green-200" title="Has Balcony">
                                Balcony
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold opacity-80 mt-0.5 capitalize">{room.room_type}</div>
                        </div>

                        {/* Status Badge */}
                        <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${cfg.badge}`}>
                          <i className={`ph ${cfg.icon}`} />
                          <span>{isSelected ? 'SELECTED' : cfg.label}</span>
                        </div>
                      </div>

                      {/* Room Specs & Thumbnail */}
                      <div className="my-2.5 flex items-center gap-3">
                        {roomPhoto && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                            <img src={roomPhoto} alt={room.room_type} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="text-[11px] font-semibold opacity-90 space-y-1">
                          <div className="flex items-center gap-1" title="Bed Type">
                            <i className="ph ph-bed text-sm" /> {room.bed_type} Bed
                          </div>
                          <div className="flex items-center gap-1" title="Capacity & View">
                            <i className="ph ph-users text-sm" /> Sleeps {room.capacity} · <i className={`ph ${viewIcon} text-xs ml-0.5`} /> {room.view_type}
                          </div>
                        </div>
                      </div>

                      {/* Pricing & Action */}
                      <div className="flex items-end justify-between pt-2 border-t border-black/10">
                        <div>
                          <div className="text-base font-black leading-none">{currency}{room.base_price}</div>
                          <div className="text-[9px] opacity-75 font-semibold">per night · {currency}{room.base_price * nights} total</div>
                        </div>

                        <button
                          disabled={statusKey !== 'available' && statusKey !== 'selected'}
                          className={`
                            px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all
                            ${isSelected
                              ? 'bg-white text-green-700 shadow-sm'
                              : statusKey === 'available'
                              ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
                              : 'bg-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}
                          `}
                        >
                          {isSelected ? 'Selected' : statusKey === 'available' ? 'Select' : 'Unavailable'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ROOM DETAILS HOVER PANEL ── */}
      {drawerRoom && (
        <div className="px-6 py-5 bg-white border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
              <img
                src={drawerRoom.images?.[0] || 'https://images.unsplash.com/photo-1590490359683-658d3d23f972?auto=format&fit=crop&w=400&q=80'}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-black text-slate-900">Room {drawerRoom.room_number}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold border border-green-200">
                  {drawerRoom.room_type}
                </span>
                <span className="text-xs text-slate-400 font-semibold">• {drawerRoom.wing_section}</span>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-3">
                <span><i className="ph ph-bed text-green-600" /> {drawerRoom.bed_type}</span>
                <span><i className="ph ph-users text-green-600" /> Max {drawerRoom.capacity} Guests</span>
                <span><i className="ph ph-sun text-green-600" /> {drawerRoom.view_type}</span>
                {drawerRoom.has_balcony && <span><i className="ph ph-check-circle text-green-600" /> Balcony</span>}
                {drawerRoom.is_accessible && <span><i className="ph ph-wheelchair text-green-600" /> Accessible</span>}
              </div>
              {drawerRoom.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {drawerRoom.amenities.slice(0, 4).map((am, i) => (
                    <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold border border-slate-200">
                      {am}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="text-right">
              <div className="text-xl font-black text-slate-900">{currency}{drawerRoom.base_price} <span className="text-xs text-slate-500 font-medium">/night</span></div>
              <div className="text-xs text-green-600 font-bold">{nights} night stay = {currency}{drawerRoom.base_price * nights}</div>
            </div>

            <button
              disabled={holding || (drawerRoom.live_status !== 'available' && drawerRoom.live_status !== 'selected')}
              onClick={() => handleSelectRoom(drawerRoom)}
              className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm flex items-center gap-2 ${
                selectedRoom?.id === drawerRoom.id
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : drawerRoom.live_status === 'available'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {selectedRoom?.id === drawerRoom.id ? 'Release Hold' : drawerRoom.live_status === 'available' ? 'Hold & Select Room' : 'Unavailable'}
            </button>
          </div>
        </div>
      )}

      {/* ── STICKY BOTTOM SUMMARY BAR ── */}
      {selectedRoom && (
        <div className="px-6 py-4 bg-green-600 border-t border-green-700 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-0 z-30 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-green-700 flex items-center justify-center font-black text-xl shadow-sm">
              <i className="ph-fill ph-check-fat" />
            </div>
            <div>
              <div className="text-xs font-black text-green-100 uppercase tracking-wider">Your Room Selection Locked</div>
              <div className="text-base font-black text-white">
                Room {selectedRoom.room_number} · {selectedRoom.room_type} ({selectedRoom.wing_section})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-green-200">Total Stay ({nights} Nights)</div>
              <div className="text-2xl font-black text-white">{currency}{selectedRoom.base_price * nights}</div>
            </div>

            <button
              onClick={() => {
                if (onRoomSelect) onRoomSelect(selectedRoom, sessionId, null, true);
              }}
              className="px-7 py-3 bg-white hover:bg-slate-50 text-green-700 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Confirm Selection <i className="ph-bold ph-arrow-right" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
