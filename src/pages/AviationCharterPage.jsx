import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";

const emptyLeg = () => ({ from: "", to: "", date: "", time: "09:00" });

export default function AviationCharterPage() {
  const [params] = useSearchParams();
  const [legs, setLegs] = useState([{ from: params.get("origin") || "EBB", to: params.get("destination") || "MFU", date: params.get("departDate") || "", time: "08:00" }]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    passengers: params.get("passengers") || 4,
    aircraftCategory: params.get("category") || "safari",
    preferredAircraftId: params.get("preferredAircraftId") || "",
    catering: "",
    groundTransport: true,
    vipServices: false,
    notes: "",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function updateLeg(index, key, value) {
    setLegs((current) => current.map((leg, i) => i === index ? { ...leg, [key]: value } : leg));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await aviationRequest("charter-create", { method: "POST", body: { ...form, legs } });
      setResult(data.charter);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AviationLayout>
      <form onSubmit={submit} className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Custom charter</p>
        <h1 className="mt-2 text-4xl font-black">Tell operators the itinerary.</h1>
        <p className="mt-3 text-slate-500">Add multiple destinations, catering, ground transport, and VIP handling. Verified operators can quote an alternative aircraft.</p>
        <div className="mt-8 space-y-4">
          {legs.map((leg, index) => (
            <div key={index} className="grid gap-3 rounded-3xl bg-white p-4 sm:grid-cols-4 dark:bg-slate-900">
              <input required placeholder="From" value={leg.from} onChange={(event) => updateLeg(index, "from", event.target.value)} className="rounded-xl border px-3 py-2" />
              <input required placeholder="To" value={leg.to} onChange={(event) => updateLeg(index, "to", event.target.value)} className="rounded-xl border px-3 py-2" />
              <input required type="date" value={leg.date} onChange={(event) => updateLeg(index, "date", event.target.value)} className="rounded-xl border px-3 py-2" />
              <input type="time" value={leg.time} onChange={(event) => updateLeg(index, "time", event.target.value)} className="rounded-xl border px-3 py-2" />
            </div>
          ))}
          <button type="button" onClick={() => setLegs((current) => [...current, emptyLeg()])} className="text-sm font-bold text-emerald-800">Add destination</button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {["name", "email", "phone", "passengers", "aircraftCategory", "preferredAircraftId"].map((field) => (
            <input key={field} required={["name", "email"].includes(field)} placeholder={field} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} className="rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900" />
          ))}
        </div>
        <textarea placeholder="Special catering" value={form.catering} onChange={(event) => setForm({ ...form, catering: event.target.value })} className="mt-3 w-full rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900" />
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.groundTransport} onChange={(event) => setForm({ ...form, groundTransport: event.target.checked })} /> Ground transportation</label>
        <label className="mt-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.vipServices} onChange={(event) => setForm({ ...form, vipServices: event.target.checked })} /> VIP services</label>
        <textarea placeholder="Notes for the operator" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-3 w-full rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900" />
        {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
        {result && <p className="mt-3 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Request {result.ref} sent. Operators can quote this itinerary from their dashboard.</p>}
        <button className="mt-6 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Submit charter request</button>
      </form>
    </AviationLayout>
  );
}
