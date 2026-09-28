import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const STEPS = [
  { id: "company", label: "Company details", icon: "ph-buildings" },
  { id: "compliance", label: "Regulatory compliance", icon: "ph-shield-check" },
  { id: "fleet", label: "Fleet overview", icon: "ph-airplane-tilt" },
  { id: "review", label: "Review & submit", icon: "ph-paper-plane-tilt" },
];

export default function AviationOnboardingPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    companyName: "",
    contactName: user?.name || "",
    phone: "",
    email: user?.email || "",
    website: "",
    baseAirport: "EBB",
    yearsInOperation: "",
    fleetSize: "",
    primaryServices: [],
    aoc: "",
    insurance: "",
    insuranceExpiry: "",
    regulatoryStatus: "pending",
    maintenanceCertified: false,
    icaoMember: false,
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const PRIMARY_SERVICES = [
    { id: "private_jet", label: "Private Jets", icon: "ph-airplane-takeoff" },
    { id: "air_charter", label: "Air Charters", icon: "ph-path" },
    { id: "helicopter", label: "Helicopters", icon: "ph-fan" },
    { id: "safari", label: "Safari Transfers", icon: "ph-paw-print" },
    { id: "medevac", label: "Medical Evacuation", icon: "ph-first-aid-kit" },
    { id: "cargo", label: "Cargo", icon: "ph-package" },
  ];

  function toggleService(id) {
    setForm((f) => ({
      ...f,
      primaryServices: f.primaryServices.includes(id)
        ? f.primaryServices.filter((s) => s !== id)
        : [...f.primaryServices, id],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!user) { navigate("/auth?redirect=/aviation/operators/join"); return; }
    setLoading(true);
    setError("");
    try {
      await aviationRequest("operator-save", { method: "POST", token: getToken(), body: form });
      navigate("/aviation/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const canProceed = [
    form.companyName && form.contactName && form.baseAirport,
    form.aoc && form.insurance,
    true,
    true,
  ][step];

  return (
    <AviationLayout>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Hero */}
        <div className="mb-8 rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Join the network</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">List your fleet on BookingCart.</h1>
          <p className="mt-3 text-sm text-slate-300 max-w-md leading-relaxed">
            Reach qualified travellers booking private jets, safari charters, and VIP transfers. All operators are verified before aircraft listings go live.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-4 max-w-sm">
            {[["120+", "Aircraft listed"], ["340+", "Routes covered"], ["< 2h", "Avg. response"]].map(([val, label]) => (
              <div key={label} className="text-center">
                <p className="text-xl font-black">{val}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 mb-8 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${step === i ? "bg-white text-slate-950 shadow dark:bg-slate-700 dark:text-white" : i < step ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-slate-400"}`}
            >
              <i className={`ph ${s.icon} text-sm`} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {/* ── STEP 0: COMPANY DETAILS ── */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black">Company details</h2>
                <p className="text-slate-500 text-sm mt-1">Tell us about your aviation business.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                {[
                  ["companyName", "Operator / Company name *", "text"],
                  ["contactName", "Primary contact name *", "text"],
                  ["email", "Business email *", "email"],
                  ["phone", "Phone number", "tel"],
                  ["website", "Website (optional)", "url"],
                  ["baseAirport", "Primary base airport (IATA) *", "text"],
                  ["yearsInOperation", "Years in operation", "number"],
                  ["fleetSize", "Current fleet size", "number"],
                ].map(([key, label, type]) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
                    <input
                      type={type}
                      required={label.endsWith("*")}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                ))}
              </div>

              {/* Primary services */}
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h3 className="font-black mb-3">Primary services offered</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRIMARY_SERVICES.map((svc) => (
                    <label
                      key={svc.id}
                      className={`flex items-center gap-2.5 rounded-2xl border p-3 cursor-pointer transition-all ${form.primaryServices.includes(svc.id) ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-slate-200 hover:border-emerald-200 dark:border-slate-700"}`}
                    >
                      <input type="checkbox" checked={form.primaryServices.includes(svc.id)} onChange={() => toggleService(svc.id)} className="h-4 w-4 rounded" />
                      <i className={`ph ${svc.icon} text-lg ${form.primaryServices.includes(svc.id) ? "text-emerald-700" : "text-slate-400"}`} />
                      <span className="text-xs font-bold">{svc.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: REGULATORY COMPLIANCE ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black">Regulatory compliance</h2>
                <p className="text-slate-500 text-sm mt-1">AOC and insurance documents are required before listings can go live. All data is verified by our aviation team.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                {[
                  ["aoc", "Air Operator Certificate (AOC) number *", "text"],
                  ["insurance", "Insurance policy number *", "text"],
                  ["insuranceExpiry", "Insurance expiry date", "date"],
                  ["regulatoryStatus", "Current regulatory status", "text"],
                ].map(([key, label, type]) => (
                  <div key={key}>
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</label>
                    <input
                      type={type}
                      required={label.endsWith("*")}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                ))}
                <div className="sm:col-span-2 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.maintenanceCertified} onChange={(e) => setForm({ ...form, maintenanceCertified: e.target.checked })} className="h-4 w-4 rounded mt-0.5" />
                    <div>
                      <p className="text-sm font-bold">Maintenance certification current</p>
                      <p className="text-xs text-slate-500">All aircraft have valid maintenance logs and inspections</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.icaoMember} onChange={(e) => setForm({ ...form, icaoMember: e.target.checked })} className="h-4 w-4 rounded mt-0.5" />
                    <div>
                      <p className="text-sm font-bold">ICAO / IATA member</p>
                      <p className="text-xs text-slate-500">Registered with international aviation bodies</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                <i className="ph ph-info mr-2" />
                Your listing will remain hidden until our aviation compliance team verifies your AOC and insurance documents. Verification typically takes 1–2 business days.
              </div>
            </div>
          )}

          {/* ── STEP 2: FLEET OVERVIEW ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black">Fleet overview</h2>
                <p className="text-slate-500 text-sm mt-1">You'll be able to add full aircraft details in your operator dashboard after registration.</p>
              </div>
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Additional notes for our team</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Tell us about your fleet, typical routes, or any specific requirements…"
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: "ph-airplane", title: "Add aircraft", desc: "Detailed specs, images, amenities" },
                  { icon: "ph-clipboard-text", title: "Receive charters", desc: "Quote custom requests" },
                  { icon: "ph-chart-line-up", title: "Track revenue", desc: "Full analytics dashboard" },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-100 bg-white p-4 dark:bg-slate-900 dark:border-slate-800">
                    <i className={`ph ${item.icon} text-xl text-emerald-700`} />
                    <p className="mt-2 font-black text-sm">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: REVIEW ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black">Review &amp; submit</h2>
                <p className="text-slate-500 text-sm mt-1">Review your details before submitting for verification.</p>
              </div>
              <div className="rounded-3xl bg-white border border-slate-100 p-5 space-y-4 dark:bg-slate-900 dark:border-slate-800">
                {[
                  ["Company", form.companyName],
                  ["Contact", `${form.contactName} · ${form.email}`],
                  ["Base airport", form.baseAirport],
                  ["Fleet size", form.fleetSize || "Not specified"],
                  ["Services", form.primaryServices.join(", ") || "Not specified"],
                  ["AOC", form.aoc],
                  ["Insurance", form.insurance],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-4">
                    <p className="w-28 shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="text-sm font-semibold">{value || "—"}</p>
                  </div>
                ))}
              </div>
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
              {!user && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  <i className="ph ph-warning mr-2" />
                  You must be signed in to submit. You'll be redirected to sign in first.
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex justify-between gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-bold dark:border-slate-700">
                ← Back
              </button>
            ) : <span />}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => setStep((s) => s + 1)}
                className="rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-md shadow-emerald-700/20"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-md shadow-emerald-700/20"
              >
                {loading ? <><i className="ph ph-spinner animate-spin" /> Submitting…</> : <><i className="ph ph-paper-plane-tilt" /> Submit for verification</>}
              </button>
            )}
          </div>
        </form>
      </div>
    </AviationLayout>
  );
}
