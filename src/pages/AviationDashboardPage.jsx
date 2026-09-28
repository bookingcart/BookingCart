import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { CATEGORY_LABELS, aviationRequest, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const TABS = ["overview", "fleet", "charters", "operations"];

const EMPTY_AIRCRAFT = {
  name: "", category: "light_jet", manufacturer: "", model: "", year: 2020, registration: "",
  baseAirport: "EBB", passengers: 6, crew: 2, rangeNm: 1500, cruiseSpeedKt: 400, maxAltitudeFt: 41000,
  baggageCuFt: 40, cabin: { lengthFt: 15, widthFt: 5, heightFt: 4.8 }, hourlyRate: 4000,
  amenities: [], petFriendly: false, smokingAllowed: false, international: true, domestic: true,
  charterServices: ["on_demand"], helicopterServices: [], flightZones: ["EBB"],
  safety: { aoc: "", certification: "", insurance: "", maintenanceCurrent: false, pilotCertifications: "ATPL", regulatoryStatus: "compliant" },
  images: "",
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

  async function load() {
    const data = await aviationRequest("operator-get", { token: getToken() });
    setPortal(data.portal);
  }

  useEffect(() => {
    document.title = "Operator dashboard | BookingCart";
    if (!user) { navigate("/auth?redirect=/aviation/dashboard"); return; }
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [user]);

  async function saveAircraft(submit) {
    setNotice(""); setError("");
    const body = {
      ...draft,
      images: String(draft.images || "").split(",").map((item) => item.trim()).filter(Boolean),
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
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 mb-2">
              <i className="ph ph-shield-check text-sm" />
              {portal.operator.status}
            </div>
            <h1 className="text-4xl font-black">{portal.operator.companyName}</h1>
            <p className="text-slate-500 mt-1 text-sm">Based at {portal.operator.baseAirport} · {portal.fleet?.length || 0} aircraft listed</p>
          </div>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {TABS.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition-all ${tab === item ? "bg-white text-slate-950 shadow dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {notice && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300">{notice}</div>}
        {error && <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-700">{error}</div>}

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
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
                    images: (item.images || []).join(", "),
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

                {/* Image URLs */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Aircraft image URLs (comma-separated)</label>
                  <input value={draft.images} onChange={(e) => setDraft({ ...draft, images: e.target.value })} placeholder="https://… , https://…" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
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
      </div>
    </AviationLayout>
  );
}
