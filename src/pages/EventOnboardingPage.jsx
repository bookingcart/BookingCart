import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_FEATURES = [
  'Guided Tour', 'Audio Guide', 'Skip-the-line', 'Wheelchair Accessible', 'Family Friendly',
  'Food & Drinks Included', 'Photography Allowed', 'Restrooms', 'Parking Available', 'Souvenir Shop',
  'Outdoor Activity', 'Indoor Activity', 'Live Performance', 'Interactive Exhibits'
];

const EVENT_TYPES = [
  'Museum', 'Theme Park', 'Guided City Tour', 'Safari & Wildlife', 'Concert / Live Music',
  'Cultural Event', 'Food & Drink Tasting', 'Adventure Sport', 'Boat Cruise', 'Workshop / Class',
  'Historical Landmark'
];

const TICKET_TYPES = ['Adult', 'Child', 'Senior', 'Student', 'VIP', 'Group (10+)'];

const STEP_CONFIG = [
  { id: 1,  key: 'registration',    label: 'Account',    icon: 'ph-user-circle-plus', title: 'Create Your Organizer Account' },
  { id: 2,  key: 'event_info',      label: 'Details',    icon: 'ph-ticket',            title: 'Event/Attraction Information' },
  { id: 3,  key: 'location',        label: 'Location',   icon: 'ph-map-pin',           title: 'Location & Address' },
  { id: 4,  key: 'features',        label: 'Features',   icon: 'ph-check-square',      title: 'Features & Inclusions' },
  { id: 5,  key: 'tickets',         label: 'Tickets',    icon: 'ph-tag',               title: 'Ticket Types & Pricing' },
  { id: 6,  key: 'gallery',         label: 'Photos',     icon: 'ph-images',            title: 'Photo Gallery' },
  { id: 7,  key: 'policies',        label: 'Policies',   icon: 'ph-clipboard-text',    title: 'Rules & Policies' },
  { id: 8,  key: 'contact',         label: 'Contact',    icon: 'ph-phone',             title: 'Contact Information' },
  { id: 9,  key: 'preview',         label: 'Preview',    icon: 'ph-eye',               title: 'Preview Your Listing' },
  { id: 10, key: 'submit',          label: 'Submit',     icon: 'ph-paper-plane-tilt',  title: 'Submit for Review' },
];

// ─── Storage Helpers ──────────────────────────────────────────────────────────
const LS_KEY = 'bc_event_draft';
function saveDraft(draft) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(draft)); } catch {}
}
function loadDraft() {
  try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StepHeader({ step }) {
  const cfg = STEP_CONFIG.find(s => s.id === step) || STEP_CONFIG[0];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
          <i className={`ph ${cfg.icon} text-white text-xl`} />
        </div>
        <span className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Step {step} of 10</span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{cfg.title}</h2>
    </div>
  );
}

function FieldGroup({ label, required, error, hint, children }) {
  return (
    <div className="mb-5">
      {label && (
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1"><i className="ph ph-warning-circle" />{error}</p>}
    </div>
  );
}

function TextInput({ id, value, onChange, placeholder, type = 'text', required, maxLength, rows }) {
  const cls = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all";
  if (rows) {
    return <textarea id={id} rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} className={cls + ' resize-none'} />;
  }
  return <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} className={cls} />;
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function PhotoUploader({ value, onChange, label = 'Photo' }) {
  const fileRef = useRef(null);
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('Photo must be less than 20MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }
  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        className="relative flex flex-col items-center justify-center w-full h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-all bg-slate-50 dark:bg-slate-800 group overflow-hidden"
      >
        {value ? (
          <>
            <img src={value} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white font-bold text-sm flex items-center gap-2"><i className="ph ph-camera text-xl" />Change Photo</span>
            </div>
          </>
        ) : (
          <div className="text-center px-4">
            <i className="ph ph-camera-plus text-4xl text-slate-300 dark:text-slate-600 mb-2 block" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Click to upload {label}</p>
            <p className="text-xs text-slate-400 mt-1">JPG or PNG, max 20MB</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function MultiPhotoUploader({ value = [], onChange, maxPhotos = 15 }) {
  const fileRef = useRef(null);

  function handleFiles(e) {
    const files = Array.from(e.target.files);
    const remaining = maxPhotos - value.length;
    const toAdd = files.slice(0, remaining);
    toAdd.forEach(file => {
      if (file.size > 20 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onloadend = () => onChange([...value, { url: reader.result, caption: '' }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removePhoto(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        {value.map((photo, idx) => (
          <div key={idx} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <img src={photo.url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <i className="ph ph-trash text-sm" />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
              <input
                type="text"
                value={photo.caption || ''}
                onChange={e => {
                  const next = [...value];
                  next[idx] = { ...next[idx], caption: e.target.value };
                  onChange(next);
                }}
                placeholder="Caption (optional)"
                className="w-full bg-transparent text-white text-xs placeholder:text-white/50 focus:outline-none"
              />
            </div>
          </div>
        ))}
        {value.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-blue-500 transition-all bg-slate-50 dark:bg-slate-800"
          >
            <i className="ph ph-plus-circle text-2xl" />
            <span className="text-xs font-semibold">Add Photo</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      <p className="text-xs text-slate-400">{value.length}/{maxPhotos} photos uploaded. First photo will be the cover image.</p>
    </div>
  );
}

function TagInput({ value = [], onChange, placeholder, maxItems = 20 }) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim();
    if (v && !value.includes(v) && value.length < maxItems) {
      onChange([...value, v]);
      setInput('');
    }
  }
  function remove(item) { onChange(value.filter(x => x !== item)); }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[36px]">
        {value.map(item => (
          <span key={item} className="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
            {item}
            <button type="button" onClick={() => remove(item)} className="text-blue-600 hover:text-red-500 transition-colors"><i className="ph ph-x text-xs" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={add} className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors">
          <i className="ph ph-plus" />
        </button>
      </div>
    </div>
  );
}

// Completeness Bar
function CompletenessBar({ score }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EventOnboardingPage() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams();

  const [currentStep, setCurrentStep] = useState(parseInt(stepParam) || 1);
  const [saving, setSaving] = useState(false);
  const [submitState, setSubmitState] = useState('idle');
  const [errors, setErrors] = useState({});
  const [completeness, setCompleteness] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [authToken, setAuthToken] = useState(() => localStorage.getItem('bc_event_token') || localStorage.getItem('bc_jwt') || '');
  const [profileId, setProfileId] = useState(() => localStorage.getItem('bc_event_profile_id') || '');

  // Draft state
  const [draft, setDraft] = useState(() => loadDraft() || {
    // Step 1 – Registration
    fullName: '', email: '', phone: '', password: '',

    // Step 2 – Event Info
    eventName: '', eventType: '', duration: '', description: '', totalCapacity: '',

    // Step 3 – Location
    country: '', city: '', address: '', postalCode: '', latitude: '', longitude: '',
    nearbyAttractions: [], distanceFromAirport: '',

    // Step 4 – Features
    features: [],

    // Step 5 – Tickets
    tickets: [], // [{name, type, price, currency, description}]

    // Step 6 – Gallery
    gallery: [], // [{url, caption}]

    // Step 7 – Policies
    startTime: '09:00', endTime: '18:00', cancellationPolicy: '',
    ageRestriction: '', accessibilityInfo: '',

    // Step 8 – Contact
    bookingEmail: '', phone2: '', whatsapp: '', website: '', facebook: '',
  });

  useEffect(() => { saveDraft(draft); }, [draft]);

  useEffect(() => {
    document.title = 'BookingCart — List Your Event or Attraction';
  }, []);

  function set(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  // Recalculate completeness whenever draft changes
  useEffect(() => {
    let score = 0;
    if (draft.eventName?.length > 3) score += 5;
    if (draft.description?.length >= 50) score += 10;
    if (draft.country && draft.city) score += 15;
    else if (draft.country) score += 7;
    if (draft.features?.length >= 3) score += 10;
    else if (draft.features?.length >= 1) score += 5;
    if (draft.tickets?.length >= 2) score += 20;
    else if (draft.tickets?.length >= 1) score += 10;
    if (draft.gallery?.length >= 6) score += 20;
    else if (draft.gallery?.length >= 3) score += 10;
    else if (draft.gallery?.length >= 1) score += 5;
    if (draft.startTime && draft.endTime) score += 10;
    if (draft.bookingEmail || draft.phone2) score += 10;
    setCompleteness(Math.min(100, score));
  }, [draft]);

  const apiHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }), [authToken]);

  async function saveStep(stepKey, data) {
    if (!authToken) return;
    try {
      await fetch('/api/event-profiles', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ action: 'save', step: stepKey, data, profileId, currentStep }),
      });
    } catch (err) {
      console.error('Step save error:', err);
    }
  }

  function validateStep(step) {
    const errs = {};
    if (step === 1) {
      if (!draft.fullName.trim()) errs.fullName = 'Full name is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errs.email = 'Valid email required';
      if (draft.password.length < 8) errs.password = 'Password must be at least 8 characters';
    }
    if (step === 2) {
      if (!draft.eventName.trim()) errs.eventName = 'Event/Attraction name is required';
      if (!draft.eventType) errs.eventType = 'Type is required';
      if (!draft.description.trim()) errs.description = 'Description is required';
    }
    if (step === 3) {
      if (!draft.country.trim()) errs.country = 'Country is required';
      if (!draft.city.trim()) errs.city = 'City is required';
      if (!draft.address.trim()) errs.address = 'Address is required';
    }
    if (step === 4) {
      if (draft.features.length === 0) errs.features = 'Select at least one feature';
    }
    if (step === 5) {
      if (draft.tickets.length === 0) errs.tickets = 'Add at least one ticket type';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleNext() {
    if (!validateStep(currentStep)) return;
    setSaving(true);

    // Step 1: Registration API call
    if (currentStep === 1) {
      try {
        const res = await fetch('/api/event-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register',
            fullName: draft.fullName,
            email: draft.email,
            phone: draft.phone,
            password: draft.password,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setErrors({ email: data.error || 'Registration failed' });
          setSaving(false);
          return;
        }
        setAuthToken(data.token);
        setProfileId(data.profileId);
        localStorage.setItem('bc_event_token', data.token);
        localStorage.setItem('bc_event_profile_id', String(data.profileId));
        localStorage.setItem('bc_jwt', data.token);
      } catch (err) {
        setErrors({ email: 'Network error. Please try again.' });
        setSaving(false);
        return;
      }
    }

    // Auto-save step data (steps 2–8)
    const stepKeyMap = {
      2: 'event_info', 3: 'location', 4: 'features', 5: 'tickets',
      6: 'gallery', 7: 'policies', 8: 'contact',
    };
    const stepKey = stepKeyMap[currentStep];
    if (stepKey) {
      const dataMap = {
        event_info: { eventName: draft.eventName, eventType: draft.eventType, duration: draft.duration, description: draft.description, totalCapacity: draft.totalCapacity },
        location: { country: draft.country, city: draft.city, address: draft.address, postalCode: draft.postalCode, latitude: draft.latitude, longitude: draft.longitude, nearbyAttractions: draft.nearbyAttractions, distanceFromAirport: draft.distanceFromAirport },
        features: { selected: draft.features },
        tickets: { list: draft.tickets },
        gallery: draft.gallery,
        policies: { startTime: draft.startTime, endTime: draft.endTime, cancellationPolicy: draft.cancellationPolicy, ageRestriction: draft.ageRestriction, accessibilityInfo: draft.accessibilityInfo },
        contact: { bookingEmail: draft.bookingEmail, phone: draft.phone2, whatsapp: draft.whatsapp, website: draft.website, facebook: draft.facebook },
      };
      // We will skip saving to DB for now or handle via event-profiles API
      // await saveStep(stepKey, dataMap[stepKey]); 
    }

    setSaving(false);
    const next = Math.min(10, currentStep + 1);
    setCurrentStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBack() {
    setCurrentStep(prev => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    setSubmitState('submitting');
    try {
      const res = await fetch('/api/event-profiles', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ action: 'submit', profileId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitState('success');
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem('bc_event_profile_id');
      } else {
        setSubmitState('error');
      }
    } catch {
      setSubmitState('error');
    }
  }

  // ── Ticket Builder State ────────────────────────────────────────────────────
  const [newTicket, setNewTicket] = useState({ name: '', type: 'Adult', price: '', currency: 'USD', description: '' });
  function addTicket() {
    if (!newTicket.name.trim() || !newTicket.price) return;
    set('tickets', [...draft.tickets, { ...newTicket, id: Date.now() }]);
    setNewTicket({ name: '', type: 'Adult', price: '', currency: 'USD', description: '' });
  }
  function removeTicket(id) { set('tickets', draft.tickets.filter(r => r.id !== id)); }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={`
        fixed lg:sticky top-0 left-0 bottom-0 lg:top-16 z-50 lg:z-auto
        w-72 lg:w-72 xl:w-80 min-h-screen lg:min-h-[calc(100vh-4rem)]
        bg-slate-900 dark:bg-slate-950 border-r border-slate-800 flex-shrink-0
        flex flex-col overflow-y-auto
        transform transition-transform duration-300 lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <i className="ph ph-ticket text-lg" />
            </span>
            <span className="font-black text-base tracking-tight">
              <span className="text-white">Booking</span><span className="text-green-500">Cart</span>
            </span>
          </a>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400 hover:text-white">
            <i className="ph ph-x text-xl" />
          </button>
        </div>

        {/* Completeness */}
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-blue-600/20 border-2 border-blue-600/40 flex items-center justify-center shrink-0">
              <span className="text-blue-400 font-black text-sm">{completeness}%</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm">Listing Strength</p>
              <p className={`text-xs font-bold ${completeness >= 80 ? 'text-emerald-400' : completeness >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {completeness >= 80 ? '🏆 Excellent' : completeness >= 60 ? '✨ Good' : '📝 Needs work'}
              </p>
            </div>
          </div>
          <CompletenessBar score={completeness} />
        </div>

        {/* Steps list */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {STEP_CONFIG.map(step => {
            const isActive = currentStep === step.id;
            const isDone = currentStep > step.id;
            return (
              <button
                key={step.id}
                onClick={() => { if (isDone || isActive) { setCurrentStep(step.id); setSidebarOpen(false); } }}
                disabled={!isDone && !isActive}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                  ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' :
                    isDone ? 'text-slate-300 hover:bg-slate-800 cursor-pointer' :
                    'text-slate-600 cursor-not-allowed'}
                `}
              >
                <div className={`
                  w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-black
                  ${isActive ? 'bg-white/20' : isDone ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-600'}
                `}>
                  {isDone ? <i className="ph ph-check text-xs text-white" /> : <span className="text-xs">{step.id}</span>}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold truncate ${isActive ? 'text-white' : isDone ? 'text-slate-300' : 'text-slate-600'}`}>
                    {step.label}
                  </p>
                </div>
                {isActive && <i className="ph ph-caret-right text-white ml-auto text-sm" />}
              </button>
            );
          })}
        </nav>

        {/* Help box */}
        <div className="px-6 py-4 border-t border-slate-800">
          <div className="bg-slate-800 rounded-xl p-3 text-xs text-slate-400">
            <p className="font-bold text-slate-300 mb-1 flex items-center gap-1.5"><i className="ph ph-lock text-blue-500" />Auto-saved locally</p>
            <p>Leave and return at any time — your progress is saved.</p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-screen overflow-y-auto">

        {/* Mobile header */}
        <div className="lg:hidden sticky top-16 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <i className="ph ph-list text-slate-700 dark:text-slate-200" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-600">Step {currentStep} of 10</p>
            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
              {STEP_CONFIG.find(s => s.id === currentStep)?.title}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 shrink-0">{completeness}%</span>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-12">

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: REGISTRATION */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div>
              <StepHeader step={1} />

              {/* Welcome Banner */}
              <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-700 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-5 text-white overflow-hidden relative shadow-lg shadow-amber-900/20 border border-amber-400/30">
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10" />
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 text-3xl">
                  🎟️
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="bg-amber-400/30 text-white font-black text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-amber-300/40">
                      Free to List
                    </span>
                  </div>
                  <h3 className="font-black text-xl">List Your Event or Attraction on BookingCart</h3>
                  <p className="text-amber-100 text-xs sm:text-sm mt-1">
                    Reach thousands of travelers worldwide. Your listing is free — we earn only when you earn.
                  </p>
                </div>
              </div>

              <FieldGroup label="Your Full Name" required error={errors.fullName}>
                <TextInput id="fullName" value={draft.fullName} onChange={v => set('fullName', v)} placeholder="e.g. James Mukasa" required />
              </FieldGroup>
              <FieldGroup label="Email Address" required error={errors.email}>
                <TextInput id="email" type="email" value={draft.email} onChange={v => set('email', v)} placeholder="james@myevent.com" required />
              </FieldGroup>
              <FieldGroup label="Phone Number" error={errors.phone}>
                <TextInput id="phone" type="tel" value={draft.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000" />
              </FieldGroup>
              <FieldGroup label="Password" required error={errors.password}>
                <TextInput id="password" type="password" value={draft.password} onChange={v => set('password', v)} placeholder="Min 8 characters" required />
                <p className="text-xs text-slate-400 mt-1">Use at least 8 characters for security.</p>
              </FieldGroup>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mt-2">
                <p className="text-blue-800 dark:text-blue-300 text-xs font-semibold flex items-start gap-2">
                  <i className="ph ph-info text-blue-600 text-base shrink-0 mt-0.5" />
                  Already have a BookingCart account? You can use the same email — we'll link your accounts automatically.
                </p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 2: PROPERTY INFORMATION */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <div>
              <StepHeader step={2} />
              <FieldGroup label="Event / Attraction Name" required error={errors.eventName}>
                <TextInput id="eventName" value={draft.eventName} onChange={v => set('eventName', v)} placeholder="e.g. Serengeti Hot Air Balloon Safari" required />
              </FieldGroup>

              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Category / Type" required error={errors.eventType}>
                  <SelectInput value={draft.eventType} onChange={v => set('eventType', v)} options={EVENT_TYPES} placeholder="Select type..." />
                </FieldGroup>
                <FieldGroup label="Approximate Duration">
                  <TextInput value={draft.duration} onChange={v => set('duration', v)} placeholder="e.g. 2 hours, Half-day" />
                </FieldGroup>
              </div>

              <FieldGroup label="Total Capacity / Group Size Limit">
                <TextInput type="number" value={draft.totalCapacity} onChange={v => set('totalCapacity', v)} placeholder="e.g. 50" />
              </FieldGroup>

              <FieldGroup label="Event/Attraction Description" required error={errors.description}
                hint="Describe your offering in 100–500 words. Mention unique highlights, what's included, and what makes it special.">
                <TextInput
                  rows={6}
                  value={draft.description}
                  onChange={v => set('description', v)}
                  placeholder="Experience the magic of the Serengeti from above. Our hot air balloon safari starts before dawn, taking you high above the plains as the sun rises..."
                  maxLength={3000}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-400">Aim for 100–500 words.</p>
                  <p className={`text-xs font-bold ${(draft.description.split(/\s+/).filter(Boolean).length) >= 100 ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {draft.description.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>
              </FieldGroup>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 3: LOCATION */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 3 && (
            <div>
              <StepHeader step={3} />
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Country" required error={errors.country}>
                  <TextInput value={draft.country} onChange={v => set('country', v)} placeholder="Uganda" required />
                </FieldGroup>
                <FieldGroup label="City" required error={errors.city}>
                  <TextInput value={draft.city} onChange={v => set('city', v)} placeholder="Kampala" required />
                </FieldGroup>
              </div>
              <FieldGroup label="Street Address" required error={errors.address}>
                <TextInput value={draft.address} onChange={v => set('address', v)} placeholder="Plot 15, Nakasero Hill Road" required />
              </FieldGroup>
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Postal / ZIP Code">
                  <TextInput value={draft.postalCode} onChange={v => set('postalCode', v)} placeholder="00100" />
                </FieldGroup>
                <FieldGroup label="Distance from Airport" hint="e.g. 12 km from Entebbe Airport">
                  <TextInput value={draft.distanceFromAirport} onChange={v => set('distanceFromAirport', v)} placeholder="12 km from Entebbe" />
                </FieldGroup>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Latitude" hint="Optional. Used for map display.">
                  <TextInput type="number" value={draft.latitude} onChange={v => set('latitude', v)} placeholder="0.3476" />
                </FieldGroup>
                <FieldGroup label="Longitude" hint="Optional.">
                  <TextInput type="number" value={draft.longitude} onChange={v => set('longitude', v)} placeholder="32.5825" />
                </FieldGroup>
              </div>
              <FieldGroup label="Nearby Attractions" hint="Add tourist spots, parks, or landmarks near your venue.">
                <TagInput value={draft.nearbyAttractions} onChange={v => set('nearbyAttractions', v)} placeholder="e.g. Bwindi Forest, Lake Victoria…" />
              </FieldGroup>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 4: FEATURES */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <div>
              <StepHeader step={4} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Select all features and inclusions for your event. Guests filter by these — choose accurately.</p>
              {errors.features && <p className="text-red-500 text-xs font-semibold mb-4 flex items-center gap-1"><i className="ph ph-warning-circle" />{errors.features}</p>}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                {ALL_FEATURES.map(feature => {
                  const selected = draft.features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => {
                        if (selected) set('features', draft.features.filter(a => a !== feature));
                        else set('features', [...draft.features, feature]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-all ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      <i className={`ph ph-check-circle text-base ${selected ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                      <span>{feature}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400">{draft.features.length} features selected</p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 5: ROOMS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 5 && (
            <div>
              <StepHeader step={5} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Add ticket options for your event or attraction. Travelers will see these when booking.</p>
              {errors.tickets && <p className="text-red-500 text-xs font-semibold mb-4 flex items-center gap-1"><i className="ph ph-warning-circle" />{errors.tickets}</p>}

              {/* Existing tickets */}
              {draft.tickets.length > 0 && (
                <div className="space-y-3 mb-6">
                  {draft.tickets.map(ticket => (
                    <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{ticket.name} <span className="text-sm font-normal text-slate-500">({ticket.type})</span></p>
                        <p className="text-sm font-black text-amber-600 mt-1">${ticket.price} {ticket.currency}</p>
                        {ticket.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ticket.description}</p>}
                      </div>
                      <button type="button" onClick={() => removeTicket(ticket.id)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                        <i className="ph ph-trash text-lg" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add ticket form */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <i className="ph ph-plus-circle text-amber-600" /> Add Ticket Option
                </h4>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldGroup label="Ticket Name">
                    <TextInput value={newTicket.name} onChange={v => setNewTicket(r => ({ ...r, name: v }))} placeholder="e.g. Standard Admission" />
                  </FieldGroup>
                  <FieldGroup label="Ticket Type">
                    <SelectInput value={newTicket.type} onChange={v => setNewTicket(r => ({ ...r, type: v }))} options={TICKET_TYPES} />
                  </FieldGroup>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldGroup label="Price (USD)">
                    <TextInput type="number" value={newTicket.price} onChange={v => setNewTicket(r => ({ ...r, price: v }))} placeholder="25" />
                  </FieldGroup>
                  <FieldGroup label="Currency">
                    <TextInput value={newTicket.currency} onChange={v => setNewTicket(r => ({ ...r, currency: v }))} placeholder="USD" />
                  </FieldGroup>
                </div>
                <FieldGroup label="Ticket Description (Optional)">
                  <TextInput rows={2} value={newTicket.description} onChange={v => setNewTicket(r => ({ ...r, description: v }))} placeholder="Includes access to all main exhibits..." />
                </FieldGroup>
                <button
                  type="button"
                  onClick={addTicket}
                  disabled={!newTicket.name.trim() || !newTicket.price}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                >
                  <i className="ph ph-plus" /> Add Ticket
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 6: GALLERY */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 6 && (
            <div>
              <StepHeader step={6} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                Upload high-quality photos of your event or attraction. Let guests see what they will experience.
                <strong className="text-slate-900 dark:text-white"> Listings with 6+ photos get 3x more bookings.</strong>
              </p>
              <MultiPhotoUploader value={draft.gallery} onChange={v => set('gallery', v)} maxPhotos={15} />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 7: POLICIES */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 7 && (
            <div>
              <StepHeader step={7} />
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Start Time / Opening Time" hint="e.g. 09:00">
                  <TextInput type="time" value={draft.startTime} onChange={v => set('startTime', v)} />
                </FieldGroup>
                <FieldGroup label="End Time / Closing Time" hint="e.g. 18:00">
                  <TextInput type="time" value={draft.endTime} onChange={v => set('endTime', v)} />
                </FieldGroup>
              </div>

              <FieldGroup label="Cancellation Policy">
                <SelectInput
                  value={draft.cancellationPolicy}
                  onChange={v => set('cancellationPolicy', v)}
                  options={[
                    'Free cancellation up to 24 hours before event',
                    'Free cancellation up to 48 hours before event',
                    'Free cancellation up to 7 days before event',
                    'Non-refundable',
                  ]}
                  placeholder="Select a policy..."
                />
              </FieldGroup>

              <FieldGroup label="Age Restrictions / Guidelines" hint="Are children allowed? Is there a minimum age?">
                <TextInput rows={3} value={draft.ageRestriction} onChange={v => set('ageRestriction', v)} placeholder="All ages welcome. Children under 12 must be accompanied by an adult." />
              </FieldGroup>

              <FieldGroup label="Accessibility Information" hint="Wheelchair access, elevators, assistance animals, etc.">
                <TextInput rows={3} value={draft.accessibilityInfo} onChange={v => set('accessibilityInfo', v)} placeholder="Fully wheelchair accessible with ramps and elevators to all floors." />
              </FieldGroup>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 8: CONTACT */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 8 && (
            <div>
              <StepHeader step={8} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Provide contact details so travelers and our team can reach you. This will NOT be publicly displayed as-is — only used for booking confirmation.</p>

              <FieldGroup label="Booking Email" hint="Reservation confirmations will be sent here.">
                <TextInput type="email" value={draft.bookingEmail} onChange={v => set('bookingEmail', v)} placeholder="bookings@myevent.com" />
              </FieldGroup>
              <FieldGroup label="Front Desk Phone" hint="Guests will call this number for enquiries.">
                <TextInput type="tel" value={draft.phone2} onChange={v => set('phone2', v)} placeholder="+256 41 123 4567" />
              </FieldGroup>
              <FieldGroup label="WhatsApp Number" hint="Optional — for instant messaging with guests.">
                <TextInput type="tel" value={draft.whatsapp} onChange={v => set('whatsapp', v)} placeholder="+256 77 123 4567" />
              </FieldGroup>
              <FieldGroup label="Website" hint="Optional — helps build trust.">
                <TextInput type="url" value={draft.website} onChange={v => set('website', v)} placeholder="https://www.myevent.com" />
              </FieldGroup>
              <FieldGroup label="Facebook Page URL" hint="Optional.">
                <TextInput type="url" value={draft.facebook} onChange={v => set('facebook', v)} placeholder="https://facebook.com/myevent" />
              </FieldGroup>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 9: PREVIEW */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 9 && (
            <div>
              <StepHeader step={9} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Here's how your listing will appear to travelers. Review everything before submitting.</p>

              {/* Preview Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl mb-8">
                {/* Cover Photo */}
                {draft.gallery.length > 0 ? (
                  <div className="relative h-56 overflow-hidden">
                    <img src={draft.gallery[0].url} alt="Event cover" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                      <div>
                        <h2 className="text-xl font-black text-white">{draft.eventName || 'Your Event/Attraction Name'}</h2>
                        <p className="text-white/80 text-sm">{draft.city}{draft.country ? `, ${draft.country}` : ''}</p>
                      </div>
                      {draft.duration && (
                        <span className="bg-amber-400 text-amber-900 font-black text-xs px-2.5 py-1 rounded-full">
                          {draft.duration}
                        </span>
                      )}
                    </div>
                    {draft.gallery.length > 1 && (
                      <span className="absolute top-3 right-3 bg-black/50 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                        +{draft.gallery.length - 1} photos
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                    <div className="text-center text-white">
                      <i className="ph ph-ticket text-5xl mb-2" />
                      <p className="font-black text-xl">{draft.eventName || 'Your Event/Attraction Name'}</p>
                      <p className="text-amber-100 text-sm">{draft.city}{draft.country ? `, ${draft.country}` : ''}</p>
                    </div>
                  </div>
                )}

                {/* Card Body */}
                <div className="p-6 space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {draft.eventType && (
                        <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full border border-amber-200 dark:border-amber-800">
                          {draft.eventType}
                        </span>
                      )}
                      {draft.totalCapacity && (
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                          Up to {draft.totalCapacity} people
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                      {draft.description || 'Your event description will appear here...'}
                    </p>
                  </div>

                  {draft.features.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Features & Inclusions</p>
                      <div className="flex flex-wrap gap-2">
                        {draft.features.slice(0, 8).map(a => (
                          <span key={a} className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <i className="ph ph-check text-amber-500" /> {a}
                          </span>
                        ))}
                        {draft.features.length > 8 && (
                          <span className="text-xs font-semibold text-slate-400">+{draft.features.length - 8} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {draft.tickets.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tickets From</p>
                      <p className="text-2xl font-black text-amber-600">
                        ${Math.min(...draft.tickets.map(r => parseFloat(r.price) || 0)).toFixed(0)}<span className="text-base font-semibold text-slate-400">/person</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Completeness summary */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
                <h4 className="font-bold text-slate-900 dark:text-white mb-3">Listing Completeness: {completeness}%</h4>
                <CompletenessBar score={completeness} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Event Name', done: !!draft.eventName },
                    { label: 'Description', done: draft.description?.length >= 50 },
                    { label: 'Location', done: !!(draft.country && draft.city) },
                    { label: 'Features (3+)', done: draft.features.length >= 3 },
                    { label: 'Tickets (1+)', done: draft.tickets.length >= 1 },
                    { label: 'Photos (6+)', done: draft.gallery.length >= 6 },
                    { label: 'Time Schedule', done: !!(draft.startTime && draft.endTime) },
                    { label: 'Contact Info', done: !!(draft.bookingEmail || draft.phone2) },
                  ].map(({ label, done }) => (
                    <div key={label} className={`flex items-center gap-1.5 font-semibold ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      <i className={`ph ${done ? 'ph-check-circle' : 'ph-circle'} text-base`} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* STEP 10: SUBMIT */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {currentStep === 10 && (
            <div>
              <StepHeader step={10} />

              {submitState === 'success' ? (
                <div className="text-center py-12">
                  <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/20">
                    <i className="ph ph-check-circle text-5xl text-emerald-500" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Listing Submitted! 🎉</h3>
                  <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-8">
                    Your event/attraction listing is under review by our team. We'll email you within 24–48 hours once it's approved and live on BookingCart.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a href="/" className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">
                      Back to BookingCart
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl">🚀</div>
                      <div>
                        <h3 className="font-black text-xl">Ready to go live?</h3>
                        <p className="text-blue-100 text-sm">Your listing will be reviewed within 24–48 hours.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-2xl font-black">{draft.tickets.length}</p>
                        <p className="text-xs text-blue-200">Ticket Types</p>
                      </div>
                      <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-2xl font-black">{draft.gallery.length}</p>
                        <p className="text-xs text-blue-200">Photos</p>
                      </div>
                      <div className="bg-white/10 rounded-xl p-3">
                        <p className="text-2xl font-black">{completeness}%</p>
                        <p className="text-xs text-blue-200">Complete</p>
                      </div>
                    </div>
                  </div>

                  {completeness < 60 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                      <i className="ph ph-warning text-amber-500 text-xl shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-900 dark:text-amber-200 text-sm">Profile looks incomplete</p>
                        <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Consider going back to add more photos, ticket options, or features before submitting. More complete listings get approved faster.</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 space-y-3 text-sm">
                    <h4 className="font-bold text-slate-900 dark:text-white">What happens next?</h4>
                    {[
                      { icon: 'ph-eye', text: 'Our team reviews your listing for accuracy and quality standards.' },
                      { icon: 'ph-envelope-simple', text: 'You\'ll receive an email notification once your listing is approved.' },
                      { icon: 'ph-globe', text: 'Your event goes live and starts appearing in traveler searches.' },
                      { icon: 'ph-currency-dollar', text: 'Visitors can book directly — earnings tracked in your dashboard.' },
                    ].map(({ icon, text }) => (
                      <div key={text} className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                        <i className={`ph ${icon} text-blue-600 text-base shrink-0 mt-0.5`} />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={submitState === 'submitting'}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black text-base rounded-2xl transition-colors shadow-xl shadow-blue-600/25 flex items-center justify-center gap-3"
                  >
                    {submitState === 'submitting' ? (
                      <><i className="ph ph-spinner-gap animate-spin text-xl" /> Submitting…</>
                    ) : (
                      <><i className="ph ph-paper-plane-tilt text-xl" /> Submit My Property Listing</>
                    )}
                  </button>
                  {submitState === 'error' && (
                    <p className="text-red-500 text-sm text-center font-semibold">Submission failed. Please try again or contact support.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Navigation Buttons ─────────────────────────────────────────── */}
          {submitState !== 'success' && currentStep !== 10 && (
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="px-6 py-3 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-all flex items-center gap-2"
              >
                <i className="ph ph-arrow-left" /> Back
              </button>
              <div className="flex items-center gap-2">
                {STEP_CONFIG.map(s => (
                  <div
                    key={s.id}
                    className={`rounded-full transition-all ${
                      s.id === currentStep ? 'w-6 h-2 bg-blue-600' :
                      s.id < currentStep ? 'w-2 h-2 bg-blue-400' :
                      'w-2 h-2 bg-slate-300 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={handleNext}
                disabled={saving}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 disabled:opacity-60 transition-all flex items-center gap-2"
              >
                {saving ? <><i className="ph ph-spinner-gap animate-spin" /> Saving…</> : <>Continue <i className="ph ph-arrow-right" /></>}
              </button>
            </div>
          )}

          {submitState !== 'success' && currentStep === 10 && (
            <div className="mt-6 text-center">
              <button
                onClick={handleBack}
                className="px-6 py-3 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2 mx-auto"
              >
                <i className="ph ph-arrow-left" /> Go Back & Edit
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
