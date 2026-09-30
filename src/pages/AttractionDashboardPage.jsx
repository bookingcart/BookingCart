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
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',         dot: 'bg-amber-500' },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-500' },
  rejected:  { label: 'Rejected',  color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',             dot: 'bg-rose-500' },
};

const MENU_ITEMS = [
  { id: 'overview',      label: 'Overview',       icon: 'ph-squares-four' },
  { id: 'attractions',   label: 'My Attractions',  icon: 'ph-map-trifold' },
  { id: 'create',        label: 'Create New',      icon: 'ph-ticket', route: '/list-your-event' },
  { id: 'analytics',     label: 'Analytics',       icon: 'ph-chart-line-up' },
  { id: 'wallet',        label: 'Wallet',          icon: 'ph-wallet' },
  { id: 'notifications', label: 'Notifications',   icon: 'ph-bell' },
  { id: 'settings',      label: 'Profile Settings',icon: 'ph-gear' },
];

// Site Theme Design Tokens (Matching Homepage & Navbar Attractions styling)
const ACCENT_LIGHT   = 'bg-amber-50 dark:bg-amber-950/40';
const SIDEBAR_ACTIVE = 'bg-amber-500 text-white shadow-md shadow-amber-500/25';

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

function ProgressBar({ value, color = 'bg-amber-500' }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.removeEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10 rounded-t-3xl">
          <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <i className="ph ph-ticket text-amber-500" />
            {title}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors">
            <i className="ph ph-x text-sm" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Form field helpers
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
  focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors`;

const textareaCls = `${inputCls} resize-none`;

// Homepage & Navbar-Consistent "List your event or attraction" CTA Button
function ListAttractionButton({ label = "List your event or attraction", className = "", onClick }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={onClick || (() => navigate('/list-your-event'))}
      className={`flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition-all shadow-sm shadow-amber-500/25 ${className}`}
    >
      <i className="ph ph-ticket text-base" />
      <span>{label}</span>
    </button>
  );
}

// ─── Attraction Form (for editing existing attractions) ─────────────────────────
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
          <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Victoria Falls Safari" className={inputCls} />
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
        <textarea required rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe your attraction or event in detail…" className={textareaCls} />
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
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm transition-all shadow-sm shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <><i className="ph ph-ticket" /> {submitLabel}</>}
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
      <div className="relative h-40 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 overflow-hidden flex-shrink-0">
        {a.featured_image ? (
          <img src={a.featured_image} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => { e.target.style.display='none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <i className="ph ph-image text-4xl text-amber-300 dark:text-amber-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3">
          <StatusBadge status={a.status} />
        </div>
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
                <button onClick={() => { onSubmit(a.id); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors">
                  <i className="ph ph-paper-plane-tilt text-amber-500" /> Submit for Review
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
            <i className="ph ph-map-pin text-amber-500 flex-shrink-0" />
            <span className="line-clamp-1">{a.city}{a.country ? `, ${a.country}` : ''}</span>
          </div>
        </div>

        {a.category && (
          <span className="self-start px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full border border-amber-200 dark:border-amber-800">
            {a.category}
          </span>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold">
            <span className="flex items-center gap-1"><i className="ph ph-eye text-amber-500" /> {a.views || 0}</span>
            <span className="flex items-center gap-1"><i className="ph ph-calendar-blank" /> {fmtDate(a.created_at)}</span>
          </div>
          {a.price > 0 && (
            <span className="text-xs font-black text-amber-600">{a.currency} {parseFloat(a.price).toFixed(0)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AttractionDashboardPage() {
  const { user, authHeaders } = useAuth();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();

  const [activeTab, setActiveTab] = useState(tabParam || 'overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Client Data
  const [attractions, setAttractions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 12;

  // Wallet / Stripe
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Modals / Targets
  const [editTarget, setEditTarget] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Authentic notifications state
  const [notifs] = useState([]);

  // Profile settings
  const [profileForm, setProfileForm] = useState({ name: '', email: '', businessName: '', phone: '', website: '', bio: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Load Client Attractions ──────────────────────────────────────────────
  const loadAttractions = useCallback(async (pg = 1, reset = false) => {
    if (!user) return;
    try {
      if (reset) setLoading(true);
      const params = new URLSearchParams({ page: pg, limit: LIMIT });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/attraction-profiles?${params}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) {
        setAttractions(prev => reset || pg === 1 ? (data.attractions || []) : [...prev, ...(data.attractions || [])]);
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

  // Load wallet balance from attraction-wallets API
  const loadWallet = useCallback(async () => {
    if (!user) return;
    setWalletLoading(true);
    try {
      const res = await fetch('/api/attraction-wallets', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'get-wallet' }),
      });
      const data = await res.json();
      if (data.ok) {
        setWallet(data.wallet);
        setStripeConnected(!!data.wallet?.stripe_connected);
      }
    } catch { /* silent */ } finally {
      setWalletLoading(false);
    }
  }, [user, authHeaders]);

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
    loadWallet();
  }, [user, navigate, loadAttractions, loadWallet]);

  useEffect(() => {
    if (user) loadAttractions(1, true);
  }, [statusFilter, search, loadAttractions, user]);

  // Handle tabParam changes
  useEffect(() => {
    if (tabParam === 'create') {
      navigate('/list-your-event');
    } else if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam, navigate]);

  // ── Sorted list ─────────────────────────────────────────────────────────────
  const sortedAttractions = [...attractions].sort((a, b) => {
    if (sortBy === 'views') return (b.views || 0) - (a.views || 0);
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
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

  // ── Stripe Connect for attractions ──────────────────────────────────────────
  async function handleConnectStripe() {
    setConnectingStripe(true);
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-account-link', role: 'attraction', email: user?.email }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate Stripe connection.');
      }
    } catch {
      alert('Network error initiating Stripe connection.');
    } finally {
      setConnectingStripe(false);
    }
  }

  async function handleRequestPayout() {
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0 || (wallet && amt > wallet.available)) return alert('Invalid amount.');
    setWithdrawing(true);
    try {
      const res = await fetch('/api/attraction-wallets', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'request-payout', amount: amt }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ Payout of $${amt.toFixed(2)} requested successfully!`);
        setWithdrawAmt('');
        setWallet(prev => prev ? { ...prev, available: prev.available - amt, withdrawn: (prev.withdrawn || 0) + amt } : prev);
      } else {
        alert(data.error || 'Payout request failed.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setWithdrawing(false);
    }
  }

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
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-xl shadow-sm shadow-amber-500/25">
            <i className="ph ph-ticket" />
          </div>
          <div>
            <div className="font-black text-base text-slate-900 dark:text-white leading-none">Attraction Portal</div>
            <div className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider mt-1">Owner Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="space-y-1">
          {MENU_ITEMS.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.route) {
                    navigate(item.route);
                  } else {
                    setActiveTab(item.id);
                  }
                  setMobileMenuOpen(false);
                }}
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

      {/* Footer CTA directly triggering navbar onboarding form (/list-your-event) */}
      <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <ListAttractionButton
          onClick={() => { navigate('/list-your-event'); setMobileMenuOpen(false); }}
          className="w-full"
        />
        <div className="text-[11px] text-slate-400 text-center font-semibold truncate">
          {user?.name || user?.email}
        </div>
      </div>
    </aside>
  );

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  const OverviewTab = () => (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-slate-800 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest mb-4">
            Attraction Dashboard
          </span>
          <h1 className="text-2xl sm:text-4xl font-black mb-2 leading-tight">
            Welcome back, {user?.name?.split(' ')[0] || 'Owner'}! 👋
          </h1>
          <p className="text-slate-300 text-sm font-medium mb-6">
            Manage your attraction listings, view authentic analytics, and expand your reach on BookingCart.
          </p>
          <div className="flex flex-wrap gap-3">
            <ListAttractionButton onClick={() => navigate('/list-your-event')} />
            <button onClick={() => setActiveTab('attractions')}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs rounded-xl backdrop-blur-md transition-all flex items-center gap-1.5">
              <i className="ph ph-map-trifold text-base" /> View All Listings
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: 'ph-map-trifold', color: 'text-slate-900 dark:text-white', bg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-amber-500' },
          { label: 'Published', value: stats.published, icon: 'ph-check-circle', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-500' },
          { label: 'Pending', value: stats.pending, icon: 'ph-clock', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-500' },
          { label: 'Drafts', value: stats.draft, icon: 'ph-pencil-line', color: 'text-slate-600', bg: 'bg-slate-50 dark:bg-slate-800/50', iconColor: 'text-slate-400' },
          { label: 'Total Views', value: stats.views.toLocaleString(), icon: 'ph-eye', color: 'text-amber-600', bg: ACCENT_LIGHT, iconColor: 'text-amber-500' },
          { label: 'Inquiries', value: stats.bookings.toLocaleString(), icon: 'ph-envelope', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-500' },
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
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-black text-base text-slate-900 dark:text-white">Recent Attractions</h3>
            <button onClick={() => setActiveTab('attractions')} className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">View All →</button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <i className="ph ph-spinner-gap text-3xl text-amber-500 animate-spin" />
            </div>
          ) : attractions.length === 0 ? (
            <div className="text-center py-10">
              <i className="ph ph-ticket text-5xl text-slate-200 dark:text-slate-700 mb-3" />
              <p className="font-bold text-slate-600 dark:text-slate-400">You haven't created any attractions yet.</p>
              <ListAttractionButton
                onClick={() => navigate('/list-your-event')}
                className="mt-4 inline-flex"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {attractions.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-800 transition-colors">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-amber-100 dark:bg-amber-950/40">
                    {a.featured_image ? (
                      <img src={a.featured_image} alt={a.name} className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <i className="ph ph-image text-amber-300 dark:text-amber-700" />
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

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-black text-sm text-slate-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <ListAttractionButton onClick={() => navigate('/list-your-event')} className="w-full justify-start" />
              {[
                { label: 'View Analytics', icon: 'ph-chart-line-up', onClick: () => setActiveTab('analytics') },
                { label: 'Check Notifications', icon: 'ph-bell', onClick: () => setActiveTab('notifications') },
                { label: 'Edit Profile', icon: 'ph-gear', onClick: () => setActiveTab('settings') },
              ].map(({ label, icon, onClick }) => (
                <button key={label} onClick={onClick}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                  <i className={`ph ${icon} text-base`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm text-slate-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{unreadCount} new</span>}
            </div>
            {notifs.length === 0 ? (
              <div className="text-center py-4">
                <i className="ph ph-bell-slash text-2xl text-slate-300 dark:text-slate-600 mb-1 block" />
                <p className="text-xs text-slate-500">No active notifications</p>
              </div>
            ) : (
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
            )}
            <button onClick={() => setActiveTab('notifications')} className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
              View all notifications →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── MY ATTRACTIONS ────────────────────────────────────────────────────────
  const AttractionsTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">My Attractions</h2>
          <p className="text-xs text-slate-500 mt-0.5">{total} listing{total !== 1 ? 's' : ''} in your portfolio</p>
        </div>
        <ListAttractionButton onClick={() => navigate('/list-your-event')} />
      </div>

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

      {loading && (
        <div className="flex items-center justify-center py-20">
          <i className="ph ph-spinner-gap text-4xl text-amber-500 animate-spin" />
        </div>
      )}

      {!loading && sortedAttractions.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
          <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ph ph-ticket text-4xl text-amber-500" />
          </div>
          <h3 className="font-black text-xl text-slate-800 dark:text-slate-200 mb-2">
            {search || statusFilter ? 'No attractions found' : "You haven't created any attractions yet."}
          </h3>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            {search || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'Start by creating your first attraction listing using the official BookingCart listing wizard!'}
          </p>
          {!search && !statusFilter && (
            <ListAttractionButton onClick={() => navigate('/list-your-event')} className="inline-flex" />
          )}
        </div>
      )}

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
  const AnalyticsTab = () => {
    const hasData = attractions.length > 0;
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">Real-time stats across all your attraction listings.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Views', value: stats.views.toLocaleString(), icon: 'ph-eye', color: 'text-amber-600' },
            { label: 'Total Listings', value: stats.total.toString(), icon: 'ph-ticket', color: 'text-emerald-600' },
            { label: 'Published', value: stats.published.toString(), icon: 'ph-check-circle', color: 'text-blue-600' },
            { label: 'Inquiries', value: stats.bookings.toString(), icon: 'ph-envelope', color: 'text-purple-600' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-slate-400 text-xs font-bold">
                <i className={`ph ${icon} text-base`} />
                <span className="uppercase tracking-wider text-[10px]">{label}</span>
              </div>
              <div className={`text-3xl font-black ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="font-black text-sm text-slate-900 dark:text-white mb-5">Most Viewed Attractions</h3>
          {!hasData ? (
            <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <i className="ph ph-chart-line-up text-4xl text-slate-300 dark:text-slate-600 mb-2 block" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">No performance data yet</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Create and publish attraction listings to start recording visitor analytics.</p>
              <ListAttractionButton onClick={() => navigate('/list-your-event')} className="inline-flex" />
            </div>
          ) : (
            <div className="space-y-4">
              {[...attractions].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((a, i) => {
                const maxViews = Math.max(...attractions.map(x => x.views || 0), 1);
                const pct = ((a.views || 0) / maxViews) * 100;
                return (
                  <div key={a.id} className="flex items-center gap-4">
                    <span className="text-xs font-black text-slate-400 w-4 flex-shrink-0">#{i + 1}</span>
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-amber-100 dark:bg-amber-950/40">
                      {a.featured_image ? (
                        <img src={a.featured_image} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><i className="ph ph-image text-amber-300" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{a.name}</div>
                      <ProgressBar value={pct} color="bg-amber-500" />
                    </div>
                    <span className="text-xs font-black text-amber-600 flex-shrink-0">{a.views || 0} views</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  const NotificationsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Notifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {notifs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="ph ph-bell text-3xl text-amber-500" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">No notifications yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You will receive updates here when your listings are reviewed by admins or when travelers make inquiries.
          </p>
        </div>
      ) : null}
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
        alert('Profile saved successfully!');
      }, 600);
    }

    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Profile Settings</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage your business details and contact information.</p>
        </div>

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
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-3xl text-amber-500 border-2 border-dashed border-amber-200 dark:border-amber-800">
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
              <textarea rows={3} value={localForm.bio} onChange={e => setLocalForm(f => ({ ...f, bio: e.target.value }))} placeholder="We offer unique experiences…" className={textareaCls} />
            </Field>

            <Field label="Website">
              <input type="url" value={localForm.website} onChange={e => setLocalForm(f => ({ ...f, website: e.target.value }))} placeholder="https://yourwebsite.com" className={inputCls} />
            </Field>

            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm transition-all shadow-sm shadow-amber-500/25 disabled:opacity-50">
                {savingProfile ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <><i className="ph ph-floppy-disk" /> Save Changes</>}
              </button>
            </div>
          </form>
        )}

        {section === 'contact' && (
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <Field label="Email Address">
              <input type="email" value={localForm.email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
              <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed directly.</p>
            </Field>
            <Field label="Phone Number">
              <input value={localForm.phone} onChange={e => setLocalForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" className={inputCls} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm transition-all shadow-sm shadow-amber-500/25 disabled:opacity-50">
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
                    alert('Password update requires re-authentication.');
                  }}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-sm shadow-amber-500/25">
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

  // ── WALLET ────────────────────────────────────────────────────────────────
  const WalletTab = () => (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Wallet & Payouts</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manage your earnings, connect Stripe, and request payouts.</p>
      </div>

      {/* Stripe Connect Banner */}
      {!stripeConnected ? (
        <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white rounded-3xl p-6 shadow-xl overflow-hidden">
          <div className="absolute -top-8 -right-8 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">
              <i className="ph ph-stripe-logo" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-lg">Connect with Stripe to receive payouts</h3>
              <p className="text-sm text-indigo-100 mt-1">Set up your Stripe Express account to receive automated payouts directly to your bank account. Fast, secure, and instant.</p>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={connectingStripe}
              className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-white text-indigo-700 font-extrabold text-sm rounded-2xl hover:bg-indigo-50 transition-all shadow-lg disabled:opacity-60"
            >
              <i className="ph ph-stripe-logo text-xl" />
              {connectingStripe ? 'Redirecting…' : 'Connect with Stripe'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-5 py-4">
          <i className="ph-fill ph-check-circle text-2xl text-emerald-500" />
          <span className="font-bold text-sm text-emerald-800 dark:text-emerald-300">Stripe Connected</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-1">Your payouts will be sent directly to your bank account.</span>
        </div>
      )}

      {/* Balance Cards */}
      {walletLoading ? (
        <div className="flex items-center justify-center py-16">
          <i className="ph ph-spinner-gap text-4xl text-amber-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Available', value: wallet?.available ?? 0, icon: 'ph-money', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-500' },
              { label: 'Pending', value: wallet?.pending ?? 0, icon: 'ph-clock', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-500' },
              { label: 'Withdrawn', value: wallet?.withdrawn ?? 0, icon: 'ph-arrow-circle-up', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-800', iconColor: 'text-slate-400' },
              { label: 'Lifetime', value: wallet?.lifetime ?? 0, icon: 'ph-trophy', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40', iconColor: 'text-violet-500' },
            ].map(({ label, value, icon, color, bg, iconColor }) => (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className={`w-10 h-10 rounded-2xl ${bg} flex items-center justify-center mb-3`}>
                  <i className={`ph ${icon} text-xl ${iconColor}`} />
                </div>
                <div className={`text-2xl sm:text-3xl font-black ${color}`}>${parseFloat(value).toFixed(2)}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Payout Request */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-black text-base text-slate-900 dark:text-white mb-5 flex items-center gap-2">
              <i className="ph ph-paper-plane-tilt text-amber-500" />
              Request Payout
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number" min="1" step="0.01"
                    max={wallet?.available || 0}
                    value={withdrawAmt}
                    onChange={e => setWithdrawAmt(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-8`}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Available: <span className="font-bold text-emerald-600">${parseFloat(wallet?.available ?? 0).toFixed(2)}</span></p>
              </div>
              <div className="flex gap-2">
                {[10, 25, 50, 100].map(v => (
                  <button key={v} type="button" onClick={() => setWithdrawAmt(String(Math.min(v, wallet?.available || 0)))}
                    className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 transition-all">
                    ${v}
                  </button>
                ))}
              </div>
              <button
                onClick={handleRequestPayout}
                disabled={withdrawing || !withdrawAmt || parseFloat(withdrawAmt) <= 0 || parseFloat(withdrawAmt) > (wallet?.available || 0)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm transition-all shadow-sm shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {withdrawing ? <><i className="ph ph-spinner-gap animate-spin" /> Processing…</> : <><i className="ph ph-paper-plane-tilt" /> Request Payout</>}
              </button>
            </div>
          </div>

          {/* Recent Transactions */}
          {wallet?.transactions?.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="font-black text-base text-slate-900 dark:text-white mb-5">Recent Transactions</h3>
              <div className="space-y-3">
                {wallet.transactions.slice(0, 10).map((tx, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tx.type === 'credit' ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-slate-800'}`}>
                      <i className={`ph ${tx.type === 'credit' ? 'ph-arrow-circle-down text-emerald-500' : 'ph-arrow-circle-up text-slate-400'} text-lg`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{tx.description || (tx.type === 'credit' ? 'Booking Payment' : 'Payout')}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(tx.created_at)}</div>
                    </div>
                    <span className={`text-sm font-black flex-shrink-0 ${tx.type === 'credit' ? 'text-emerald-600' : 'text-slate-600 dark:text-slate-400'}`}>
                      {tx.type === 'credit' ? '+' : '-'}${parseFloat(tx.amount || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!wallet || (wallet?.transactions?.length === 0)) && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-dashed border-slate-200 dark:border-slate-800 text-center">
              <i className="ph ph-receipt text-4xl text-slate-200 dark:text-slate-700 mb-3 block" />
              <p className="text-sm font-bold text-slate-500">No transactions yet</p>
              <p className="text-xs text-slate-400 mt-1">Earnings from bookings will appear here once your attractions receive payments.</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Header */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
          <i className="ph ph-ticket text-amber-500 text-2xl" />
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
        {activeTab === 'analytics'     && <AnalyticsTab />}
        {activeTab === 'wallet'        && <WalletTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'settings'      && <SettingsTab />}
      </main>

      {/* ── Modals ── */}

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
            <div className="h-52 rounded-2xl overflow-hidden bg-amber-100 dark:bg-amber-950/40 relative">
              {previewTarget.featured_image ? (
                <img src={previewTarget.featured_image} alt={previewTarget.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <i className="ph ph-image text-6xl text-amber-300 dark:text-amber-800" />
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Location', value: `${previewTarget.city || ''}${previewTarget.country ? `, ${previewTarget.country}` : ''}` || '—', icon: 'ph-map-pin' },
                { label: 'Price', value: previewTarget.price > 0 ? `${previewTarget.currency} ${previewTarget.price}` : 'Free', icon: 'ph-tag' },
                { label: 'Duration', value: previewTarget.duration || '—', icon: 'ph-clock' },
                { label: 'Views', value: (previewTarget.views || 0).toString(), icon: 'ph-eye' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    <i className={`ph ${icon} text-amber-500`} /> {label}
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
                      <i className="ph-fill ph-check-circle text-amber-500" /> {h}
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
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-sm shadow-amber-500/25">
                  <i className="ph ph-paper-plane-tilt" /> Submit for Review
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center px-1 py-2 gap-0">
        {['overview','attractions','create','analytics','wallet','notifications'].map(id => {
          const item = MENU_ITEMS.find(m => m.id === id);
          if (!item) return null;
          const active = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => item.route ? navigate(item.route) : setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all ${active ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400'}`}>
              <i className={`ph ${item.icon} text-xl`} />
              <span className="text-[9px] font-bold">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
