import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Museum','Art Gallery','Theme Park','National Park','Historic Site',
  'Beach','Waterfall','Wildlife Reserve','Cultural Center','Adventure Sport',
  'Food & Dining','Shopping','Religious Site','Garden','Viewpoint',
  'Zoo / Aquarium','Water Park','Stadium','Casino','Spa & Wellness','Other',
];

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',        dot: 'bg-slate-400' },
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',         dot: 'bg-amber-400' },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-400' },
  rejected:  { label: 'Rejected',  color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',             dot: 'bg-rose-400' },
};

const MENU_ITEMS = [
  { id: 'overview',      label: 'Overview',       icon: 'ph-squares-four' },
  { id: 'attractions',   label: 'My Attractions',  icon: 'ph-map-trifold' },
  { id: 'create',        label: 'Create New',      icon: 'ph-plus-circle' },
  { id: 'analytics',     label: 'Analytics',       icon: 'ph-chart-line-up' },
  { id: 'notifications', label: 'Notifications',   icon: 'ph-bell' },
  { id: 'settings',      label: 'Profile Settings',icon: 'ph-gear' },
];

// Colour theme
const ACCENT = 'violet';
const ACCENT_BG   = 'bg-violet-600';
const ACCENT_HOVER= 'hover:bg-violet-700';
const ACCENT_TEXT = 'text-violet-600';
const ACCENT_LIGHT= 'bg-violet-50 dark:bg-violet-950/40';
const ACCENT_RING = 'focus:ring-violet-500';
const ACCENT_SHADOW = 'shadow-violet-600/20';
const SIDEBAR_ACTIVE = `bg-violet-600 text-white shadow-md shadow-violet-600/20`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ value, color = 'bg-violet-500' }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, value || 0)}%` }} />
    </div>
  );
}

// Simple sparkline chart using SVG
function Sparkline({ data = [], color = '#7c3aed', height = 48 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 200;
  const h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(' L ')}`;
  const areaD = `M ${pts[0]} L ${pts.join(' L ')} L ${(data.length - 1) / (data.length - 1) * w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#','')})`} />
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10 rounded-t-3xl">
          <h3 className="font-black text-lg text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors">
            <i className="ph ph-x text-sm" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Form field helpers ────────────────────────────────────────────────────────
function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = `w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl
  px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400
  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors`;

const textareaCls = `${inputCls} resize-none`;

// ─── Attraction Form (create/edit) ────────────────────────────────────────────
function AttractionForm({ initial = {}, onSubmit, loading, submitLabel = 'Save Attraction' }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', country: '', location: '',
    description: '', featured_image: '', price: '', currency: 'USD',
    duration: '', highlights: '', tags: '', contact_email: '', contact_phone: '',
    ...initial,
    highlights: Array.isArray(initial.highlights) ? initial.highlights.join('\n') : (initial.highlights || ''),
    tags: Array.isArray(initial.tags) ? initial.tags.join(', ') : (initial.tags || ''),
    contact_email: initial.contact?.email || '',
    contact_phone: initial.contact?.phone || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      name: form.name.trim(),
      category: form.category,
      city: form.city.trim(),
      country: form.country.trim(),
      location: form.location.trim() || `${form.city}, ${form.country}`,
      description: form.description.trim(),
      featured_image: form.featured_image.trim(),
      price: parseFloat(form.price) || 0,
      currency: form.currency || 'USD',
      duration: form.duration.trim(),
      highlights: form.highlights.split('\n').map(s => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      contact: { email: form.contact_email.trim(), phone: form.contact_phone.trim() },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Attraction Name" required>
          <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Victoria Falls" className={inputCls} />
        </Field>
        <Field label="Category" required>
          <select required value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="City" required>
          <input required value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Livingstone" className={inputCls} />
        </Field>
        <Field label="Country" required>
          <input required value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Zambia" className={inputCls} />
        </Field>
      </div>
      <Field label="Description" required hint="Minimum 50 characters for a complete profile">
        <textarea required rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe your attraction in detail…" className={textareaCls} />
      </Field>
      <Field label="Featured Image URL" hint="Direct link to your main attraction photo">
        <input type="url" value={form.featured_image} onChange={e => set('featured_image', e.target.value)} placeholder="https://…" className={inputCls} />
        {form.featured_image && (
          <div className="mt-2 rounded-xl overflow-hidden h-32 bg-slate-100 dark:bg-slate-800">
            <img src={form.featured_image} alt="Preview" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
          </div>
        )}
      </Field>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Price">
          <input type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" className={inputCls} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
            {['USD','EUR','GBP','KES','NGN','ZAR','UGX','TZS','GHS','EGP'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Duration" hint="e.g. 2-3 hours, Full day">
          <input value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 3 hours" className={inputCls} />
        </Field>
      </div>
      <Field label="Highlights" hint="One highlight per line">
        <textarea rows={3} value={form.highlights} onChange={e => set('highlights', e.target.value)} placeholder={"Guided tour included\nFree parking\nFamily friendly"} className={textareaCls} />
      </Field>
      <Field label="Tags" hint="Comma-separated: safari, wildlife, outdoor">
        <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="safari, wildlife, outdoor" className={inputCls} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Contact Email">
          <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="booking@example.com" className={inputCls} />
        </Field>
        <Field label="Contact Phone">
          <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+1 555 000 0000" className={inputCls} />
        </Field>
      </div>

      <div className="pt-2 flex gap-3 justify-end">
        <button type="submit" disabled={loading}
          className={`px-6 py-3 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-sm rounded-xl transition-all shadow-lg ${ACCENT_SHADOW} flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>
          {loading ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <><i className="ph ph-floppy-disk" /> {submitLabel}</>}
        </button>
      </div>
    </form>
  );
}

// ─── Attraction Card ──────────────────────────────────────────────────────────
function AttractionCard({ attraction: a, onEdit, onDelete, onDuplicate, onSubmit, onPreview }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group flex flex-col">
      {/* Featured Image */}
      <div className="relative h-40 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950/50 dark:to-indigo-950/50 overflow-hidden flex-shrink-0">
        {a.featured_image ? (
          <img src={a.featured_image} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { e.target.style.display='none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <i className="ph ph-image text-4xl text-violet-300 dark:text-violet-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3">
          <StatusBadge status={a.status} />
        </div>
        {/* Actions menu */}
        <div className="absolute top-2 right-2" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-8 h-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-white transition-colors shadow-sm"
          >
            <i className="ph ph-dots-three-vertical text-base" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-20 overflow-hidden py-1">
              <button onClick={() => { onEdit(a); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i className="ph ph-pencil text-slate-400" /> Edit
              </button>
              <button onClick={() => { onDuplicate(a.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i className="ph ph-copy text-slate-400" /> Duplicate
              </button>
              <button onClick={() => { onPreview(a); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i className="ph ph-eye text-slate-400" /> Preview
              </button>
              {(a.status === 'draft' || a.status === 'rejected') && (
                <button onClick={() => { onSubmit(a.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors">
                  <i className="ph ph-paper-plane-tilt text-violet-500" /> Submit for Review
                </button>
              )}
              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
              <button onClick={() => { onDelete(a.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">
                <i className="ph ph-trash text-rose-500" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div>
          <h3 className="font-black text-sm text-slate-900 dark:text-white line-clamp-1">{a.name || 'Unnamed Attraction'}</h3>
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500">
            <i className="ph ph-map-pin text-violet-400 flex-shrink-0" />
            <span className="line-clamp-1">{a.city}{a.country ? `, ${a.country}` : ''}</span>
          </div>
        </div>

        {a.category && (
          <span className="self-start px-2 py-0.5 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[10px] font-bold rounded-full border border-violet-200 dark:border-violet-800">
            {a.category}
          </span>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold">
            <span className="flex items-center gap-1"><i className="ph ph-eye" /> {a.views || 0}</span>
            <span className="flex items-center gap-1"><i className="ph ph-calendar-blank" /> {fmtDate(a.created_at)}</span>
          </div>
          {a.price > 0 && (
            <span className="text-xs font-black text-violet-600">{a.currency} {parseFloat(a.price).toFixed(0)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DEMO notifications ───────────────────────────────────────────────────────
const DEMO_NOTIFS = [
  { id: 1, icon: 'ph-check-circle', color: 'text-emerald-500', title: 'Listing Approved', body: 'Your attraction "Safari Wildlife Walk" has been approved and is now live.', time: '2 hours ago', read: false },
  { id: 2, icon: 'ph-star', color: 'text-amber-500', title: 'New Inquiry', body: 'You have a new booking inquiry for "Sunset Boat Tour".', time: '5 hours ago', read: false },
  { id: 3, icon: 'ph-warning', color: 'text-rose-500', title: 'Listing Rejected', body: 'Your submission "Night Market Tour" requires revision. Please update the description.', time: 'Yesterday', read: true },
  { id: 4, icon: 'ph-bell', color: 'text-violet-500', title: 'System Update', body: 'New analytics features have been added to your dashboard.', time: '3 days ago', read: true },
  { id: 5, icon: 'ph-users', color: 'text-blue-500', title: 'Profile View Milestone', body: 'Your attractions have received 1,000+ total views this month!', time: '4 days ago', read: true },
];

// Demo analytics data
function generateWeekData(base = 10, variance = 8) {
  return Array.from({ length: 12 }, (_, i) => Math.max(0, base + Math.round((Math.sin(i * 0.8) * variance) + (Math.random() * variance * 0.5))));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AttractionDashboardPage() {
  const { user, getToken, authHeaders } = useAuth();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();

  const [activeTab, setActiveTab] = useState(tabParam || 'overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data
  const [attractions, setAttractions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 12;

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // Notifications
  const [notifs, setNotifs] = useState(DEMO_NOTIFS);

  // Profile settings
  const [profileForm, setProfileForm] = useState({ name: '', email: '', businessName: '', phone: '', website: '', bio: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Analytics
  const [analyticsData] = useState({
    viewsData: generateWeekData(45, 20),
    inquiriesData: generateWeekData(8, 5),
    months: ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'],
  });

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadAttractions = useCallback(async (pg = 1, reset = false) => {
    if (!user) return;
    try {
      reset ? setLoading(true) : null;
      const params = new URLSearchParams({ page: pg, limit: LIMIT });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/attraction-profiles?${params}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => reset || pg === 1 ? data.attractions : [...prev, ...data.attractions]);
        setTotal(data.total || 0);
        setPage(pg);
      } else {
        setError(data.error || 'Failed to load attractions');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, authHeaders, statusFilter, search]);

  useEffect(() => {
    document.title = 'Attraction Owner Dashboard | BookingCart';
    if (!user) {
      navigate('/auth?redirect=/attraction-dashboard');
      return;
    }
    setProfileForm({
      name: user.name || '',
      email: user.email || '',
      businessName: user.businessName || '',
      phone: user.phone || '',
      website: user.website || '',
      bio: user.bio || '',
    });
    loadAttractions(1, true);
  }, [user, navigate]);

  // Re-fetch on filter change
  useEffect(() => {
    if (user) loadAttractions(1, true);
  }, [statusFilter, search]);

  // ── Sorted list ─────────────────────────────────────────────────────────────
  const sortedAttractions = [...attractions].sort((a, b) => {
    if (sortBy === 'views') return (b.views || 0) - (a.views || 0);
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    return new Date(b.created_at) - new Date(a.created_at); // newest
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = {
    total: total,
    published: attractions.filter(a => a.status === 'published').length,
    pending: attractions.filter(a => a.status === 'pending').length,
    draft: attractions.filter(a => a.status === 'draft').length,
    views: attractions.reduce((s, a) => s + (a.views || 0), 0),
    bookings: attractions.reduce((s, a) => s + (a.bookings || 0), 0),
  };

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleCreate(formData) {
    setCreateLoading(true);
    try {
      const res = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'create', data: formData }),
      });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => [data.attraction, ...prev]);
        setTotal(t => t + 1);
        setShowCreate(false);
        setActiveTab('attractions');
      } else {
        alert(data.error || 'Failed to create attraction');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit(formData) {
    if (!editTarget) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'save', id: editTarget.id, data: formData }),
      });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => prev.map(a => a.id === data.attraction.id ? data.attraction : a));
        setEditTarget(null);
      } else {
        alert(data.error || 'Failed to update attraction');
      }
    } catch {
      alert('Network error.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this attraction? This action cannot be undone.')) return;
    try {
      const res = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => prev.filter(a => a.id !== id));
        setTotal(t => Math.max(0, t - 1));
      } else {
        alert(data.error || 'Failed to delete.');
      }
    } catch {
      alert('Network error.');
    }
  }

  async function handleDuplicate(id) {
    try {
      const res = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'duplicate', id }),
      });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => [data.attraction, ...prev]);
        setTotal(t => t + 1);
      } else {
        alert(data.error || 'Failed to duplicate.');
      }
    } catch {
      alert('Network error.');
    }
  }

  async function handleSubmit(id) {
    if (!window.confirm('Submit this attraction for admin review? You cannot edit it while under review.')) return;
    try {
      const res = await fetch('/api/attraction-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'submit', id }),
      });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => prev.map(a => a.id === id ? { ...a, status: 'pending' } : a));
      } else {
        alert(data.error || 'Failed to submit.');
      }
    } catch {
      alert('Network error.');
    }
  }

  const unreadCount = notifs.filter(n => !n.read).length;

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className={`
      fixed md:sticky top-0 left-0 bottom-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800
      p-6 flex flex-col justify-between transition-transform duration-300 h-screen overflow-y-auto
      ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div>
        {/* Logo */}
        <div className="hidden md:flex items-center gap-3 mb-8">
          <div className={`w-10 h-10 rounded-2xl ${ACCENT_BG} text-white flex items-center justify-center font-black text-xl shadow-lg ${ACCENT_SHADOW}`}>
            <i className="ph-fill ph-map-trifold" />
          </div>
          <div>
            <div className="font-black text-base text-slate-900 dark:text-white leading-none">Attraction Portal</div>
            <div className={`text-[10px] font-extrabold ${ACCENT_TEXT} uppercase tracking-wider mt-1`}>Owner Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="space-y-1">
          {MENU_ITEMS.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                className={`w-full px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-3 transition-all ${
                  active ? SIDEBAR_ACTIVE : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <i className={`ph ${item.icon} text-lg`} />
                <span>{item.label}</span>
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span className="ml-auto bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <button
          onClick={() => { setShowCreate(true); setMobileMenuOpen(false); }}
          className={`w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all`}
        >
          <i className="ph ph-plus-circle text-base" /> Add Attraction
        </button>
        <div className="text-[11px] text-slate-400 text-center font-semibold">
          {user?.name || user?.email}
        </div>
      </div>
    </aside>
  );

  // ─── Tabs ────────────────────────────────────────────────────────────────────

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  const OverviewTab = () => (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative bg-gradient-to-r from-slate-900 via-violet-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest mb-4">
            Dashboard Overview
          </span>
          <h1 className="text-2xl sm:text-4xl font-black mb-2 leading-tight">
            Welcome back, {user?.name?.split(' ')[0] || 'Owner'}! 👋
          </h1>
          <p className="text-slate-300 text-sm font-medium mb-6">
            Manage your attraction listings, track performance, and grow your audience on BookingCart.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCreate(true)}
              className={`px-5 py-2.5 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-xs rounded-xl transition-all shadow-lg ${ACCENT_SHADOW} flex items-center gap-1.5`}>
              <i className="ph ph-plus-circle" /> Create Attraction
            </button>
            <button onClick={() => setActiveTab('attractions')}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs rounded-xl backdrop-blur-md transition-all flex items-center gap-1.5">
              <i className="ph ph-map-trifold" /> View All Listings
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: 'ph-map-trifold', color: 'text-slate-900 dark:text-white', bg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-violet-500' },
          { label: 'Published', value: stats.published, icon: 'ph-check-circle', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-500' },
          { label: 'Pending', value: stats.pending, icon: 'ph-clock', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-500' },
          { label: 'Drafts', value: stats.draft, icon: 'ph-pencil-line', color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-800/50', iconColor: 'text-slate-400' },
          { label: 'Total Views', value: stats.views.toLocaleString(), icon: 'ph-eye', color: 'text-violet-600', bg: ACCENT_LIGHT, iconColor: ACCENT_TEXT },
          { label: 'Inquiries', value: stats.bookings.toLocaleString(), icon: 'ph-envelope', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40', iconColor: 'text-indigo-500' },
        ].map(({ label, value, icon, color, bg, iconColor }) => (
          <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <i className={`ph ${icon} text-lg ${iconColor}`} />
            </div>
            <div className={`text-2xl sm:text-3xl font-black ${color}`}>{value}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Attractions */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Attractions</h3>
            <button onClick={() => setActiveTab('attractions')} className={`text-xs font-bold ${ACCENT_TEXT} hover:underline`}>View All →</button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <i className="ph ph-spinner-gap text-3xl text-violet-500 animate-spin" />
            </div>
          ) : attractions.length === 0 ? (
            <div className="text-center py-10">
              <i className="ph ph-map-trifold text-5xl text-slate-200 dark:text-slate-700 mb-3" />
              <p className="font-bold text-slate-600 dark:text-slate-400">You haven't created any attractions yet.</p>
              <button onClick={() => setShowCreate(true)}
                className={`mt-4 px-5 py-2.5 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-xs rounded-xl transition-all shadow-md`}>
                Create Your First Attraction
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {attractions.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-800 transition-colors">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-violet-100 dark:bg-violet-950/40">
                    {a.featured_image ? (
                      <img src={a.featured_image} alt={a.name} className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <i className="ph ph-image text-violet-300 dark:text-violet-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">{a.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{a.city}{a.country ? `, ${a.country}` : ''} · {fmtDate(a.created_at)}</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions + Activity Feed */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-black text-sm text-slate-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'Create Attraction', icon: 'ph-plus-circle', onClick: () => setShowCreate(true), primary: true },
                { label: 'View Analytics', icon: 'ph-chart-line-up', onClick: () => setActiveTab('analytics') },
                { label: 'Check Notifications', icon: 'ph-bell', onClick: () => setActiveTab('notifications') },
                { label: 'Edit Profile', icon: 'ph-gear', onClick: () => setActiveTab('settings') },
              ].map(({ label, icon, onClick, primary }) => (
                <button key={label} onClick={onClick}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs transition-all ${
                    primary
                      ? `${ACCENT_BG} ${ACCENT_HOVER} text-white shadow-md ${ACCENT_SHADOW}`
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}>
                  <i className={`ph ${icon} text-base`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications preview */}
          {unreadCount > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm text-slate-900 dark:text-white">Notifications</h3>
                <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{unreadCount} new</span>
              </div>
              <div className="space-y-3">
                {notifs.filter(n => !n.read).slice(0, 2).map(n => (
                  <div key={n.id} className="flex gap-3">
                    <i className={`ph ${n.icon} text-base ${n.color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-2">{n.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setActiveTab('notifications')} className={`mt-3 text-xs font-bold ${ACCENT_TEXT} hover:underline`}>
                View all notifications →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── MY ATTRACTIONS ────────────────────────────────────────────────────────
  const AttractionsTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">My Attractions</h2>
          <p className="text-xs text-slate-500 mt-0.5">{total} listing{total !== 1 ? 's' : ''} in your portfolio</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className={`flex items-center gap-2 px-5 py-2.5 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-xs rounded-xl shadow-md ${ACCENT_SHADOW} transition-all`}>
          <i className="ph ph-plus-circle" /> Add Attraction
        </button>
      </div>

      {/* Search / Filter / Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, category, city…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${inputCls} sm:w-36`}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={`${inputCls} sm:w-36`}>
          <option value="newest">Newest</option>
          <option value="views">Most Views</option>
          <option value="name">Name A–Z</option>
          <option value="status">By Status</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <i className="ph ph-spinner-gap text-4xl text-violet-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedAttractions.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
          <div className="w-20 h-20 bg-violet-50 dark:bg-violet-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ph ph-map-trifold text-4xl text-violet-300 dark:text-violet-600" />
          </div>
          <h3 className="font-black text-xl text-slate-800 dark:text-slate-200 mb-2">
            {search || statusFilter ? 'No attractions found' : "You haven't created any attractions yet."}
          </h3>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            {search || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'Start by creating your first attraction listing. It only takes a few minutes!'}
          </p>
          {!search && !statusFilter && (
            <button onClick={() => setShowCreate(true)}
              className={`px-6 py-3 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-sm rounded-xl shadow-lg ${ACCENT_SHADOW} transition-all`}>
              <i className="ph ph-plus-circle mr-2" />
              Create Your First Attraction
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && sortedAttractions.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {sortedAttractions.map(a => (
              <AttractionCard
                key={a.id}
                attraction={a}
                onEdit={setEditTarget}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onSubmit={handleSubmit}
                onPreview={setPreviewTarget}
              />
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button disabled={page <= 1} onClick={() => loadAttractions(page - 1)}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                ← Previous
              </button>
              <span className="text-xs text-slate-500 font-semibold">Page {page} of {Math.ceil(total / LIMIT)}</span>
              <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => loadAttractions(page + 1)}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  const AnalyticsTab = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Analytics</h2>
        <p className="text-xs text-slate-500 mt-0.5">Track performance across all your attraction listings.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Views (30d)', value: '1,847', change: '+12%', up: true, color: 'text-violet-600' },
          { label: 'Unique Visitors', value: '1,023', change: '+8%', up: true, color: 'text-indigo-600' },
          { label: 'Inquiries', value: '48', change: '+3%', up: true, color: 'text-emerald-600' },
          { label: 'Avg. View Time', value: '2m 18s', change: '-5%', up: false, color: 'text-slate-900 dark:text-white' },
        ].map(({ label, value, change, up, color }) => (
          <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
            <div className={`text-3xl font-black ${color}`}>{value}</div>
            <div className={`text-[10px] font-bold mt-1.5 flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
              <i className={`ph ${up ? 'ph-trend-up' : 'ph-trend-down'} text-sm`} /> {change} vs last month
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Views chart */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white">Views Over Time</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Last 12 months</p>
            </div>
            <span className="text-2xl font-black text-violet-600">{analyticsData.viewsData.reduce((a, b) => a + b, 0).toLocaleString()}</span>
          </div>
          <Sparkline data={analyticsData.viewsData} color="#7c3aed" height={64} />
          <div className="flex justify-between mt-2">
            {analyticsData.months.map((m, i) => (
              <span key={m} className="text-[8px] text-slate-400">{m}</span>
            ))}
          </div>
        </div>

        {/* Inquiries chart */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white">Inquiries / Bookings</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Last 12 months</p>
            </div>
            <span className="text-2xl font-black text-indigo-600">{analyticsData.inquiriesData.reduce((a, b) => a + b, 0)}</span>
          </div>
          <Sparkline data={analyticsData.inquiriesData} color="#4f46e5" height={64} />
          <div className="flex justify-between mt-2">
            {analyticsData.months.map(m => (
              <span key={m} className="text-[8px] text-slate-400">{m}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Top Attractions */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="font-black text-sm text-slate-900 dark:text-white mb-5">Most Viewed Attractions</h3>
        {attractions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No attraction data yet. Create your first listing!</p>
        ) : (
          <div className="space-y-4">
            {[...attractions].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((a, i) => {
              const maxViews = Math.max(...attractions.map(x => x.views || 0), 1);
              const pct = ((a.views || 0) / maxViews) * 100;
              return (
                <div key={a.id} className="flex items-center gap-4">
                  <span className="text-xs font-black text-slate-300 dark:text-slate-600 w-4 flex-shrink-0">#{i + 1}</span>
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-violet-100 dark:bg-violet-950/40">
                    {a.featured_image ? (
                      <img src={a.featured_image} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><i className="ph ph-image text-violet-300" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{a.name}</div>
                    <ProgressBar value={pct} />
                  </div>
                  <span className="text-xs font-black text-violet-600 flex-shrink-0">{a.views || 0} views</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Visitor stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Desktop', pct: 58, color: 'bg-violet-500', icon: 'ph-desktop' },
          { label: 'Mobile', pct: 37, color: 'bg-indigo-500', icon: 'ph-device-mobile' },
          { label: 'Tablet', pct: 5, color: 'bg-slate-400', icon: 'ph-device-tablet' },
        ].map(({ label, pct, color, icon }) => (
          <div key={label} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <i className={`ph ${icon} text-3xl text-slate-400 dark:text-slate-600 mb-2`} />
            <div className="text-2xl font-black text-slate-900 dark:text-white">{pct}%</div>
            <div className="text-xs font-bold text-slate-400 mb-3">{label}</div>
            <ProgressBar value={pct} color={color} />
          </div>
        ))}
      </div>
    </div>
  );

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  const NotificationsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Notifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => setNotifs(prev => prev.map(n => ({ ...n, read: true })))}
            className="text-xs font-bold text-violet-600 hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifs.map(n => (
          <div key={n.id}
            className={`bg-white dark:bg-slate-900 rounded-3xl border p-5 shadow-sm flex items-start gap-4 transition-all ${
              n.read ? 'border-slate-200 dark:border-slate-800' : 'border-violet-200 dark:border-violet-800 ring-1 ring-violet-200 dark:ring-violet-800/40'
            }`}>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${n.read ? 'bg-slate-100 dark:bg-slate-800' : ACCENT_LIGHT}`}>
              <i className={`ph ${n.icon} text-lg ${n.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-black ${n.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>{n.title}</span>
                {!n.read && <span className="w-2 h-2 bg-violet-500 rounded-full flex-shrink-0" />}
              </div>
              <p className="text-xs text-slate-500 mt-1">{n.body}</p>
              <p className="text-[10px] text-slate-400 mt-2 font-semibold">{n.time}</p>
            </div>
            <button
              onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
              className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
            >
              <i className="ph ph-x text-sm" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // ── PROFILE SETTINGS ──────────────────────────────────────────────────────
  const SettingsTab = () => {
    const [localForm, setLocalForm] = useState({ ...profileForm });
    const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
    const [section, setSection] = useState('business');

    function handleSave(e) {
      e.preventDefault();
      setSavingProfile(true);
      setProfileForm(localForm);
      setTimeout(() => {
        setSavingProfile(false);
        alert('✅ Profile saved successfully!');
      }, 800);
    }

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Profile Settings</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage your account, business details, and security.</p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
          {['business', 'contact', 'security'].map(s => (
            <button key={s} onClick={() => setSection(s)}
              className={`flex-1 py-2 rounded-xl capitalize transition-colors ${section === s ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
              {s === 'business' ? '🏢 Business' : s === 'contact' ? '📬 Contact' : '🔒 Security'}
            </button>
          ))}
        </div>

        {section === 'business' && (
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            {/* Logo placeholder */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-3xl text-violet-300 dark:text-violet-600 border-2 border-dashed border-violet-200 dark:border-violet-800">
                {localForm.name ? localForm.name.charAt(0).toUpperCase() : <i className="ph ph-building" />}
              </div>
              <div>
                <button type="button" className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5">
                  <i className="ph ph-upload" /> Upload Logo
                </button>
                <p className="text-[10px] text-slate-400 mt-1">JPG, PNG or SVG. Max 2MB.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Your Name">
                <input value={localForm.name} onChange={e => setLocalForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Business Name">
                <input value={localForm.businessName} onChange={e => setLocalForm(f => ({ ...f, businessName: e.target.value }))} placeholder="My Attractions Co." className={inputCls} />
              </Field>
            </div>

            <Field label="Bio" hint="Describe your business to visitors">
              <textarea rows={3} value={localForm.bio} onChange={e => setLocalForm(f => ({ ...f, bio: e.target.value }))} placeholder="We specialize in…" className={textareaCls} />
            </Field>

            <Field label="Website">
              <input type="url" value={localForm.website} onChange={e => setLocalForm(f => ({ ...f, website: e.target.value }))} placeholder="https://yourwebsite.com" className={inputCls} />
            </Field>

            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile}
                className={`px-6 py-3 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-sm rounded-xl transition-all shadow-md ${ACCENT_SHADOW} flex items-center gap-2 disabled:opacity-50`}>
                {savingProfile ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <><i className="ph ph-floppy-disk" /> Save Changes</>}
              </button>
            </div>
          </form>
        )}

        {section === 'contact' && (
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <Field label="Email Address">
              <input type="email" value={localForm.email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
              <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed. Contact support if needed.</p>
            </Field>
            <Field label="Phone Number">
              <input value={localForm.phone} onChange={e => setLocalForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" className={inputCls} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile}
                className={`px-6 py-3 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-sm rounded-xl transition-all shadow-md ${ACCENT_SHADOW} flex items-center gap-2 disabled:opacity-50`}>
                {savingProfile ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <><i className="ph ph-floppy-disk" /> Save Changes</>}
              </button>
            </div>
          </form>
        )}

        {section === 'security' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4">Change Password</h3>
              <div className="space-y-4">
                <Field label="Current Password">
                  <input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="New Password">
                  <input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Confirm New Password">
                  <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} className={inputCls} />
                </Field>
                <button type="button"
                  onClick={() => {
                    if (!pwForm.current || !pwForm.newPw) return alert('Fill in all password fields.');
                    if (pwForm.newPw !== pwForm.confirm) return alert('Passwords do not match.');
                    alert('Password change coming soon — use Account Settings for now.');
                  }}
                  className={`px-6 py-3 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-extrabold text-sm rounded-xl transition-all shadow-md`}>
                  Update Password
                </button>
              </div>
            </div>
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
              <a href="/account-settings" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors">
                <i className="ph ph-user-gear" /> Full Account Settings
              </a>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Main Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Header */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
          <i className="ph-fill ph-map-trifold text-violet-600 text-2xl" />
          <span className="text-base">Attraction Portal</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={() => setActiveTab('notifications')} className="relative p-2">
              <i className="ph ph-bell text-slate-600 dark:text-slate-400 text-xl" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
            </button>
          )}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xl font-bold">
            <i className={`ph ${mobileMenuOpen ? 'ph-x' : 'ph-list'}`} />
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <Sidebar />

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 max-w-7xl mx-auto w-full">
        {error && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 flex items-center gap-3">
            <i className="ph ph-warning-circle text-rose-500 text-xl flex-shrink-0" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <button onClick={() => setError('')} className="ml-auto text-rose-400"><i className="ph ph-x" /></button>
          </div>
        )}

        {activeTab === 'overview'      && <OverviewTab />}
        {activeTab === 'attractions'   && <AttractionsTab />}
        {activeTab === 'create'        && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Create New Attraction</h2>
              <p className="text-xs text-slate-500 mt-0.5">Fill in the details below to add a new attraction to your portfolio.</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <AttractionForm onSubmit={handleCreate} loading={createLoading} submitLabel="Create Attraction" />
            </div>
          </div>
        )}
        {activeTab === 'analytics'     && <AnalyticsTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'settings'      && <SettingsTab />}
      </main>

      {/* ── Modals ── */}

      {/* Create modal (triggered from overview/sidebar) */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Attraction" wide>
        <AttractionForm onSubmit={handleCreate} loading={createLoading} submitLabel="Create Attraction" />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Attraction" wide>
        {editTarget && (
          <AttractionForm
            initial={editTarget}
            onSubmit={handleEdit}
            loading={editLoading}
            submitLabel="Save Changes"
          />
        )}
      </Modal>

      {/* Preview modal */}
      <Modal open={!!previewTarget} onClose={() => setPreviewTarget(null)} title="Attraction Preview" wide>
        {previewTarget && (
          <div className="space-y-5">
            {/* Cover */}
            <div className="h-52 rounded-2xl overflow-hidden bg-violet-100 dark:bg-violet-950/40 relative">
              {previewTarget.featured_image ? (
                <img src={previewTarget.featured_image} alt={previewTarget.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <i className="ph ph-image text-6xl text-violet-200 dark:text-violet-800" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-2xl font-black text-white">{previewTarget.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={previewTarget.status} />
                  {previewTarget.category && (
                    <span className="text-[10px] font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded-full">{previewTarget.category}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Location', value: `${previewTarget.city || ''}${previewTarget.country ? `, ${previewTarget.country}` : ''}` || '—', icon: 'ph-map-pin' },
                { label: 'Price', value: previewTarget.price > 0 ? `${previewTarget.currency} ${previewTarget.price}` : 'Free', icon: 'ph-tag' },
                { label: 'Duration', value: previewTarget.duration || '—', icon: 'ph-clock' },
                { label: 'Views', value: (previewTarget.views || 0).toString(), icon: 'ph-eye' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    <i className={`ph ${icon} text-violet-400`} /> {label}
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>

            {previewTarget.description && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{previewTarget.description}</p>
              </div>
            )}

            {previewTarget.highlights?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Highlights</h4>
                <ul className="space-y-1.5">
                  {previewTarget.highlights.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <i className="ph-fill ph-check-circle text-violet-500" /> {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => { setEditTarget(previewTarget); setPreviewTarget(null); }}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-1.5">
                <i className="ph ph-pencil" /> Edit
              </button>
              {(previewTarget.status === 'draft' || previewTarget.status === 'rejected') && (
                <button onClick={() => { handleSubmit(previewTarget.id); setPreviewTarget(null); }}
                  className={`px-5 py-2.5 ${ACCENT_BG} ${ACCENT_HOVER} text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5`}>
                  <i className="ph ph-paper-plane-tilt" /> Submit for Review
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center px-2 py-2 gap-0.5">
        {MENU_ITEMS.slice(0, 5).map(item => {
          const active = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all ${active ? ACCENT_TEXT : 'text-slate-400'}`}>
              <i className={`ph ${item.icon} text-xl`} />
              <span className="text-[9px] font-bold">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
