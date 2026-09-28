import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { CATEGORY_LABELS, aviationRequest, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const TABS = ["overview", "profile", "fleet", "charters", "operations", "wallet"];

const EMPTY_AIRCRAFT = {
  name: "", category: "light_jet", manufacturer: "", model: "", year: 2020, registration: "",
  baseAirport: "EBB", passengers: 6, crew: 2, rangeNm: 1500, cruiseSpeedKt: 400, maxAltitudeFt: 41000,
  baggageCuFt: 40, cabin: { lengthFt: 15, widthFt: 5, heightFt: 4.8 }, hourlyRate: 4000,
  amenities: [], petFriendly: false, smokingAllowed: false, international: true, domestic: true,
  charterServices: ["on_demand"], helicopterServices: [], flightZones: ["EBB"],
  safety: { aoc: "", certification: "", insurance: "", maintenanceCurrent: false, pilotCertifications: "ATPL", regulatoryStatus: "compliant" },
  images: [],
};

const AMENITY_OPTIONS = [
  { id: "wifi", label: "Wi-Fi", icon: "ph-wifi-high" },
  { id: "entertainment", label: "Entertainment", icon: "ph-monitor-play" },
  { id: "conference", label: "Conference", icon: "ph-chalkboard" },
  { id: "private_bedrooms", label: "Private Bedrooms", icon: "ph-bed" },
  { id: "premium_catering", label: "Premium Catering", icon: "ph-fork-knife" },
  { id: "luxury_seating", label: "Luxury Seating", icon: "ph-couch" },
  { id: "flight_attendant", label: "Flight Attendant", icon: "ph-person-simple-walk" },
  { id: "vip_ground", label: "VIP Ground Handling", icon: "ph-car" },
];

const CHARTER_SERVICE_OPTIONS = ["on_demand", "corporate", "group", "medevac", "government", "tourism", "safari", "island"];
const HELICOPTER_SERVICE_OPTIONS = ["scenic", "aerial_tour", "vip_transfer", "airport_transfer", "emergency", "corporate_flight"];

export default function AviationDashboardPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(EMPTY_AIRCRAFT);
  const [quote, setQuote] = useState({ charterRef: "", aircraftId: "", amount: "", notes: "", schedule: "" });
  const [crew, setCrew] = useState({ bookingRef: "", name: "", role: "Captain", certification: "ATPL" });
  const [doc, setDoc] = useState({ aircraftId: "", name: "Insurance certificate", url: "" });
  const [notice, setNotice] = useState("");
  const [profileForm, setProfileForm] = useState({
    companyName: "", contactName: "", phone: "", baseAirport: "", aoc: "", insurance: "", regulatoryStatus: "pending"
  });
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  async function load() {
    const data = await aviationRequest("operator-get", { token: getToken() });
    setPortal(data.portal);
    if (data.portal?.operator) {
      const op = data.portal.operator;
      setProfileForm({
        companyName: op.companyName || "",
        contactName: op.contactName || "",
        phone: op.phone || "",
        baseAirport: op.baseAirport || "",
        aoc: op.aoc || op.compliance?.aoc || "",
        insurance: op.insurance || op.compliance?.insurance || "",
        regulatoryStatus: op.regulatoryStatus || op.compliance?.regulatoryStatus || "pending",
      });
      try {
        const sRes = await fetch("/api/stripe-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check-status", role: "operator", operatorId: op.id })
        });
        const sData = await sRes.json();
        if (sData.ok) setStripeConnected(sData.connected);
      } catch {}
    }
    // Fetch unread aviation notifications
    try {
      const recipientId = encodeURIComponent(user?.email || "");
      const nRes = await fetch(`/api/notifications?recipientId=${recipientId}&role=operator`);
      const nData = await nRes.json();
      if (nData.success) {
        const aviationTypes = [
          'AVIATION_OPERATOR_VERIFIED','AVIATION_OPERATOR_REJECTED',
          'AVIATION_AIRCRAFT_APPROVED','AVIATION_AIRCRAFT_REJECTED','AVIATION_AIRCRAFT_SUSPENDED',
          'AVIATION_CHARTER_QUOTED','AVIATION_CHARTER_ACCEPTED','AVIATION_CHARTER_DECLINED',
          'AVIATION_BOOKING_CONFIRMED',
        ];
        const unread = (nData.notifications || []).filter(n => !n.read && aviationTypes.includes(n.type)).length;
        setUnreadNotifs(unread);
      }
    } catch {}
  }

  useEffect(() => {
    document.title = "Operator dashboard | BookingCart";
    if (!user) { navigate("/auth?redirect=/aviation/dashboard"); return; }
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [user]);

  async function handleConnectStripe() {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-account-link", role: "operator", operatorId: portal.operator.id })
      });
      const data = await res.json();
      if (data.ok && data.url) window.location.href = data.url;
      else setError(data.error || "Could not connect to Stripe");
    } catch (e) {
      setError(e.message);
    } finally {
      setStripeLoading(false);
    }
  }

  async function handleStripeLogin() {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-login-link", role: "operator", operatorId: portal.operator.id })
      });
      const data = await res.json();
      if (data.ok && data.url) window.open(data.url, "_blank");
      else setError(data.error || "Could not open Stripe dashboard");
    } catch (e) {
      setError(e.message);
    } finally {
      setStripeLoading(false);
    }
  }

  async function saveOperatorProfile(e) {
    if (e) e.preventDefault();
    setNotice(""); setError("");
    try {
      await aviationRequest("operator-save", { method: "POST", token: getToken(), body: profileForm });
      setNotice("Operator profile & compliance details updated successfully.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveAircraft(submit) {
    setNotice(""); setError("");
    const body = {
      ...draft,
      images: Array.isArray(draft.images) ? draft.images : [],
      safety: { ...draft.safety, pilotCertifications: String(draft.safety.pilotCertifications || "").split(",").map((item) => item.trim()).filter(Boolean) },
      submit,
    };
    const data = await aviationRequest("aircraft-save", { method: "POST", token: getToken(), body });
    setNotice(`${data.aircraft.name} saved as ${data.aircraft.status}.`);
    await load();
  }

  function toggleAmenity(id) {
    const current = Array.isArray(draft.amenities) ? draft.amenities : [];
    setDraft({ ...draft, amenities: current.includes(id) ? current.filter((a) => a !== id) : [...current, id] });
  }

  function toggleService(type, id) {
    const key = type === "charter" ? "charterServices" : "helicopterServices";
    const current = Array.isArray(draft[key]) ? draft[key] : [];
    setDraft({ ...draft, [key]: current.includes(id) ? current.filter((s) => s !== id) : [...current, id] });
  }

  if (loading) return <AviationLayout><p className="px-4 py-16 text-center animate-pulse">Loading operator portal…</p></AviationLayout>;
  if (!portal?.operator) {
    return (
      <AviationLayout>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <i className="ph ph-airplane-tilt text-5xl text-slate-200 dark:text-slate-700 mb-4" />
          <h1 className="text-3xl font-black">Operator portal</h1>
          <p className="mt-3 text-slate-500">{error || "You are not yet registered as an aviation operator."}</p>
          <a href="/aviation/operators/join" className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white">
            <i className="ph ph-airplane-tilt text-base" />
            Register as an operator
          </a>
        </div>
      </AviationLayout>
    );
  }

  const analytics = portal.analytics || {};

  return (
    <AviationLayout>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="relative mb-8 rounded-[2rem] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-8 sm:p-10 shadow-2xl shadow-slate-900/20 text-white dark:from-slate-950 dark:via-slate-900 dark:to-black">
          {/* subtle pattern overlay */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent"></div>
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-300 border border-emerald-500/30 mb-4 backdrop-blur-sm shadow-sm">
                <i className="ph ph-shield-check text-sm" />
                {portal.operator.status}
              </div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight">{portal.operator.companyName}</h1>
              <p className="text-slate-300 mt-3 text-sm flex items-center gap-3 font-medium">
                <span className="flex items-center gap-1.5"><i className="ph ph-map-pin text-emerald-400 text-lg"></i> Base: {portal.operator.baseAirport}</span>
                <span className="text-slate-600">|</span> 
                <span className="flex items-center gap-1.5"><i className="ph ph-airplane text-emerald-400 text-lg"></i> {portal.fleet?.length || 0} aircraft</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Notifications bell */}
              <a
                href="/notifications"
                className="relative inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/40 transition-all backdrop-blur-md shadow-lg hover:scale-105 active:scale-95"
                title="View aviation notifications"
              >
                <i className="ph ph-bell text-xl text-white" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-lg border-2 border-slate-900 animate-pulse">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </a>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 overflow-x-auto pb-6 mb-2 scrollbar-hide">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-2xl px-6 py-3 text-sm font-black capitalize transition-all whitespace-nowrap shadow-sm border hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 ${tab === item ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900" : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:shadow-md dark:bg-slate-900 dark:border-slate-700 dark:hover:text-white dark:hover:border-slate-600"}`}
            >
              {item === 'overview' && <i className="ph ph-squares-four text-lg" />}
              {item === 'profile' && <i className="ph ph-building text-lg" />}
              {item === 'fleet' && <i className="ph ph-airplane-tilt text-lg" />}
              {item === 'charters' && <i className="ph ph-paper-plane-tilt text-lg" />}
              {item === 'operations' && <i className="ph ph-clipboard-text text-lg" />}
              {item === 'wallet' && <i className="ph ph-wallet text-lg" />}
              {item}
            </button>
          ))}
        </div>

        {notice && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300">{notice}</div>}
        {error && <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-700">{error}</div>}

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {(!profileForm.aoc || !profileForm.insurance) && (
              <div className="rounded-3xl bg-amber-50 border border-amber-200 p-5 dark:bg-amber-950/20 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                    <i className="ph ph-warning-circle text-2xl" />
                  </div>
                  <div>
                    <h3 className="font-black text-amber-900 dark:text-amber-200 text-sm">Action Required: Submit AOC &amp; Insurance Info</h3>
                    <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                      Please submit your Air Operator Certificate (AOC) and Insurance coverage details through your profile dashboard so your account file is complete.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setTab("profile")}
                  className="rounded-full bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors shrink-0"
                >
                  Submit Missing Info →
                </button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Charter revenue", value: money(analytics.totalCharterRevenue), icon: "ph-money", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
                { label: "Flights booked", value: analytics.flightsBooked || 0, icon: "ph-airplane-tilt", color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40" },
                { label: "Average booking", value: money(analytics.averageBookingValue), icon: "ph-chart-line-up", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
                { label: "Satisfaction", value: analytics.customerSatisfaction || "—", icon: "ph-star", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="rounded-3xl bg-white p-5 border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-3`}>
                    <i className={`ph ${icon} text-lg`} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-3xl font-black">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h2 className="font-black mb-3">Popular routes</h2>
                {(analytics.popularRoutes || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No confirmed flights yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(analytics.popularRoutes || []).map((route) => (
                      <div key={route.route} className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{route.route}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold dark:bg-slate-800">{route.count} flights</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h2 className="font-black mb-3">Aircraft utilization</h2>
                {(analytics.aircraftUtilization || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No utilization data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(analytics.aircraftUtilization || []).slice(0, 4).map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span>{item.name}</span>
                          <span>{item.utilization}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${item.utilization}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <a href="/aviation/dashboard#fleet" onClick={() => setTab("fleet")} className="rounded-3xl border-2 border-dashed border-slate-200 p-6 hover:border-emerald-300 hover:bg-emerald-50 transition-all dark:border-slate-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20 text-center">
                <i className="ph ph-airplane text-3xl text-slate-300 dark:text-slate-600" />
                <p className="mt-2 font-black text-sm">Add aircraft to your fleet</p>
                <p className="text-xs text-slate-500 mt-1">Upload details and submit for approval</p>
              </a>
              <a href="/aviation/dashboard#charters" onClick={() => setTab("charters")} className="rounded-3xl border-2 border-dashed border-slate-200 p-6 hover:border-emerald-300 hover:bg-emerald-50 transition-all dark:border-slate-700 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20 text-center">
                <i className="ph ph-clipboard-text text-3xl text-slate-300 dark:text-slate-600" />
                <p className="mt-2 font-black text-sm">{portal.charters?.length || 0} charter requests</p>
                <p className="text-xs text-slate-500 mt-1">Review and quote pending requests</p>
              </a>
            </div>
          </div>
        )}

        {/* ── PROFILE & COMPLIANCE ── */}
        {tab === "profile" && (
          <form onSubmit={saveOperatorProfile} className="rounded-3xl bg-white border border-slate-100 p-6 dark:bg-slate-900 dark:border-slate-800 space-y-6">
            <div>
              <h2 className="text-xl font-black">Operator Profile &amp; Safety Compliance</h2>
              <p className="text-xs text-slate-500 mt-1">Submit or update your company registration, Air Operator Certificate (AOC), and insurance coverage info.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Company Name *</label>
                <input
                  value={profileForm.companyName}
                  onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                  placeholder="e.g. Lake Air Charters"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact Person Name</label>
                <input
                  value={profileForm.contactName}
                  onChange={(e) => setProfileForm({ ...profileForm, contactName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phone Number</label>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+256 700 000 000"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Base Airport (IATA Code)</label>
                <input
                  value={profileForm.baseAirport}
                  onChange={(e) => setProfileForm({ ...profileForm, baseAirport: e.target.value.toUpperCase() })}
                  placeholder="e.g. EBB"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              <h3 className="font-black text-sm mb-3">Required Compliance Files</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Air Operator Certificate (AOC) *</label>
                  <input
                    value={profileForm.aoc}
                    onChange={(e) => setProfileForm({ ...profileForm, aoc: e.target.value })}
                    placeholder="e.g. UG-AOC-999 or AOC Certificate Link"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Provide your active AOC license number or document ref.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Insurance Coverage Details *</label>
                  <input
                    value={profileForm.insurance}
                    onChange={(e) => setProfileForm({ ...profileForm, insurance: e.target.value })}
                    placeholder="e.g. Lloyd's Aviation Liability Policy #8841"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Provide insurer name, coverage type, or policy number.</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Regulatory Compliance Status</label>
                  <select
                    value={profileForm.regulatoryStatus}
                    onChange={(e) => setProfileForm({ ...profileForm, regulatoryStatus: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="compliant">Compliant</option>
                    <option value="pending">Pending Audit</option>
                    <option value="under_review">Under Review</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-2xl bg-emerald-700 px-6 py-2.5 text-sm font-black text-white hover:bg-emerald-800 transition-colors shadow-sm"
              >
                Save Profile &amp; Compliance Details
              </button>
            </div>
          </form>
        )}

        {/* ── FLEET MANAGEMENT ── */}
        {tab === "fleet" && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Aircraft list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black">Your fleet</h2>
                <button onClick={() => setDraft(EMPTY_AIRCRAFT)} className="text-xs font-bold text-emerald-700">+ New aircraft</button>
              </div>
              {portal.fleet.length === 0 && <p className="text-sm text-slate-500">No aircraft added yet.</p>}
              {portal.fleet.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setDraft({
                    ...item,
                    images: Array.isArray(item.images) ? item.images : [],
                    amenities: item.amenities || [],
                    safety: { ...item.safety, pilotCertifications: (item.safety?.pilotCertifications || []).join(", ") },
                  })}
                  className="w-full rounded-2xl bg-white border border-slate-100 p-4 text-left hover:border-emerald-200 hover:shadow-md transition-all dark:bg-slate-900 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-black text-sm">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.registration} · {CATEGORY_LABELS[item.category] || item.category}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {item.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Aircraft form */}
            <form
              onSubmit={(e) => { e.preventDefault(); saveAircraft(false).catch((err) => setError(err.message)); }}
              className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800"
            >
              <h2 className="font-black mb-4">{draft.id ? "Edit aircraft" : "Add new aircraft"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Category */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Aircraft category</label>
                  <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
                    {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>

                {/* General fields */}
                {[
                  ["name", "Aircraft name *"],
                  ["manufacturer", "Manufacturer"],
                  ["model", "Model"],
                  ["year", "Year of manufacture"],
                  ["registration", "Registration number *"],
                  ["baseAirport", "Base airport (IATA) *"],
                  ["passengers", "Passenger capacity"],
                  ["crew", "Crew capacity"],
                  ["rangeNm", "Flight range (nm)"],
                  ["cruiseSpeedKt", "Cruise speed (kt)"],
                  ["maxAltitudeFt", "Maximum altitude (ft)"],
                  ["baggageCuFt", "Baggage capacity (cu ft)"],
                  ["hourlyRate", "Hourly rate (USD)"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
                    <input value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                  </div>
                ))}

                {/* Aircraft Images */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 block">Aircraft images</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(Array.isArray(draft.images) ? draft.images : []).map((img, idx) => (
                      <div key={idx} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        <img src={img} alt={`Aircraft ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...(Array.isArray(draft.images) ? draft.images : [])];
                              next.splice(idx, 1);
                              setDraft({ ...draft, images: next });
                            }}
                            className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-colors"
                          >
                            <i className="ph ph-trash text-sm" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!draft.images || draft.images.length < 10) && (
                      <label className="aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-500 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-emerald-500 transition-all bg-slate-50 dark:bg-slate-800 cursor-pointer">
                        <i className="ph ph-plus-circle text-2xl" />
                        <span className="text-xs font-semibold">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files);
                            files.forEach(file => {
                              if (file.size > 20 * 1024 * 1024) return;
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setDraft(prev => ({ ...prev, images: [...(Array.isArray(prev.images) ? prev.images : []), reader.result] }));
                              };
                              reader.readAsDataURL(file);
                            });
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Upload up to 10 photos. First photo will be the cover image.</p>
                </div>

                {/* Amenities */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 block">Cabin amenities</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {AMENITY_OPTIONS.map((a) => (
                      <label key={a.id} className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer text-xs font-semibold transition-all ${(draft.amenities || []).includes(a.id) ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700"}`}>
                        <input type="checkbox" checked={(draft.amenities || []).includes(a.id)} onChange={() => toggleAmenity(a.id)} className="h-3.5 w-3.5 rounded" />
                        <i className={`ph ${a.icon} text-sm`} />
                        {a.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Charter services */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 block">Charter services offered</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CHARTER_SERVICE_OPTIONS.map((svc) => (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => toggleService("charter", svc)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all border ${(draft.charterServices || []).includes(svc) ? "bg-emerald-700 text-white border-emerald-700" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}
                      >
                        {svc.replaceAll("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Helicopter services */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 block">Helicopter services offered</label>
                  <div className="flex flex-wrap gap-1.5">
                    {HELICOPTER_SERVICE_OPTIONS.map((svc) => (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => toggleService("helicopter", svc)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all border ${(draft.helicopterServices || []).includes(svc) ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}
                      >
                        {svc.replaceAll("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safety fields */}
                <div className="sm:col-span-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h3 className="font-black mb-3 text-sm">Safety &amp; compliance</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["aoc", "Air Operator Certificate (AOC)"],
                      ["certification", "Aircraft certification"],
                      ["insurance", "Insurance coverage"],
                      ["regulatoryStatus", "Regulatory status"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
                        <input value={draft.safety[key] || ""} onChange={(e) => setDraft({ ...draft, safety: { ...draft.safety, [key]: e.target.value } })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pilot certifications (comma-separated)</label>
                      <input value={draft.safety.pilotCertifications} onChange={(e) => setDraft({ ...draft, safety: { ...draft.safety, pilotCertifications: e.target.value } })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" checked={!!draft.safety.maintenanceCurrent} onChange={(e) => setDraft({ ...draft, safety: { ...draft.safety, maintenanceCurrent: e.target.checked } })} className="h-4 w-4 rounded" />
                      Maintenance records current
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="checkbox" checked={!!draft.petFriendly} onChange={(e) => setDraft({ ...draft, petFriendly: e.target.checked })} className="h-4 w-4 rounded" />
                      Pet friendly
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-black dark:border-slate-700" type="submit">Save draft</button>
                <button type="button" onClick={() => saveAircraft(true).catch((err) => setError(err.message))} className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 transition-colors">
                  Submit for approval
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── CHARTER MANAGEMENT ── */}
        {tab === "charters" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Charter requests</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {portal.charters.filter((c) => c.status === "pending").length} pending
              </span>
            </div>
            {portal.charters.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
                <i className="ph ph-clipboard-text text-4xl text-slate-300 dark:text-slate-600" />
                <p className="mt-3 font-black">No charter requests yet.</p>
                <p className="text-sm text-slate-500 mt-1">Requests appear once your fleet is approved.</p>
              </div>
            )}
            {portal.charters.map((charter) => (
              <article key={charter.ref} className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${charter.status === "pending" ? "bg-amber-100 text-amber-800" : charter.status === "quoted" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}>
                        {charter.status}
                      </span>
                      <span className="text-xs font-bold text-slate-400">{charter.ref}</span>
                    </div>
                    <p className="font-black">{charter.legs?.map((leg) => `${leg.from} → ${leg.to}`).join(" · ") || "Multi-leg"}</p>
                    <p className="text-sm text-slate-500 mt-1">{charter.passengers} guests · {charter.aircraftCategory?.replaceAll("_", " ")}</p>
                    {charter.catering && <p className="text-xs text-slate-500 mt-1"><i className="ph ph-fork-knife mr-1" />{charter.catering}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {charter.groundTransport && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">Ground transport</span>}
                      {charter.vipServices && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">VIP services</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <input
                    placeholder="Aircraft ID"
                    value={quote.charterRef === charter.ref ? quote.aircraftId : ""}
                    onChange={(e) => setQuote({ ...quote, charterRef: charter.ref, aircraftId: e.target.value })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                  <input
                    placeholder="Amount (USD)"
                    value={quote.charterRef === charter.ref ? quote.amount : ""}
                    onChange={(e) => setQuote({ ...quote, charterRef: charter.ref, amount: e.target.value })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                  <input
                    placeholder="Notes"
                    value={quote.charterRef === charter.ref ? quote.notes : ""}
                    onChange={(e) => setQuote({ ...quote, charterRef: charter.ref, notes: e.target.value })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 flex-1 min-w-32"
                  />
                  <button
                    onClick={() => aviationRequest("quotation", { method: "POST", token: getToken(), body: { ...quote, charterRef: charter.ref } }).then(load).then(() => setNotice("Quotation sent")).catch((err) => setError(err.message))}
                    className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                  >
                    Send quote
                  </button>
                  <button
                    onClick={() => aviationRequest("quotation", { method: "POST", token: getToken(), body: { charterRef: charter.ref, action: "reject" } }).then(load).catch((err) => setError(err.message))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold hover:border-rose-300 hover:text-rose-600 transition-colors dark:border-slate-700"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* ── FLIGHT OPERATIONS ── */}
        {tab === "operations" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-xl font-black">Upcoming flights</h2>
              {portal.bookings.filter((b) => b.status === "confirmed").length === 0 && (
                <p className="text-sm text-slate-500">No confirmed flights yet.</p>
              )}
              {portal.bookings.filter((b) => b.status === "confirmed").map((booking) => (
                <article key={booking.ref} className="rounded-3xl bg-white border border-slate-100 p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black">{booking.ref}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Confirmed</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{booking.origin?.code} → {booking.destination?.code} · {booking.departDate}</p>
                  <p className="text-xs mt-1 font-semibold">Crew: {(booking.crew || []).map((m) => m.name).join(", ") || "Unassigned"}</p>
                </article>
              ))}

              {/* Crew assignment */}
              <form
                onSubmit={(e) => { e.preventDefault(); aviationRequest("crew", { method: "POST", token: getToken(), body: { bookingRef: crew.bookingRef, crew: [crew] } }).then((data) => { setNotice(`Report ${data.report?.ref} ready`); return load(); }).catch((err) => setError(err.message)); }}
                className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800 space-y-3"
              >
                <h3 className="font-black">Assign crew</h3>
                {[["bookingRef", "Booking reference"], ["name", "Crew member name"], ["role", "Role (Captain/Co-pilot)"], ["certification", "Certification (ATPL/CPL)"]].map(([key, placeholder]) => (
                  <input key={key} placeholder={placeholder} value={crew[key]} onChange={(e) => setCrew({ ...crew, [key]: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                ))}
                <button className="w-full rounded-xl bg-slate-950 py-2 text-sm font-bold text-white dark:bg-slate-800">Save crew &amp; generate report</button>
              </form>
            </div>

            {/* Flight documents */}
            <form
              onSubmit={(e) => { e.preventDefault(); aviationRequest("aircraft-ops", { method: "POST", token: getToken(), body: { aircraftId: doc.aircraftId, document: doc, availability: [{ from: "2026-01-01", to: "2027-12-31", status: "available" }] } }).then(() => setNotice("Document stored")).catch((err) => setError(err.message)); }}
              className="h-fit space-y-4 rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800"
            >
              <h3 className="font-black">Upload flight documents</h3>
              <p className="text-xs text-slate-500">AOC certificates, insurance policies, maintenance records, and pilot certifications.</p>
              {[["aircraftId", "Aircraft ID"], ["name", "Document name"], ["url", "Document URL (https://)"]].map(([key, placeholder]) => (
                <input key={key} placeholder={placeholder} value={doc[key]} onChange={(e) => setDoc({ ...doc, [key]: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
              ))}
              <button className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 transition-colors">Upload document record</button>
            </form>
          </div>
        )}

        {/* ── WALLET ── */}
        {tab === "wallet" && (
          <div className="max-w-xl mx-auto mt-6">
            <h2 className="text-2xl font-black mb-6">Wallet &amp; Payouts</h2>
            <div className="rounded-3xl bg-white border border-slate-100 p-8 dark:bg-slate-900 dark:border-slate-800 text-center shadow-lg shadow-slate-200/40 dark:shadow-none transition-all">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white mb-6 shadow-xl shadow-indigo-500/30">
                <i className="ph ph-wallet text-4xl" />
              </div>
              <h3 className="text-xl font-black mb-2">Receive payouts directly</h3>
              <p className="text-sm text-slate-500 mb-8 max-w-sm mx-auto">
                Connect your bank account to receive payouts automatically when charter flights are completed. Powered securely by Stripe.
              </p>
              
              {stripeConnected ? (
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 mb-6 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
                    <i className="ph ph-check-circle text-lg" />
                    Stripe account connected
                  </div>
                  <button
                    onClick={handleStripeLogin}
                    disabled={stripeLoading}
                    className="block w-full rounded-full bg-slate-950 py-3.5 text-sm font-black text-white hover:bg-slate-800 transition-colors dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 disabled:opacity-70 shadow-lg shadow-slate-950/20 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {stripeLoading ? "Loading..." : "View Stripe Dashboard & Withdrawals"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectStripe}
                  disabled={stripeLoading}
                  className="block w-full rounded-full bg-indigo-600 py-3.5 text-sm font-black text-white hover:bg-indigo-700 transition-colors disabled:opacity-70 shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {stripeLoading ? "Connecting..." : "Connect Bank Account"}
                </button>
              )}
            </div>
            
            <div className="mt-8 rounded-3xl bg-slate-50 border border-slate-200 p-6 dark:bg-slate-800/50 dark:border-slate-700">
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <i className="ph ph-info text-blue-600 text-lg" />
                How payouts work
              </h4>
              <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-400 mt-5">
                <li className="flex items-start gap-4">
                  <div className="mt-0.5 rounded-full bg-blue-100 w-6 h-6 flex items-center justify-center text-xs font-black text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 shrink-0">1</div>
                  <p className="leading-relaxed">When a client books a flight, their payment is securely held in escrow.</p>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-0.5 rounded-full bg-blue-100 w-6 h-6 flex items-center justify-center text-xs font-black text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 shrink-0">2</div>
                  <p className="leading-relaxed">Funds become available for withdrawal 48 hours after the flight is successfully completed.</p>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-0.5 rounded-full bg-blue-100 w-6 h-6 flex items-center justify-center text-xs font-black text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 shrink-0">3</div>
                  <p className="leading-relaxed">Withdrawals take 2-3 business days to appear in your connected bank account.</p>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AviationLayout>
  );
}
