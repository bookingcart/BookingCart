import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AviationOnboardingPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: "", contactName: user?.name || "", phone: "", baseAirport: "EBB", aoc: "", insurance: "", regulatoryStatus: "pending" });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!user) {
      navigate("/auth?redirect=/aviation/operators/join");
      return;
    }
    try {
      await aviationRequest("operator-save", { method: "POST", token: getToken(), body: form });
      navigate("/aviation/dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AviationLayout>
      <form onSubmit={submit} className="mx-auto max-w-xl px-4 py-14">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Operator verification</p>
        <h1 className="mt-2 text-4xl font-black">List your fleet.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Air operator certificate and insurance are required before aircraft can be approved. Listings stay hidden until an administrator reviews the file.</p>
        <div className="mt-6 space-y-3">
          {[
            ["companyName", "Operator name"],
            ["contactName", "Contact name"],
            ["phone", "Phone"],
            ["baseAirport", "Base airport code"],
            ["aoc", "Air Operator Certificate"],
            ["insurance", "Insurance coverage"],
          ].map(([key, label]) => (
            <label key={key} className="block text-xs font-bold uppercase text-slate-500">
              {label}
              <input required={key !== "phone"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold normal-case dark:bg-slate-900" />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
        <button className="mt-6 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Submit for verification</button>
      </form>
    </AviationLayout>
  );
}
