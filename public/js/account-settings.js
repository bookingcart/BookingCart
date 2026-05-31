/* ═══════════════════════════════════════════════════
   BookingCart — Account Settings JS
   ═══════════════════════════════════════════════════ */

"use strict";

function userApiHeaders() {
  if (window.bookingcartAuth && typeof window.bookingcartAuth.authHeaders === "function") {
    return window.bookingcartAuth.authHeaders();
  }
  // fallback - check for new JWT token first, then Google token
  let token = "";
  if (typeof localStorage !== "undefined") {
    token =
      localStorage.getItem("bookingcart_jwt_token") ||
      localStorage.getItem("bookingcart_google_id_token") ||
      localStorage.getItem("bookingcart_token") ||
      "";
  }
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  return h;
}

/* ── State ── */
const storedUser = JSON.parse(localStorage.getItem('bookingcart_user') || 'null');
const defaultName = storedUser ? storedUser.name : "Alex Johnson";
const defFirst = storedUser ? storedUser.given_name || storedUser.name.split(' ')[0] : "Alex";
const defLast = storedUser ? storedUser.family_name || storedUser.name.split(' ').slice(1).join(' ') : "Johnson";
const defEmail = storedUser ? storedUser.email : "alex.johnson@email.com";
const accountEmail = storedUser ? String(storedUser.email || "").trim().toLowerCase() : defEmail;
const defAvatar = storedUser ? storedUser.picture : `https://ui-avatars.com/api/?name=${encodeURIComponent(defaultName)}&background=dcfce7&color=15803d&size=200`;

let state = {
  profile: {
    firstName: defFirst,
    lastName: defLast,
    email: defEmail,
    phone: "+1 (555) 012-3456",
    phoneCode: "+1",
    dob: "1990-06-15",
    nationality: "American",
    language: "en",
    avatar: defAvatar,
  },
  cards: [
    { id: 1, brand: "Visa", last4: "4587", expiry: "12/26", isDefault: true },
    {
      id: 2,
      brand: "Mastercard",
      last4: "1234",
      expiry: "08/25",
      isDefault: false,
    },
  ],
  notifications: {
    email: {
      booking_confirmations: true,
      price_alerts: true,
      promotions: false,
      newsletter: false,
    },
    sms: {
      sms_notifications: true,
      push_notifications: false,
    },
  },
  preferences: {
    homeAirport: "LHR",
    cabin: "Economy",
    seat: "window",
    meal: "Standard",
    airlines: ["Emirates", "British Airways"],
  },
  rewards: {
    level: "Member",
    points: 0,
    nextLevel: "Silver",
    nextThreshold: 5000,
    history: [],
  },
  loginActivity: [
    {
      device: "Chrome on Windows",
      location: "Nairobi, KE",
      date: "Today, 17:32",
      current: true,
    },
    {
      device: "Safari on iPhone 15",
      location: "Dubai, UAE",
      date: "Yesterday, 09:14",
      current: false,
    },
    {
      device: "Firefox on macOS",
      location: "London, UK",
      date: "28 Feb 2026, 21:05",
      current: false,
    },
  ],
};

const AIRLINES = [
  "Emirates",
  "British Airways",
  "Qatar Airways",
  "Etihad Airways",
  "Turkish Airlines",
  "Lufthansa",
  "Air France",
  "KLM",
  "Singapore Airlines",
  "Cathay Pacific",
  "Delta",
  "United Airlines",
  "American Airlines",
  "Kenya Airways",
  "South African Airways",
];

/* ══════════════════════════════════════════════════
   DB SYNC
══════════════════════════════════════════════════ */
async function saveStateToDB() {
  if (!accountEmail) {
    console.warn("[saveStateToDB] No account email, skipping save");
    return false;
  }
  
  const headers = userApiHeaders();
  console.log("[saveStateToDB] Saving with headers:", { hasAuth: !!headers.Authorization });
  
  try {
    const resp = await fetch("/api/user", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ email: accountEmail, state }),
    });
    
    const data = await resp.json();
    console.log("[saveStateToDB] Response:", data);
    
    if (!resp.ok || !data.ok) {
      console.error("[saveStateToDB] Save failed:", data.error);
      return false;
    } else {
      console.log("[saveStateToDB] Save successful");
      return true;
    }
  } catch (e) { 
    console.error("[saveStateToDB] Could not sync settings to DB:", e); 
    return false;
  }
}

async function loadStateFromDB() {
  let userEmail = accountEmail;
  if (!userEmail) return;
  try {
    const resp = await fetch("/api/user?email=" + encodeURIComponent(userEmail), {
      headers: userApiHeaders(),
    });
    const data = await resp.json();
    if (resp.ok && data && data.ok && data.state) {
      state = { ...state, ...data.state };
    }
  } catch (e) { console.error("Could not load settings from DB:", e); }
}

function showInitialLoading() {
  if (document.getElementById("settings-loading-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "settings-loading-overlay";
  overlay.className = "fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900/95 backdrop-blur-sm overflow-y-auto";
  overlay.innerHTML = `
    <div class="max-w-7xl mx-auto px-6 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-8">
        <div class="hidden lg:block">
          <div class="bc-skeleton-card" style="padding:18px;">
            <div class="bc-skeleton bc-skeleton-line" style="width:74%;height:18px;border-radius:999px"></div>
            <div style="margin-top:18px;display:grid;gap:12px">
              <div class="bc-skeleton bc-skeleton-line" style="width:92%;height:42px;border-radius:12px"></div>
              <div class="bc-skeleton bc-skeleton-line" style="width:84%;height:42px;border-radius:12px"></div>
              <div class="bc-skeleton bc-skeleton-line" style="width:88%;height:42px;border-radius:12px"></div>
              <div class="bc-skeleton bc-skeleton-line" style="width:78%;height:42px;border-radius:12px"></div>
            </div>
          </div>
        </div>
        <div style="display:grid;gap:20px">
          <div class="bc-skeleton-panel" style="padding:24px;">
            <div class="bc-skeleton bc-skeleton-line" style="width:38%;height:24px;border-radius:999px"></div>
            <div class="bc-skeleton bc-skeleton-line" style="margin-top:10px;width:52%;height:14px;border-radius:999px"></div>
            <div style="margin-top:18px;display:grid;gap:12px">
              <div class="bc-skeleton" style="height:96px;border-radius:16px"></div>
              <div class="bc-skeleton" style="height:170px;border-radius:16px"></div>
            </div>
          </div>
          <div class="bc-skeleton-panel" style="padding:24px;">
            <div class="bc-skeleton bc-skeleton-line" style="width:30%;height:22px;border-radius:999px"></div>
            <div style="margin-top:14px;display:grid;gap:12px">
              <div class="bc-skeleton" style="height:140px;border-radius:16px"></div>
              <div class="bc-skeleton" style="height:140px;border-radius:16px"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function hideInitialLoading() {
  const overlay = document.getElementById("settings-loading-overlay");
  if (overlay) overlay.remove();
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
let accountSettingsUiBound = false;

function bindAccountSettingsUiOnce() {
  if (accountSettingsUiBound) return;
  accountSettingsUiBound = true;

  document.body.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("modal-overlay")) {
      t.classList.remove("open");
    }
  });

  document.body.addEventListener("input", (e) => {
    const el = e.target;
    if (!el || !el.id) return;
    if (el.id === "delete-confirm-input") {
      const btn = document.getElementById("confirm-delete-btn");
      if (btn) btn.disabled = el.value !== "DELETE";
      return;
    }
    if (el.id === "card-number-input") {
      let v = el.value.replace(/\D/g, "").substring(0, 16);
      el.value = v.match(/.{1,4}/g)?.join(" ") || v;
      return;
    }
    if (el.id === "card-expiry-input") {
      let v = el.value.replace(/\D/g, "").substring(0, 4);
      if (v.length >= 2) v = v.substring(0, 2) + "/" + v.substring(2);
      el.value = v;
    }
  });
}

async function bootAccountSettingsPage() {
  if (!document.getElementById("firstName")) return;

  showInitialLoading();
  try {
    await loadStateFromDB();

    await loadProfile();
    renderCards();
    renderLoginActivity();
    renderNotifications();
    renderAirlines();
    renderRewards();
    loadPreferences();
  } finally {
    hideInitialLoading();
  }
  bindAccountSettingsUiOnce();
}

window.bootAccountSettingsPage = bootAccountSettingsPage;

/* ══════════════════════════════════════════════════
   SECTION NAVIGATION
══════════════════════════════════════════════════ */
function switchSection(name) {
  document
    .querySelectorAll(".settings-section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".sidebar-link")
    .forEach((l) => l.classList.remove("active"));
  const sec = document.getElementById("section-" + name);
  if (sec) sec.classList.add("active");
  document
    .querySelectorAll(`.sidebar-link[data-section="${name}"]`)
    .forEach((l) => l.classList.add("active"));
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleSidebar() {
  document.getElementById("sidebar-drawer").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("open");
}

function closeSidebar() {
  document.getElementById("sidebar-drawer").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

/* ══════════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════════ */
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const icon = type === "success" ? "ph-check-circle" : "ph-x-circle";
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="ph ${icon} text-xl"></i> <span></span>`;
  toast.querySelector("span").textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

/* ══════════════════════════════════════════════════
   PROFILE
══════════════════════════════════════════════════ */
async function loadProfile() {
  // First try to load from the account API
  try {
    const headers = userApiHeaders();
    if (headers.Authorization) {
      const resp = await fetch('/api/user', { headers });
      const data = await resp.json();
      if (resp.ok && data.ok && data.state && data.state.profile) {
        // Merge database profile with local state
        state.profile = { ...state.profile, ...data.state.profile };
        console.log('[loadProfile] Loaded from account API:', state.profile);
      }
    }
  } catch (err) {
    console.error('[loadProfile] Failed to load from account API:', err);
  }
  
  // Populate form fields from state
  const p = state.profile;
  setVal("firstName", p.firstName);
  setVal("lastName", p.lastName);
  setVal("email", p.email);
  setVal("phone", p.phone.replace(p.phoneCode, "").trim());
  setVal("dob", p.dob);
  setVal("nationality", p.nationality);
  setVal("language", p.language);
  setVal("phone-code", p.phoneCode);
  updateHeaderInfo();
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function updateHeaderInfo() {
  const p = state.profile;
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  setText("header-name", fullName || "My Account");
  setText("header-email", p.email);
  setText("sidebar-name", fullName || "My Account");
  setText("sidebar-email", p.email);
  const avatarSrc =
    p.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=dcfce7&color=15803d&size=200`;
  ["header-avatar", "sidebar-avatar", "avatar-preview"].forEach((id) => {
    const img = document.getElementById(id);
    if (img) img.src = avatarSrc;
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function previewAvatar(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast("Image must be under 5 MB", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.profile.avatar = e.target.result;
    updateHeaderInfo();
    showToast("Profile photo updated!");
  };
  reader.readAsDataURL(file);
}

async function saveProfile(e) {
  e.preventDefault();
  let valid = true;

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();

  toggleErr("firstName-err", !firstName);
  toggleErr("lastName-err", !lastName);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  toggleErr("email-err", !emailOk);

  if (!firstName || !lastName || !emailOk) {
    valid = false;
  }

  if (!valid) {
    showToast("Please fix the errors before saving", "error");
    return;
  }

  state.profile.firstName = firstName;
  state.profile.lastName = lastName;
  state.profile.email = email;
  state.profile.phoneCode = document.getElementById("phone-code").value;
  state.profile.phone = document.getElementById("phone").value.trim();
  state.profile.dob = document.getElementById("dob").value;
  state.profile.nationality = document.getElementById("nationality").value;
  state.profile.language = document.getElementById("language").value;

  updateHeaderInfo();
  const saved = await saveStateToDB();

  // Sync core changes back to bookingcart_user so they reflect across all pages immediately
  try {
    const gUserStr = localStorage.getItem('bookingcart_user');
    if (gUserStr) {
      const gUser = JSON.parse(gUserStr);
      gUser.name = `${firstName} ${lastName}`.trim();
      localStorage.setItem('bookingcart_user', JSON.stringify(gUser));
      if (window.applyAuthUI) window.applyAuthUI(); // Update the header immediately
    }
  } catch (e) { }

  showToast(saved ? "Profile updated successfully!" : "Profile saved locally, but account sync failed.", saved ? "success" : "error");
}

async function resetProfile() {
  await loadProfile();
  showToast("Changes discarded", "error");
}

function toggleErr(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden", !show);
  const inputId = id.replace("-err", "");
  const input = document.getElementById(inputId);
  if (input) input.classList.toggle("error", show);
}

/* ══════════════════════════════════════════════════
   SECURITY — PASSWORD
══════════════════════════════════════════════════ */
function togglePass(id) {
  const inp = document.getElementById(id);
  const eye = document.getElementById(id + "-eye");
  if (!inp || !eye) return;
  if (inp.type === "password") {
    inp.type = "text";
    eye.className = "ph ph-eye-slash";
  } else {
    inp.type = "password";
    eye.className = "ph ph-eye";
  }
}

function checkStrength(val) {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const colors = ["#ef4444", "#f97316", "#eab308", "#16a34a"];
  const labels = ["Weak", "Fair", "Good", "Strong"];
  for (let i = 1; i <= 4; i++) {
    const seg = document.getElementById("s" + i);
    if (seg) seg.style.background = i <= score ? colors[score - 1] : "#e2e8f0";
  }
  const lbl = document.getElementById("strength-label");
  if (lbl)
    lbl.textContent = score
      ? `Strength: ${labels[score - 1]}`
      : "Enter a password";
}

async function changePassword(e) {
  e.preventDefault();
  const cur = document.getElementById("current-pass").value;
  const nw = document.getElementById("new-pass").value;
  const conf = document.getElementById("confirm-pass").value;
  const errEl = document.getElementById("confirm-pass-err");

  if (!cur || !nw || !conf) {
    showToast("All password fields are required", "error");
    return;
  }
  if (nw !== conf) {
    errEl.classList.remove("hidden");
    document.getElementById("confirm-pass").classList.add("error");
    showToast("Passwords don't match", "error");
    return;
  }
  if (nw.length < 8) {
    showToast("Password must be at least 8 characters", "error");
    return;
  }
  if (!/[0-9]/.test(nw) || !/[^A-Za-z0-9]/.test(nw)) {
    showToast("Password needs a number and a special character", "error");
    return;
  }

  try {
    const resp = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: userApiHeaders(),
      body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      showToast(data.error || "Could not change password", "error");
      return;
    }
  } catch (err) {
    showToast("Could not change password", "error");
    return;
  }

  errEl.classList.add("hidden");
  document.getElementById("confirm-pass").classList.remove("error");
  document.getElementById("password-form").reset();
  ["s1", "s2", "s3", "s4"].forEach((id) => {
    const s = document.getElementById(id);
    if (s) s.style.background = "#e2e8f0";
  });
  document.getElementById("strength-label").textContent = "Enter a password";
  showToast("Password changed successfully!");
}

/* ── 2FA ── */
function toggle2FA(enabled) {
  const status = document.getElementById("tfa-status");
  const setup = document.getElementById("tfa-setup");
  if (enabled) {
    status.innerHTML = 'Status: <span class="text-green-600">Enabled</span>';
    setup.classList.remove("hidden");
    saveStateToDB();
    showToast("Two-Factor Authentication enabled!");
  } else {
    status.innerHTML = 'Status: <span class="text-red-500">Disabled</span>';
    setup.classList.add("hidden");
    saveStateToDB();
    showToast("2FA disabled. Your account is less secure.", "error");
  }
}

/* ── Login Activity ── */
function renderLoginActivity() {
  const list = document.getElementById("login-activity-list");
  if (!list) return;
  list.innerHTML = state.loginActivity
    .map(
      (a) => `
    <div class="activity-row">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.current ? "bg-green-100" : "bg-slate-100 dark:bg-slate-800"}">
        <i class="ph ph-${a.device.includes("iPhone") || a.device.includes("iPad") ? "device-mobile" : "desktop"} text-xl ${a.current ? "text-green-600" : "text-slate-500 dark:text-slate-400"}"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHTML(a.device)} ${a.current ? '<span class="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-1">Current</span>' : ""}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${escapeHTML(a.location)} · ${escapeHTML(a.date)}</div>
      </div>
      ${!a.current ? `<button onclick="removeDevice('${escapeHTML(a.device)}')" class="text-xs text-red-500 font-semibold hover:text-red-700 flex-shrink-0">Revoke</button>` : ""}
    </div>
  `,
    )
    .join("");
}

function removeDevice(device) {
  state.loginActivity = state.loginActivity.filter((a) => a.device !== device);
  renderLoginActivity();
  saveStateToDB();
  showToast(`Session for "${device}" revoked`);
}

function logoutAll() {
  state.loginActivity = state.loginActivity.filter((a) => a.current);
  renderLoginActivity();
  saveStateToDB();
  showToast("Logged out from all other devices");
}

/* ── Delete Account Modal ── */
function openDeleteModal() {
  document.getElementById("delete-modal").classList.add("open");
  document.getElementById("delete-confirm-input").value = "";
  document.getElementById("confirm-delete-btn").disabled = true;
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.remove("open");
}

async function confirmDelete() {
  closeDeleteModal();

  const email = state.profile.email;
  if (email) {
    try {
      await fetch("/api/user", {
        method: "DELETE",
        headers: userApiHeaders(),
        body: JSON.stringify({ email })
      });
    } catch (e) {
      console.error("Failed to delete from DB", e);
    }
  }

  // Clear local session data
  localStorage.removeItem("bookingcart_user");
  localStorage.removeItem("bookingcart_google_id_token");
  localStorage.removeItem("bookingcart_jwt_token");
  localStorage.removeItem("bookingcart_token");

  showToast("Account deleted successfully. Logging out...");

  // Redirect to home page after a short delay
  setTimeout(() => {
    if (typeof window.__bcNavigate === "function") window.__bcNavigate("/");
    else window.location.href = "/";
  }, 1500);
}

/* ══════════════════════════════════════════════════
   PAYMENTS
══════════════════════════════════════════════════ */
const CARD_ICONS = { Visa: "💳", Mastercard: "💳", Amex: "💳", Default: "💳" };

function renderCards() {
  const list = document.getElementById("cards-list");
  if (!list) return;
  if (state.cards.length === 0) {
    list.innerHTML =
      '<p class="text-sm text-slate-400 text-center py-4">No saved cards yet.</p>';
    return;
  }
  list.innerHTML = state.cards
    .map(
      (card) => `
    <div class="pay-card ${card.isDefault ? "default" : ""}" id="card-${card.id}">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center text-2xl ${card.isDefault ? "bg-green-100" : "bg-slate-100 dark:bg-slate-800"}">
          ${card.brand === "Visa" ? "🟦" : card.brand === "Mastercard" ? "🔴" : "💳"}
        </div>
        <div>
          <div class="font-bold text-sm text-slate-800 dark:text-slate-200">${card.brand} •••• ${card.last4}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Expires ${card.expiry}</div>
          ${card.isDefault ? '<span class="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Default</span>' : ""}
        </div>
      </div>
      <div class="flex items-center gap-2">
        ${!card.isDefault ? `<button onclick="setDefault(${card.id})" class="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-green-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-green-500 transition-all">Set Default</button>` : ""}
        <button onclick="removeCard(${card.id})" class="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all"><i class="ph ph-trash"></i></button>
      </div>
    </div>
  `,
    )
    .join("");
}

function setDefault(id) {
  state.cards.forEach((c) => (c.isDefault = c.id === id));
  renderCards();
  saveStateToDB();
  showToast("Default payment method updated!");
}

function removeCard(id) {
  const card = state.cards.find((c) => c.id === id);
  if (card && card.isDefault && state.cards.length > 1) {
    showToast(
      "Cannot remove default card. Set another as default first.",
      "error",
    );
    return;
  }
  state.cards = state.cards.filter((c) => c.id !== id);
  renderCards();
  saveStateToDB();
  showToast("Card removed successfully");
}

function addCard() {
  const number = document
    .getElementById("card-number-input")
    .value.replace(/\s/g, "");
  const expiry = document.getElementById("card-expiry-input").value;
  const cvc = document.getElementById("card-cvc-input").value;
  const name = document.getElementById("card-name-input").value.trim();

  if (number.length < 13 || !expiry || cvc.length < 3 || !name) {
    showToast("Please fill in all card details correctly", "error");
    return;
  }
  if (!/^\d+$/.test(number)) {
    showToast("Invalid card number", "error");
    return;
  }
  if (!/^\d{2}\/\d{2}$/.test(expiry)) {
    showToast("Use MM/YY format for expiry", "error");
    return;
  }

  const last4 = number.slice(-4);
  const brand = number.startsWith("4")
    ? "Visa"
    : number.startsWith("5")
      ? "Mastercard"
      : number.startsWith("3")
        ? "Amex"
        : "Card";
  const newId = state.cards.length
    ? Math.max(...state.cards.map((c) => c.id)) + 1
    : 1;
  state.cards.push({
    id: newId,
    brand,
    last4,
    expiry,
    isDefault: state.cards.length === 0,
  });

  document.getElementById("add-card-modal").classList.remove("open");
  [
    "card-number-input",
    "card-expiry-input",
    "card-cvc-input",
    "card-name-input",
  ].forEach((id) => setVal(id, ""));
  renderCards();
  saveStateToDB();
  showToast(`${brand} card ending in ${last4} added!`);
}

/* ══════════════════════════════════════════════════
   TRAVEL PREFERENCES
══════════════════════════════════════════════════ */
function renderAirlines() {
  const grid = document.getElementById("airlines-grid");
  if (!grid) return;
  grid.innerHTML = AIRLINES.map(
    (airline) => `
    <div class="airline-chip ${state.preferences.airlines.includes(airline) ? "selected" : ""}" onclick="toggleAirline('${airline}', this)">
      <i class="ph ph-airplane-tilt text-sm"></i> ${airline}
    </div>
  `,
  ).join("");
}

function toggleAirline(name, el) {
  const idx = state.preferences.airlines.indexOf(name);
  if (idx > -1) {
    state.preferences.airlines.splice(idx, 1);
    el.classList.remove("selected");
  } else {
    state.preferences.airlines.push(name);
    el.classList.add("selected");
  }
  saveStateToDB();
}

function loadPreferences() {
  const p = state.preferences;
  setVal("home-airport", p.homeAirport);
  setVal("cabin-pref", p.cabin);
  setVal("meal-pref", p.meal);
  const radios = document.querySelectorAll('input[name="seat-pref"]');
  radios.forEach((r) => {
    r.checked = r.value === p.seat;
  });
}

function autoDetectAirport() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported by your browser", "error");
    return;
  }
  showToast("Detecting your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // In production: reverse geocode → nearest airport
      // Mock: show success with a placeholder
      const { latitude, longitude } = pos.coords;
      showToast(
        `Location detected (${latitude.toFixed(2)}, ${longitude.toFixed(2)}). Using nearest major airport.`,
      );
      setVal("home-airport", "NBO");
    },
    () => {
      showToast("Could not detect location. Please enter manually.", "error");
    },
  );
}

function savePreferences() {
  state.preferences.homeAirport = (
    document.getElementById("home-airport")?.value || ""
  ).toUpperCase();
  state.preferences.cabin =
    document.getElementById("cabin-pref")?.value || "Economy";
  state.preferences.meal =
    document.getElementById("meal-pref")?.value || "Standard";
  const selectedSeat = document.querySelector(
    'input[name="seat-pref"]:checked',
  );
  if (selectedSeat) state.preferences.seat = selectedSeat.value;
  saveStateToDB();
  showToast("Travel preferences saved!");
}

/* ══════════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════════ */
const EMAIL_NOTIF = [
  {
    key: "booking_confirmations",
    label: "Booking Confirmations",
    desc: "Get notified when a booking is confirmed or cancelled",
  },
  {
    key: "price_alerts",
    label: "Flight Price Alerts",
    desc: "Alerts when prices drop on your saved routes",
  },
  {
    key: "promotions",
    label: "Promotions & Offers",
    desc: "Exclusive deals and limited-time offers",
  },
  {
    key: "newsletter",
    label: "Newsletter",
    desc: "Monthly travel inspiration and destination guides",
  },
];
const SMS_NOTIF = [
  {
    key: "sms_notifications",
    label: "SMS Notifications",
    desc: "Text messages for booking updates and alerts",
  },
  {
    key: "push_notifications",
    label: "Push Notifications",
    desc: "Browser push alerts for real-time updates",
  },
];

function renderNotifications() {
  renderNotifGroup("email-notifications", EMAIL_NOTIF, "email");
  renderNotifGroup("sms-notifications", SMS_NOTIF, "sms");
}

function renderNotifGroup(containerId, items, group) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items
    .map(
      (item) => `
    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="font-bold text-sm text-slate-800 dark:text-slate-200">${item.label}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${item.desc}</div>
      </div>
      <label class="toggle-wrap flex-shrink-0">
        <input type="checkbox" id="notif-${item.key}" ${state.notifications[group][item.key] ? "checked" : ""} onchange="toggleNotif('${group}','${item.key}',this.checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `,
    )
    .join("");
}

function toggleNotif(group, key, val) {
  state.notifications[group][key] = val;
  saveStateToDB();
}

function saveNotifications() {
  showToast("Notification preferences saved!");
}

/* ══════════════════════════════════════════════════
   REWARDS
══════════════════════════════════════════════════ */
function renderRewards() {
  const r = state.rewards;
  if (!r) return;
  
  setText("reward-level-badge", r.level === "Member" ? "Member" : `${r.level} Member`);
  setText("reward-points", r.points.toLocaleString());
  
  const valEl = document.getElementById("reward-value");
  if(valEl) valEl.textContent = `≈ $${(r.points / 100).toFixed(2)} in travel credits`;
  
  setText("reward-progress-header", `Progress to ${r.nextLevel}`);
  const remaining = r.nextThreshold - r.points;
  const subEl = document.getElementById("reward-progress-sub");
  if(subEl) subEl.innerHTML = `Earn <span class="font-bold text-green-600" id="reward-progress-points">${remaining.toLocaleString()} more points</span> to reach ${r.nextLevel} status`;
  
  setText("reward-current-label", `${r.level} — ${r.points.toLocaleString()} pts`);
  setText("reward-next-label", `${r.nextLevel} — ${r.nextThreshold.toLocaleString()} pts`);
  
  const pct = ((r.points / r.nextThreshold) * 100).toFixed(1);
  const fill = document.getElementById("progress-fill");
  if(fill) fill.style.width = pct + "%";
  setText("reward-progress-text", `${pct}% complete`);

  const history = document.getElementById("points-history");
  if (history) {
    if (!r.history || r.history.length === 0) {
      history.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">No points history available yet.</p>';
    } else {
      history.innerHTML = r.history
        .map(
          (h) => `
        <div class="activity-row">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${h.pts > 0 ? "bg-green-100" : "bg-red-50"}">
            <i class="ph ph-${h.pts > 0 ? "plus-circle" : "minus-circle"} text-lg ${h.pts > 0 ? "text-green-600" : "text-red-500"}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">${h.desc}</div>
            <div class="text-xs text-slate-400">${h.date}</div>
          </div>
          <div class="font-bold text-sm ${h.pts > 0 ? "text-green-600" : "text-red-500"} flex-shrink-0">
            ${h.pts > 0 ? "+" : ""}${h.pts.toLocaleString()} pts
          </div>
        </div>
      `,
        )
        .join("");
    }
  }
}
