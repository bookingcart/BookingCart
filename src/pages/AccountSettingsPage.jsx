import { useEffect } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/account-settings.js'];

const ACCOUNT_SECTIONS = [
  'profile',
  'security',
  'payments',
  'preferences',
  'notifications',
  'rewards',
];

const SECTION_TITLE = {
  profile: 'Profile',
  security: 'Security',
  payments: 'Payments',
  preferences: 'Travel preferences',
  notifications: 'Notifications',
  rewards: 'Rewards',
};

function accountPath(slug) {
  return slug === 'profile' ? '/account-settings' : `/account-settings/${slug}`;
}

export default function AccountSettingsPage() {
  const { section: sectionParam } = useParams();

  const activeSection =
    !sectionParam || sectionParam === 'profile'
      ? 'profile'
      : ACCOUNT_SECTIONS.includes(sectionParam)
        ? sectionParam
        : null;

  useEffect(() => {
    if (activeSection) {
      document.title = `${SECTION_TITLE[activeSection]} · Account | BookingCart`;
    }
  }, [activeSection]);

  useEffect(() => {
    if (!activeSection) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSection]);

  useLegacyScripts(SCRIPTS, 'account-settings', () => {
    if (typeof window.bootAccountSettingsPage === 'function') {
      void window.bootAccountSettingsPage();
    }
  });

  if (sectionParam === 'profile' || activeSection === null) {
    return <Navigate to="/account-settings" replace />;
  }

  const sectionClass = (id) =>
    `settings-section${activeSection === id ? ' active' : ''}`;

  const navCls = ({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`;
  return (
    <>
      
          <div id="toast-container"></div>
      
          
          <div className="modal-overlay" id="delete-modal">
            <div className="modal-box">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"
                >
                  <i className="ph ph-warning text-2xl text-red-600"></i>
                </div>
                <div>
                  <div className="font-800 text-lg font-extrabold text-slate-900">
                    Delete Account?
                  </div>
                  <div className="text-sm text-slate-500">
                    This action is permanent and cannot be undone.
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                All your bookings, payment methods, preferences, and loyalty points
                will be permanently deleted. Please type <strong>DELETE</strong> to
                confirm.
              </p>
              <input
                id="delete-confirm-input"
                type="text"
                className="field-input mb-4"
                placeholder="Type DELETE to confirm"
              />
              <div className="flex gap-3">
                <button onclick="closeDeleteModal()" className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  id="confirm-delete-btn"
                  onclick="confirmDelete()"
                  className="btn-danger flex-1"
                  disabled
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
      
          
          <div className="modal-overlay" id="add-card-modal">
            <div className="modal-box">
              <div className="font-extrabold text-lg text-slate-900 mb-1">
                Add New Card
              </div>
              <div className="text-sm text-slate-500 mb-5">
                Card data is tokenized and never stored.
              </div>
              <div className="space-y-4">
                <div>
                  <label className="field-label">Card Number</label>
                  <input
                    id="card-number-input"
                    type="text"
                    maxLength="19"
                    className="field-input"
                    placeholder="•••• •••• •••• ••••"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Expiry</label>
                    <input
                      id="card-expiry-input"
                      type="text"
                      maxLength="5"
                      className="field-input"
                      placeholder="MM/YY"
                    />
                  </div>
                  <div>
                    <label className="field-label">CVC</label>
                    <input
                      id="card-cvc-input"
                      type="text"
                      maxLength="4"
                      className="field-input"
                      placeholder="•••"
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Cardholder Name</label>
                  <input
                    id="card-name-input"
                    type="text"
                    className="field-input"
                    placeholder="Full name on card"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onclick="
                    document.getElementById('add-card-modal').classList.remove('open')
                  "
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button onclick="addCard()" className="btn-primary flex-1">
                  Add Card
                </button>
              </div>
            </div>
          </div>
      
          
          <div id="sidebar-overlay" onclick="closeSidebar()"></div>
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8 flex gap-6 items-start bg-slate-50/30">
            
            <aside
              id="sidebar-drawer"
              className="w-60 flex-shrink-0 lg:sticky lg:top-[80px]"
            >
              <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                
                <div
                  className="flex items-center gap-3 px-3 py-3 mb-2 border-b border-slate-100"
                >
                  <img
                    id="sidebar-avatar"
                    src="https://ui-avatars.com/api/?name=B&background=6366f1&color=fff&size=80"
                    className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                  <div className="overflow-hidden">
                    <div
                      className="text-sm font-extrabold text-slate-900 truncate"
                      id="sidebar-name"
                    >
                      Black denum
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5" id="sidebar-email">
                      blackdenum@gmail.com
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase">
                      <i className="ph-fill ph-seal-check"></i> Genius Lvl 1
                    </div>
                  </div>
                </div>
                <nav className="space-y-1">
                  <NavLink
                    to={accountPath('profile')}
                    end
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-user-circle"></i> Profile
                  </NavLink>
                  <NavLink
                    to={accountPath('security')}
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-shield-check"></i> Security
                  </NavLink>
                  <NavLink
                    to={accountPath('payments')}
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-credit-card"></i> Payments
                  </NavLink>
                  <NavLink
                    to={accountPath('preferences')}
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-airplane"></i> Travel Preferences
                  </NavLink>
                  <NavLink
                    to={accountPath('notifications')}
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-bell"></i> Notifications
                  </NavLink>
                  <NavLink
                    to={accountPath('rewards')}
                    className={navCls}
                    onClick={() => window.closeSidebar?.()}
                  >
                    <i className="ph ph-star"></i> Rewards
                  </NavLink>
                </nav>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <a href="/" className="sidebar-link text-slate-400"
                    ><i className="ph ph-arrow-left"></i> Back to Home</a
                  >
                </div>
              </div>
            </aside>
      
            
            <main className="flex-1 min-w-0">
              
              <section id="section-profile" className={sectionClass('profile')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Profile Information
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Manage your personal details and preferences
                  </p>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Profile Picture</div>
                  <div className="settings-card-sub">
                    Upload a photo to personalize your account
                  </div>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="relative group cursor-pointer">
                      <img
                        id="avatar-preview"
                        src="https://ui-avatars.com/api/?name=B&background=6366f1&color=fff&size=200"
                        alt="Your avatar"
                        className="shadow-sm border-white"
                      />
                      <div className="absolute inset-0 bg-slate-900/40 rounded-[1.25rem] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 pointer-events-none">
                        <i className="ph ph-camera text-white text-2xl"></i>
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="avatar-upload"
                        className="btn-primary cursor-pointer inline-flex"
                        ><i className="ph ph-upload-simple mr-1"></i> Upload Photo</label
                      >
                      <input
                        type="file"
                        id="avatar-upload"
                        accept="image/*"
                        className="hidden"
                        onchange="previewAvatar(this)"
                      />
                      <p className="text-xs text-slate-400 mt-3 font-medium">
                        JPG, PNG or GIF · Max 5 MB
                      </p>
                    </div>
                  </div>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Personal Details</div>
                  <div className="settings-card-sub">
                    Update your name, email, and contact information
                  </div>
                  <form id="profile-form" onsubmit="saveProfile(event)" novalidate>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                      <div>
                        <label className="field-label" htmlFor="firstName">First Name</label>
                        <input
                          id="firstName"
                          name="firstName"
                          type="text"
                          className="field-input"
                          placeholder="John"
                          required
                        />
                        <div
                          className="text-xs text-red-500 mt-1 hidden"
                          id="firstName-err"
                        >
                          Required field
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="lastName">Last Name</label>
                        <input
                          id="lastName"
                          name="lastName"
                          type="text"
                          className="field-input"
                          placeholder="Doe"
                          required
                        />
                        <div
                          className="text-xs text-red-500 mt-1 hidden"
                          id="lastName-err"
                        >
                          Required field
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="email">Email Address</label>
                        <div className="relative">
                          <input
                            id="email"
                            name="email"
                            type="email"
                            className="field-input pr-24"
                            placeholder="john@example.com"
                            required
                          />
                          <span
                            className="verified-badge absolute right-3 top-1/2 -translate-y-1/2"
                            ><i className="ph ph-seal-check"></i> Verified</span
                          >
                        </div>
                        <div className="text-xs text-red-500 mt-1 hidden" id="email-err">
                          Enter a valid email
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="phone">Phone Number</label>
                        <div className="flex gap-2">
                          <select
                            id="phone-code"
                            className="field-input w-28 flex-shrink-0"
                          >
                            <option value="+1">🇺🇸 +1</option>
                            <option value="+44">🇬🇧 +44</option>
                            <option value="+91">🇮🇳 +91</option>
                            <option value="+971">🇦🇪 +971</option>
                            <option value="+966">🇸🇦 +966</option>
                            <option value="+234">🇳🇬 +234</option>
                            <option value="+254">🇰🇪 +254</option>
                            <option value="+27">🇿🇦 +27</option>
                            <option value="+20">🇪🇬 +20</option>
                            <option value="+49">🇩🇪 +49</option>
                            <option value="+33">🇫🇷 +33</option>
                            <option value="+86">🇨🇳 +86</option>
                            <option value="+81">🇯🇵 +81</option>
                            <option value="+55">🇧🇷 +55</option>
                          </select>
                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            className="field-input flex-1"
                            placeholder="(555) 000-0000"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="dob">Date of Birth</label>
                        <input id="dob" name="dob" type="date" className="field-input" />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="nationality"
                          >Nationality</label
                        >
                        <select
                          id="nationality"
                          name="nationality"
                          className="field-input"
                        >
                          <option value="">Select country…</option>
                          <option>American</option>
                          <option>British</option>
                          <option>Canadian</option>
                          <option>Chinese</option>
                          <option>French</option>
                          <option>German</option>
                          <option>Indian</option>
                          <option>Japanese</option>
                          <option>Nigerian</option>
                          <option>South African</option>
                          <option>Kenyan</option>
                          <option>Emirati</option>
                          <option>Saudi</option>
                          <option>Brazilian</option>
                          <option>Australian</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="language"
                          >Preferred Language</label
                        >
                        <select id="language" name="language" className="field-input">
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                          <option value="de">Deutsch</option>
                          <option value="ar">العربية</option>
                          <option value="zh">中文</option>
                          <option value="es">Español</option>
                          <option value="pt">Português</option>
                          <option value="ja">日本語</option>
                          <option value="hi">हिन्दी</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-6">
                      <button
                        type="submit"
                        className="btn-primary flex items-center gap-2"
                      >
                        <i className="ph ph-floppy-disk"></i> Save Changes
                      </button>
                      <button
                        type="button"
                        onclick="resetProfile()"
                        className="btn-secondary"
                      >
                        Discard
                      </button>
                    </div>
                  </form>
                </div>
              </section>
      
              
              <section id="section-security" className={sectionClass('security')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Security Settings
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Keep your account protected
                  </p>
                </div>
      
                
                <div className="settings-card">
                  <div className="settings-card-header">Change Password</div>
                  <div className="settings-card-sub">
                    Use a strong, unique password you don't use elsewhere
                  </div>
                  <form
                    id="password-form"
                    onsubmit="changePassword(event)"
                    novalidate
                  >
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="field-label" htmlFor="current-pass"
                          >Current Password</label
                        >
                        <div className="relative">
                          <input
                            id="current-pass"
                            type="password"
                            className="field-input pr-10"
                            placeholder="Enter current password"
                            required
                          />
                          <button
                            type="button"
                            onclick="togglePass('current-pass')"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <i className="ph ph-eye" id="current-pass-eye"></i>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="new-pass">New Password</label>
                        <div className="relative">
                          <input
                            id="new-pass"
                            type="password"
                            className="field-input pr-10"
                            placeholder="Min. 8 characters"
                            required
                            oninput="checkStrength(this.value)"
                          />
                          <button
                            type="button"
                            onclick="togglePass('new-pass')"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <i className="ph ph-eye" id="new-pass-eye"></i>
                          </button>
                        </div>
                        <div className="strength-bar mt-2">
                          <div className="strength-seg" id="s1"></div>
                          <div className="strength-seg" id="s2"></div>
                          <div className="strength-seg" id="s3"></div>
                          <div className="strength-seg" id="s4"></div>
                        </div>
                        <div className="text-xs text-slate-400 mt-1" id="strength-label">
                          Enter a password
                        </div>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="confirm-pass"
                          >Confirm New Password</label
                        >
                        <input
                          id="confirm-pass"
                          type="password"
                          className="field-input"
                          placeholder="Repeat new password"
                          required
                        />
                        <div
                          className="text-xs text-red-500 mt-1 hidden"
                          id="confirm-pass-err"
                        >
                          Passwords do not match
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="btn-primary mt-5 flex items-center gap-2"
                    >
                      <i className="ph ph-lock-key"></i> Update Password
                    </button>
                  </form>
                </div>
      
                
                <div className="settings-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="settings-card-header">
                        Two-Factor Authentication
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        Add an extra layer of protection using your phone
                      </div>
                      <div
                        id="tfa-status"
                        className="mt-2 text-xs font-semibold text-slate-400"
                      >
                        Status: <span className="text-red-500">Disabled</span>
                      </div>
                    </div>
                    <label className="toggle-wrap mt-1 flex-shrink-0">
                      <input
                        type="checkbox"
                        id="tfa-toggle"
                        onchange="toggle2FA(this.checked)"
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div
                    id="tfa-setup"
                    className="hidden mt-4 bg-green-50 rounded-xl p-4 text-sm text-green-800"
                  >
                    <i className="ph ph-check-circle mr-1"></i> 2FA enabled via
                    Authenticator App. Scan the QR code in your authenticator to
                    confirm.
                  </div>
                </div>
      
                
                <div className="settings-card">
                  <div className="settings-card-header">Recent Login Activity</div>
                  <div className="settings-card-sub">
                    Review recent sign-ins to detect unauthorised access
                  </div>
                  <div id="login-activity-list">
                    
                  </div>
                  <button
                    onclick="logoutAll()"
                    className="btn-secondary mt-4 flex items-center gap-2"
                  >
                    <i className="ph ph-sign-out"></i> Logout from All Devices
                  </button>
                </div>
      
                
                <div className="settings-card border-red-200 bg-red-50/30">
                  <div className="settings-card-header text-red-700">Danger Zone</div>
                  <div className="settings-card-sub">
                    Irreversible actions — proceed with caution
                  </div>
                  <div
                    className="flex items-center justify-between flex-wrap gap-4 p-4 bg-white border border-red-200 rounded-xl"
                  >
                    <div>
                      <div className="font-bold text-slate-800 text-sm">
                        Delete My Account
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        All data will be permanently removed
                      </div>
                    </div>
                    <button
                      onclick="openDeleteModal()"
                      className="btn-danger flex items-center gap-2"
                    >
                      <i className="ph ph-trash"></i> Delete Account
                    </button>
                  </div>
                </div>
              </section>
      
              
              <section id="section-payments" className={sectionClass('payments')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Payment Methods
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Manage saved cards. All data is PCI-compliant and tokenized.
                  </p>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Saved Cards</div>
                  <div className="settings-card-sub">
                    Select a default card for faster checkout
                  </div>
                  <div id="cards-list"></div>
                  <button
                    onclick="
                      document.getElementById('add-card-modal').classList.add('open')
                    "
                    className="btn-primary mt-2 flex items-center gap-2 w-full justify-center"
                  >
                    <i className="ph ph-plus"></i> Add New Card
                  </button>
                </div>
      
                <div className="settings-card">
                  <div className="flex items-center gap-3 mb-3">
                    <i className="ph ph-shield-check text-2xl text-green-600"></i>
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        PCI DSS Compliant
                      </div>
                      <div className="text-xs text-slate-500">
                        Your card details are tokenized and never stored on our
                        servers
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <i className="ph ph-lock text-2xl text-blue-500"></i>
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        SSL Encrypted
                      </div>
                      <div className="text-xs text-slate-500">
                        All payment data is protected with 256-bit encryption
                      </div>
                    </div>
                  </div>
                </div>
              </section>
      
              
              <section id="section-preferences" className={sectionClass('preferences')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Travel Preferences
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Personalize your booking experience
                  </p>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Flight Preferences</div>
                  <div className="settings-card-sub">
                    These preferences auto-fill during booking
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="field-label" htmlFor="home-airport"
                        >Home Airport (IATA)</label
                      >
                      <div className="flex gap-2">
                        <input
                          id="home-airport"
                          type="text"
                          maxLength="3"
                          className="field-input uppercase"
                          placeholder="e.g. LHR"
                        />
                        <button
                          onclick="autoDetectAirport()"
                          className="btn-secondary flex-shrink-0 text-xs px-3 flex items-center gap-1"
                        >
                          <i className="ph ph-map-pin"></i> Auto-detect
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="cabin-pref">Cabin Class</label>
                      <select id="cabin-pref" className="field-input">
                        <option>Economy</option>
                        <option>Premium Economy</option>
                        <option>Business Class</option>
                        <option>First Class</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="seat-pref"
                        >Seat Preference</label
                      >
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="seat-pref"
                            value="window"
                            className="accent-green-600"
                            checked
                          />
                          <span className="text-sm font-medium">🪟 Window</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="seat-pref"
                            value="aisle"
                            className="accent-green-600"
                          />
                          <span className="text-sm font-medium">💺 Aisle</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="seat-pref"
                            value="middle"
                            className="accent-green-600"
                          />
                          <span className="text-sm font-medium">🔲 Middle</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="meal-pref"
                        >Meal Preference</label
                      >
                      <select id="meal-pref" className="field-input">
                        <option>Standard</option>
                        <option>Vegetarian</option>
                        <option>Vegan</option>
                        <option>Halal</option>
                        <option>Kosher</option>
                        <option>Gluten-Free</option>
                        <option>No Preference</option>
                      </select>
                    </div>
                  </div>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Preferred Airlines</div>
                  <div className="settings-card-sub">
                    Click to select your favourite airlines
                  </div>
                  <div id="airlines-grid" className="flex flex-wrap gap-2">
                    
                  </div>
                </div>
      
                <button
                  onclick="savePreferences()"
                  className="btn-primary flex items-center gap-2 mt-2"
                >
                  <i className="ph ph-floppy-disk"></i> Save Preferences
                </button>
              </section>
      
              
              <section id="section-notifications" className={sectionClass('notifications')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Notification Settings
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Choose what updates you'd like to receive
                  </p>
                </div>
      
                <div className="settings-card">
                  <div className="settings-card-header">Email Notifications</div>
                  <div className="settings-card-sub">
                    Manage emails sent to your registered email address
                  </div>
                  <div className="space-y-5" id="email-notifications">
                    
                  </div>
                </div>
      
                <div className="settings-card mt-4">
                  <div className="settings-card-header">SMS & Push Notifications</div>
                  <div className="settings-card-sub">
                    Manage mobile alerts and push notifications
                  </div>
                  <div className="space-y-5" id="sms-notifications">
                    
                  </div>
                </div>
      
                <button
                  onclick="saveNotifications()"
                  className="btn-primary flex items-center gap-2 mt-2"
                >
                  <i className="ph ph-floppy-disk"></i> Save Preferences
                </button>
              </section>
      
              
              <section id="section-rewards" className={sectionClass('rewards')}>
                <div className="mb-6">
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    Rewards & Loyalty
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Your TravelPoints membership overview
                  </p>
                </div>
      
                
                <div
                  className="rounded-2xl p-6 mb-5"
                  style={{"background":"linear-gradient(\n                      135deg,\n                      #14532d 0%,\n                      #16a34a 60%,\n                      #4ade80 100%\n                    )"}}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div
                        className="text-green-200 text-xs font-bold uppercase tracking-widest mb-1"
                      >
                        TravelPoints
                      </div>
                      <div
                        className="text-white text-2xl font-extrabold"
                        id="reward-level-badge"
                      >
                        Gold Member
                      </div>
                    </div>
                    <i className="ph ph-star text-5xl text-yellow-300 opacity-80"></i>
                  </div>
                  <div className="text-white/80 text-sm mb-1">Available Points</div>
                  <div
                    className="text-white text-4xl font-extrabold tracking-tight"
                    id="reward-points"
                  >
                    12,450
                  </div>
                  <div className="text-white/60 text-xs mt-1">
                    ≈ $124.50 in travel credits
                  </div>
                </div>
      
                
                <div className="settings-card">
                  <div className="settings-card-header">Progress to Platinum</div>
                  <div className="settings-card-sub">
                    Earn
                    <span className="font-bold text-green-600">7,550 more points</span> to
                    reach Platinum status
                  </div>
                  <div
                    className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2"
                  >
                    <span>Gold — 12,450 pts</span>
                    <span>Platinum — 20,000 pts</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" id="progress-fill"></div>
                  </div>
                  <div className="text-right text-xs text-slate-400 mt-1">
                    62.3% complete
                  </div>
                </div>
      
                
                <div className="settings-card">
                  <div className="settings-card-header">Your Gold Member Benefits</div>
                  <div className="settings-card-sub">
                    Exclusive perks included with your membership
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                      <i className="ph ph-briefcase text-2xl text-green-600"></i>
                      <div>
                        <div className="font-bold text-sm">Priority Boarding</div>
                        <div className="text-xs text-slate-500">
                          Skip the queue at the gate
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                      <i className="ph ph-seat text-2xl text-green-600"></i>
                      <div>
                        <div className="font-bold text-sm">Free Seat Selection</div>
                        <div className="text-xs text-slate-500">
                          Choose your seat at no cost
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                      <i className="ph ph-percent text-2xl text-green-600"></i>
                      <div>
                        <div className="font-bold text-sm">10% Points Bonus</div>
                        <div className="text-xs text-slate-500">
                          Earn extra on every trip
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                      <i className="ph ph-headset text-2xl text-green-600"></i>
                      <div>
                        <div className="font-bold text-sm">Priority Support</div>
                        <div className="text-xs text-slate-500">
                          Dedicated customer service line
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
      
                
                <div className="settings-card">
                  <div className="settings-card-header">Points History</div>
                  <div className="settings-card-sub">
                    Recent transactions on your account
                  </div>
                  <div id="points-history"></div>
                </div>
              </section>
            </main>
          </div>
      
          
          <FlightFooter />
    </>
  );
}
