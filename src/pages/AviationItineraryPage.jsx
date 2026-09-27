import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, money } from "../lib/aviationClient.js";

export default function AviationItineraryPage() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("Murchison Falls air safari");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Luxury itinerary | BookingCart";
    aviationRequest("preset", { query: { preset: "murchison" } })
      .then((data) => { setItems(data.preset.items); setTitle(data.preset.title); })
      .catch((err) => setError(err.message));
  }, []);

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: key === "price" ? Number(value) : value } : item));
  }

  async function save(checkout) {
    setError("");
    try {
      const data = await aviationRequest("itinerary-save", { method: "POST", body: { email, title, items, ref: saved?.ref } });
      let itinerary = data.itinerary;
      if (checkout) {
        const checked = await aviationRequest("itinerary-checkout", { method: "POST", body: { ref: itinerary.ref, email } });
        itinerary = checked.itinerary;
      }
      setSaved(itinerary);
    } catch (err) {
      setError(err.message);
    }
  }

  const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0);

  return (
    <AviationLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">One checkout</p>
        <h1 className="mt-2 text-4xl font-black">{title}</h1>
        <p className="mt-3 text-slate-500">Combine the jet, helicopter, lodge, park entry, and safari van. Adjust any line before checkout.</p>
        <div className="mt-8 space-y-3">
          {items.map((item, index) => (
            <div key={`${item.type}-${index}`} className="grid gap-3 rounded-3xl bg-white p-4 sm:grid-cols-[140px_1fr_120px] dark:bg-slate-900">
              <p className="text-xs font-bold uppercase text-slate-400">{item.type.replaceAll("_", " ")}</p>
              <div>
                <input value={item.title} onChange={(event) => updateItem(index, "title", event.target.value)} className="w-full bg-transparent font-bold" />
                <p className="text-sm text-slate-500">{item.details}</p>
              </div>
              <input type="number" value={item.price} onChange={(event) => updateItem(index, "price", event.target.value)} className="rounded-xl border px-3 py-2 text-right font-bold" />
            </div>
          ))}
        </div>
        <p className="mt-6 text-3xl font-black">{money(total)}</p>
        <input type="email" required placeholder="Email for this itinerary" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-4 w-full rounded-2xl border bg-white px-4 py-3 dark:bg-slate-900" />
        {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
        {saved && <p className="mt-3 text-sm font-semibold text-emerald-800">{saved.ref} · {saved.status.replaceAll("_", " ")}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={() => save(false)} className="rounded-2xl border px-4 py-3 text-sm font-black">Save draft</button>
          <button onClick={() => save(true)} className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Checkout itinerary</button>
        </div>
      </div>
    </AviationLayout>
  );
}
