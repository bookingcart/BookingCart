import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GuideProfileCompleteness, { CompletenessBar } from '../components/GuideProfileCompleteness.jsx';
import GuideAIOptimizer from '../components/GuideAIOptimizer.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_CATEGORIES = [
  'Adventure Guide', 'Safari Guide', 'Wildlife Guide', 'Cultural Guide',
  'Historical Guide', 'City Guide', 'Food Tour Guide', 'Photography Guide',
  'Birding Guide', 'Luxury Travel Guide', 'Hiking Guide', 'Religious Tourism Guide',
  'Marine Guide', 'Custom Tour Guide'
];

const ALL_SKILLS = [
  'Wildlife Tracking', 'Photography Assistance', 'Historical Storytelling',
  'Bird Identification', 'Safari Planning', 'First Aid', 'Nature Interpretation',
  'Museum Tours', 'Cultural Experiences', 'Food Experiences', 'Luxury Travel Assistance',
  'Hiking Leadership', 'Camping', 'Adventure Activities', 'Boat Tours',
  'Custom Experiences', 'Nature Conservation', 'Cooking Experiences',
];

const ALL_LANGUAGES = [
  'English', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Arabic',
  'Chinese', 'Japanese', 'Russian', 'Swahili', 'Hindi', 'Dutch', 'Korean',
  'Turkish', 'Greek', 'Polish', 'Swedish', 'Norwegian'
];

const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Professional', 'Basic'];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STEP_CONFIG = [
  { id: 1,  key: 'registration',     label: 'Account',       icon: 'ph-user-circle-plus', title: 'Create Your Guide Account' },
  { id: 2,  key: 'personal',         label: 'Personal Info', icon: 'ph-identification-card', title: 'Personal Information' },
  { id: 3,  key: 'categories',       label: 'Categories',    icon: 'ph-tag', title: 'Guide Categories' },
  { id: 4,  key: 'areas',            label: 'Service Areas', icon: 'ph-map-pin-area', title: 'Service Areas' },
  { id: 5,  key: 'languages',        label: 'Languages',     icon: 'ph-translate', title: 'Languages Spoken' },
  { id: 6,  key: 'skills',           label: 'Skills',        icon: 'ph-star', title: 'Skills & Specializations' },
  { id: 7,  key: 'certifications',   label: 'Certifications',icon: 'ph-certificate', title: 'Certifications' },
  { id: 8,  key: 'experience',       label: 'Experience',    icon: 'ph-briefcase', title: 'Experience & Achievements' },
  { id: 9,  key: 'pricing',          label: 'Pricing',       icon: 'ph-currency-dollar', title: 'Pricing' },
  { id: 10, key: 'gallery',          label: 'Gallery',       icon: 'ph-images', title: 'Photo Gallery' },
  { id: 11, key: 'availability',     label: 'Availability',  icon: 'ph-calendar', title: 'Availability Calendar' },
  { id: 12, key: 'booking_settings', label: 'Booking',       icon: 'ph-lightning', title: 'Booking Settings' },
  { id: 13, key: 'preview',          label: 'Preview',       icon: 'ph-eye', title: 'Profile Preview' },
  { id: 14, key: 'submit',           label: 'Submit',        icon: 'ph-paper-plane-tilt', title: 'AI Optimizer & Submit' },
];

// ─── Storage Helpers ──────────────────────────────────────────────────────────
const LS_KEY = 'bc_guide_draft';
function saveDraft(draft) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(draft)); } catch {}
}
function loadDraft() {
  try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StepHeader({ step, title }) {
  const cfg = STEP_CONFIG.find(s => s.id === step) || STEP_CONFIG[0];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shadow-lg shadow-green-600/25">
          <i className={`ph ${cfg.icon} text-white text-xl`} />
        </div>
        <span className="text-xs font-black uppercase tracking-widest text-green-600 dark:text-green-400">Step {step} of 14</span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{title || cfg.title}</h2>
    </div>
  );
}

function FieldGroup({ label, required, error, children }) {
  return (
    <div className="mb-5">
      {label && (
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-red-500 font-semibold flex items-center gap-1"><i className="ph ph-warning-circle" />{error}</p>}
    </div>
  );
}

function TextInput({ id, value, onChange, placeholder, type = 'text', required, maxLength, rows }) {
  const cls = "w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all";
  if (rows) {
    return <textarea id={id} rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} className={cls + ' resize-none'} />;
  }
  return <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} maxLength={maxLength} className={cls} />;
}

function PhotoUploader({ value, onChange, label = 'Profile Photo' }) {
  const fileRef = useRef(null);
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be less than 2MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }
  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        className="relative flex flex-col items-center justify-center w-full h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-500 cursor-pointer transition-all bg-slate-50 dark:bg-slate-800 group overflow-hidden"
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
            <p className="text-xs text-slate-400 mt-1">JPG or PNG, max 2MB</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
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
          <span key={item} className="flex items-center gap-1.5 bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800">
            {item}
            <button type="button" onClick={() => remove(item)} className="text-green-600 hover:text-red-500 transition-colors"><i className="ph ph-x text-xs" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button type="button" onClick={add} className="px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors">
          <i className="ph ph-plus" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GuideOnboardingPage() {
  const navigate = useNavigate();
  const { step: stepParam } = useParams();

  const [currentStep, setCurrentStep] = useState(parseInt(stepParam) || 1);
  const [saving, setSaving] = useState(false);
  const [submitState, setSubmitState] = useState('idle'); // idle | submitting | success | error
  const [errors, setErrors] = useState({});
  const [completeness, setCompleteness] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feeStatus, setFeeStatus] = useState({ guideCount: 0, freeEligible: true, freeLimit: 200, registrationFeeCents: 1000 });
  const [checkingFeePayment, setCheckingFeePayment] = useState(false);

  // Auth token for API calls after registration
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('bc_guide_token') || localStorage.getItem('bc_jwt') || '');
  const [profileId, setProfileId] = useState(() => localStorage.getItem('bc_guide_profile_id') || '');

  // Draft data
  const [draft, setDraft] = useState(() => loadDraft() || {
    // Step 1 - Registration
    fullName: '', email: '', phone: '', password: '',

    // Step 2 - Personal
    photo: '', bio: '', dateOfBirth: '', gender: '', nationality: '', city: '',

    // Step 3 - Categories
    categories: [], primaryCategory: '',

    // Step 4 - Areas
    areasCountry: '', areasRegions: [], areasDistricts: [], areasCities: [], areasAttractions: [],

    // Step 5 - Languages
    languages: [], // [{lang, proficiency}]

    // Step 6 - Skills
    skills: [], customSkill: '',

    // Step 7 - Certifications
    certifications: [], // [{name, org, issueDate, expiryDate, url}]

    // Step 8 - Experience
    yearsExp: '', toursCount: '', achievements: '', awards: '',

    // Step 9 - Pricing
    pricingHourly: '', pricingHalfDay: '', pricingFullDay: '', pricingMultiDay: '',
    pricingCurrency: 'USD', pricingNotes: '', pricingCustomQuote: false,

    // Step 10 - Gallery
    gallery: [], // [{url, caption, type}]

    // Step 11 - Availability
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    startTime: '07:00', endTime: '19:00',
    maxToursPerDay: 1, blockedDates: [],

    // Step 12 - Booking Settings
    instantBooking: false,

    // Temp input states
    newCertName: '', newCertOrg: '', newCertIssue: '', newCertExpiry: '', newCertUrl: '',
    newGalleryUrl: '', newGalleryCaption: '',
    newLanguage: 'English', newProficiency: 'Fluent',
  });

  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => {
    document.title = 'BookingCart — Become a Guide';
    fetch('/api/guides?action=fee-status')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setFeeStatus(data);
      })
      .catch(err => console.warn('Failed to load fee status:', err));

    const params = new URLSearchParams(window.location.search);
    if (params.get('registration_paid') === '1' && params.get('session_id')) {
      const sessionId = params.get('session_id');
      setCheckingFeePayment(true);
      fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`)
        .then(r => r.json())
        .then(async data => {
          if (data.ok && (data.session?.payment_status === 'paid' || data.session?.status === 'complete')) {
            const guideEmail = params.get('email') || '';
            await fetch('/api/guide-profiles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'mark-fee-paid', feeType: 'registration', email: guideEmail, profileId })
            });
            setCurrentStep(2);
          }
        })
        .catch(console.error)
        .finally(() => setCheckingFeePayment(false));
    }
  }, []);

  function set(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  function buildProfilePayload() {
    return {
      step_personal: {
        fullName: draft.fullName, photo: draft.photo, bio: draft.bio,
        dateOfBirth: draft.dateOfBirth, gender: draft.gender,
        nationality: draft.nationality, city: draft.city, phone: draft.phone,
        email: draft.email,
      },
      step_categories: { selected: draft.categories, primary: draft.primaryCategory },
      step_areas: {
        country: draft.areasCountry, regions: draft.areasRegions,
        districts: draft.areasDistricts, cities: draft.areasCities,
        attractions: draft.areasAttractions,
      },
      step_languages: { list: draft.languages },
      step_skills: { selected: draft.skills },
      step_certifications: draft.certifications,
      step_experience: {
        yearsExp: draft.yearsExp, toursCount: draft.toursCount,
        achievements: draft.achievements, awards: draft.awards,
      },
      step_pricing: {
        perHour: draft.pricingHourly, halfDay: draft.pricingHalfDay,
        perDay: draft.pricingFullDay, multiDay: draft.pricingMultiDay,
        currency: draft.pricingCurrency, notes: draft.pricingNotes,
        customQuote: draft.pricingCustomQuote,
      },
      step_gallery: draft.gallery,
      step_availability: {
        workingDays: draft.workingDays, startTime: draft.startTime,
        endTime: draft.endTime, maxToursPerDay: draft.maxToursPerDay,
        blockedDates: draft.blockedDates,
      },
      step_booking_settings: { instantBooking: draft.instantBooking },
    };
  }

  const apiHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }), [authToken]);

  async function saveStep(stepKey, data) {
    if (!authToken) return;
    try {
      await fetch('/api/guide-profiles', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ action: 'save', step: stepKey, data, profileId, currentStep }),
      });
    } catch (err) {
      console.error('Step save error:', err);
    }
  }

  async function recalcCompleteness() {
    const p = buildProfilePayload();
    // Local completeness calculation (mirrors server logic)
    let score = 0;
    if (p.step_personal.photo?.length > 10) score += 10;
    if ((p.step_personal.bio || '').length >= 50) score += 10;
    if ((p.step_skills.selected || []).length >= 3) score += 15;
    else if ((p.step_skills.selected || []).length >= 1) score += 7;
    if ((p.step_areas.cities || []).length >= 1 || (p.step_areas.attractions || []).length >= 1) score += 15;
    else if (p.step_areas.country) score += 7;
    if ((p.step_languages.list || []).length >= 2) score += 10;
    else if ((p.step_languages.list || []).length === 1) score += 5;
    const gal = (p.step_gallery || []).filter(g => g && g.url);
    if (gal.length >= 4) score += 10;
    else if (gal.length >= 2) score += 5;
    const wd = p.step_availability.workingDays || [];
    if (wd.length >= 5) score += 15;
    else if (wd.length >= 3) score += 8;
    if (parseFloat(p.step_pricing.perDay || 0) > 0) score += 10;
    else if (parseFloat(p.step_pricing.perHour || 0) > 0) score += 5;
    if ((p.step_certifications || []).length >= 1) score += 5;
    setCompleteness(Math.min(100, score));
  }

  useEffect(() => { recalcCompleteness(); }, [draft]);

  function validateStep(step) {
    const errs = {};
    if (step === 1) {
      if (!draft.fullName.trim()) errs.fullName = 'Full name is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errs.email = 'Valid email required';
      if (draft.password.length < 8) errs.password = 'Password must be at least 8 characters';
    }
    if (step === 2) {
      if (!draft.bio.trim()) errs.bio = 'Biography is required';
      if (!draft.city.trim()) errs.city = 'City is required';
    }
    if (step === 3) {
      if (draft.categories.length === 0) errs.categories = 'Select at least one category';
      if (!draft.primaryCategory) errs.primaryCategory = 'Select a primary category';
    }
    if (step === 4) {
      if (!draft.areasCountry) errs.areasCountry = 'Country is required';
    }
    if (step === 5) {
      if (draft.languages.length === 0) errs.languages = 'Add at least one language';
    }
    if (step === 6) {
      if (draft.skills.length === 0) errs.skills = 'Select at least one skill';
    }
    if (step === 9) {
      if (!draft.pricingFullDay && !draft.pricingHourly) errs.pricing = 'Set at least one price (Full Day or Hourly)';
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
        const res = await fetch('/api/guide-profiles', {
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
        localStorage.setItem('bc_guide_token', data.token);
        localStorage.setItem('bc_guide_profile_id', String(data.profileId));
        // Also set main auth token so site recognizes them as logged in
        localStorage.setItem('bc_jwt', data.token);

        // If registration fee is required ($10) and not eligible for free slot (<200)
        if (!data.registrationFeePaid && !data.freeEligible) {
          const payRes = await fetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountCents: 1000,
              currency: 'usd',
              description: 'BookingCart Tour Guide Account Registration Fee ($10 USD)',
              customerEmail: draft.email,
              paymentPurpose: 'guide-registration-fee',
              successPath: `/guide-onboarding?registration_paid=1&email=${encodeURIComponent(draft.email)}`,
              cancelPath: '/guide-onboarding?step=1'
            })
          });
          const payData = await payRes.json();
          if (payData.ok && payData.url) {
            window.location.href = payData.url;
            return;
          } else {
            setErrors({ email: payData.error || 'Failed to initialize $10 USD registration checkout.' });
            setSaving(false);
            return;
          }
        }
      } catch (err) {
        setErrors({ email: 'Network error. Please try again.' });
        setSaving(false);
        return;
      }
    }

    // Auto-save step data to server (steps 2-12)
    const stepKeyMap = { 2:'personal', 3:'categories', 4:'areas', 5:'languages', 6:'skills', 7:'certifications', 8:'experience', 9:'pricing', 10:'gallery', 11:'availability', 12:'booking_settings' };
    const stepKey = stepKeyMap[currentStep];
    if (stepKey) {
      const payload = buildProfilePayload();
      await saveStep(stepKey, payload[`step_${stepKey}`] || payload[stepKey]);
    }

    setSaving(false);
    const next = Math.min(14, currentStep + 1);
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
      const res = await fetch('/api/guide-profiles', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ action: 'submit', profileId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitState('success');
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem('bc_guide_profile_id');
      } else {
        setSubmitState('error');
      }
    } catch {
      setSubmitState('error');
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
              <i className="ph ph-compass text-lg" />
            </span>
            <span className="font-black text-base tracking-tight">
              <span className="text-white">Booking</span><span className="text-green-500">Cart</span>
            </span>
          </a>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-slate-400 hover:text-white">
            <i className="ph ph-x text-xl" />
          </button>
        </div>

        {/* Completeness ring */}
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <GuideProfileCompleteness score={completeness} size={72} showLabel={false} />
            <div>
              <p className="text-white font-bold text-sm">Profile Strength</p>
              <p className={`text-xs font-bold ${completeness >= 80 ? 'text-green-400' : completeness >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {completeness >= 80 ? '🏆 Excellent' : completeness >= 60 ? '✨ Good' : '📝 Needs work'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{completeness}% complete</p>
            </div>
          </div>
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
                  ${isActive ? 'bg-green-600 text-white shadow-lg shadow-green-600/25' :
                    isDone ? 'text-slate-300 hover:bg-slate-800 cursor-pointer' :
                    'text-slate-600 cursor-not-allowed'}
                `}
              >
                <div className={`
                  w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-black
                  ${isActive ? 'bg-white/20' : isDone ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-600'}
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
            <p className="font-bold text-slate-300 mb-1 flex items-center gap-1.5"><i className="ph ph-lock text-green-500" />Your data is auto-saved</p>
            <p>You can leave and return at any time — your progress is saved locally.</p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-screen overflow-y-auto">

        {/* Mobile header */}
        <div className="lg:hidden sticky top-16 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <i className="ph ph-list text-slate-700 dark:text-slate-200" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-green-600">Step {currentStep} of 14</p>
            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
              {STEP_CONFIG.find(s => s.id === currentStep)?.title}
            </p>
          </div>
          <CompletenessBar score={completeness} label={false} />
          <span className="text-xs font-bold text-slate-500 shrink-0 w-10 text-right">{completeness}%</span>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-12">

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* STEP 1: REGISTRATION */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div>
              <StepHeader step={1} />

              {/* Early Bird Free Registration vs $10 Fee Banner */}
              {feeStatus.freeEligible ? (
                <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-5 text-white overflow-hidden relative shadow-lg shadow-emerald-900/20 border border-emerald-400/30">
                  <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10" />
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 text-3xl">
                    🎉
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="bg-emerald-400/30 text-white font-black text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-emerald-300/40">
                        First 200 Early Access
                      </span>
                      <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        Slot #{feeStatus.guideCount + 1} of {feeStatus.freeLimit}
                      </span>
                    </div>
                    <h3 className="font-black text-xl">Account Registration is FREE ($0 USD)</h3>
                    <p className="text-emerald-100 text-xs sm:text-sm mt-1">
                      You're among the first 200 guides! Registration fee ($10 USD) is completely waived for your account.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-5 text-white overflow-hidden relative border border-slate-700 shadow-lg">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-amber-400/30 text-3xl">
                    💳
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="bg-amber-500/20 text-amber-300 font-extrabold text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-amber-400/30">
                        Standard Registration
                      </span>
                    </div>
                    <h3 className="font-black text-xl">Guide Registration Fee: $10 USD</h3>
                    <p className="text-slate-300 text-xs sm:text-sm mt-1">
                      The first 200 free registration slots have been claimed. Proceed with account details to pay $10 USD via secure Stripe checkout.
                    </p>
                  </div>
                </div>
              )}

              <FieldGroup label="Full Name" required error={errors.fullName}>
                <TextInput id="fullName" value={draft.fullName} onChange={v => set('fullName', v)} placeholder="Sarah Johnson" required />
              </FieldGroup>
              <FieldGroup label="Email Address" required error={errors.email}>
                <TextInput id="email" type="email" value={draft.email} onChange={v => set('email', v)} placeholder="sarah@example.com" required />
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

          {/* STEP 2: PERSONAL INFO */}
          {currentStep === 2 && (
            <div>
              <StepHeader step={2} />
              <FieldGroup label="Profile Photo">
                <PhotoUploader value={draft.photo} onChange={v => set('photo', v)} />
              </FieldGroup>
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Date of Birth">
                  <TextInput type="date" value={draft.dateOfBirth} onChange={v => set('dateOfBirth', v)} />
                </FieldGroup>
                <FieldGroup label="Gender">
                  <select value={draft.gender} onChange={e => set('gender', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">Prefer not to say</option>
                    <option>Male</option><option>Female</option><option>Non-binary</option><option>Other</option>
                  </select>
                </FieldGroup>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FieldGroup label="Nationality">
                  <TextInput value={draft.nationality} onChange={v => set('nationality', v)} placeholder="Ugandan" />
                </FieldGroup>
                <FieldGroup label="Current City" required error={errors.city}>
                  <TextInput value={draft.city} onChange={v => set('city', v)} placeholder="Kampala" required />
                </FieldGroup>
              </div>
              <FieldGroup label="Biography" required error={errors.bio}>
                <TextInput
                  rows={6}
                  value={draft.bio}
                  onChange={v => set('bio', v)}
                  placeholder="Professional safari and cultural guide with 8 years of experience helping travelers discover Uganda's wildlife, culture, and hidden gems. I specialize in..."
                  maxLength={2000}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-400">Aim for 100–500 words. Be authentic and specific.</p>
                  <p className={`text-xs font-bold ${(draft.bio.split(/\s+/).filter(Boolean).length) >= 100 ? 'text-green-500' : 'text-slate-400'}`}>
                    {draft.bio.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>
              </FieldGroup>
            </div>
          )}

          {/* STEP 3: CATEGORIES */}
          {currentStep === 3 && (
            <div>
              <StepHeader step={3} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Select all categories that describe your guiding style (max 10). You must also choose a primary category.</p>
              {errors.categories && <p className="text-red-500 text-xs font-semibold mb-4 flex items-center gap-1"><i className="ph ph-warning-circle" />{errors.categories}</p>}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
                {ALL_CATEGORIES.map(cat => {
                  const selected = draft.categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          const next = draft.categories.filter(c => c !== cat);
                          set('categories', next);
                          if (draft.primaryCategory === cat) set('primaryCategory', next[0] || '');
                        } else if (draft.categories.length < 10) {
                          const next = [...draft.categories, cat];
                          set('categories', next);
                          if (!draft.primaryCategory) set('primaryCategory', cat);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-all ${
                        selected
                          ? 'bg-green-600 border-green-600 text-white shadow-md shadow-green-600/20'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-green-400'
                      }`}
                    >
                      <i className={`ph ph-check-circle text-base ${selected ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`} />
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>

              {draft.categories.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Primary Category <span className="text-red-500">*</span></p>
                  {errors.primaryCategory && <p className="text-red-500 text-xs mb-2">{errors.primaryCategory}</p>}
                  <div className="flex flex-wrap gap-2">
                    {draft.categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => set('primaryCategory', cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          draft.primaryCategory === cat
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-green-400'
                        }`}
                      >
                        {draft.primaryCategory === cat && <i className="ph ph-star-fill mr-1" />}
                        {cat}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Primary category is shown prominently in search results.</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SERVICE AREAS */}
          {currentStep === 4 && (
            <div>
              <StepHeader step={4} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Define where you operate. Each area becomes searchable by travelers.</p>
              <FieldGroup label="Country" required error={errors.areasCountry}>
                <TextInput value={draft.areasCountry} onChange={v => set('areasCountry', v)} placeholder="Uganda" required />
              </FieldGroup>
              <FieldGroup label="Regions">
                <TagInput value={draft.areasRegions} onChange={v => set('areasRegions', v)} placeholder="Central Uganda, Western Uganda…" />
              </FieldGroup>
              <FieldGroup label="Districts">
                <TagInput value={draft.areasDistricts} onChange={v => set('areasDistricts', v)} placeholder="Kampala, Mbarara…" />
              </FieldGroup>
              <FieldGroup label="Cities / Towns">
                <TagInput value={draft.areasCities} onChange={v => set('areasCities', v)} placeholder="Kampala, Jinja, Fort Portal…" />
              </FieldGroup>
              <FieldGroup label="Tourist Attractions">
                <TagInput value={draft.areasAttractions} onChange={v => set('areasAttractions', v)} placeholder="Murchison Falls, Bwindi…" />
                <p className="text-xs text-slate-400 mt-1">These are the most important — travelers search by attraction name.</p>
              </FieldGroup>
            </div>
          )}

          {/* STEP 5: LANGUAGES */}
          {currentStep === 5 && (
            <div>
              <StepHeader step={5} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Add all languages you can guide in and your proficiency level.</p>
              {errors.languages && <p className="text-red-500 text-xs font-semibold mb-4">{errors.languages}</p>}

              {/* Add language form */}
              <div className="flex flex-wrap gap-2 mb-6 bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                <select
                  value={draft.newLanguage} onChange={e => set('newLanguage', e.target.value)}
                  className="flex-1 min-w-[160px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {ALL_LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
                <select
                  value={draft.newProficiency} onChange={e => set('newProficiency', e.target.value)}
                  className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {PROFICIENCY_LEVELS.map(p => <option key={p}>{p}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (draft.languages.some(l => l.lang === draft.newLanguage)) return;
                    set('languages', [...draft.languages, { lang: draft.newLanguage, proficiency: draft.newProficiency }]);
                  }}
                  className="px-4 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <i className="ph ph-plus" /> Add
                </button>
              </div>

              <div className="space-y-3">
                {draft.languages.map((l, i) => {
                  const profColors = { Native: 'bg-green-600', Fluent: 'bg-blue-600', Professional: 'bg-purple-600', Basic: 'bg-slate-500' };
                  return (
                    <div key={l.lang} className="flex items-center gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                        <i className="ph ph-translate text-blue-600 text-xl" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900 dark:text-white">{l.lang}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${profColors[l.proficiency] || 'bg-slate-500'}`}>{l.proficiency}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('languages', draft.languages.filter((_, j) => j !== i))}
                        className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 transition-colors flex items-center justify-center"
                      >
                        <i className="ph ph-trash text-sm" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 6: SKILLS */}
          {currentStep === 6 && (
            <div>
              <StepHeader step={6} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Select all skills that apply. You can also add custom skills.</p>
              {errors.skills && <p className="text-red-500 text-xs font-semibold mb-4">{errors.skills}</p>}
              <div className="grid sm:grid-cols-2 gap-2 mb-6">
                {ALL_SKILLS.map(skill => {
                  const selected = draft.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => {
                        set('skills', selected ? draft.skills.filter(s => s !== skill) : [...draft.skills, skill]);
                      }}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-all ${
                        selected
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-green-400'
                      }`}
                    >
                      <i className={`ph ${selected ? 'ph-check-circle' : 'ph-circle'} text-base`} />
                      {skill}
                    </button>
                  );
                })}
              </div>
              <FieldGroup label="Add Custom Skills">
                <TagInput
                  value={draft.skills.filter(s => !ALL_SKILLS.includes(s))}
                  onChange={custom => set('skills', [...ALL_SKILLS.filter(s => draft.skills.includes(s)), ...custom])}
                  placeholder="Type a skill and press Enter…"
                />
              </FieldGroup>
            </div>
          )}

          {/* STEP 7: CERTIFICATIONS */}
          {currentStep === 7 && (
            <div>
              <StepHeader step={7} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Add certifications that prove your qualifications. These are reviewed by our admin team.</p>

              {/* Add cert form */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 mb-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <i className="ph ph-plus-circle text-green-600" /> Add Certification
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Certificate Name *</label>
                    <TextInput value={draft.newCertName} onChange={v => set('newCertName', v)} placeholder="Tour Guide License" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Issuing Organization</label>
                    <TextInput value={draft.newCertOrg} onChange={v => set('newCertOrg', v)} placeholder="Uganda Tourism Board" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Issue Date</label>
                    <TextInput type="date" value={draft.newCertIssue} onChange={v => set('newCertIssue', v)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Expiry Date</label>
                    <TextInput type="date" value={draft.newCertExpiry} onChange={v => set('newCertExpiry', v)} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-bold text-slate-500 mb-2 block">Upload Certificate Image</label>
                  <PhotoUploader value={draft.newCertUrl} onChange={v => set('newCertUrl', v)} label="Certificate" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!draft.newCertName.trim()) return;
                    const cert = { name: draft.newCertName, org: draft.newCertOrg, issueDate: draft.newCertIssue, expiryDate: draft.newCertExpiry, url: draft.newCertUrl };
                    set('certifications', [...draft.certifications, cert]);
                    set('newCertName', ''); set('newCertOrg', ''); set('newCertIssue', ''); set('newCertExpiry', ''); set('newCertUrl', '');
                  }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-colors"
                >
                  Add Certification
                </button>
              </div>

              <div className="space-y-3">
                {draft.certifications.map((cert, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                      <i className="ph-fill ph-medal text-amber-500 text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{cert.name}</p>
                      {cert.org && <p className="text-xs text-slate-500">{cert.org}</p>}
                      {cert.url && (
                        <div className="mt-2">
                          <img src={cert.url} alt="Certificate preview" className="h-16 w-24 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => set('certifications', draft.certifications.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                      <i className="ph ph-trash" />
                    </button>
                  </div>
                ))}
              </div>

              {draft.certifications.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <i className="ph ph-certificate text-4xl block mb-2" />
                  <p className="text-sm">No certifications added yet. Certified guides earn the Licensed Guide badge.</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 8: EXPERIENCE */}
          {currentStep === 8 && (
            <div>
              <StepHeader step={8} />
              <div className="grid sm:grid-cols-2 gap-5">
                <FieldGroup label="Years of Experience">
                  <TextInput type="number" value={draft.yearsExp} onChange={v => set('yearsExp', v)} placeholder="8" />
                </FieldGroup>
                <FieldGroup label="Number of Tours Conducted">
                  <TextInput type="number" value={draft.toursCount} onChange={v => set('toursCount', v)} placeholder="450" />
                </FieldGroup>
              </div>
              <FieldGroup label="Special Achievements">
                <TextInput rows={3} value={draft.achievements} onChange={v => set('achievements', v)} placeholder="Top Rated Guide 2025, National Geographic Featured Guide…" />
              </FieldGroup>
              <FieldGroup label="Awards & Recognition">
                <TextInput rows={2} value={draft.awards} onChange={v => set('awards', v)} placeholder="Uganda Tourism Award 2024, Best Safari Guide East Africa…" />
              </FieldGroup>

              {/* Stats preview cards */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { val: draft.yearsExp || '—', label: 'Years Experience', icon: 'ph-clock', color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
                  { val: draft.toursCount || '—', label: 'Tours Conducted', icon: 'ph-compass', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
                  { val: draft.certifications.length || '—', label: 'Certifications', icon: 'ph-certificate', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
                ].map(s => (
                  <div key={s.label} className={`${s.color} rounded-xl p-4 text-center border border-current/10`}>
                    <i className={`ph ${s.icon} text-2xl block mb-1`} />
                    <p className="text-2xl font-black">{s.val}</p>
                    <p className="text-xs font-semibold opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 9: PRICING */}
          {currentStep === 9 && (
            <div>
              <StepHeader step={9} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Set your pricing. At least one rate is required.</p>
              {errors.pricing && <p className="text-red-500 text-xs font-semibold mb-4">{errors.pricing}</p>}

              <div className="grid sm:grid-cols-2 gap-5 mb-5">
                {[
                  { key: 'pricingHourly', label: 'Hourly Rate', icon: 'ph-clock', placeholder: '15', hint: 'Per hour, 1-3 hours' },
                  { key: 'pricingHalfDay', label: 'Half Day Rate', icon: 'ph-clock-afternoon', placeholder: '40', hint: 'Approx 4-5 hours' },
                  { key: 'pricingFullDay', label: 'Full Day Rate ★', icon: 'ph-sun', placeholder: '80', hint: '8-10 hours', highlight: true },
                  { key: 'pricingMultiDay', label: 'Multi-Day Rate', icon: 'ph-calendar-dots', placeholder: '70', hint: 'Per day for 2+ day tours' },
                ].map(field => (
                  <div key={field.key} className={`${field.highlight ? 'ring-2 ring-green-500' : ''} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      <i className={`ph ${field.icon} text-green-600 text-xl`} />
                      <label className="font-bold text-slate-900 dark:text-white text-sm">{field.label}</label>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 rounded-xl px-3 h-11">
                      <span className="text-slate-400 font-bold text-sm">{draft.pricingCurrency}</span>
                      <input
                        type="number" min="0" value={draft[field.key]}
                        onChange={e => set(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-bold text-lg focus:outline-none"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{field.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <FieldGroup label="Currency">
                  <select value={draft.pricingCurrency} onChange={e => set('pricingCurrency', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    {['USD','EUR','GBP','KES','UGX','GHS','EGP','JPY','AUD','CAD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Custom Quote">
                  <label className="flex items-center gap-3 cursor-pointer h-11 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div className="relative">
                      <input type="checkbox" checked={draft.pricingCustomQuote} onChange={e => set('pricingCustomQuote', e.target.checked)} className="sr-only" />
                      <div className={`w-10 h-6 rounded-full transition-colors ${draft.pricingCustomQuote ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-transform ${draft.pricingCustomQuote ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Offer custom quotes</span>
                  </label>
                </FieldGroup>
              </div>

              <FieldGroup label="Pricing Notes">
                <TextInput rows={2} value={draft.pricingNotes} onChange={v => set('pricingNotes', v)} placeholder="Includes transport, park fees arranged separately…" />
              </FieldGroup>
            </div>
          )}

          {/* STEP 10: GALLERY */}
          {currentStep === 10 && (
            <div>
              <StepHeader step={10} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Add photos and videos showcasing your tours. High-quality images significantly increase bookings.</p>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-2">
                  <i className="ph ph-link text-green-600" /> Add Photo or Video
                </h3>
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-2 block">Upload Photo *</label>
                    <PhotoUploader value={draft.newGalleryUrl} onChange={v => set('newGalleryUrl', v)} label="Photo" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Caption</label>
                    <TextInput value={draft.newGalleryCaption} onChange={v => set('newGalleryCaption', v)} placeholder="Gorilla tracking in Bwindi…" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!draft.newGalleryUrl.trim()) return;
                    if (draft.gallery.length >= 30) { alert('Maximum 30 photos allowed'); return; }
                    set('gallery', [...draft.gallery, { url: draft.newGalleryUrl.trim(), caption: draft.newGalleryCaption.trim(), type: 'photo' }]);
                    set('newGalleryUrl', ''); set('newGalleryCaption', '');
                  }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm"
                >
                  Add to Gallery
                </button>
                <p className="text-xs text-slate-400 mt-2">Upload a high-quality JPG or PNG. {draft.gallery.length}/30 photos added.</p>
              </div>

              {draft.gallery.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {draft.gallery.map((item, i) => (
                    <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-slate-200 dark:bg-slate-800">
                      <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" onError={e => { e.currentTarget.src = 'https://images.unsplash.com/photo-1516426122078-c23e76319801?w=400&q=60'; }} />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                        {item.caption && <p className="text-white text-xs font-semibold text-center">{item.caption}</p>}
                        <button type="button" onClick={() => set('gallery', draft.gallery.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 font-bold text-xs flex items-center gap-1">
                          <i className="ph ph-trash" /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <i className="ph ph-images text-5xl block mb-3" />
                  <p className="font-semibold">No photos added yet</p>
                  <p className="text-sm">Guides with 4+ photos get 5x more bookings</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 11: AVAILABILITY */}
          {currentStep === 11 && (
            <div>
              <StepHeader step={11} />

              <FieldGroup label="Working Days">
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map(day => {
                    const active = draft.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => set('workingDays', active ? draft.workingDays.filter(d => d !== day) : [...draft.workingDays, day])}
                        className={`w-14 h-12 rounded-xl font-bold text-sm transition-all ${active ? 'bg-green-600 text-white shadow-md shadow-green-600/25' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-green-400'}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              <div className="grid sm:grid-cols-2 gap-5">
                <FieldGroup label="Working Hours — Start">
                  <TextInput type="time" value={draft.startTime} onChange={v => set('startTime', v)} />
                </FieldGroup>
                <FieldGroup label="Working Hours — End">
                  <TextInput type="time" value={draft.endTime} onChange={v => set('endTime', v)} />
                </FieldGroup>
              </div>

              <FieldGroup label="Maximum Tours Per Day">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => set('maxToursPerDay', Math.max(1, draft.maxToursPerDay - 1))} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <i className="ph ph-minus text-slate-600 dark:text-slate-400" />
                  </button>
                  <span className="text-3xl font-black text-slate-900 dark:text-white w-12 text-center">{draft.maxToursPerDay}</span>
                  <button type="button" onClick={() => set('maxToursPerDay', Math.min(10, draft.maxToursPerDay + 1))} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <i className="ph ph-plus text-slate-600 dark:text-slate-400" />
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400">tours per day</span>
                </div>
              </FieldGroup>

              <FieldGroup label="Block Out Dates (vacation, personal days)">
                <TagInput value={draft.blockedDates} onChange={v => set('blockedDates', v)} placeholder="YYYY-MM-DD (press Enter to add)" />
                <p className="text-xs text-slate-400 mt-1">Format: 2026-12-25 for Christmas. Travelers won't be able to book these dates.</p>
              </FieldGroup>
            </div>
          )}

          {/* STEP 12: BOOKING SETTINGS */}
          {currentStep === 12 && (
            <div>
              <StepHeader step={12} />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-8">Choose how you want to handle booking requests from travelers.</p>

              <div className="space-y-4">
                {[
                  {
                    value: true, icon: 'ph-lightning', color: 'green',
                    title: 'Instant Booking', subtitle: 'Travelers can immediately reserve your available dates',
                    benefits: ['45% more bookings', 'Earn ⚡ Fast Responder badge', 'Appear higher in search results'],
                  },
                  {
                    value: false, icon: 'ph-envelope', color: 'blue',
                    title: 'Request to Book', subtitle: 'You must approve each booking request manually',
                    benefits: ['Full control over bookings', 'Screen travelers first', 'Approve in your own time'],
                  },
                ].map(opt => {
                  const active = draft.instantBooking === opt.value;
                  const borderColor = opt.color === 'green' ? 'border-green-500' : 'border-blue-500';
                  const iconBg = opt.color === 'green' ? 'bg-green-100 dark:bg-green-950/40 text-green-600' : 'bg-blue-100 dark:bg-blue-950/40 text-blue-600';
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => set('instantBooking', opt.value)}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${active ? borderColor + ' bg-white dark:bg-slate-800 shadow-md' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
                          <i className={`ph ${opt.icon} text-2xl`} />
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 dark:text-white text-base">{opt.title}</p>
                          <p className="text-slate-500 dark:text-slate-400 text-sm">{opt.subtitle}</p>
                        </div>
                        {active && <i className="ph-fill ph-check-circle text-green-500 text-2xl ml-auto" />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {opt.benefits.map(b => (
                          <span key={b} className="text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">✓ {b}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 13: PROFILE PREVIEW */}
          {currentStep === 13 && (
            <div>
              <StepHeader step={13} title="Profile Preview" />
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">This is how your profile will appear to travelers. Review everything carefully before submitting.</p>

              {/* Preview card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl mb-6">
                {/* Header */}
                <div className="relative h-40 bg-gradient-to-br from-green-600 to-emerald-700 overflow-hidden">
                  {draft.gallery[0] && <img src={draft.gallery[0].url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                </div>
                <div className="relative -mt-12 px-6 pb-6">
                  <div className="flex items-end gap-4 mb-4">
                    <div className="relative">
                      {draft.photo ? (
                        <img src={draft.photo} alt="" className="w-24 h-24 rounded-2xl object-cover border-4 border-white dark:border-slate-800 shadow-xl" />
                      ) : (
                        <div className="w-24 h-24 rounded-2xl bg-green-600 flex items-center justify-center border-4 border-white dark:border-slate-800 shadow-xl">
                          <i className="ph ph-user text-white text-4xl" />
                        </div>
                      )}
                    </div>
                    <div className="pb-1">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white">{draft.fullName || 'Your Name'}</h3>
                      <p className="text-slate-500 text-sm flex items-center gap-1">
                        <i className="ph ph-map-pin text-green-500" />
                        {draft.city && draft.areasCountry ? `${draft.city}, ${draft.areasCountry}` : 'Your City, Country'}
                      </p>
                    </div>
                  </div>

                  {/* Categories */}
                  {draft.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {draft.categories.slice(0, 4).map(cat => (
                        <span key={cat} className="text-xs font-bold px-2.5 py-1 bg-slate-900 dark:bg-slate-700 text-white rounded-full">{cat}</span>
                      ))}
                    </div>
                  )}

                  {/* Bio */}
                  {draft.bio && <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-3">{draft.bio}</p>}

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { val: draft.yearsExp ? `${draft.yearsExp}y` : '—', label: 'Experience', icon: 'ph-clock' },
                      { val: draft.toursCount ? `${draft.toursCount}+` : '—', label: 'Tours', icon: 'ph-compass' },
                      { val: draft.languages.length || '—', label: 'Languages', icon: 'ph-translate' },
                    ].map(s => (
                      <div key={s.label} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                        <i className={`ph ${s.icon} text-green-600 text-lg block mb-1`} />
                        <p className="font-extrabold text-slate-900 dark:text-white text-lg">{s.val}</p>
                        <p className="text-xs text-slate-500">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pricing */}
                  {(draft.pricingFullDay || draft.pricingHourly) && (
                    <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
                      <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">From</span>
                      <span className="text-2xl font-black text-green-600">
                        ${draft.pricingHourly || draft.pricingFullDay}
                        <span className="text-sm font-bold text-slate-400 ml-1">{draft.pricingCurrency}/{draft.pricingHourly ? 'hr' : 'day'}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Checklist */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Profile Checklist</h3>
                <div className="space-y-2">
                  {[
                    { check: !!draft.photo, label: 'Profile photo uploaded' },
                    { check: draft.bio.length >= 100, label: 'Biography (100+ words)' },
                    { check: draft.categories.length > 0, label: `Guide categories (${draft.categories.length} selected)` },
                    { check: !!draft.areasCountry, label: 'Service country set' },
                    { check: draft.languages.length > 0, label: `Languages (${draft.languages.length} added)` },
                    { check: draft.skills.length >= 3, label: `Skills (${draft.skills.length} selected)` },
                    { check: !!(draft.pricingFullDay || draft.pricingHourly), label: 'Pricing configured' },
                    { check: draft.gallery.length >= 2, label: `Gallery photos (${draft.gallery.length} added)` },
                    { check: draft.workingDays.length >= 3, label: `Availability (${draft.workingDays.length} days set)` },
                    { check: draft.certifications.length > 0, label: `Certifications (${draft.certifications.length} added)` },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${item.check ? 'bg-green-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <i className={`ph ${item.check ? 'ph-check text-white' : 'ph-minus text-slate-400'} text-xs`} />
                      </div>
                      <span className={`text-sm ${item.check ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 14: AI OPTIMIZER & SUBMIT */}
          {currentStep === 14 && (
            <div>
              <StepHeader step={14} title="AI Optimizer & Submit" />

              {submitState === 'success' ? (
                <div className="text-center py-16">
                  <div className="w-24 h-24 bg-green-100 dark:bg-green-950/30 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                    <i className="ph ph-check-circle text-green-600 text-5xl" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Profile Submitted! 🎉</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-lg mb-2">Your guide profile is now under review.</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Our admin team will review your profile within 24-48 hours. You'll be notified by email once approved.</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <button onClick={() => navigate('/tour-guides')} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors">
                      View All Guides
                    </button>
                    <button onClick={() => navigate('/')} className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      Return Home
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Completeness ring */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-6">
                    <GuideProfileCompleteness score={completeness} size={100} />
                    <div className="flex-1">
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-lg mb-1">
                        {completeness >= 80 ? 'Excellent Profile!' : completeness >= 60 ? 'Good Profile' : 'Profile Needs Work'}
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
                        {completeness >= 80
                          ? 'Your profile is comprehensive. Guides with 80%+ completeness get 3x more bookings.'
                          : completeness >= 60
                          ? 'Your profile is good but could be stronger. Review the AI suggestions below to improve visibility.'
                          : 'Your profile is incomplete. Complete more sections to increase your chances of getting bookings.'}
                      </p>
                      <CompletenessBar score={completeness} label={false} />
                    </div>
                  </div>

                  {/* AI Optimizer */}
                  <div className="mb-8">
                    <GuideAIOptimizer
                      profileData={buildProfilePayload()}
                      onGoToStep={step => setCurrentStep(step)}
                    />
                  </div>

                  {/* Submit section */}
                  <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white">
                    <h3 className="font-extrabold text-xl mb-2">Ready to Submit?</h3>
                    <p className="text-white/80 text-sm mb-4">
                      Once submitted, our admin team will review your profile within 24-48 hours. You'll receive an email confirmation when approved.
                    </p>
                    <div className="flex flex-wrap gap-3 items-center mb-4">
                      {[
                        { icon: 'ph-clock', text: '24-48h review time' },
                        { icon: 'ph-envelope', text: 'Email confirmation' },
                        { icon: 'ph-seal-check', text: 'Verified badge on approval' },
                      ].map(b => (
                        <span key={b.text} className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-full">
                          <i className={`ph ${b.icon}`} />{b.text}
                        </span>
                      ))}
                    </div>

                    {submitState === 'error' && (
                      <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-3 mb-4 text-sm">
                        Submission failed. Please try again or contact support.
                      </div>
                    )}

                    <button
                      onClick={handleSubmit}
                      disabled={submitState === 'submitting'}
                      className="w-full sm:w-auto bg-white text-green-700 font-extrabold px-8 py-4 rounded-xl hover:bg-green-50 transition-colors flex items-center justify-center gap-3 shadow-lg text-base disabled:opacity-60"
                    >
                      {submitState === 'submitting' ? (
                        <><i className="ph ph-spinner-gap animate-spin" /> Submitting…</>
                      ) : (
                        <><i className="ph ph-paper-plane-tilt text-xl" /> Submit Profile for Review</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Navigation Buttons ──────────────────────────────────────────── */}
          {submitState !== 'success' && (
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-5 py-3 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="ph ph-arrow-left" /> Back
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:block">
                  {currentStep} / 14
                </span>
                <div className="flex gap-1">
                  {STEP_CONFIG.map(s => (
                    <div key={s.id} className={`h-1.5 rounded-full transition-all ${s.id === currentStep ? 'w-6 bg-green-600' : s.id < currentStep ? 'w-1.5 bg-green-400' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
                  ))}
                </div>
              </div>

              {currentStep < 14 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm shadow-md shadow-green-600/25 transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {saving ? <><i className="ph ph-spinner-gap animate-spin" />Saving…</> : <>{currentStep === 13 ? 'Continue to Submit' : 'Continue'}<i className="ph ph-arrow-right" /></>}
                </button>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
