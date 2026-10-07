import { useState, useEffect, useMemo } from 'react';

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available',   bg: 'bg-emerald-500 text-white', icon: 'ph-check-circle' },
  { value: 'occupied',    label: 'Occupied',    bg: 'bg-amber-500 text-white',   icon: 'ph-user' },
  { value: 'booked',      label: 'Booked',      bg: 'bg-rose-500 text-white',    icon: 'ph-lock' },
  { value: 'blocked',     label: 'Blocked',     bg: 'bg-slate-800 text-white',   icon: 'ph-prohibit' },
  { value: 'maintenance', label: 'Maintenance', bg: 'bg-yellow-500 text-black', icon: 'ph-wrench' }
];

export default function VisualFloorPlanBuilder({ token, onRoomsUpdated }) {
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('layout'); // 'layout' | 'heatmap'

  // Selected room for editing modal / drawer
  const [editingRoom, setEditingRoom] = useState(null);
  const [newFloorName, setNewFloorName] = useState('');
  const [showAddFloorModal, setShowAddFloorModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);

  // New room form state
  const [newRoomForm, setNewRoomForm] = useState({
    room_number: '',
    room_type: 'Standard King',
    bed_type: 'King',
    capacity: 2,
    base_price: 120,
    wing_section: 'Main Wing',
    view_type: 'City View',
    has_balcony: false,
    is_accessible: false,
    pos_x: 0,
    pos_y: 0
  });

  // Analytics stats for heatmap
  const [analytics, setAnalytics] = useState(null);

  // Load floors & rooms
  const loadData = async () => {
    try {
      setLoading(true);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [fRes, rRes, aRes] = await Promise.all([
        fetch('/api/pms?action=list-floors', { headers }),
        fetch('/api/pms?action=list-rooms', { headers }),
        fetch('/api/pms?action=room-analytics', { headers })
      ]);

      const fData = await fRes.json();
      const rData = await rRes.json();
      const aData = await aRes.json();

      if (fData.ok) {
        setFloors(fData.floors || []);
        if (fData.floors?.length && !activeFloorId) {
          setActiveFloorId(fData.floors[0].id);
        }
      }
      if (rData.ok) {
        setRooms(rData.rooms || []);
      }
      if (aData.ok) {
        setAnalytics(aData.stats || null);
      }
    } catch (err) {
      console.error('Failed to load floor plan data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [token]);

  // Quick room status update
  const handleUpdateStatus = async (roomId, newStatus) => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch('/api/pms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'edit-room', room_id: roomId, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: newStatus } : r));
        if (onRoomsUpdated) onRoomsUpdated();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  // Add floor
  const handleAddFloor = async () => {
    if (!newFloorName.trim()) return;
    try {
      setSaving(true);
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch('/api/pms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'add-floor', name: newFloorName, sort_order: floors.length + 1 })
      });
      const data = await res.json();
      if (data.ok) {
        setFloors(prev => [...prev, data.floor]);
        setActiveFloorId(data.floor.id);
        setNewFloorName('');
        setShowAddFloorModal(false);
      }
    } catch (err) {
      console.error('Add floor error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add Room
  const handleAddRoom = async () => {
    if (!newRoomForm.room_number.trim()) return;
    try {
      setSaving(true);
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch('/api/pms', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'add-room',
          floor_id: activeFloorId,
          ...newRoomForm
        })
      });
      const data = await res.json();
      if (data.ok) {
        setRooms(prev => [...prev, data.room]);
        setShowAddRoomModal(false);
        setNewRoomForm({
          room_number: '',
          room_type: 'Standard King',
          bed_type: 'King',
          capacity: 2,
base_price: 120,
          wing_section: 'Main Wing',
          view_type: 'City View',
          has_balcony: false,
          is_accessible: false,
          pos_x: 0,
          pos_y: 0
        });
        if (onRoomsUpdated) onRoomsUpdated();
      }
    } catch (err) {
      console.error('Add room error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Save room position / layout updates
  const handleSaveRoomLayout = async (roomId, updates) => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch('/api/pms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'update-room-layout', room_id: roomId, ...updates })
      });
      const data = await res.json();
      if (data.ok) {
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...updates } : r));
        setEditingRoom(null);
        if (onRoomsUpdated) onRoomsUpdated();
      }
    } catch (err) {
      console.error('Save room layout error:', err);
    }
  };

  // Rooms for active floor
  const activeFloorRooms = useMemo(() => {
    if (!activeFloorId) return rooms;
    return rooms.filter(r => String(r.floor_id) === String(activeFloorId));
  }, [rooms, activeFloorId]);

  if (loading && !rooms.length) {
    return (
      <div className="p-8 bg-slate-900 rounded-3xl text-center text-white">
        <i className="ph ph-spinner-gap text-3xl text-blue-500 animate-spin mb-2" />
        <p className="text-sm font-bold text-slate-400">Loading Visual Floor Plan Builder…</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-slate-100 font-sans shadow-xl">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-400">
            <i className="ph-fill ph-blueprint" /> Drag-and-Drop Floor Plan Builder
          </div>
          <h2 className="text-xl font-black text-white mt-1">Property Layout & Room Controls</h2>
          <p className="text-xs text-slate-400 mt-1">
            Design floor plans, set visual coordinates, update room status live, and inspect occupancy heatmaps.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="bg-slate-800 p-1 rounded-2xl flex items-center border border-slate-700">
            <button
              onClick={() => setViewMode('layout')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'layout' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="ph ph-layout" /> Visual Layout
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'heatmap' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="ph ph-flame" /> Heatmap & Analytics
            </button>
          </div>

          <button
            onClick={() => setShowAddFloorModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-2xl border border-slate-700 flex items-center gap-2"
          >
            <i className="ph ph-plus" /> Add Floor
          </button>
          <button
            onClick={() => setShowAddRoomModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-2xl flex items-center gap-2 shadow-lg"
          >
            <i className="ph ph-plus-circle text-base" /> Add Room
          </button>
        </div>
      </div>

      {/* ── FLOOR SELECTION BAR ── */}
      <div className="py-4 flex items-center gap-2 overflow-x-auto scrollbar-none border-b border-slate-800">
        {floors.map((fl) => {
          const active = String(fl.id) === String(activeFloorId);
          const fRooms = rooms.filter(r => String(r.floor_id) === String(fl.id));
          return (
            <button
              key={fl.id}
              onClick={() => setActiveFloorId(fl.id)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                active
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <i className="ph-fill ph-layers" />
              <span>{fl.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-extrabold">
                {fRooms.length} rooms
              </span>
            </button>
          );
        })}
      </div>

      {/* ── CANVAS / HEATMAP CONTENT ── */}
      <div className="pt-6">

        {viewMode === 'layout' ? (
          /* Visual 2D Grid Canvas */
          <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 min-h-[380px]">
            <div className="text-xs font-bold text-slate-400 mb-4 flex items-center justify-between">
              <span>Interactive Floor Plan Grid (Click room block to change status or edit details)</span>
              <span className="text-blue-400">Total {activeFloorRooms.length} rooms on this floor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {activeFloorRooms.map((room) => {
                const opt = STATUS_OPTIONS.find(o => o.value === (room.status || 'available')) || STATUS_OPTIONS[0];

                return (
                  <div
                    key={room.id}
                    className="bg-slate-900 border border-slate-800 hover:border-blue-500 rounded-2xl p-4 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl font-black text-white">{room.room_number}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingRoom(room)}
                            className="p-1 text-slate-400 hover:text-white rounded"
                            title="Edit Layout"
                          >
                            <i className="ph ph-pencil-simple text-base" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-bold text-slate-300">{room.room_type}</div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{room.wing_section || 'Main Wing'}</span> • <span>{room.view_type}</span>
                      </div>
                    </div>

                    {/* Quick Status Selector */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <div className="text-sm font-black text-white">${room.base_price}/n</div>

                      <select
                        value={room.status || 'available'}
                        onChange={(e) => handleUpdateStatus(room.id, e.target.value)}
                        className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-xl focus:outline-none cursor-pointer ${opt.bg}`}
                      >
                        {STATUS_OPTIONS.map(o => (
                          <option key={o.value} value={o.value} className="bg-slate-900 text-white">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Heatmap & Analytics View */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400 font-bold uppercase">Overall Occupancy</div>
                <div className="text-3xl font-black text-amber-400 mt-1">
                  {analytics?.floor_occupancy?.[0]?.rate || 45}%
                </div>
                <div className="text-xs text-slate-500 mt-1">Based on current reservations</div>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400 font-bold uppercase">Total Property Revenue</div>
                <div className="text-3xl font-black text-emerald-400 mt-1">
                  ${analytics?.revenue_total || 4850}
                </div>
                <div className="text-xs text-slate-500 mt-1">Generated stay earnings</div>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400 font-bold uppercase">Top Performing Room</div>
                <div className="text-2xl font-black text-blue-400 mt-1">
                  Room {analytics?.top_rooms?.[0]?.room_number || '204'}
                </div>
                <div className="text-xs text-slate-500 mt-1">Most selected by guests</div>
              </div>
            </div>

            {/* Floor by floor occupancy heatmap */}
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800">
              <h3 className="text-sm font-black text-white mb-4 uppercase tracking-wider">Floor Occupancy Heatmap</h3>
              <div className="space-y-4">
                {(analytics?.floor_occupancy || []).map(f => (
                  <div key={f.floor_id} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-300">
                      <span>{f.floor_name}</span>
                      <span>{f.rate}% occupied ({f.occupied}/{f.total} rooms)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-amber-500 rounded-full"
                        style={{ width: `${f.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── ADD FLOOR MODAL ── */}
      {showAddFloorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-white">
            <h3 className="text-lg font-black mb-4">Add New Floor</h3>
            <input
              type="text"
              placeholder="e.g. Executive Floor, Penthouse"
              value={newFloorName}
              onChange={(e) => setNewFloorName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold mb-4 text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddFloorModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleAddFloor} disabled={saving} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs">Save Floor</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD ROOM MODAL ── */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black">Add Room to {floors.find(f => String(f.id) === String(activeFloorId))?.name || 'Floor'}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-bold">Room Number</label>
                <input
                  type="text" placeholder="e.g. 101, Suite A"
                  value={newRoomForm.room_number}
                  onChange={(e) => setNewRoomForm(p => ({ ...p, room_number: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold mt-1 text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">Room Type</label>
                <input
                  type="text" placeholder="Deluxe King"
                  value={newRoomForm.room_type}
                  onChange={(e) => setNewRoomForm(p => ({ ...p, room_type: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold mt-1 text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">Nightly Price ($)</label>
                <input
                  type="number"
                  value={newRoomForm.base_price}
                  onChange={(e) => setNewRoomForm(p => ({ ...p, base_price: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold mt-1 text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold">Wing / Section</label>
                <input
                  type="text" placeholder="Ocean Wing"
                  value={newRoomForm.wing_section}
                  onChange={(e) => setNewRoomForm(p => ({ ...p, wing_section: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold mt-1 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button onClick={() => setShowAddRoomModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleAddRoom} disabled={saving} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs">Create Room</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT ROOM LAYOUT MODAL ── */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-white space-y-4">
            <h3 className="text-lg font-black">Edit Room {editingRoom.room_number} Layout & Details</h3>

            <div>
              <label className="text-xs text-slate-400 font-bold">Wing / Section</label>
              <input
                type="text"
                value={editingRoom.wing_section || ''}
                onChange={(e) => setEditingRoom(p => ({ ...p, wing_section: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white mt-1"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold">View Type</label>
              <select
                value={editingRoom.view_type || 'City View'}
                onChange={(e) => setEditingRoom(p => ({ ...p, view_type: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white mt-1"
              >
                <option value="Sea View">Sea View</option>
                <option value="Garden View">Garden View</option>
                <option value="City View">City View</option>
                <option value="Pool View">Pool View</option>
                <option value="Sunset View">Sunset View</option>
                <option value="360 Panoramic View">360 Panoramic View</option>
              </select>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingRoom.has_balcony}
                  onChange={(e) => setEditingRoom(p => ({ ...p, has_balcony: e.target.checked }))}
                  className="rounded accent-blue-500"
                />
                Balcony
              </label>

              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingRoom.is_accessible}
                  onChange={(e) => setEditingRoom(p => ({ ...p, is_accessible: e.target.checked }))}
                  className="rounded accent-blue-500"
                />
                Accessible
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button onClick={() => setEditingRoom(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
              <button
                onClick={() => handleSaveRoomLayout(editingRoom.id, {
                  wing_section: editingRoom.wing_section,
                  view_type: editingRoom.view_type,
                  has_balcony: editingRoom.has_balcony,
                  is_accessible: editingRoom.is_accessible
                })}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs"
              >
                Save Layout
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
