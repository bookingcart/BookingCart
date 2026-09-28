import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";

const emptyLeg = () => ({ from: "", to: "", date: "", time: "09:00" });

const AIRCRAFT_CATEGORIES = [
  { value: "light_jet", label: "Light Jet (4–7 guests)" },
  { value: "midsize_jet", label: "Mid-Size Jet (8–9 guests)" },
  { value: "super_midsize_jet", label: "Super Mid-Size Jet (9–10 guests)" },
  { value: "heavy_jet", label: "Heavy Jet (12–16 guests)" },
  { value: "ultra_long_range", label: "Ultra Long Range (14–19 guests)" },
  { value: "business_jet", label: "Business Jet" },
  { value: "executive_jet", label: "Executive Jet" },
  { value: "vip_jet", label: "VIP Jet" },
  { value: "on_demand", label: "On-Demand Charter" },
  { value: "corporate", label: "Corporate Charter" },
  { value: "group", label: "Group Charter" },
  { value: "medevac", label: "Medical Evacuation" },
  { value: "government", label: "Government Charter" },
  { value: "tourism", label: "Tourism Charter" },
  { value: "safari", label: "Safari Air Transfer" },
  { value: "island", label: "Island Transfer" },
  { value: "scenic", label: "Scenic Helicopter Flight" },
  { value: "aerial_tour", label: "Aerial Tour" },
  { value: "vip_transfer", label: "VIP Helicopter Transfer" },
  { value: "helicopter", label: "Any Helicopter Service" },
];

const CATERING_PRESETS = ["Standard catering", "Gourmet dining", "Champagne & canapés", "Vegan menu", "Halal menu", "Kids menu"];
const VIP_SERVICES = [
  { id: "red_carpet", label: "Red carpet & meet & greet", icon: "ph-star" },
  { id: "limousine", label: "Limousine transfer", icon: "ph-car" },
  { id: "vip_lounge", label: "VIP lounge access", icon: "ph-armchair" },
  { id: "concierge", label: "Personal concierge", icon: "ph-person-simple-walk" },
  { id: "hotel_transfer", label: "Hotel transfer arrangement", icon: "ph-house-simple" },
  { id: "photography", label: "Professional photography", icon: "ph-camera" },
];

const STEPS = ["Itinerary", "Passengers & Preferences", "Ground Services", "Review & Submit"];

export default function AviationCharterPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [legs, setLegs] = useState([{
    from: params.get("origin") || "EBB",
    to: params.get("destination") || "MFU",
    date: params.get("departDate") || "",
    time: "08:00",
  }]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    passengers: params.get("passengers") || 4,
    aircraftCategory: params.get("category") || "safari",
    preferredAircraftId: params.get("preferredAircraftId") || "",
    catering: "",
    cateringNotes: "",
    groundTransport: true,
    groundTransportNotes: "",
    vipServices: [],
    smokingAllowed: false,
    petFriendly: false,
    specialRequests: "",
    notes: "",
    budget: "",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateLeg(index, key, value) {
    setLegs((current) => current.map((leg, i) => i === index ? { ...leg, [key]: value } : leg));
  }

  function removeLeg(index) {
    setLegs((current) => current.filter((_, i) => i !== index));
  }

  function toggleVip(id) {
    setForm((f) => ({
      ...f,
      vipServices: f.vipServices.includes(id) ? f.vipServices.filter((v) => v !== id) : [...f.vipServices, id],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await aviationRequest("charter-create", {
        method: "POST",
        body: { ...form, legs },
      });
      setResult(data.charter);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <AviationLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-6">
            <i className="ph ph-paper-plane-tilt text-4xl text-emerald-700" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Charter request received</p>
          <h1 className="mt-2 text-4xl font-black">{result.ref}</h1>
          <p className="mt-4 text-slate-500 leading-relaxed max-w-md mx-auto">
            Your charter request has been sent to verified operators. Expect customised quotations and aircraft alternatives within 2 hours. Operators can negotiate charter terms directly.
          </p>
          <div className="mt-8 rounded-3xl bg-white border border-slate-100 p-6 text-left space-y-3 dark:bg-slate-900 dark:border-slate-800">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Itinerary summary</p>
            {legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-black dark:bg-emerald-900/40 dark:text-emerald-300">{i + 1}</span>
                <p className="font-bold text-sm">{leg.from} → {leg.to}</p>
                <p className="text-xs text-slate-400">{leg.date} {leg.time}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/aviation" className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white">Back to aviation</a>
            <a href="/aviation/itinerary" className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold">Build full itinerary</a>
          </div>
        </div>
      </AviationLayout>
    );
  }

  return (
    <AviationLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Custom charter request</p>
          <h1 className="mt-2 text-4xl font-black">Tell operators the itinerary.</h1>
          <p className="mt-3 text-slate-500 max-w-lg leading-relaxed">
            Add multiple destinations, catering preferences, ground transport, and VIP services. Verified operators will submit custom quotations and can offer alternative aircraft.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => i < step + 1 && setStep(i)}
              className={`shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                step === i
                  ? "bg-emerald-700 text-white shadow-md shadow-emerald-700/20"
                  : i < step
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              }`}
            >
              <span className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">{i + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {/* ── STEP 0: ITINERARY ── */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-black">Flight itinerary</h2>
              <p className="text-sm text-slate-500">Add all legs of your journey. You can add multiple stops.</p>
              {legs.map((leg, index) => (
                <div key={index} className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-black dark:bg-emerald-900/40 dark:text-emerald-300">
                        {index + 1}
                      </span>
                      <p className="font-black text-sm">Leg {index + 1}</p>
                    </div>
                    {legs.length > 1 && (
                      <button type="button" onClick={() => removeLeg(index)} className="text-xs font-bold text-rose-500 hover:text-rose-700">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">From airport</label>
                      <input required placeholder="EBB" value={leg.from} onChange={(e) => updateLeg(index, "from", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">To airport</label>
                      <input required placeholder="MFU" value={leg.to} onChange={(e) => updateLeg(index, "to", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Date</label>
                      <input required type="date" value={leg.date} onChange={(e) => updateLeg(index, "date", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Departure time</label>
                      <input type="time" value={leg.time} onChange={(e) => updateLeg(index, "time", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLegs((current) => [...current, emptyLeg()])}
                className="inline-flex items-center gap-2 rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
              >
                <i className="ph ph-plus text-base" />
                Add destination
              </button>
            </div>
          )}

          {/* ── STEP 1: PASSENGERS & PREFERENCES ── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black">Passengers &amp; preferences</h2>
              <div className="grid gap-4 rounded-3xl bg-white border border-slate-100 p-5 sm:grid-cols-2 dark:bg-slate-900 dark:border-slate-800">
                {[["name", "Full name *", "text"], ["email", "Email address *", "email"], ["phone", "Phone number", "tel"], ["company", "Company / Organisation", "text"]].map(([key, label, type]) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
                    <input
                      type={type}
                      required={["name", "email"].includes(key)}
                      placeholder={label.replace(" *", "")}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Passenger count</label>
                  <input type="number" min="1" max="100" value={form.passengers} onChange={(e) => setForm({ ...form, passengers: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Preferred aircraft category</label>
                  <select value={form.aircraftCategory} onChange={(e) => setForm({ ...form, aircraftCategory: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
                    {AIRCRAFT_CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Preferred aircraft ID (optional)</label>
                  <input placeholder="Leave blank for any" value={form.preferredAircraftId} onChange={(e) => setForm({ ...form, preferredAircraftId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Budget (USD, optional)</label>
                  <input type="number" placeholder="Any budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input type="checkbox" checked={form.smokingAllowed} onChange={(e) => setForm({ ...form, smokingAllowed: e.target.checked })} className="h-4 w-4 rounded" />
                    <i className="ph ph-cigarette text-slate-400" />
                    Smoking allowed
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input type="checkbox" checked={form.petFriendly} onChange={(e) => setForm({ ...form, petFriendly: e.target.checked })} className="h-4 w-4 rounded" />
                    <i className="ph ph-paw-print text-slate-400" />
                    Pet-friendly aircraft
                  </label>
                </div>
              </div>

              {/* Catering */}
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h3 className="font-black mb-3">Special catering requests</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {CATERING_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, catering: f.catering === preset ? "" : preset }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all border ${form.catering === preset ? "bg-emerald-700 text-white border-emerald-700" : "border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300"}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Specific dietary requirements, meal preferences, beverages…"
                  value={form.cateringNotes}
                  onChange={(e) => setForm({ ...form, cateringNotes: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: GROUND SERVICES ── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black">Ground services &amp; VIP</h2>

              {/* Ground transport */}
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-black">Ground transportation</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Vehicle from / to aircraft</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="sr-only peer" checked={form.groundTransport} onChange={(e) => setForm({ ...form, groundTransport: e.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-emerald-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </div>
                {form.groundTransport && (
                  <textarea
                    placeholder="Pickup address, hotel, or instructions for the ground coordinator…"
                    value={form.groundTransportNotes}
                    onChange={(e) => setForm({ ...form, groundTransportNotes: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                  />
                )}
              </div>

              {/* VIP services */}
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h3 className="font-black mb-3">VIP services</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {VIP_SERVICES.map((svc) => (
                    <label key={svc.id} className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-all ${form.vipServices.includes(svc.id) ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-slate-200 hover:border-emerald-200 dark:border-slate-700"}`}>
                      <input type="checkbox" checked={form.vipServices.includes(svc.id)} onChange={() => toggleVip(svc.id)} className="h-4 w-4 rounded" />
                      <i className={`ph ${svc.icon} text-lg ${form.vipServices.includes(svc.id) ? "text-emerald-700" : "text-slate-400"}`} />
                      <span className="text-sm font-semibold">{svc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h3 className="font-black mb-3">Notes for the operator</h3>
                <textarea
                  placeholder="Any other requirements, special occasions, accessibility needs…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
          )}

          {/* ── STEP 3: REVIEW ── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-black">Review &amp; submit</h2>
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800 space-y-4">
                <ReviewRow label="Contact" value={`${form.name} · ${form.email}`} />
                <ReviewRow label="Passengers" value={form.passengers} />
                <ReviewRow label="Aircraft preference" value={AIRCRAFT_CATEGORIES.find((c) => c.value === form.aircraftCategory)?.label || form.aircraftCategory} />
                <ReviewRow label="Itinerary" value={legs.map((l) => `${l.from} → ${l.to} (${l.date})`).join(" · ")} />
                {form.catering && <ReviewRow label="Catering" value={form.catering} />}
                {form.groundTransport && <ReviewRow label="Ground transport" value="Requested" />}
                {form.vipServices.length > 0 && <ReviewRow label="VIP services" value={form.vipServices.map((id) => VIP_SERVICES.find((v) => v.id === id)?.label).join(", ")} />}
                {form.notes && <ReviewRow label="Notes" value={form.notes} />}
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                <i className="ph ph-info mr-2" />
                Your request will be visible to all verified aviation operators. Operators respond within 2 hours with custom quotations.
              </div>
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-6 flex justify-between gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300">
                ← Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} className="rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-700/20">
                Continue →
              </button>
            ) : (
              <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-md shadow-emerald-700/20">
                {loading ? <><i className="ph ph-spinner animate-spin" /> Submitting…</> : <><i className="ph ph-paper-plane-tilt" /> Submit charter request</>}
              </button>
            )}
          </div>
        </form>
      </div>
    </AviationLayout>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start gap-4">
      <p className="w-36 shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
