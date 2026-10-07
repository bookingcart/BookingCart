import { useState, useEffect, useMemo, useRef } from 'react';

// ─── Status Config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  available: {
    label: 'Available',
    color: 'bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200 hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-500/20 cursor-pointer',
    badge: 'bg-emerald-500 text-white',
    legendBg: 'bg-emerald-500',
    icon: 'ph-check'
  },
  selected: {
    label: 'Selected (Held)',
    color: 'bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-600/40 ring-4 ring-blue-300 dark:ring-blue-800 scale-105 cursor-pointer',
    badge: 'bg-white text-blue-700',
    legendBg: 'bg-blue-600',
    icon: 'ph-check-circle-fill'
  },
  booked: {
    label: 'Booked',
    color: 'bg-rose-100/80 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 opacity-60 cursor-not-allowed',
    badge: 'bg-rose-600 text-white',
    legendBg: 'bg-rose-600',
    icon: 'ph-lock-key-fill'
  },
  occupied: {
    label: 'Occupied',
    color: 'bg-amber-100/80 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400 opacity-60 cursor-not-allowed',
    badge: 'bg-amber-600 text-white',
    legendBg: 'bg-amber-600',
    icon: 'ph-user-fill'
  },
  blocked: {
    label: 'Blocked',
    color: 'bg-slate-800 border-slate-700 text-slate-300 opacity-50 cursor-not-allowed',
    badge: 'bg-slate-700 text-white',
    legendBg: 'bg-slate-800',
    icon: 'ph-prohibit-fill'
  },
  maintenance: {
    label: 'Maintenance',
    color: 'bg-yellow-100 border-yellow-400 text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-800 dark:text-yellow-300 opacity-60 cursor-not-allowed',
    badge: 'bg-yellow-600 text-white',
    legendBg: 'bg-yellow-500',
    icon: 'ph-wrench-fill'
  },
  held: {
    label: 'Reserved (Held)',
    color: 'bg-purple-100 border-purple-300 text-purple-900 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300 opacity-60 cursor-not-allowed',
    badge: 'bg-purple-600 text-white',
    legendBg: 'bg-purple-600',
    icon: 'ph-clock-fill'
  }
};

const VIEW_ICONS = {
  'Sea View': 'ph-waves',
  'Garden View': 'ph-tree-evergreen',
  'City View': 'ph-buildings',
  'Pool View': 'ph-swimming-pool',
  'Sunset View': 'ph-sun-horizon',
  '360 Panoramic View': 'ph-compass'
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
  const [holdTimer, setHoldTimer] = useState(0); // seconds
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

  // Filter state
  const [maxPriceFilter, setMaxPriceFilter] = useState(600);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [viewFilter, setViewFilter] = useState('all');
  const [balconyOnly, setBalconyOnly] = useState(false);
  const [accessibleOnly, setAccessibleOnly] = useState(false);

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
      const res = await fetch(`/api/pms?action=public-room-map&hotel_id=${encodeURIComponent(hotelId || 1)}&check_in=${checkIn || ''}&check_out=${checkOut || ''}&session_id=${sessionId}`);
      const data = await res.json();
      if (data.ok) {
        setFloors(data.floors || []);
        setRooms(data.rooms || []);
        if (data.floors?.length && !activeFloorId) {
          setActiveFloorId(data.floors[0].id);
        }
        // If server indicates we hold a room
        if (data.selected_room_id) {
          const r = data.rooms.find(x => String(x.id) === String(data.selected_room_id));
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
    const interval = setInterval(fetchRoomMap, 15000); // Live sync every 15s
    return () => clearInterval(interval);
  }, [hotelId, checkIn, checkOut]);

  // Hold Countdown Timer effect
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
    if (room.live_status !== 'available' && room.live_status !== 'selected') {
      return; // Cannot select booked/occupied/blocked room
    }

    try {
      setHolding(true);
      if (selectedRoom?.id === room.id) {
        // Toggle unselect
        await fetch('/api/pms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release-hold', session_id: sessionId, room_id: room.id })
        });
        setSelectedRoom(null);
        setHoldTimer(0);
        if (onRoomSelect) onRoomSelect(null);
      } else {
        // Reserve hold for 10 minutes
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
          fetchRoomMap(); // Instant refresh map
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

  // Filter matching check
  const isRoomMatchingFilter = (room) => {
    const price = Number(room.base_price) || 0;
    if (price > maxPriceFilter) return false;
    if (roomTypeFilter !== 'all' && !room.room_type.toLowerCase().includes(roomTypeFilter.toLowerCase())) return false;
    if (viewFilter !== 'all' && room.view_type !== viewFilter) return false;
    if (balconyOnly && !room.has_balcony) return false;
    if (accessibleOnly && !room.is_accessible) return false;
    return true;
  };

  // Rooms for active floor
  const activeFloorRooms = useMemo(() => {
    if (!activeFloorId) return rooms;
    return rooms.filter(r => String(r.floor_id) === String(activeFloorId));
  }, [rooms, activeFloorId]);

  // Group rooms by wing section
  const wings = useMemo(() => {
    const groups = {};
    activeFloorRooms.forEach(room => {
      const wing = room.wing_section || 'Main Wing';
      if (!groups[wing]) groups[wing] = [];
      groups[wing].push(room);
    });
    return groups;
  }, [activeFloorRooms]);

  // Format countdown timer 09:59
  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading && !rooms.length) {
    return (
      <div className="bg-slate-900 text-white rounded-3xl p-12 text-center shadow-2xl border border-slate-800">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-bold text-sm">Loading interactive visual floor map…</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden font-sans">

      {/* ── TOP BAR / HEADER ── */}
      <div className="p-6 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-400">
            <i className="ph-fill ph-grid-four text-base" /> Visual Seat-Style Room Selection
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-3">
            Pick Your Exact Room
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Availability
            </span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Browse property floors, view room features, and lock your room selection in real time.
          </p>
        </div>

        {/* 10-Minute Hold Countdown Bar */}
        {selectedRoom && (
          <div className="bg-blue-950/80 border border-blue-500/40 px-5 py-3 rounded-2xl flex items-center gap-4 animate-fadeIn">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-blue-500/30">
              <i className="ph-fill ph-clock-countdown" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-blue-300">Room Held For You</div>
              <div className="text-lg font-black text-white flex items-center gap-2">
                Room {selectedRoom.room_number}
                <span className="text-amber-400 font-mono font-bold text-sm bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                  {formatTimer(holdTimer)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── LEGEND BAR ── */}
      <div className="bg-slate-900/50 border-b border-slate-800 px-6 py-3 flex items-center gap-4 overflow-x-auto text-xs font-bold scrollbar-none">
        <span className="text-slate-400 text-[11px] uppercase tracking-wider font-extrabold flex items-center gap-1">
          Legend:
        </span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-3.5 h-3.5 rounded-md ${cfg.legendBg} shadow-sm`} />
            <span className="text-slate-300 text-[12px]">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── FILTERING TOOLBAR ── */}
      <div className="p-4 bg-slate-900/70 border-b border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Max Price Slider */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
            Max Rate: <span className="text-white font-extrabold">{currency}{maxPriceFilter}/night</span>
          </label>
          <input
            type="range" min="80" max="600" step="10"
            value={maxPriceFilter}
            onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">Room Type</label>
          <select
            value={roomTypeFilter}
            onChange={(e) => setRoomTypeFilter(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 font-bold focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Room Types</option>
            <option value="Standard">Standard</option>
            <option value="Executive">Executive</option>
            <option value="Deluxe">Deluxe</option>
            <option value="Suite">Suite</option>
            <option value="Penthouse">Penthouse</option>
          </select>
        </div>

        {/* View Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">View Type</label>
          <select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 font-bold focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Views</option>
            <option value="Sea View">Sea View</option>
            <option value="Garden View">Garden View</option>
            <option value="City View">City View</option>
            <option value="Pool View">Pool View</option>
            <option value="Sunset View">Sunset View</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-4 col-span-1 sm:col-span-2 lg:col-span-2 pt-2 sm:pt-0">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={balconyOnly}
              onChange={(e) => setBalconyOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
            />
            <span>Balcony</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={(e) => setAccessibleOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
            />
            <span>Accessible Ramp</span>
          </label>

          {/* Canvas Zoom Controls */}
          <div className="ml-auto flex items-center gap-1 bg-slate-800 border border-slate-700 p-1 rounded-xl">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.8, z - 0.1))}
              className="w-7 h-7 rounded-lg hover:bg-slate-700 flex items-center justify-center font-bold"
              title="Zoom out"
            >
              -
            </button>
            <span className="text-[11px] font-mono font-bold px-2">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(1.4, z + 0.1))}
              className="w-7 h-7 rounded-lg hover:bg-slate-700 flex items-center justify-center font-bold"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── FLOOR NAVIGATION TABS ── */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2">
          {floors.map((fl) => {
            const active = String(fl.id) === String(activeFloorId);
            const countOnFloor = rooms.filter(r => String(r.floor_id) === String(fl.id)).length;
            const availCount = rooms.filter(r => String(r.floor_id) === String(fl.id) && r.live_status === 'available').length;
            return (
              <button
                key={fl.id}
                onClick={() => setActiveFloorId(fl.id)}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2.5 ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <i className="ph-fill ph-layers text-sm" />
                <span>{fl.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${active ? 'bg-white/20 text-white' : 'bg-slate-900 text-emerald-400'}`}>
                  {availCount}/{countOnFloor} free
                </span>
              </button>
            );
          })}
        </div>

        {/* Floor Dropdown selector for quick jumps */}
        <select
          value={activeFloorId || ''}
          onChange={(e) => setActiveFloorId(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none md:hidden"
        >
          {floors.map(fl => (
            <option key={fl.id} value={fl.id}>{fl.name}</option>
          ))}
        </select>
      </div>

      {/* ── INTERACTIVE VISUAL FLOOR PLAN MAP CANVAS ── */}
      <div className="p-6 bg-slate-950 min-h-[420px] overflow-auto relative">

        <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }} className="transition-transform duration-200">
          {Object.entries(wings).map(([wingName, wingRooms]) => (
            <div key={wingName} className="mb-8 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 relative">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-sm font-black text-slate-200 uppercase tracking-wider">
                  <i className="ph-fill ph-buildings text-blue-500" />
                  <span>{wingName}</span>
                </div>
                <div className="text-xs text-slate-500 font-bold">
                  {wingRooms.filter(r => r.live_status === 'available').length} available rooms in wing
                </div>
              </div>

              {/* Corridor & Room Layout Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {wingRooms.map((room) => {
                  const statusKey = room.live_status || 'available';
                  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.available;
                  const isSelected = selectedRoom?.id === room.id;
                  const matchesFilter = isRoomMatchingFilter(room);
                  const viewIcon = VIEW_ICONS[room.view_type] || 'ph-eye';

                  return (
                    <div
                      key={room.id}
                      onClick={() => matchesFilter && handleSelectRoom(room)}
                      onMouseEnter={() => setDrawerRoom(room)}
                      className={`
                        relative rounded-2xl p-4 border transition-all duration-200 flex flex-col justify-between min-h-[140px]
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
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-extrabold border border-blue-500/30" title="Has Balcony">
                                Balcony
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold opacity-80 mt-0.5">{room.room_type}</div>
                        </div>

                        {/* Status Badge */}
                        <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${cfg.badge}`}>
                          <i className={`ph ${cfg.icon}`} />
                          <span>{isSelected ? 'SELECTED' : cfg.label}</span>
                        </div>
                      </div>

                      {/* Room Specs */}
                      <div className="my-3 text-[11px] font-semibold opacity-90 flex items-center gap-3">
                        <span className="flex items-center gap-1" title="Bed Type">
                          <i className="ph ph-bed text-sm" /> {room.bed_type}
                        </span>
                        <span className="flex items-center gap-1" title="Capacity">
                          <i className="ph ph-users text-sm" /> {room.capacity} Guests
                        </span>
                        <span className="flex items-center gap-1" title="View">
                          <i className={`ph ${viewIcon} text-sm`} /> {room.view_type}
                        </span>
                      </div>

                      {/* Room Pricing & Action */}
                      <div className="flex items-end justify-between pt-2 border-t border-black/10 dark:border-white/10">
                        <div>
                          <div className="text-base font-black leading-none">{currency}{room.base_price}</div>
                          <div className="text-[9px] opacity-75 font-semibold">per night · {currency}{room.base_price * nights} total</div>
                        </div>

                        <button
                          disabled={statusKey !== 'available' && statusKey !== 'selected'}
                          className={`
                            px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all
                            ${isSelected
                              ? 'bg-white text-blue-700 shadow-md'
                              : statusKey === 'available'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                              : 'bg-slate-700 text-slate-400 opacity-50 cursor-not-allowed'}
                          `}
                        >
                          {isSelected ? 'Selected' : statusKey === 'available' ? 'Select Room' : 'Unavailable'}
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

      {/* ── ROOM DETAILS HOVER / DRAWER PANEL ── */}
      {drawerRoom && (
        <div className="p-6 bg-slate-900 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
              <img
                src={drawerRoom.images?.[0] || 'https://images.unsplash.com/photo-1590490359683-658d3d23f972?auto=format&fit=crop&w=400&q=80'}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-white">Room {drawerRoom.room_number}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                  {drawerRoom.room_type}
                </span>
                <span className="text-xs text-slate-400 font-semibold">• {drawerRoom.wing_section}</span>
              </div>
              <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-3">
                <span><i className="ph ph-bed text-blue-400" /> {drawerRoom.bed_type}</span>
                <span><i className="ph ph-users text-blue-400" /> Max {drawerRoom.capacity} Guests</span>
                <span><i className="ph ph-sun text-blue-400" /> {drawerRoom.view_type}</span>
                {drawerRoom.has_balcony && <span><i className="ph ph-check-circle text-emerald-400" /> Balcony Access</span>}
                {drawerRoom.is_accessible && <span><i className="ph ph-wheelchair text-emerald-400" /> Wheelchair Accessible</span>}
              </div>
              {drawerRoom.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {drawerRoom.amenities.slice(0, 4).map((am, i) => (
                    <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-semibold">
                      {am}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="text-right">
              <div className="text-xl font-black text-white">{currency}{drawerRoom.base_price} <span className="text-xs text-slate-400 font-medium">/night</span></div>
              <div className="text-xs text-emerald-400 font-bold">{nights} night stay = {currency}{drawerRoom.base_price * nights}</div>
            </div>

            <button
              disabled={holding || (drawerRoom.live_status !== 'available' && drawerRoom.live_status !== 'selected')}
              onClick={() => handleSelectRoom(drawerRoom)}
              className={`px-6 py-3 rounded-2xl font-black text-xs transition-all shadow-lg flex items-center gap-2 ${
                selectedRoom?.id === drawerRoom.id
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : drawerRoom.live_status === 'available'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {selectedRoom?.id === drawerRoom.id ? 'Release Hold' : drawerRoom.live_status === 'available' ? 'Hold & Select Room' : 'Unavailable'}
            </button>
          </div>
        </div>
      )}

      {/* ── STICKY BOTTOM SUMMARY BAR ── */}
      {selectedRoom && (
        <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-900 border-t border-blue-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-0 z-30 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white text-blue-900 flex items-center justify-center font-black text-xl shadow-lg">
              <i className="ph-fill ph-check-fat" />
            </div>
            <div>
              <div className="text-xs font-black text-blue-200 uppercase tracking-wider">Your Room Selection Locked</div>
              <div className="text-base font-black text-white">
                Room {selectedRoom.room_number} · {selectedRoom.room_type} ({selectedRoom.wing_section})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-blue-200">Total Stay ({nights} Nights)</div>
              <div className="text-2xl font-black text-white">{currency}{selectedRoom.base_price * nights}</div>
            </div>

            <button
              onClick={() => {
                if (onRoomSelect) onRoomSelect(selectedRoom, sessionId);
              }}
              className="px-8 py-3 bg-white hover:bg-slate-100 text-blue-950 font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Confirm Selection <i className="ph-bold ph-arrow-right" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
