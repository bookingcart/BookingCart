import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, money } from "../lib/aviationClient.js";

const ITEM_TYPES = [
  { id: "private_jet", label: "Private Jet", icon: "ph-airplane-takeoff", color: "text-emerald-600" },
  { id: "helicopter", label: "Helicopter", icon: "ph-fan", color: "text-sky-600" },
  { id: "lodge", label: "Luxury Lodge", icon: "ph-house-simple", color: "text-amber-600" },
  { id: "park_entry", label: "Park Entry Tickets", icon: "ph-paw-print", color: "text-green-600" },
  { id: "ground_transfer", label: "Ground Transfer", icon: "ph-van", color: "text-orange-600" },
  { id: "activity", label: "Activity / Tour", icon: "ph-compass", color: "text-purple-600" },
  { id: "boat", label: "Boat / River Transfer", icon: "ph-boat", color: "text-blue-600" },
  { id: "catering", label: "Special Catering", icon: "ph-fork-knife", color: "text-pink-600" },
  { id: "hotel", label: "Hotel", icon: "ph-buildings", color: "text-indigo-600" },
];

const PRESET_PACKAGES = [
  {
    id: "murchison",
    label: "Murchison Falls Safari",
    desc: "Jet · Helicopter tour · Luxury lodge · Park entry · Safari van",
    icon: "ph-paw-print",
  },
  {
    id: "bwindi",
    label: "Bwindi Gorilla Trek",
    desc: "Charter flight · Lodge · Gorilla permit · Forest guide",
    icon: "ph-mountains",
  },
  {
    id: "zanzibar",
    label: "Zanzibar Island Escape",
    desc: "Private jet · Island transfer · Beach resort · Dhow cruise",
    icon: "ph-island",
  },
];

export default function AviationItineraryPage() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("Murchison Falls air safari");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ type: "private_jet", title: "", details: "", price: 0, date: "" });

  useEffect(() => {
    document.title = "Luxury travel itinerary | BookingCart";
    aviationRequest("preset", { query: { preset: "murchison" } })
      .then((data) => { setItems(data.preset.items); setTitle(data.preset.title); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadPreset(preset) {
    setLoading(true);
    setError("");
    try {
      const data = await aviationRequest("preset", { query: { preset } });
      setItems(data.preset.items);
      setTitle(data.preset.title);
      setSaved(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: key === "price" ? Number(value) : value } : item));
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function addItem() {
    if (!newItem.title) return;
    setItems((current) => [...current, { ...newItem }]);
    setNewItem({ type: "private_jet", title: "", details: "", price: 0, date: "" });
    setAdding(false);
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

  function getItemMeta(type) {
    return ITEM_TYPES.find((t) => t.id === type) || { icon: "ph-star", color: "text-slate-500", label: type };
  }

  return (
    <AviationLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">One checkout · Multiple services</p>
          <div className="mt-2 flex items-center gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 text-3xl font-black bg-transparent border-none outline-none focus:ring-0 tracking-tight"
              placeholder="Name your itinerary"
            />
          </div>
          <p className="mt-2 text-slate-500 text-sm">Combine a private jet, helicopter, lodge, park entry, and safari van into one unified booking. Adjust any line before checkout.</p>
        </div>

        {/* Preset packages */}
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400 mb-3">Start with a preset package</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PRESET_PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => loadPreset(pkg.id)}
                className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900"
              >
                <i className={`ph ${pkg.icon} text-xl text-emerald-700`} />
                <p className="mt-2 font-black text-sm">{pkg.label}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{pkg.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Itinerary items */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => {
              const meta = getItemMeta(item.type);
              return (
                <div key={`${item.type}-${index}`} className="group grid gap-4 rounded-3xl bg-white border border-slate-100 p-4 sm:grid-cols-[auto_1fr_auto_auto] items-center dark:bg-slate-900 dark:border-slate-800 transition-all hover:shadow-md">
                  {/* Type icon */}
                  <div className={`h-10 w-10 shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center`}>
                    <i className={`ph ${meta.icon} text-lg ${meta.color}`} />
                  </div>

                  {/* Content */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">{meta.label || item.type.replaceAll("_", " ")}</span>
                      {item.date && <span className="text-[10px] text-slate-400">· {item.date}</span>}
                    </div>
                    <input
                      value={item.title}
                      onChange={(e) => updateItem(index, "title", e.target.value)}
                      className="w-full bg-transparent font-black text-sm outline-none focus:ring-0"
                      placeholder="Service name"
                    />
                    <input
                      value={item.details || ""}
                      onChange={(e) => updateItem(index, "details", e.target.value)}
                      className="w-full bg-transparent text-xs text-slate-500 outline-none focus:ring-0 mt-0.5"
                      placeholder="Details or notes"
                    />
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => updateItem(index, "price", e.target.value)}
                      className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm font-black dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>

                  {/* Remove */}
                  <button onClick={() => removeItem(index)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all">
                    <i className="ph ph-x-circle text-xl" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add item */}
        {adding ? (
          <div className="mt-4 rounded-3xl bg-white border border-dashed border-emerald-300 p-5 dark:bg-slate-900 dark:border-emerald-800">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400 mb-3">Add service</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Service type</label>
                <select value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
                  {ITEM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Name / Description</label>
                <input placeholder="e.g. Luxury River Lodge" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Date (optional)</label>
                <input type="date" value={newItem.date} onChange={(e) => setNewItem({ ...newItem, date: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Price (USD)</label>
                <input type="number" placeholder="0" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={addItem} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800">Add to itinerary</button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
          >
            <i className="ph ph-plus text-base" />
            Add service to itinerary
          </button>
        )}

        {/* Totals and checkout */}
        <div className="mt-8 rounded-3xl bg-slate-950 text-white p-6">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{items.length} services · Total package</p>
              <p className="mt-1 text-4xl font-black">{money(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">All services billed together</p>
              <p className="text-xs text-emerald-400 mt-1">Instant confirmation</p>
            </div>
          </div>

          <input
            type="email"
            required
            placeholder="Email for this itinerary"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold mb-4 placeholder-slate-500 focus:border-emerald-500 outline-none transition-colors"
          />

          {error && <p className="mb-4 text-sm font-semibold text-rose-400">{error}</p>}
          {saved && (
            <div className="mb-4 rounded-2xl bg-emerald-900/40 border border-emerald-700/50 p-3 text-sm">
              <p className="font-black text-emerald-300">{saved.ref}</p>
              <p className="text-emerald-400 text-xs mt-0.5">{saved.status?.replaceAll("_", " ")}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => save(false)}
              className="flex-1 rounded-2xl border border-slate-600 py-3 text-sm font-black hover:bg-slate-800 transition-colors"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={!email}
              className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-black hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-600/20"
            >
              Checkout itinerary
            </button>
          </div>
        </div>

        {/* Service descriptions */}
        <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400 mb-4">Included service types</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ITEM_TYPES.map((type) => (
              <div key={type.id} className="flex items-center gap-2.5">
                <i className={`ph ${type.icon} text-lg ${type.color}`} />
                <p className="text-sm font-semibold">{type.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AviationLayout>
  );
}
