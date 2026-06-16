import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const ACCOUNT_SECTIONS = ['profile', 'security', 'payments', 'preferences', 'notifications', 'rewards'];
const SECTION_TITLE = {
  profile: 'Profile',
  security: 'Security',
  payments: 'Payments',
  preferences: 'Travel preferences',
  notifications: 'Notifications',
  rewards: 'Rewards',
};

const DEFAULT_NOTIFICATIONS = {
  email: {
    booking_confirmations: true,
    price_alerts: true,
    promotions: false,
    newsletter: false,
  },
  sms: {
    sms_notifications: false,
    push_notifications: false,
  },
};

const DEFAULT_PREFERENCES = {
  homeAirport: '',
  cabin: 'Economy',
  seat: 'window',
  meal: 'Standard',
  airlines: [],
};

const EMAIL_NOTIFICATIONS = [
  ['booking_confirmations', 'Booking confirmations', 'Booking confirmations and cancellations'],
  ['price_alerts', 'Flight price alerts', 'Saved route price drops'],
  ['promotions', 'Promotions and offers', 'Limited-time travel offers'],
  ['newsletter', 'Newsletter', 'Monthly destination inspiration'],
];

const SMS_NOTIFICATIONS = [
  ['sms_notifications', 'SMS notifications', 'Text messages for booking updates'],
  ['push_notifications', 'Push notifications', 'Browser alerts for live updates'],
];

const AIRLINES = [
  'Emirates',
  'Qatar Airways',
  'Turkish Airlines',
  'British Airways',
  'Ethiopian Airlines',
  'Kenya Airways',
  'RwandAir',
  'KLM',
  'Air France',
  'Lufthansa',
];

function accountPath(slug) {
  return slug === 'profile' ? '/account-settings' : `/account-settings/${slug}`;
}

function splitName(user) {
  const full = String(user?.name || '').trim();
  return {
    firstName: user?.given_name || full.split(/\s+/)[0] || '',
    lastName: user?.family_name || full.split(/\s+/).slice(1).join(' ') || '',
  };
}

function profileFromUser(user) {
  const name = splitName(user);
  return {
    ...name,
    email: String(user?.email || '').trim().toLowerCase(),
    phone: '',
    phoneCode: '+1',
    dob: '',
    nationality: '',
    language: 'en',
    avatar: user?.picture || '',
  };
}

function normalizeState(raw, user) {
  const baseProfile = profileFromUser(user);
  const rawProfile = raw?.profile || {};
  return {
    profile: {
      ...baseProfile,
      ...rawProfile,
      email: baseProfile.email || String(rawProfile.email || raw?.email || '').trim().toLowerCase(),
      avatar: rawProfile.avatar || raw?.picture || baseProfile.avatar,
    },
    cards: Array.isArray(raw?.cards) ? raw.cards.filter((card) => card?.tokenId) : [],
    notifications: {
      email: { ...DEFAULT_NOTIFICATIONS.email, ...(raw?.notifications?.email || {}) },
      sms: { ...DEFAULT_NOTIFICATIONS.sms, ...(raw?.notifications?.sms || {}) },
    },
    preferences: { ...DEFAULT_PREFERENCES, ...(raw?.preferences || {}) },
    rewards: {
      level: raw?.rewards?.level || 'Member',
      points: Number(raw?.rewards?.points || 0),
      nextLevel: raw?.rewards?.nextLevel || 'Silver',
      nextThreshold: Number(raw?.rewards?.nextThreshold || 5000),
      history: Array.isArray(raw?.rewards?.history) ? raw.rewards.history : [],
    },
    security: {
      twoFactorEnabled: !!raw?.security?.twoFactorEnabled,
      loginActivity: Array.isArray(raw?.security?.loginActivity) ? raw.security.loginActivity : [],
    },
  };
}

function displayName(profile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || 'My Account';
}

function avatarUrl(profile) {
  if (profile.avatar) return profile.avatar;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName(profile))}&background=dcfce7&color=15803d&size=200`;
}

function SettingsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8 grid gap-5">
      <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  );
}

function EmptyPanel({ icon, title, body, action }) {
  return (
    <div className="settings-card text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <i className={`ph ${icon} text-2xl text-slate-400`} />
      </div>
      <div className="font-extrabold text-slate-900">{title}</div>
      <p className="text-sm text-slate-500 mt-1">{body}</p>
      {action}
    </div>
  );
}

export default function AccountSettingsPage() {
  const { section: sectionParam } = useParams();
  const { user, authHeaders, isAuthenticated, refresh, handleAuthFailure } = useAuth();
  const activeSection = !sectionParam || sectionParam === 'profile'
    ? 'profile'
    : ACCOUNT_SECTIONS.includes(sectionParam)
      ? sectionParam
      : null;

  const [state, setState] = useState(() => normalizeState(null, user));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const hasGoogleToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('bookingcart_google_id_token');
  const hasJwtToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('bookingcart_jwt_token');
  const canChangePassword = hasJwtToken && !hasGoogleToken;
  const accountEmail = String(user?.email || '').trim().toLowerCase();
  const signInHref = `/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  useEffect(() => {
    if (activeSection) document.title = `${SECTION_TITLE[activeSection]} · Account | BookingCart`;
  }, [activeSection]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setStatus('');
      const next = normalizeState(null, user);
      if (!isAuthenticated || !next.profile.email) {
        if (!cancelled) {
          setState(next);
          setLoading(false);
        }
        return;
      }
      try {
        const resp = await fetch(`/api/user?email=${encodeURIComponent(next.profile.email)}`, {
          headers: authHeaders(),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok && handleAuthFailure(resp.status, data.error)) {
          if (!cancelled) setStatus('Your session expired. Please sign in again.');
          return;
        }
        if (!cancelled) setState(normalizeState(resp.ok && data.ok ? data.state : null, user));
      } catch {
        if (!cancelled) {
          setState(next);
          setStatus('Could not load saved account settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authHeaders, handleAuthFailure, isAuthenticated, user]);

  const profile = state.profile;
  const navCls = ({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`;
  const progressPct = Math.min(100, state.rewards.nextThreshold > 0 ? (state.rewards.points / state.rewards.nextThreshold) * 100 : 0);

  async function persist(nextState, message = 'Saved') {
    if (!isAuthenticated || !accountEmail) {
      setStatus('Sign in to save account settings.');
      return false;
    }
    const stateToSave = {
      ...nextState,
      profile: {
        ...nextState.profile,
        email: accountEmail,
      },
    };
    setSaving(true);
    setStatus('');
    try {
      const resp = await fetch('/api/user', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: accountEmail, state: stateToSave }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok && handleAuthFailure(resp.status, data.error)) {
        throw new Error('Your session expired. Please sign in again.');
      }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Save failed');
      try {
        const storedUser = JSON.parse(localStorage.getItem('bookingcart_user') || '{}');
        localStorage.setItem('bookingcart_user', JSON.stringify({
          ...storedUser,
          email: accountEmail,
          name: displayName(stateToSave.profile),
          picture: stateToSave.profile.avatar || storedUser.picture,
        }));
        refresh();
        window.applyAuthUI?.();
      } catch {}
      setStatus(message);
      return true;
    } catch (err) {
      setStatus(err.message || 'Could not save account settings.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateProfileField(key, value) {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    const next = {
      ...state,
      profile: {
        ...state.profile,
        firstName: state.profile.firstName.trim(),
        lastName: state.profile.lastName.trim(),
        email: accountEmail,
      },
    };
    if (!next.profile.firstName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.profile.email)) {
      setStatus('First name and a valid account email are required.');
      return;
    }
    setState(next);
    await persist(next, 'Profile updated successfully.');
  }

  async function saveSection(partial, message) {
    const next = { ...state, ...partial };
    setState(next);
    await persist(next, message);
  }

  async function changePassword(event) {
    event.preventDefault();
    if (!canChangePassword) return;
    if (!password.current || !password.next || password.next !== password.confirm) {
      setStatus('Enter the current password and matching new password.');
      return;
    }
    if (password.next.length < 8 || !/[0-9]/.test(password.next) || !/[^A-Za-z0-9]/.test(password.next)) {
      setStatus('New password must be at least 8 characters and include a number and symbol.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword: password.current, newPassword: password.next }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok && handleAuthFailure(resp.status, data.error)) {
        throw new Error('Your session expired. Please sign in again.');
      }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Could not change password');
      setPassword({ current: '', next: '', confirm: '' });
      setStatus('Password changed successfully.');
    } catch (err) {
      setStatus(err.message || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  }

  const sidebar = (
    <aside className="w-60 flex-shrink-0 lg:sticky lg:top-[80px]">
      <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-3 px-3 py-3 mb-2 border-b border-slate-100">
          <img src={avatarUrl(profile)} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" alt="" />
          <div className="overflow-hidden">
            <div className="text-sm font-extrabold text-slate-900 truncate">{displayName(profile)}</div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{profile.email || 'Not signed in'}</div>
            <div className="mt-1 inline-flex items-center gap-1 bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
              <i className="ph-fill ph-seal-check" /> {state.rewards.level}
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {ACCOUNT_SECTIONS.map((section) => (
            <NavLink key={section} to={accountPath(section)} end={section === 'profile'} className={navCls}>
              <i className={`ph ph-${section === 'profile' ? 'user-circle' : section === 'security' ? 'shield-check' : section === 'payments' ? 'credit-card' : section === 'preferences' ? 'airplane' : section === 'notifications' ? 'bell' : 'star'}`} />
              {SECTION_TITLE[section]}
            </NavLink>
          ))}
        </nav>
        <div className="mt-3 pt-3 border-t border-slate-100">
          <a href="/" className="sidebar-link text-slate-400"><i className="ph ph-arrow-left" /> Back to Home</a>
        </div>
      </div>
    </aside>
  );

  if (sectionParam === 'profile' || activeSection === null) return <Navigate to="/account-settings" replace />;
  if (loading) return <SettingsSkeleton />;
  if (!isAuthenticated) {
    return (
      <>
        <main className="max-w-3xl mx-auto px-4 py-12">
          <EmptyPanel
            icon="ph-user-circle"
            title="Sign in to manage your account"
            body="Profile, support, bookings, preferences, and rewards are saved only for signed-in users."
            action={<a href={signInHref} className="btn-primary inline-flex mt-5">Sign in</a>}
          />
        </main>
        <FlightFooter />
      </>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8 flex gap-6 items-start bg-slate-50">
        {sidebar}
        <main className="flex-1 min-w-0">
          {status && (
            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${/success|saved|changed|updated/i.test(status) ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {status}
            </div>
          )}

          {activeSection === 'profile' && (
            <section>
              <PageHeading title="Profile Information" subtitle="Manage your personal details and preferences" />
              <div className="settings-card">
                <div className="settings-card-header">Profile picture</div>
                <div className="settings-card-sub">Use your signed-in avatar or upload a new image.</div>
                <div className="flex items-center gap-6 flex-wrap">
                  <img src={avatarUrl(profile)} alt="Your avatar" className="w-28 h-28 rounded-2xl object-cover shadow-sm border border-slate-100" />
                  <label className="btn-primary cursor-pointer inline-flex">
                    <i className="ph ph-upload-simple mr-1" /> Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          setStatus('Image must be under 5 MB.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => updateProfileField('avatar', String(reader.result || ''));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              </div>
              <form className="settings-card" onSubmit={saveProfile}>
                <div className="settings-card-header">Personal details</div>
                <div className="settings-card-sub">Update your name, email, and contact information.</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TextField label="First name" value={profile.firstName} onChange={(v) => updateProfileField('firstName', v)} required />
                  <TextField label="Last name" value={profile.lastName} onChange={(v) => updateProfileField('lastName', v)} />
                  <TextField label="Account email" type="email" value={accountEmail || profile.email} onChange={() => {}} readOnly required help="Used for sign-in and account security." />
                  <TextField label="Phone number" value={profile.phone} onChange={(v) => updateProfileField('phone', v)} />
                  <TextField label="Date of birth" type="date" value={profile.dob} onChange={(v) => updateProfileField('dob', v)} />
                  <SelectField label="Nationality" value={profile.nationality} onChange={(v) => updateProfileField('nationality', v)} options={['', 'American', 'British', 'Canadian', 'French', 'German', 'Kenyan', 'Nigerian', 'Rwandan', 'Ugandan']} />
                  <SelectField label="Preferred language" value={profile.language} onChange={(v) => updateProfileField('language', v)} options={['en', 'fr', 'de', 'es', 'pt']} />
                </div>
                <button className="btn-primary mt-6" disabled={saving}><i className="ph ph-floppy-disk mr-1" /> {saving ? 'Saving...' : 'Save Changes'}</button>
              </form>
            </section>
          )}

          {activeSection === 'security' && (
            <section>
              <PageHeading title="Security Settings" subtitle="Keep your account protected" />
              {canChangePassword ? (
                <form className="settings-card" onSubmit={changePassword}>
                  <div className="settings-card-header">Change password</div>
                  <div className="settings-card-sub">Use a strong, unique password.</div>
                  <div className="space-y-4 max-w-md">
                    <TextField label="Current password" type="password" value={password.current} onChange={(v) => setPassword((p) => ({ ...p, current: v }))} required />
                    <TextField label="New password" type="password" value={password.next} onChange={(v) => setPassword((p) => ({ ...p, next: v }))} required />
                    <TextField label="Confirm new password" type="password" value={password.confirm} onChange={(v) => setPassword((p) => ({ ...p, confirm: v }))} required />
                  </div>
                  <button className="btn-primary mt-5" disabled={saving}><i className="ph ph-lock-key mr-1" /> Update Password</button>
                </form>
              ) : (
                <EmptyPanel icon="ph-shield-check" title="Password managed by Google" body="This account is signed in with Google. Use your Google account security settings to change the password." />
              )}
              <div className="settings-card">
                <ToggleRow
                  title="Two-factor authentication"
                  body="Phone or authenticator setup is not connected yet."
                  checked={state.security.twoFactorEnabled}
                  disabled
                />
              </div>
              <EmptyPanel icon="ph-clock-counter-clockwise" title="No login activity available" body="Login session tracking is not connected yet." />
            </section>
          )}

          {activeSection === 'payments' && (
            <section>
              <PageHeading title="Payment Methods" subtitle="Saved cards require a tokenized payment provider." />
              <EmptyPanel icon="ph-credit-card" title="No saved cards yet" body="BookingCart does not store raw card details. Saved cards will appear here after a tokenized payment provider is connected." />
            </section>
          )}

          {activeSection === 'preferences' && (
            <section>
              <PageHeading title="Travel Preferences" subtitle="Personalize your booking experience" />
              <div className="settings-card">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextField label="Home airport (IATA)" value={state.preferences.homeAirport} maxLength={3} onChange={(v) => setState((p) => ({ ...p, preferences: { ...p.preferences, homeAirport: v.toUpperCase() } }))} />
                  <SelectField label="Cabin class" value={state.preferences.cabin} onChange={(v) => setState((p) => ({ ...p, preferences: { ...p.preferences, cabin: v } }))} options={['Economy', 'Premium Economy', 'Business Class', 'First Class']} />
                  <SelectField label="Seat preference" value={state.preferences.seat} onChange={(v) => setState((p) => ({ ...p, preferences: { ...p.preferences, seat: v } }))} options={['window', 'aisle', 'middle']} />
                  <SelectField label="Meal preference" value={state.preferences.meal} onChange={(v) => setState((p) => ({ ...p, preferences: { ...p.preferences, meal: v } }))} options={['Standard', 'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free', 'No Preference']} />
                </div>
                <div className="mt-5">
                  <div className="field-label">Preferred airlines</div>
                  <div className="flex flex-wrap gap-2">
                    {AIRLINES.map((airline) => {
                      const selected = state.preferences.airlines.includes(airline);
                      return (
                        <button
                          type="button"
                          key={airline}
                          onClick={() => setState((prev) => ({
                            ...prev,
                            preferences: {
                              ...prev.preferences,
                              airlines: selected
                                ? prev.preferences.airlines.filter((a) => a !== airline)
                                : [...prev.preferences.airlines, airline],
                            },
                          }))}
                          className={`airline-chip ${selected ? 'selected' : ''}`}
                        >
                          <i className="ph ph-airplane-tilt text-sm" /> {airline}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button className="btn-primary mt-6" onClick={() => saveSection({ preferences: state.preferences }, 'Travel preferences saved.')} disabled={saving}>Save Preferences</button>
              </div>
            </section>
          )}

          {activeSection === 'notifications' && (
            <section>
              <PageHeading title="Notification Settings" subtitle="Choose what updates you want to receive" />
              <NotificationGroup title="Email notifications" group="email" items={EMAIL_NOTIFICATIONS} state={state} setState={setState} />
              <NotificationGroup title="SMS and push notifications" group="sms" items={SMS_NOTIFICATIONS} state={state} setState={setState} />
              <button className="btn-primary mt-2" onClick={() => saveSection({ notifications: state.notifications }, 'Notification preferences saved.')} disabled={saving}>Save Preferences</button>
            </section>
          )}

          {activeSection === 'rewards' && (
            <section>
              <PageHeading title="Rewards & Loyalty" subtitle="Your TravelPoints membership overview" />
              <div className="rounded-2xl p-6 mb-5 bg-gradient-to-br from-green-900 via-green-600 to-green-400">
                <div className="text-green-100 text-xs font-bold uppercase tracking-widest mb-1">TravelPoints</div>
                <div className="text-white text-2xl font-extrabold">{state.rewards.level}</div>
                <div className="text-white/80 text-sm mt-6 mb-1">Available points</div>
                <div className="text-white text-4xl font-extrabold">{state.rewards.points.toLocaleString()}</div>
                <div className="text-white/70 text-xs mt-1">${(state.rewards.points / 100).toFixed(2)} in travel credits</div>
              </div>
              <div className="settings-card">
                <div className="settings-card-header">Progress to {state.rewards.nextLevel}</div>
                <div className="settings-card-sub">{Math.max(0, state.rewards.nextThreshold - state.rewards.points).toLocaleString()} more points to reach {state.rewards.nextLevel}</div>
                <div className="progress-bar mt-4"><div className="progress-fill" style={{ width: `${progressPct}%` }} /></div>
                <div className="text-right text-xs text-slate-400 mt-1">{progressPct.toFixed(1)}% complete</div>
              </div>
              <EmptyPanel icon="ph-list-bullets" title="No points history yet" body="Points history will appear after completed bookings earn rewards." />
            </section>
          )}
        </main>
      </div>
      <FlightFooter />
    </>
  );
}

function PageHeading({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', required = false, maxLength, readOnly = false, help = '' }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className={`field-input ${readOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
        type={type}
        value={value || ''}
        maxLength={maxLength}
        required={required}
        readOnly={readOnly}
        onChange={(event) => {
          if (!readOnly) onChange(event.target.value);
        }}
      />
      {help && <span className="mt-1 block text-xs font-medium text-slate-400">{help}</span>}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field-input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option || 'Select...'}</option>)}
      </select>
    </label>
  );
}

function ToggleRow({ title, body, checked, disabled = false, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="settings-card-header">{title}</div>
        <div className="text-sm text-slate-500 mt-1">{body}</div>
      </div>
      <label className="toggle-wrap">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

function NotificationGroup({ title, group, items, state, setState }) {
  return (
    <div className="settings-card">
      <div className="settings-card-header">{title}</div>
      <div className="space-y-5 mt-4">
        {items.map(([key, label, desc]) => (
          <ToggleRow
            key={key}
            title={label}
            body={desc}
            checked={!!state.notifications[group][key]}
            onChange={(value) => setState((prev) => ({
              ...prev,
              notifications: {
                ...prev.notifications,
                [group]: { ...prev.notifications[group], [key]: value },
              },
            }))}
          />
        ))}
      </div>
    </div>
  );
}
