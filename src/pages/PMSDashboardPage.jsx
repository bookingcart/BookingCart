import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import VisualFloorPlanBuilder from '../components/VisualFloorPlanBuilder.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const ROOM_STATUSES = [
  { key: 'available',    label: 'Available',      color: 'bg-emerald-500',  text: 'text-emerald-700',  bg: 'bg-emerald-50',  border: 'border-emerald-200',  dot: '#10b981' },
  { key: 'booked',       label: 'Booked',         color: 'bg-blue-500',     text: 'text-blue-700',     bg: 'bg-blue-50',     border: 'border-blue-200',     dot: '#3b82f6' },
  { key: 'reserved',     label: 'Reserved',       color: 'bg-yellow-400',   text: 'text-yellow-700',   bg: 'bg-yellow-50',   border: 'border-yellow-200',   dot: '#facc15' },
  { key: 'occupied',     label: 'Occupied',       color: 'bg-indigo-500',   text: 'text-indigo-700',   bg: 'bg-indigo-50',   border: 'border-indigo-200',   dot: '#6366f1' },
  { key: 'maintenance',  label: 'Maintenance',    color: 'bg-orange-500',   text: 'text-orange-700',   bg: 'bg-orange-50',   border: 'border-orange-200',   dot: '#f97316' },
  { key: 'blocked',      label: 'Blocked',        color: 'bg-red-500',      text: 'text-red-700',      bg: 'bg-red-50',      border: 'border-red-200',      dot: '#ef4444' },
  { key: 'out_of_service', label: 'Out of Service', color: 'bg-slate-500', text: 'text-slate-700',    bg: 'bg-slate-100',   border: 'border-slate-200',    dot: '#64748b' },
];

const BOOKING_STATUSES = ['pending','confirmed','checked_in','checked_out','cancelled','no_show'];
const PAYMENT_STATUSES = ['pending','partially_paid','paid','refunded'];
const BED_TYPES = ['Single','Double','Queen','King','Twin','Bunk','Sofa Bed'];
const ROOM_TYPES = ['Standard','Deluxe','Suite','Junior Suite','Executive','Presidential','Family','Studio','Penthouse','Dormitory'];
const BLOCK_REASONS = ['blocked','maintenance','renovation','deep_cleaning','owner_stay','vip_reservation','internal_use'];

const SAMPLE_FLOORS = [
  { id: 'f1', name: 'Ground Floor', sort_order: 0, room_count: 3 },
  { id: 'f2', name: 'First Floor', sort_order: 1, room_count: 4 },
  { id: 'f3', name: 'Second Floor', sort_order: 2, room_count: 3 },
];

const SAMPLE_ROOMS = [
  { id: 'r1', floor_id: 'f1', floor_name: 'Ground Floor', room_number: 'G01', room_type: 'Standard', bed_type: 'Double', capacity: 2, base_price: 80, currency: 'USD', status: 'available', amenities: ['WiFi','AC','TV'], description: 'Comfortable ground floor room' },
  { id: 'r2', floor_id: 'f1', floor_name: 'Ground Floor', room_number: 'G02', room_type: 'Deluxe',   bed_type: 'Queen',  capacity: 2, base_price: 120, currency: 'USD', status: 'booked',     amenities: ['WiFi','AC','TV','Balcony'], description: '' },
  { id: 'r3', floor_id: 'f1', floor_name: 'Ground Floor', room_number: 'G03', room_type: 'Standard', bed_type: 'Single', capacity: 1, base_price: 60,  currency: 'USD', status: 'maintenance', amenities: ['WiFi','AC'], description: '' },
  { id: 'r4', floor_id: 'f2', floor_name: 'First Floor',  room_number: '101', room_type: 'Deluxe',   bed_type: 'King',   capacity: 2, base_price: 150, currency: 'USD', status: 'occupied',   amenities: ['WiFi','AC','TV','Minibar'], description: 'Spacious deluxe room' },
  { id: 'r5', floor_id: 'f2', floor_name: 'First Floor',  room_number: '102', room_type: 'Suite',    bed_type: 'King',   capacity: 3, base_price: 250, currency: 'USD', status: 'available',  amenities: ['WiFi','AC','TV','Minibar','Jacuzzi'], description: 'Luxury suite' },
  { id: 'r6', floor_id: 'f2', floor_name: 'First Floor',  room_number: '103', room_type: 'Standard', bed_type: 'Twin',   capacity: 2, base_price: 90,  currency: 'USD', status: 'reserved',   amenities: ['WiFi','AC','TV'], description: '' },
  { id: 'r7', floor_id: 'f3', floor_name: 'Second Floor', room_number: '201', room_type: 'Suite',    bed_type: 'King',   capacity: 4, base_price: 320, currency: 'USD', status: 'available',  amenities: ['WiFi','AC','TV','Balcony','Jacuzzi','Minibar'], description: 'Corner suite with panoramic views' },
  { id: 'r8', floor_id: 'f3', floor_name: 'Second Floor', room_number: '202', room_type: 'Deluxe',   bed_type: 'Queen',  capacity: 2, base_price: 140, currency: 'USD', status: 'blocked',    amenities: ['WiFi','AC','TV'], description: '' },
];

const SAMPLE_BOOKINGS = [
  { id: 'b1', ref: 'PMS-ABCD1234', room_id: 'r2', room_number: 'G02', floor_name: 'Ground Floor', room_type: 'Deluxe', guest_name: 'Sarah & James Okonkwo', guest_email: 'sarah@example.com', guest_phone: '+1 555 0101', check_in: '2026-10-10', check_out: '2026-10-13', num_guests: 2, booking_status: 'confirmed', payment_status: 'paid', amount_paid: 360, total_amount: 360, remaining_balance: 0, special_requests: 'Late check-in around 10pm', source: 'direct', created_at: '2026-10-01T09:00:00Z' },
  { id: 'b2', ref: 'PMS-EFGH5678', room_id: 'r4', room_number: '101',  floor_name: 'First Floor',  room_type: 'Deluxe', guest_name: 'Amara Diallo',           guest_email: 'amara@example.com',  guest_phone: '+33 6 12 34 56 78', check_in: '2026-10-08', check_out: '2026-10-11', num_guests: 1, booking_status: 'checked_in', payment_status: 'paid', amount_paid: 450, total_amount: 450, remaining_balance: 0, special_requests: '', source: 'booking.com', created_at: '2026-09-28T14:00:00Z' },
  { id: 'b3', ref: 'PMS-IJKL9012', room_id: 'r6', room_number: '103',  floor_name: 'First Floor',  room_type: 'Standard', guest_name: 'Chen Wei',             guest_email: 'chen@example.com',   guest_phone: '+86 138 0000 0000',  check_in: '2026-10-15', check_out: '2026-10-18', num_guests: 2, booking_status: 'pending',    payment_status: 'pending', amount_paid: 0, total_amount: 270, remaining_balance: 270, special_requests: 'Ground floor if possible', source: 'direct', created_at: '2026-10-05T11:00:00Z' },
  { id: 'b4', ref: 'PMS-MNOP3456', room_id: 'r7', room_number: '201',  floor_name: 'Second Floor', room_type: 'Suite', guest_name: 'Fatima Al-Rashid',       guest_email: 'fatima@example.com', guest_phone: '+971 50 123 4567',   check_in: '2026-10-20', check_out: '2026-10-25', num_guests: 3, booking_status: 'confirmed', payment_status: 'partially_paid', amount_paid: 800, total_amount: 1600, remaining_balance: 800, special_requests: 'Honeymoon setup please', source: 'direct', created_at: '2026-10-03T16:00:00Z' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function money(val, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(val) || 0);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function calcNights(ci, co) {
  try { return Math.max(1, Math.round((new Date(co) - new Date(ci)) / 86400000)); } catch { return 1; }
}
function getRoomStatus(key) { return ROOM_STATUSES.find(s => s.key === key) || ROOM_STATUSES[0]; }

const MENU_ITEMS = [
  { id: 'dashboard',      label: 'Dashboard',            icon: 'ph-squares-four' },
  { id: 'visual-builder', label: 'Visual Floor Builder', icon: 'ph-blueprint', badge: 'Interactive' },
  { id: 'floors',         label: 'Floor Manager',        icon: 'ph-stack' },
  { id: 'rooms',          label: 'Room Inventory',       icon: 'ph-bed' },
  { id: 'calendar',       label: 'Calendar',             icon: 'ph-calendar-dots' },
  { id: 'bookings',       label: 'Bookings',             icon: 'ph-receipt' },
  { id: 'blocking',       label: 'Room Blocking',        icon: 'ph-prohibit' },
  { id: 'reports',        label: 'Reports',              icon: 'ph-chart-bar' },
];

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, type = 'booking' }) {
  const bookingColors = {
    pending:     'bg-amber-100 text-amber-700 border-amber-200',
    confirmed:   'bg-emerald-100 text-emerald-700 border-emerald-200',
    checked_in:  'bg-blue-100 text-blue-700 border-blue-200',
    checked_out: 'bg-purple-100 text-purple-700 border-purple-200',
    cancelled:   'bg-red-100 text-red-600 border-red-200',
    no_show:     'bg-slate-100 text-slate-600 border-slate-200',
  };
  const paymentColors = {
    pending:         'bg-amber-100 text-amber-700 border-amber-200',
    partially_paid:  'bg-orange-100 text-orange-700 border-orange-200',
    paid:            'bg-emerald-100 text-emerald-700 border-emerald-200',
    refunded:        'bg-rose-100 text-rose-700 border-rose-200',
  };
  const colors = type === 'payment' ? paymentColors : bookingColors;
  const label = (status || '').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border capitalize ${colors[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

// ─── Room Status Chip ─────────────────────────────────────────────────────────
function RoomChip({ status }) {
  const s = getRoomStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${s.bg} ${s.text} border ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, maxW = 'max-w-2xl' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full ${maxW} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="font-black text-lg text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <i className="ph ph-x text-sm" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children, required }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
const inputCls = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all";

// ─── Confirmation Letter Preview ──────────────────────────────────────────────
function ConfirmationLetter({ booking, hotelName, hotelAddress, contactEmail, contactPhone }) {
  const nights = calcNights(booking.check_in, booking.check_out);
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden font-sans text-slate-800" id="confirmation-letter">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 px-8 py-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-1">Official Booking Confirmation</div>
            <h2 className="text-2xl font-black">{hotelName || 'Your Hotel'}</h2>
            {hotelAddress && <p className="text-indigo-200 text-sm mt-1">{hotelAddress}</p>}
          </div>
          <div className="text-right">
            <div className="text-xs text-indigo-300 font-bold">Booking Reference</div>
            <div className="text-2xl font-black text-white tracking-widest">{booking.ref}</div>
            <div className="text-indigo-300 text-xs mt-1">Issued: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Guest Info */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Guest Information</div>
            <div className="font-black text-lg text-slate-900">{booking.guest_name}</div>
            <div className="text-sm text-slate-600 mt-1">{booking.guest_email}</div>
            {booking.guest_phone && <div className="text-sm text-slate-600">{booking.guest_phone}</div>}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Booking Status</div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-black ${booking.booking_status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {(booking.booking_status || '').replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stay Details */}
        <div className="bg-slate-50 rounded-2xl p-5">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Stay Details</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 font-semibold">Check-in</div>
              <div className="font-black text-slate-900 mt-0.5">{fmtDate(booking.check_in)}</div>
              <div className="text-xs text-slate-500 mt-0.5">From 14:00</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 font-semibold">Duration</div>
              <div className="font-black text-2xl text-indigo-600 mt-0.5">{nights}</div>
              <div className="text-xs text-slate-500">night{nights !== 1 ? 's' : ''}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 font-semibold">Check-out</div>
              <div className="font-black text-slate-900 mt-0.5">{fmtDate(booking.check_out)}</div>
              <div className="text-xs text-slate-500 mt-0.5">By 12:00</div>
            </div>
          </div>
        </div>

        {/* Room + Payment */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-indigo-50 rounded-2xl p-4">
            <div className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-3">Room</div>
            <div className="font-black text-slate-900">Room {booking.room_number || '—'}</div>
            <div className="text-sm text-slate-600">{booking.room_type}</div>
            {booking.floor_name && <div className="text-xs text-slate-500 mt-0.5">{booking.floor_name}</div>}
            <div className="text-sm text-slate-600 mt-1">Guests: {booking.num_guests}</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-400 mb-3">Payment Summary</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Total Amount</span><span className="font-black text-slate-900">{money(booking.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Amount Paid</span><span className="font-black text-emerald-700">{money(booking.amount_paid)}</span></div>
              <div className="flex justify-between border-t border-emerald-200 pt-1.5 mt-1.5"><span className="text-slate-600">Remaining</span><span className="font-black text-slate-900">{money(booking.remaining_balance)}</span></div>
            </div>
          </div>
        </div>

        {booking.special_requests && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="text-xs font-black uppercase tracking-wider text-amber-600 mb-1">Special Requests</div>
            <p className="text-sm text-slate-700">{booking.special_requests}</p>
          </div>
        )}

        {/* Contact */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-sm text-slate-500">
          <div>
            {contactEmail && <div><i className="ph ph-envelope mr-1" />{contactEmail}</div>}
            {contactPhone && <div><i className="ph ph-phone mr-1" />{contactPhone}</div>}
          </div>
          <div className="text-right">
            <div className="font-black text-slate-400 text-xs">BOOKINGCART PMS</div>
            <div className="text-xs">bookingcart.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PMSDashboardPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Data state (starts clean for real property owners)
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [stats, setStats] = useState({
    total_rooms: 0, available_rooms: 0, occupied_rooms: 0, total_bookings: 0,
    pending_bookings: 0, confirmed_bookings: 0, todays_checkins: 0, todays_checkouts: 0,
    revenue_total: 0, revenue_month: 0,
  });

  // Calendar
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [calYear, setCalYear]  = useState(today.getFullYear());
  const [calView, setCalView]  = useState('monthly');

  // Booking filter
  const [bookingFilter, setBookingFilter] = useState('all');

  // Modals
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditFloor, setShowEditFloor] = useState(null);
  const [showAddRoom, setShowAddRoom]   = useState(false);
  const [showEditRoom, setShowEditRoom] = useState(null);
  const [showAddBooking, setShowAddBooking]  = useState(false);
  const [showViewBooking, setShowViewBooking] = useState(null);
  const [showBlockRoom, setShowBlockRoom]    = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(null);

  // Hotel profile
  const [hotelProfile, setHotelProfile] = useState(null);

  // Form states
  const [newFloor, setNewFloor]   = useState({ name: '', sort_order: 0 });
  const [newRoom, setNewRoom]     = useState({ floor_id: '', room_number: '', room_type: 'Standard', bed_type: 'Queen', capacity: 2, base_price: '', currency: 'USD', amenities: '', description: '', size_sqm: '' });
  const [newBooking, setNewBooking] = useState({ room_id: '', guest_name: '', guest_email: '', guest_phone: '', check_in: '', check_out: '', num_guests: 1, total_amount: '', special_requests: '' });
  const [newBlock, setNewBlock]   = useState({ room_id: '', from_date: '', to_date: '', reason: 'blocked', notes: '' });

  // ── API helper ──────────────────────────────────────────────────────────────
  const pmsApi = useCallback(async (action, data = {}) => {
    const token = getToken ? getToken() : localStorage.getItem('bc_jwt');
    const res = await fetch('/api/pms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...data }),
    });
    return res.json();
  }, [getToken]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load hotel profile ──────────────────────────────────────────────────────
  useEffect(() => {
    document.title = 'Property Management System | BookingCart';
    if (!user) { navigate('/auth?redirect=/hotel-dashboard?tab=pms'); return; }
    const token = getToken ? getToken() : localStorage.getItem('bc_jwt');
    fetch('/api/hotel-profiles', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => { if (d.ok && d.profile) setHotelProfile(d.profile); }).catch(() => {});
  }, [user, navigate, getToken]);

  // ── Load PMS data on tab change ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadData() {
      setLoading(true);
      try {
        const [fRes, rRes, bRes, stRes] = await Promise.all([
          pmsApi('list-floors'),
          pmsApi('list-rooms'),
          pmsApi('list-bookings'),
          pmsApi('dashboard-stats'),
        ]);
        if (fRes.ok) setFloors(fRes.floors || []);
        if (rRes.ok) setRooms(rRes.rooms || []);
        if (bRes.ok) setBookings(bRes.bookings || []);
        if (stRes.ok) setStats(stRes.stats || {
          total_rooms: 0, available_rooms: 0, occupied_rooms: 0, total_bookings: 0,
          pending_bookings: 0, confirmed_bookings: 0, todays_checkins: 0, todays_checkouts: 0,
          revenue_total: 0, revenue_month: 0,
        });
      } catch {
        // Clean empty state on network error
      } finally { setLoading(false); }
    }
    loadData();
  }, [user, pmsApi]);

  // ── Floor CRUD ──────────────────────────────────────────────────────────────
  async function handleAddFloor(e) {
    e.preventDefault();
    if (!newFloor.name.trim()) return;
    setSaving(true);
    try {
      const res = await pmsApi('add-floor', newFloor);
      if (res.ok) {
        setFloors(f => [...f, res.floor]);
        setShowAddFloor(false);
        setNewFloor({ name: '', sort_order: floors.length });
        showToast('Floor added successfully!');
      } else {
        // Demo mode: add locally
        const id = `f${Date.now()}`;
        setFloors(f => [...f, { id, ...newFloor, room_count: 0, created_at: new Date().toISOString() }]);
        setShowAddFloor(false); setNewFloor({ name: '', sort_order: 0 });
        showToast('Floor added (demo mode)');
      }
    } catch {
      const id = `f${Date.now()}`;
      setFloors(f => [...f, { id, ...newFloor, room_count: 0 }]);
      setShowAddFloor(false); showToast('Floor added (offline)');
    } finally { setSaving(false); }
  }

  async function handleDeleteFloor(floor_id) {
    if (!confirm('Delete this floor? Rooms will be unassigned.')) return;
    try { await pmsApi('delete-floor', { floor_id }); } catch {}
    setFloors(f => f.filter(x => String(x.id) !== String(floor_id)));
    showToast('Floor deleted');
  }

  // ── Room CRUD ───────────────────────────────────────────────────────────────
  async function handleAddRoom(e) {
    e.preventDefault();
    if (!newRoom.room_number.trim()) return;
    setSaving(true);
    const payload = {
      ...newRoom,
      amenities: newRoom.amenities ? newRoom.amenities.split(',').map(s => s.trim()).filter(Boolean) : [],
      capacity: parseInt(newRoom.capacity) || 2,
      base_price: parseFloat(newRoom.base_price) || 0,
      size_sqm: parseInt(newRoom.size_sqm) || null,
    };
    try {
      const res = await pmsApi('add-room', payload);
      if (res.ok) {
        setRooms(r => [...r, { ...res.room, floor_name: floors.find(f => String(f.id) === String(res.room.floor_id))?.name || null }]);
        showToast('Room added!');
      } else {
        const id = `r${Date.now()}`;
        const floor = floors.find(f => String(f.id) === String(payload.floor_id));
        setRooms(r => [...r, { id, ...payload, floor_name: floor?.name || null, status: 'available', created_at: new Date().toISOString() }]);
        showToast('Room added (demo)');
      }
      setShowAddRoom(false);
      setNewRoom({ floor_id: '', room_number: '', room_type: 'Standard', bed_type: 'Queen', capacity: 2, base_price: '', currency: 'USD', amenities: '', description: '', size_sqm: '' });
    } catch {
      showToast('Error adding room', 'error');
    } finally { setSaving(false); }
  }

  async function handleEditRoomStatus(room_id, status) {
    try { await pmsApi('edit-room', { room_id, status }); } catch {}
    setRooms(r => r.map(x => String(x.id) === String(room_id) ? { ...x, status } : x));
    showToast(`Room status updated to ${status}`);
  }

  async function handleDeleteRoom(room_id) {
    if (!confirm('Delete this room permanently?')) return;
    try { await pmsApi('delete-room', { room_id }); } catch {}
    setRooms(r => r.filter(x => String(x.id) !== String(room_id)));
    showToast('Room deleted');
  }

  // ── Booking CRUD ─────────────────────────────────────────────────────────────
  async function handleAddBooking(e) {
    e.preventDefault();
    if (!newBooking.room_id || !newBooking.guest_name || !newBooking.guest_email || !newBooking.check_in || !newBooking.check_out) return;
    setSaving(true);
    try {
      const res = await pmsApi('create-booking', { ...newBooking, num_guests: parseInt(newBooking.num_guests) || 1, total_amount: parseFloat(newBooking.total_amount) || 0 });
      if (res.ok) {
        const room = rooms.find(r => String(r.id) === String(newBooking.room_id));
        setBookings(b => [{ ...res.booking, room_number: room?.room_number, room_type: room?.room_type, floor_name: room?.floor_name }, ...b]);
        showToast(`Booking ${res.ref} created!`);
      } else {
        if (res.error?.includes('unavailable')) {
          showToast('Room is unavailable for those dates!', 'error');
          setSaving(false); return;
        }
        // Demo: add locally
        const ref = `PMS-DEMO${Date.now().toString().slice(-6)}`;
        const room = rooms.find(r => String(r.id) === String(newBooking.room_id));
        const bk = { id: `b${Date.now()}`, ref, ...newBooking, room_number: room?.room_number, room_type: room?.room_type, floor_name: room?.floor_name, booking_status: 'pending', payment_status: 'pending', amount_paid: 0, remaining_balance: parseFloat(newBooking.total_amount) || 0, created_at: new Date().toISOString() };
        setBookings(b => [bk, ...b]);
        showToast(`Booking ${ref} created (demo)!`);
      }
      setShowAddBooking(false);
      setNewBooking({ room_id: '', guest_name: '', guest_email: '', guest_phone: '', check_in: '', check_out: '', num_guests: 1, total_amount: '', special_requests: '' });
    } catch { showToast('Error creating booking', 'error'); }
    finally { setSaving(false); }
  }

  async function handleUpdateBookingStatus(booking_id, booking_status, payment_status) {
    try { await pmsApi('update-booking-status', { booking_id, booking_status, payment_status }); } catch {}
    setBookings(b => b.map(x => String(x.id) === String(booking_id) ? { ...x, ...(booking_status ? { booking_status } : {}), ...(payment_status ? { payment_status } : {}) } : x));
    showToast('Booking updated!');
  }

  // ── Blocking ─────────────────────────────────────────────────────────────────
  async function handleAddBlock(e) {
    e.preventDefault();
    if (!newBlock.room_id || !newBlock.from_date || !newBlock.to_date) return;
    setSaving(true);
    try {
      const res = await pmsApi('block-room', newBlock);
      if (res.ok) {
        setBlocks(b => [...b, res.block]);
      } else {
        const id = `bl${Date.now()}`;
        setBlocks(b => [...b, { id, ...newBlock, created_at: new Date().toISOString() }]);
      }
      const room = rooms.find(r => String(r.id) === String(newBlock.room_id));
      if (room && newBlock.reason === 'maintenance') handleEditRoomStatus(newBlock.room_id, 'maintenance');
      else if (room && newBlock.reason === 'blocked') handleEditRoomStatus(newBlock.room_id, 'blocked');
      setShowBlockRoom(false);
      setNewBlock({ room_id: '', from_date: '', to_date: '', reason: 'blocked', notes: '' });
      showToast('Room blocked successfully!');
    } catch { showToast('Error blocking room', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeleteBlock(block_id) {
    try { await pmsApi('delete-block', { block_id }); } catch {}
    setBlocks(b => b.filter(x => String(x.id) !== String(block_id)));
    showToast('Block removed');
  }

  // ── Calendar helpers ─────────────────────────────────────────────────────────
  function getDaysInMonth(m, y) { return new Date(y, m, 0).getDate(); }
  function getFirstDayOfMonth(m, y) { return new Date(y, m - 1, 1).getDay(); }

  function getDayStatus(roomId, day) {
    const date = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const bk = bookings.find(b => {
      if (String(b.room_id) !== String(roomId)) return false;
      if (['cancelled','no_show'].includes(b.booking_status)) return false;
      return b.check_in <= date && b.check_out > date;
    });
    if (bk) return { type: 'booked', booking: bk };
    const bl = blocks.find(bl => String(bl.room_id) === String(roomId) && bl.from_date <= date && bl.to_date > date);
    if (bl) return { type: 'blocked', block: bl };
    return { type: 'available' };
  }

  const calColors = {
    available: 'bg-emerald-100 text-emerald-700 cursor-default',
    booked:    'bg-blue-100 text-blue-700 cursor-pointer',
    blocked:   'bg-red-100 text-red-600 cursor-pointer',
  };

  const hotelName = hotelProfile?.step_property_info?.hotelName || 'Your Property';
  const hotelCity = hotelProfile?.step_location?.city || '';
  const contactEmail = hotelProfile?.step_contact?.bookingEmail || user?.email || '';
  const contactPhone = hotelProfile?.step_contact?.phone || '';
  const hotelAddress = [hotelProfile?.step_location?.address, hotelCity, hotelProfile?.step_location?.country].filter(Boolean).join(', ');

  const filteredBookings = bookings.filter(b => bookingFilter === 'all' || b.booking_status === bookingFilter);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row pb-20 md:pb-0">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm transition-all ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'}`}>
          <i className={`ph ${toast.type === 'error' ? 'ph-warning-circle' : 'ph-check-circle'} text-xl`} />
          {toast.msg}
        </div>
      )}

      {/* ── Mobile header ─────────────────────────────────────────────────────── */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
          <i className="ph-fill ph-buildings text-indigo-600 text-2xl" />
          <span>PMS</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xl">
          <i className={`ph ${mobileMenuOpen ? 'ph-x' : 'ph-list'}`} />
        </button>
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────────────────── */}
      <aside className={`fixed md:sticky top-0 left-0 bottom-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div>
          <div className="hidden md:flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <i className="ph-fill ph-buildings text-white text-lg" />
            </div>
            <div>
              <div className="font-black text-sm text-slate-900 dark:text-white leading-none">PMS Dashboard</div>
              <div className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider mt-0.5">Property Management</div>
            </div>
          </div>

          {/* Hotel name */}
          <div className="mb-5 px-3 py-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-0.5">Property</div>
            <div className="font-black text-slate-900 dark:text-white text-sm truncate">{hotelName}</div>
            {hotelCity && <div className="text-xs text-slate-500 truncate">{hotelCity}</div>}
          </div>

          <nav className="space-y-0.5">
            {MENU_ITEMS.map(item => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full px-3 py-2.5 rounded-2xl font-bold text-xs flex items-center justify-between transition-all ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <div className="flex items-center gap-3">
                    <i className={`ph ${item.icon} text-base`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-indigo-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <a href="/hotel-dashboard" className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-colors">
            <i className="ph ph-arrow-left text-sm" /> Back to Dashboard
          </a>
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">

        {/* ══════════════════════════════════════════ VISUAL FLOOR BUILDER ═══ */}
        {activeTab === 'visual-builder' && (
          <VisualFloorPlanBuilder
            token={getToken ? getToken() : localStorage.getItem('bc_jwt')}
            onRoomsUpdated={() => pmsApi('list-rooms')}
          />
        )}

        {/* ═══════════════════════════════════════════ DASHBOARD ═══════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, rgba(139,92,246,0.4) 0%, transparent 60%)' }} />
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                  <i className="ph ph-buildings" /> Property Management System
                </div>
                <h1 className="text-2xl sm:text-4xl font-black mb-2">Welcome back, {user?.name?.split(' ')[0] || 'Owner'}!</h1>
                <p className="text-indigo-200 text-sm">{hotelName} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Rooms', value: stats.total_rooms, icon: 'ph-bed', color: 'text-indigo-600', bg: 'bg-indigo-50', sub: `${stats.available_rooms} available` },
                { label: "Today's Check-ins", value: stats.todays_checkins, icon: 'ph-sign-in', color: 'text-emerald-600', bg: 'bg-emerald-50', sub: 'Arriving today' },
                { label: "Today's Check-outs", value: stats.todays_checkouts, icon: 'ph-sign-out', color: 'text-orange-500', bg: 'bg-orange-50', sub: 'Departing today' },
                { label: 'Total Bookings', value: stats.total_bookings, icon: 'ph-receipt', color: 'text-blue-600', bg: 'bg-blue-50', sub: `${stats.pending_bookings} pending` },
              ].map(({ label, value, icon, color, bg, sub }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <div className={`w-10 h-10 ${bg} rounded-2xl flex items-center justify-center mb-3`}>
                    <i className={`ph ${icon} ${color} text-xl`} />
                  </div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">{value}</div>
                  <div className="text-xs font-bold text-slate-500 mt-0.5">{label}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* Revenue + Occupancy */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Monthly Revenue</div>
                <div className="text-3xl font-black text-emerald-600">{money(stats.revenue_month)}</div>
                <div className="text-xs text-slate-400 mt-1">Lifetime: {money(stats.revenue_total)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Occupancy Rate</div>
                <div className="text-3xl font-black text-indigo-600">
                  {stats.total_rooms > 0 ? Math.round(((stats.total_rooms - stats.available_rooms) / stats.total_rooms) * 100) : 0}%
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mt-3">
                  <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${stats.total_rooms > 0 ? Math.round(((stats.total_rooms - stats.available_rooms) / stats.total_rooms) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Room Status</div>
                <div className="space-y-2">
                  {ROOM_STATUSES.slice(0, 4).map(s => {
                    const count = rooms.filter(r => r.status === s.key).length;
                    return count > 0 ? (
                      <div key={s.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${s.color}`} />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{s.label}</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{count}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Add Floor', icon: 'ph-stack', action: () => setShowAddFloor(true), color: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25' },
                { label: 'Add Room', icon: 'ph-plus-square', action: () => setShowAddRoom(true), color: 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/25' },
                { label: 'New Booking', icon: 'ph-plus-circle', action: () => setShowAddBooking(true), color: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25' },
                { label: 'Block Room', icon: 'ph-prohibit', action: () => setShowBlockRoom(true), color: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25' },
              ].map(({ label, icon, action, color }) => (
                <button key={label} onClick={action} className={`py-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${color}`}>
                  <i className={`ph ${icon} text-base`} />
                  {label}
                </button>
              ))}
            </div>

            {/* Recent bookings */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 dark:text-white">Recent Bookings</h3>
                <button onClick={() => setActiveTab('bookings')} className="text-xs font-bold text-indigo-600 hover:underline">View All</button>
              </div>
              <div className="space-y-3">
                {bookings.slice(0, 4).map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 font-black text-sm">
                        {b.guest_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">{b.guest_name}</div>
                        <div className="text-[11px] text-slate-400">Room {b.room_number} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.booking_status} />
                      <button onClick={() => setShowViewBooking(b)} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold"><i className="ph ph-eye" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ FLOOR MANAGER ══════════════ */}
        {activeTab === 'floors' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Floor Manager</h2>
                <p className="text-xs text-slate-500 mt-1">Manage property floors and room structure</p>
              </div>
              <button onClick={() => setShowAddFloor(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-md transition-all">
                <i className="ph ph-plus" /> Add Floor
              </button>
            </div>

            {/* Property tree */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/25">
                  <i className="ph ph-buildings text-white text-lg" />
                </div>
                <div>
                  <div className="font-black text-slate-900 dark:text-white">{hotelName}</div>
                  <div className="text-xs text-slate-500">{floors.length} floors · {rooms.length} rooms</div>
                </div>
              </div>

              <div className="space-y-4">
                {floors.map((floor, fi) => {
                  const floorRooms = rooms.filter(r => String(r.floor_id) === String(floor.id));
                  return (
                    <div key={floor.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center">
                            <i className="ph ph-stack text-indigo-600 text-sm" />
                          </div>
                          <div>
                            <span className="font-black text-slate-900 dark:text-white">{floor.name}</span>
                            <span className="text-xs text-slate-400 ml-3">{floorRooms.length} rooms</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setShowEditFloor(floor)} className="text-xs font-bold text-slate-500 hover:text-indigo-600 px-2 py-1 hover:bg-indigo-50 rounded-lg transition-colors">
                            <i className="ph ph-pencil" /> Edit
                          </button>
                          <button onClick={() => handleDeleteFloor(floor.id)} className="text-xs font-bold text-slate-500 hover:text-red-500 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">
                            <i className="ph ph-trash" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {floorRooms.map(room => {
                          const s = getRoomStatus(room.status);
                          return (
                            <div key={room.id} className={`p-3 rounded-xl border ${s.border} ${s.bg} cursor-pointer hover:shadow-md transition-all`}
                              onClick={() => setShowEditRoom(room)}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-slate-900 dark:text-slate-100 text-sm">Room {room.room_number}</span>
                                <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                              </div>
                              <div className="text-[11px] text-slate-500">{room.room_type}</div>
                              <div className="text-[11px] text-slate-500">{room.bed_type} · {room.capacity} guests</div>
                              <div className="text-xs font-bold text-indigo-600 mt-1">{money(room.base_price)}/night</div>
                            </div>
                          );
                        })}
                        <button onClick={() => { setNewRoom(r => ({ ...r, floor_id: floor.id })); setShowAddRoom(true); }}
                          className="p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all min-h-[80px]">
                          <i className="ph ph-plus-circle text-xl" />
                          <span className="text-[11px] font-semibold">Add Room</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {floors.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <i className="ph ph-stack text-5xl mb-3 block" />
                    <p className="font-semibold">No floors yet. Add your first floor to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ ROOM INVENTORY ══════════════ */}
        {activeTab === 'rooms' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Room Inventory</h2>
                <p className="text-xs text-slate-500 mt-1">{rooms.length} rooms across {floors.length} floors</p>
              </div>
              <button onClick={() => setShowAddRoom(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-md transition-all">
                <i className="ph ph-plus" /> Add Room
              </button>
            </div>

            {/* Status legend */}
            <div className="flex flex-wrap gap-2">
              {ROOM_STATUSES.map(s => (
                <span key={s.key} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${s.bg} ${s.text} border ${s.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                  {s.label}: {rooms.filter(r => r.status === s.key).length}
                </span>
              ))}
            </div>

            {/* Room grid by floor */}
            {floors.map(floor => {
              const floorRooms = rooms.filter(r => String(r.floor_id) === String(floor.id));
              if (!floorRooms.length) return null;
              return (
                <div key={floor.id}>
                  <h3 className="font-black text-slate-700 dark:text-slate-300 text-sm mb-3 flex items-center gap-2">
                    <i className="ph ph-stack text-indigo-500" /> {floor.name}
                    <span className="text-slate-400 font-normal">({floorRooms.length} rooms)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {floorRooms.map(room => {
                      const s = getRoomStatus(room.status);
                      return (
                        <div key={room.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-all">
                          <div className={`h-1.5 ${s.color}`} />
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="font-black text-slate-900 dark:text-white">Room {room.room_number}</div>
                                <div className="text-xs text-slate-500">{room.room_type} · {room.bed_type}</div>
                              </div>
                              <RoomChip status={room.status} />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                              <span><i className="ph ph-users mr-0.5" />{room.capacity} guests</span>
                              {room.size_sqm && <span>{room.size_sqm}m²</span>}
                            </div>
                            {room.amenities?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {(Array.isArray(room.amenities) ? room.amenities : []).slice(0, 3).map(a => (
                                  <span key={a} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">{a}</span>
                                ))}
                                {room.amenities.length > 3 && <span className="text-[10px] text-slate-400">+{room.amenities.length - 3}</span>}
                              </div>
                            )}
                            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                              <span className="font-black text-indigo-600">{money(room.base_price)}<span className="text-xs font-normal text-slate-400">/night</span></span>
                              <div className="flex gap-1">
                                <button onClick={() => setShowEditRoom(room)} className="w-7 h-7 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg flex items-center justify-center transition-colors text-sm">
                                  <i className="ph ph-pencil" />
                                </button>
                                <button onClick={() => handleDeleteRoom(room.id)} className="w-7 h-7 bg-slate-100 dark:bg-slate-800 hover:bg-red-100 text-slate-500 hover:text-red-500 rounded-lg flex items-center justify-center transition-colors text-sm">
                                  <i className="ph ph-trash" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Rooms without floor */}
            {(() => {
              const orphans = rooms.filter(r => !r.floor_id || !floors.find(f => String(f.id) === String(r.floor_id)));
              if (!orphans.length) return null;
              return (
                <div>
                  <h3 className="font-black text-slate-500 text-sm mb-3"><i className="ph ph-question mr-1" />Unassigned ({orphans.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {orphans.map(room => (
                      <div key={room.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <div className="font-black text-slate-900 dark:text-white">Room {room.room_number}</div>
                        <div className="text-xs text-slate-500">{room.room_type}</div>
                        <div className="font-black text-indigo-600 text-sm mt-2">{money(room.base_price)}/night</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════════════════════════════════ CALENDAR ════════════════════ */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Availability Calendar</h2>
                <p className="text-xs text-slate-500 mt-1">Visual room occupancy and booking overview</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { const d = new Date(calYear, calMonth - 2); setCalMonth(d.getMonth() + 1); setCalYear(d.getFullYear()); }} className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors">
                  <i className="ph ph-caret-left" />
                </button>
                <span className="font-black text-slate-900 dark:text-white min-w-[130px] text-center">
                  {new Date(calYear, calMonth - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => { const d = new Date(calYear, calMonth); setCalMonth(d.getMonth() + 1); setCalYear(d.getFullYear()); }} className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors">
                  <i className="ph ph-caret-right" />
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Available', color: 'bg-emerald-200' },
                { label: 'Booked', color: 'bg-blue-300' },
                { label: 'Blocked', color: 'bg-red-300' },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span className={`w-3 h-3 rounded ${color}`} />{label}
                </span>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left p-3 font-black text-slate-500 w-32 sticky left-0 bg-white dark:bg-slate-900 z-10">Room</th>
                    {Array.from({ length: getDaysInMonth(calMonth, calYear) }, (_, i) => {
                      const d = new Date(calYear, calMonth - 1, i + 1);
                      const isToday = d.toDateString() === new Date().toDateString();
                      return (
                        <th key={i} className={`text-center p-1 font-bold ${isToday ? 'text-indigo-600' : 'text-slate-400'}`} style={{ minWidth: 32 }}>
                          <div className={`w-7 h-7 rounded-full mx-auto flex items-center justify-center ${isToday ? 'bg-indigo-600 text-white' : ''}`}>
                            {i + 1}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => (
                    <tr key={room.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-3 sticky left-0 bg-white dark:bg-slate-900 z-10">
                        <div className="font-bold text-slate-900 dark:text-white">Room {room.room_number}</div>
                        <div className="text-[10px] text-slate-400">{room.floor_name}</div>
                      </td>
                      {Array.from({ length: getDaysInMonth(calMonth, calYear) }, (_, i) => {
                        const day = i + 1;
                        const { type, booking: bk, block: bl } = getDayStatus(room.id, day);
                        const cls = type === 'booked' ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 cursor-pointer' : type === 'blocked' ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 cursor-pointer' : 'bg-emerald-50 dark:bg-emerald-950/20';
                        return (
                          <td key={i} className={`text-center h-9 ${cls} transition-colors border-r border-slate-100 dark:border-slate-800`}
                            onClick={() => { if (bk) setShowViewBooking(bk); }}
                            title={bk ? `${bk.guest_name} (${bk.ref})` : bl ? `${bl.reason}` : 'Available'}>
                            {type === 'booked' && <span className="text-blue-600 font-black text-[10px]">✓</span>}
                            {type === 'blocked' && <span className="text-red-500 font-black text-[10px]">✕</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Room status cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.filter(r => r.status !== 'available').map(room => {
                const activeBk = bookings.find(b => String(b.room_id) === String(room.id) && ['confirmed','checked_in','pending'].includes(b.booking_status));
                const activeBlock = blocks.find(bl => String(bl.room_id) === String(room.id));
                return (
                  <div key={room.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-slate-900 dark:text-white">Room {room.room_number}</span>
                      <RoomChip status={room.status} />
                    </div>
                    <div className="text-xs text-slate-500 mb-2">{room.floor_name}</div>
                    {activeBk && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-2.5 text-xs">
                        <div className="font-bold text-blue-800 dark:text-blue-300">{activeBk.guest_name}</div>
                        <div className="text-blue-600">{fmtDate(activeBk.check_in)} → {fmtDate(activeBk.check_out)}</div>
                      </div>
                    )}
                    {activeBlock && !activeBk && (
                      <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-2.5 text-xs">
                        <div className="font-bold text-red-700 dark:text-red-400 capitalize">{activeBlock.reason.replace(/_/g, ' ')}</div>
                        <div className="text-red-500">{fmtDate(activeBlock.from_date)} → {fmtDate(activeBlock.to_date)}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ BOOKINGS ════════════════════ */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Booking Management</h2>
                <p className="text-xs text-slate-500 mt-1">{filteredBookings.length} of {bookings.length} bookings</p>
              </div>
              <div className="flex gap-3">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold overflow-x-auto">
                  {['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(f => (
                    <button key={f} onClick={() => setBookingFilter(f)}
                      className={`px-3 py-1.5 rounded-xl capitalize whitespace-nowrap transition-colors ${bookingFilter === f ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                      {f.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowAddBooking(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-md transition-all whitespace-nowrap">
                  <i className="ph ph-plus" /> New Booking
                </button>
              </div>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total', value: bookings.length, color: 'text-slate-900' },
                { label: 'Pending', value: bookings.filter(b => b.booking_status === 'pending').length, color: 'text-amber-600' },
                { label: 'Confirmed', value: bookings.filter(b => b.booking_status === 'confirmed').length, color: 'text-emerald-600' },
                { label: 'Checked In', value: bookings.filter(b => b.booking_status === 'checked_in').length, color: 'text-blue-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm text-center">
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                  <div className="text-xs font-bold text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Bookings table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      {['Ref', 'Guest', 'Room', 'Dates', 'Guests', 'Amount', 'Status', 'Payment', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBookings.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-black text-xs text-indigo-600">{b.ref}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white text-xs">{b.guest_name}</div>
                          <div className="text-[11px] text-slate-400">{b.guest_email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-xs text-slate-900 dark:text-white">Room {b.room_number}</div>
                          <div className="text-[11px] text-slate-400">{b.floor_name}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                          <div>{fmtDate(b.check_in)}</div>
                          <div className="text-slate-400">→ {fmtDate(b.check_out)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{b.num_guests}</td>
                        <td className="px-4 py-3">
                          <div className="font-black text-xs text-slate-900 dark:text-white">{money(b.total_amount)}</div>
                          {b.remaining_balance > 0 && <div className="text-[11px] text-amber-600">Due: {money(b.remaining_balance)}</div>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={b.booking_status} /></td>
                        <td className="px-4 py-3"><StatusBadge status={b.payment_status} type="payment" /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setShowViewBooking(b)} title="View" className="w-7 h-7 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center transition-colors">
                              <i className="ph ph-eye text-xs" />
                            </button>
                            {b.booking_status === 'pending' && (
                              <button onClick={() => handleUpdateBookingStatus(b.id, 'confirmed', null)} title="Confirm" className="w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center transition-colors">
                                <i className="ph ph-check text-xs" />
                              </button>
                            )}
                            {b.booking_status === 'confirmed' && (
                              <button onClick={() => handleUpdateBookingStatus(b.id, 'checked_in', 'paid')} title="Check In" className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition-colors">
                                <i className="ph ph-sign-in text-xs" />
                              </button>
                            )}
                            {b.booking_status === 'checked_in' && (
                              <button onClick={() => handleUpdateBookingStatus(b.id, 'checked_out', null)} title="Check Out" className="w-7 h-7 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center transition-colors">
                                <i className="ph ph-sign-out text-xs" />
                              </button>
                            )}
                            <button onClick={() => setShowConfirmation(b)} title="Confirmation Letter" className="w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center transition-colors">
                              <i className="ph ph-envelope text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12 text-slate-400 font-semibold">No bookings found for this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ ROOM BLOCKING ═══════════════ */}
        {activeTab === 'blocking' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Room Blocking</h2>
                <p className="text-xs text-slate-500 mt-1">Manually block rooms for maintenance, owner stays, or VIP reservations</p>
              </div>
              <button onClick={() => setShowBlockRoom(true)} className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-md transition-all">
                <i className="ph ph-prohibit" /> Block Room
              </button>
            </div>

            {/* Reason info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {BLOCK_REASONS.map(r => (
                <div key={r} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-center">
                  <div className="text-xs font-black text-slate-700 dark:text-slate-300 capitalize">{r.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>

            {/* Active blocks */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-black text-slate-900 dark:text-white">Active Blocks ({blocks.length})</h3>
              </div>
              {blocks.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {blocks.map(bl => {
                    const room = rooms.find(r => String(r.id) === String(bl.room_id));
                    return (
                      <div key={bl.id} className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950 flex items-center justify-center">
                            <i className="ph ph-prohibit text-red-600 text-lg" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">Room {room?.room_number || bl.room_id}</div>
                            <div className="text-xs text-slate-500 capitalize">{bl.reason?.replace(/_/g, ' ')} · {fmtDate(bl.from_date)} → {fmtDate(bl.to_date)}</div>
                            {bl.notes && <div className="text-xs text-slate-400 mt-0.5">{bl.notes}</div>}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteBlock(bl.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors flex items-center gap-1">
                          <i className="ph ph-x" /> Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <i className="ph ph-prohibit text-5xl mb-3 block" />
                  <p className="font-semibold">No active room blocks</p>
                  <p className="text-sm mt-1">Block rooms to prevent bookings during maintenance or special periods</p>
                </div>
              )}
            </div>

            {/* Room status quick control */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <h3 className="font-black text-slate-900 dark:text-white mb-4">Quick Room Status Control</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">Room {room.room_number}</div>
                      <div className="text-xs text-slate-500">{room.floor_name}</div>
                    </div>
                    <select
                      value={room.status}
                      onChange={e => handleEditRoomStatus(room.id, e.target.value)}
                      className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {ROOM_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════ REPORTS ═════════════════════ */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Reports & Analytics</h2>
              <p className="text-xs text-slate-500 mt-1">Property performance insights</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Occupancy Rate', value: `${stats.total_rooms > 0 ? Math.round(((stats.total_rooms - stats.available_rooms) / stats.total_rooms) * 100) : 0}%`, icon: 'ph-chart-pie', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Total Revenue', value: money(stats.revenue_total), icon: 'ph-currency-dollar', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Monthly Revenue', value: money(stats.revenue_month), icon: 'ph-trend-up', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Avg Stay', value: `${bookings.length > 0 ? (bookings.reduce((a, b) => a + calcNights(b.check_in, b.check_out), 0) / bookings.length).toFixed(1) : 0} nights`, icon: 'ph-moon', color: 'text-purple-600', bg: 'bg-purple-50' },
              ].map(({ label, value, icon, color, bg }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <div className={`w-10 h-10 ${bg} rounded-2xl flex items-center justify-center mb-3`}>
                    <i className={`ph ${icon} ${color} text-xl`} />
                  </div>
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                  <div className="text-xs font-bold text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Room performance table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-black text-slate-900 dark:text-white">Room Performance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      {['Room', 'Floor', 'Type', 'Rate', 'Bookings', 'Revenue', 'Status'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rooms.map(room => {
                      const roomBookings = bookings.filter(b => String(b.room_id) === String(room.id) && !['cancelled','no_show'].includes(b.booking_status));
                      const revenue = roomBookings.reduce((a, b) => a + parseFloat(b.amount_paid || 0), 0);
                      return (
                        <tr key={room.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">Room {room.room_number}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{room.floor_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{room.room_type}</td>
                          <td className="px-4 py-3 font-bold text-indigo-600 text-xs">{money(room.base_price)}/night</td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{roomBookings.length}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600 text-xs">{money(revenue)}</td>
                          <td className="px-4 py-3"><RoomChip status={room.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Booking source distribution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-black text-slate-900 dark:text-white mb-4">Booking Status Distribution</h3>
                <div className="space-y-3">
                  {BOOKING_STATUSES.map(s => {
                    const count = bookings.filter(b => b.booking_status === s).length;
                    const pct = bookings.length > 0 ? Math.round((count / bookings.length) * 100) : 0;
                    const colors = { pending: 'bg-amber-400', confirmed: 'bg-emerald-500', checked_in: 'bg-blue-500', checked_out: 'bg-purple-500', cancelled: 'bg-red-400', no_show: 'bg-slate-400' };
                    return (
                      <div key={s}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-600 dark:text-slate-400 capitalize">{s.replace(/_/g, ' ')}</span>
                          <span className="font-black text-slate-900 dark:text-white">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                          <div className={`h-full rounded-full ${colors[s] || 'bg-slate-400'} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-black text-slate-900 dark:text-white mb-4">Cancellation Rate</h3>
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="text-5xl font-black text-slate-900 dark:text-white">
                      {bookings.length > 0 ? Math.round((bookings.filter(b => b.booking_status === 'cancelled').length / bookings.length) * 100) : 0}%
                    </div>
                    <div className="text-sm text-slate-400 mt-2">Cancellation Rate</div>
                    <div className="text-xs text-slate-500 mt-1">{bookings.filter(b => b.booking_status === 'cancelled').length} of {bookings.length} bookings</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ════════════════════════════════════════════════════════ MODALS ═══════ */}

      {/* Add Floor Modal */}
      <Modal open={showAddFloor} onClose={() => setShowAddFloor(false)} title="Add New Floor" maxW="max-w-md">
        <form onSubmit={handleAddFloor} className="space-y-4">
          <Field label="Floor Name" required>
            <input type="text" required value={newFloor.name} onChange={e => setNewFloor(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Ground Floor, First Floor, Penthouse" />
          </Field>
          <Field label="Sort Order" >
            <input type="number" value={newFloor.sort_order} onChange={e => setNewFloor(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className={inputCls} placeholder="0 = ground, 1 = first, etc." />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAddFloor(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors text-sm disabled:opacity-60">{saving ? 'Adding…' : 'Add Floor'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit Floor Modal */}
      <Modal open={!!showEditFloor} onClose={() => setShowEditFloor(null)} title="Edit Floor" maxW="max-w-md">
        {showEditFloor && (
          <form onSubmit={async e => {
            e.preventDefault();
            setSaving(true);
            try { await pmsApi('edit-floor', { floor_id: showEditFloor.id, name: showEditFloor.name, sort_order: showEditFloor.sort_order }); } catch {}
            setFloors(f => f.map(x => String(x.id) === String(showEditFloor.id) ? { ...x, ...showEditFloor } : x));
            setShowEditFloor(null); showToast('Floor updated!'); setSaving(false);
          }} className="space-y-4">
            <Field label="Floor Name" required>
              <input type="text" required value={showEditFloor.name} onChange={e => setShowEditFloor(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Sort Order">
              <input type="number" value={showEditFloor.sort_order} onChange={e => setShowEditFloor(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowEditFloor(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors text-sm">{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add Room Modal */}
      <Modal open={showAddRoom} onClose={() => setShowAddRoom(false)} title="Add New Room">
        <form onSubmit={handleAddRoom} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Number" required>
              <input type="text" required value={newRoom.room_number} onChange={e => setNewRoom(r => ({ ...r, room_number: e.target.value }))} className={inputCls} placeholder="e.g. G01, 101, PH01" />
            </Field>
            <Field label="Floor">
              <select value={newRoom.floor_id} onChange={e => setNewRoom(r => ({ ...r, floor_id: e.target.value }))} className={inputCls}>
                <option value="">No floor</option>
                {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Room Type">
              <select value={newRoom.room_type} onChange={e => setNewRoom(r => ({ ...r, room_type: e.target.value }))} className={inputCls}>
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Bed Type">
              <select value={newRoom.bed_type} onChange={e => setNewRoom(r => ({ ...r, bed_type: e.target.value }))} className={inputCls}>
                {BED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Capacity">
              <input type="number" min={1} max={20} value={newRoom.capacity} onChange={e => setNewRoom(r => ({ ...r, capacity: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Base Price">
              <input type="number" min={0} step="0.01" value={newRoom.base_price} onChange={e => setNewRoom(r => ({ ...r, base_price: e.target.value }))} className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Currency">
              <select value={newRoom.currency} onChange={e => setNewRoom(r => ({ ...r, currency: e.target.value }))} className={inputCls}>
                {['USD','EUR','GBP','KES','NGN','ZAR','UGX'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Size (m²)" >
            <input type="number" value={newRoom.size_sqm} onChange={e => setNewRoom(r => ({ ...r, size_sqm: e.target.value }))} className={inputCls} placeholder="e.g. 32" />
          </Field>
          <Field label="Amenities" >
            <input type="text" value={newRoom.amenities} onChange={e => setNewRoom(r => ({ ...r, amenities: e.target.value }))} className={inputCls} placeholder="WiFi, AC, TV, Minibar (comma-separated)" />
          </Field>
          <Field label="Description">
            <textarea rows={2} value={newRoom.description} onChange={e => setNewRoom(r => ({ ...r, description: e.target.value }))} className={`${inputCls} resize-none`} placeholder="Brief room description..." />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAddRoom(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm">{saving ? 'Adding…' : 'Add Room'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit Room Modal */}
      <Modal open={!!showEditRoom} onClose={() => setShowEditRoom(null)} title={`Edit Room ${showEditRoom?.room_number || ''}`}>
        {showEditRoom && (
          <form onSubmit={async e => {
            e.preventDefault();
            setSaving(true);
            try { await pmsApi('edit-room', { room_id: showEditRoom.id, ...showEditRoom, amenities: Array.isArray(showEditRoom.amenities) ? showEditRoom.amenities : showEditRoom.amenities?.split(',').map(s => s.trim()).filter(Boolean) }); } catch {}
            setRooms(r => r.map(x => String(x.id) === String(showEditRoom.id) ? { ...x, ...showEditRoom } : x));
            setShowEditRoom(null); showToast('Room updated!'); setSaving(false);
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Room Number"><input type="text" value={showEditRoom.room_number} onChange={e => setShowEditRoom(r => ({ ...r, room_number: e.target.value }))} className={inputCls} /></Field>
              <Field label="Floor">
                <select value={showEditRoom.floor_id || ''} onChange={e => setShowEditRoom(r => ({ ...r, floor_id: e.target.value }))} className={inputCls}>
                  <option value="">No floor</option>
                  {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Room Type">
                <select value={showEditRoom.room_type} onChange={e => setShowEditRoom(r => ({ ...r, room_type: e.target.value }))} className={inputCls}>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Bed Type">
                <select value={showEditRoom.bed_type} onChange={e => setShowEditRoom(r => ({ ...r, bed_type: e.target.value }))} className={inputCls}>
                  {BED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Capacity"><input type="number" min={1} value={showEditRoom.capacity} onChange={e => setShowEditRoom(r => ({ ...r, capacity: e.target.value }))} className={inputCls} /></Field>
              <Field label="Base Price"><input type="number" min={0} step="0.01" value={showEditRoom.base_price} onChange={e => setShowEditRoom(r => ({ ...r, base_price: e.target.value }))} className={inputCls} /></Field>
              <Field label="Status">
                <select value={showEditRoom.status} onChange={e => setShowEditRoom(r => ({ ...r, status: e.target.value }))} className={inputCls}>
                  {ROOM_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Amenities">
              <input type="text" value={Array.isArray(showEditRoom.amenities) ? showEditRoom.amenities.join(', ') : showEditRoom.amenities || ''} onChange={e => setShowEditRoom(r => ({ ...r, amenities: e.target.value }))} className={inputCls} placeholder="WiFi, AC, TV (comma-separated)" />
            </Field>
            <Field label="Description">
              <textarea rows={2} value={showEditRoom.description || ''} onChange={e => setShowEditRoom(r => ({ ...r, description: e.target.value }))} className={`${inputCls} resize-none`} />
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowEditRoom(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm">{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add Booking Modal */}
      <Modal open={showAddBooking} onClose={() => setShowAddBooking(false)} title="Create New Booking">
        <form onSubmit={handleAddBooking} className="space-y-4">
          <Field label="Room" required>
            <select required value={newBooking.room_id} onChange={e => setNewBooking(b => ({ ...b, room_id: e.target.value }))} className={inputCls}>
              <option value="">Select room…</option>
              {rooms.filter(r => r.status === 'available' || r.status === 'reserved').map(r => (
                <option key={r.id} value={r.id}>Room {r.room_number} ({r.room_type}) — {money(r.base_price)}/night</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Guest Name" required>
              <input type="text" required value={newBooking.guest_name} onChange={e => setNewBooking(b => ({ ...b, guest_name: e.target.value }))} className={inputCls} placeholder="Full name" />
            </Field>
            <Field label="Guest Email" required>
              <input type="email" required value={newBooking.guest_email} onChange={e => setNewBooking(b => ({ ...b, guest_email: e.target.value }))} className={inputCls} placeholder="email@example.com" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <input type="tel" value={newBooking.guest_phone} onChange={e => setNewBooking(b => ({ ...b, guest_phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Guests">
              <input type="number" min={1} max={20} value={newBooking.num_guests} onChange={e => setNewBooking(b => ({ ...b, num_guests: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Check-in" required>
              <input type="date" required value={newBooking.check_in} onChange={e => setNewBooking(b => ({ ...b, check_in: e.target.value }))} className={inputCls} min={new Date().toISOString().split('T')[0]} />
            </Field>
            <Field label="Check-out" required>
              <input type="date" required value={newBooking.check_out} onChange={e => setNewBooking(b => ({ ...b, check_out: e.target.value }))} className={inputCls} min={newBooking.check_in || new Date().toISOString().split('T')[0]} />
            </Field>
          </div>
          <Field label="Total Amount">
            <input type="number" min={0} step="0.01" value={newBooking.total_amount} onChange={e => setNewBooking(b => ({ ...b, total_amount: e.target.value }))} className={inputCls} placeholder="0.00" />
          </Field>
          <Field label="Special Requests">
            <textarea rows={2} value={newBooking.special_requests} onChange={e => setNewBooking(b => ({ ...b, special_requests: e.target.value }))} className={`${inputCls} resize-none`} placeholder="Any guest requests…" />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAddBooking(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm">{saving ? 'Creating…' : 'Create Booking'}</button>
          </div>
        </form>
      </Modal>

      {/* View Booking Modal */}
      <Modal open={!!showViewBooking} onClose={() => setShowViewBooking(null)} title={`Booking ${showViewBooking?.ref || ''}`}>
        {showViewBooking && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Guest</div>
                <div className="font-black text-slate-900 dark:text-white">{showViewBooking.guest_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{showViewBooking.guest_email}</div>
                {showViewBooking.guest_phone && <div className="text-xs text-slate-500">{showViewBooking.guest_phone}</div>}
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Room</div>
                <div className="font-black text-slate-900 dark:text-white">Room {showViewBooking.room_number}</div>
                <div className="text-xs text-slate-500">{showViewBooking.room_type} · {showViewBooking.floor_name}</div>
                <div className="text-xs text-slate-500">{showViewBooking.num_guests} guest(s)</div>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 grid grid-cols-3 gap-4">
              <div><div className="text-xs text-slate-400 mb-0.5">Check-in</div><div className="font-black text-slate-900 dark:text-white text-sm">{fmtDate(showViewBooking.check_in)}</div></div>
              <div className="text-center"><div className="text-xs text-slate-400 mb-0.5">Nights</div><div className="font-black text-indigo-600 text-xl">{calcNights(showViewBooking.check_in, showViewBooking.check_out)}</div></div>
              <div className="text-right"><div className="text-xs text-slate-400 mb-0.5">Check-out</div><div className="font-black text-slate-900 dark:text-white text-sm">{fmtDate(showViewBooking.check_out)}</div></div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <div className="text-xs font-black uppercase text-slate-400 mb-1">Booking Status</div>
                <StatusBadge status={showViewBooking.booking_status} />
              </div>
              <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <div className="text-xs font-black uppercase text-slate-400 mb-1">Payment</div>
                <StatusBadge status={showViewBooking.payment_status} type="payment" />
              </div>
              <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <div className="text-xs font-black uppercase text-slate-400 mb-1">Total</div>
                <div className="font-black text-emerald-600">{money(showViewBooking.total_amount)}</div>
                {showViewBooking.remaining_balance > 0 && <div className="text-[11px] text-amber-600">Due: {money(showViewBooking.remaining_balance)}</div>}
              </div>
            </div>
            {showViewBooking.special_requests && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                <div className="text-xs font-black uppercase text-amber-600 mb-1">Special Requests</div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{showViewBooking.special_requests}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              {showViewBooking.booking_status === 'pending' && (
                <button onClick={() => { handleUpdateBookingStatus(showViewBooking.id, 'confirmed', null); setShowViewBooking(b => ({ ...b, booking_status: 'confirmed' })); }} className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2">
                  <i className="ph ph-check-circle" /> Confirm Booking
                </button>
              )}
              {showViewBooking.booking_status === 'confirmed' && (
                <button onClick={() => { handleUpdateBookingStatus(showViewBooking.id, 'checked_in', 'paid'); setShowViewBooking(b => ({ ...b, booking_status: 'checked_in', payment_status: 'paid' })); }} className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2">
                  <i className="ph ph-sign-in" /> Check In Guest
                </button>
              )}
              {showViewBooking.booking_status === 'checked_in' && (
                <button onClick={() => { handleUpdateBookingStatus(showViewBooking.id, 'checked_out', null); setShowViewBooking(b => ({ ...b, booking_status: 'checked_out' })); }} className="py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2">
                  <i className="ph ph-sign-out" /> Check Out Guest
                </button>
              )}
              <button onClick={() => { setShowConfirmation(showViewBooking); setShowViewBooking(null); }} className="py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2">
                <i className="ph ph-envelope" /> Send Confirmation
              </button>
              <button onClick={() => { if (confirm('Cancel this booking?')) { handleUpdateBookingStatus(showViewBooking.id, 'cancelled', null); setShowViewBooking(null); }}} className="py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2">
                <i className="ph ph-x-circle" /> Cancel Booking
              </button>
              <button onClick={() => setShowViewBooking(null)} className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-xs transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Block Room Modal */}
      <Modal open={showBlockRoom} onClose={() => setShowBlockRoom(false)} title="Block a Room" maxW="max-w-md">
        <form onSubmit={handleAddBlock} className="space-y-4">
          <Field label="Room" required>
            <select required value={newBlock.room_id} onChange={e => setNewBlock(b => ({ ...b, room_id: e.target.value }))} className={inputCls}>
              <option value="">Select room…</option>
              {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} ({r.room_type})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From Date" required>
              <input type="date" required value={newBlock.from_date} onChange={e => setNewBlock(b => ({ ...b, from_date: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="To Date" required>
              <input type="date" required value={newBlock.to_date} onChange={e => setNewBlock(b => ({ ...b, to_date: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <Field label="Reason">
            <select value={newBlock.reason} onChange={e => setNewBlock(b => ({ ...b, reason: e.target.value }))} className={inputCls}>
              {BLOCK_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <textarea rows={2} value={newBlock.notes} onChange={e => setNewBlock(b => ({ ...b, notes: e.target.value }))} className={`${inputCls} resize-none`} placeholder="Optional details…" />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowBlockRoom(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm">{saving ? 'Blocking…' : 'Block Room'}</button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Letter Modal */}
      <Modal open={!!showConfirmation} onClose={() => setShowConfirmation(null)} title="Booking Confirmation Letter" maxW="max-w-3xl">
        {showConfirmation && (
          <div className="space-y-4">
            <ConfirmationLetter
              booking={showConfirmation}
              hotelName={hotelName}
              hotelAddress={hotelAddress}
              contactEmail={contactEmail}
              contactPhone={contactPhone}
            />
            <div className="flex gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button onClick={() => { window.print(); }} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
                <i className="ph ph-printer" /> Print / Save PDF
              </button>
              <button onClick={() => { const el = document.querySelector('#confirmation-letter'); if (el) { const w = window.open('', '_blank'); w.document.write(`<html><head><title>Booking Confirmation ${showConfirmation.ref}</title><style>body{font-family:sans-serif;padding:20px;}</style></head><body>${el.outerHTML}</body></html>`); w.print(); } }} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
                <i className="ph ph-download" /> Download
              </button>
              <button onClick={() => setShowConfirmation(null)} className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl text-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
