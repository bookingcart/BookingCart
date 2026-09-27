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
  amenities: ["wifi"], petFriendly: false, smokingAllowed: false, international: true, domestic: true,
  charterServices: ["on_demand"], helicopterServices: [], flightZones: ["EBB"],
  safety: { aoc: "", certification: "", insurance: "", maintenanceCurrent: false, pilotCertifications: "ATPL", regulatoryStatus: "compliant" },
  images: "",
};

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
    if (!user) {
      navigate("/auth?redirect=/aviation/dashboard");
      return;
    }
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [user]);

  async function saveAircraft(submit) {
    setNotice("");
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

  if (loading) {
    return <AviationLayout><p className="px-4 py-16 text-center">Loading operator portal…</p></AviationLayout>;
  }
  if (!portal?.operator) {
    return (
      <AviationLayout>
        <div className="mx-auto max-w-xl px-4 py-16">
          <h1 className="text-3xl font-black">Operator portal</h1>
          <p className="mt-3 text-slate-500">{error || "Loading your fleet…"}</p>
          <a href="/aviation/operators/join" className="mt-4 inline-block font-bold text-emerald-800">Register as an operator</a>
        </div>
      </AviationLayout>
    );
  }

  const analytics = portal.analytics || {};

  return (
    <AviationLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{portal.operator.status}</p>
            <h1 className="text-4xl font-black">{portal.operator.companyName}</h1>
          </div>
          <div className="flex gap-2">
            {TABS.map((item) => (
              <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3 py-1.5 text-sm font-bold capitalize ${tab === item ? "bg-slate-950 text-white" : "bg-white dark:bg-slate-900"}`}>{item}</button>
            ))}
          </div>
        </div>
        {notice && <p className="mt-4 text-sm font-semibold text-emerald-800">{notice}</p>}
        {error && <p className="mt-4 text-sm font-semibold text-rose-600">{error}</p>}

        {tab === "overview" && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Charter revenue", money(analytics.totalCharterRevenue)],
              ["Flights booked", analytics.flightsBooked || 0],
              ["Average booking", money(analytics.averageBookingValue)],
              ["Satisfaction", analytics.customerSatisfaction || "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl bg-white p-5 dark:bg-slate-900">
                <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
            ))}
            <div className="rounded-3xl bg-white p-5 sm:col-span-2 dark:bg-slate-900">
              <h2 className="font-black">Popular routes</h2>
              {(analytics.popularRoutes || []).length === 0 && <p className="mt-2 text-sm text-slate-500">No confirmed flights yet.</p>}
              {(analytics.popularRoutes || []).map((route) => <p key={route.route} className="mt-2 text-sm font-semibold">{route.route} · {route.count}</p>)}
            </div>
          </div>
        )}

        {tab === "fleet" && (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              {portal.fleet.length === 0 && <p className="text-sm text-slate-500">No aircraft yet.</p>}
              {portal.fleet.map((item) => (
                <button key={item.id} onClick={() => setDraft({ ...item, images: (item.images || []).join(", "), safety: { ...item.safety, pilotCertifications: (item.safety?.pilotCertifications || []).join(", ") } })} className="block w-full rounded-3xl bg-white p-4 text-left dark:bg-slate-900">
                  <p className="font-black">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.registration} · {item.status}</p>
                </button>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); saveAircraft(false).catch((err) => setError(err.message)); }} className="grid gap-3 rounded-3xl bg-white p-5 sm:grid-cols-2 dark:bg-slate-900">
              <label className="text-xs font-bold uppercase text-slate-500">category
                <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 normal-case">
                  {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              {["name", "manufacturer", "model", "year", "registration", "baseAirport", "passengers", "crew", "rangeNm", "cruiseSpeedKt", "maxAltitudeFt", "baggageCuFt", "hourlyRate"].map((key) => (
                <label key={key} className="text-xs font-bold uppercase text-slate-500">{key}
                  <input value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 normal-case" />
                </label>
              ))}
              <label className="text-xs font-bold uppercase text-slate-500 sm:col-span-2">Image URLs
                <input value={draft.images} onChange={(event) => setDraft({ ...draft, images: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 normal-case" />
              </label>
              {["aoc", "certification", "insurance", "regulatoryStatus"].map((key) => (
                <label key={key} className="text-xs font-bold uppercase text-slate-500">{key}
                  <input value={draft.safety[key] || ""} onChange={(event) => setDraft({ ...draft, safety: { ...draft.safety, [key]: event.target.value } })} className="mt-1 w-full rounded-xl border px-3 py-2 normal-case" />
                </label>
              ))}
              <label className="text-xs font-bold uppercase text-slate-500 sm:col-span-2">Pilot certifications
                <input value={draft.safety.pilotCertifications} onChange={(event) => setDraft({ ...draft, safety: { ...draft.safety, pilotCertifications: event.target.value } })} className="mt-1 w-full rounded-xl border px-3 py-2 normal-case" />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!draft.safety.maintenanceCurrent} onChange={(event) => setDraft({ ...draft, safety: { ...draft.safety, maintenanceCurrent: event.target.checked } })} /> Maintenance current</label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!draft.petFriendly} onChange={(event) => setDraft({ ...draft, petFriendly: event.target.checked })} /> Pet friendly</label>
              <div className="flex gap-2 sm:col-span-2">
                <button className="rounded-2xl border px-4 py-2 text-sm font-black">Save draft</button>
                <button type="button" onClick={() => saveAircraft(true).catch((err) => setError(err.message))} className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white">Submit for approval</button>
              </div>
            </form>
          </div>
        )}

        {tab === "charters" && (
          <div className="mt-8 space-y-4">
            {portal.charters.length === 0 && <p className="text-sm text-slate-500">No charter requests assigned yet. Quotes can be sent once your fleet is approved.</p>}
            {portal.charters.map((charter) => (
              <article key={charter.ref} className="rounded-3xl bg-white p-5 dark:bg-slate-900">
                <p className="font-black">{charter.ref} · {charter.status}</p>
                <p className="text-sm text-slate-500">{charter.legs.map((leg) => `${leg.from} → ${leg.to}`).join(" · ")} · {charter.passengers} guests</p>
                <p className="mt-2 text-sm">{charter.catering || "No catering note"} {charter.groundTransport ? "· Ground transport" : ""} {charter.vipServices ? "· VIP" : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input placeholder="Aircraft id" value={quote.charterRef === charter.ref ? quote.aircraftId : ""} onChange={(event) => setQuote({ ...quote, charterRef: charter.ref, aircraftId: event.target.value })} className="rounded-xl border px-3 py-2 text-sm" />
                  <input placeholder="Amount" value={quote.charterRef === charter.ref ? quote.amount : ""} onChange={(event) => setQuote({ ...quote, charterRef: charter.ref, amount: event.target.value })} className="rounded-xl border px-3 py-2 text-sm" />
                  <button onClick={() => aviationRequest("quotation", { method: "POST", token: getToken(), body: { ...quote, charterRef: charter.ref } }).then(load).then(() => setNotice("Quotation sent")).catch((err) => setError(err.message))} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Send quote</button>
                  <button onClick={() => aviationRequest("quotation", { method: "POST", token: getToken(), body: { charterRef: charter.ref, action: "reject" } }).then(load).catch((err) => setError(err.message))} className="rounded-xl border px-3 py-2 text-sm font-bold">Reject</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {tab === "operations" && (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="font-black">Upcoming flights</h2>
              {portal.bookings.filter((item) => item.status === "confirmed").map((booking) => (
                <article key={booking.ref} className="rounded-3xl bg-white p-4 dark:bg-slate-900">
                  <p className="font-black">{booking.ref}</p>
                  <p className="text-sm text-slate-500">{booking.origin.code} → {booking.destination.code} · {booking.departDate}</p>
                  <p className="text-sm">Crew: {(booking.crew || []).map((member) => member.name).join(", ") || "Unassigned"}</p>
                </article>
              ))}
              <form onSubmit={(event) => { event.preventDefault(); aviationRequest("crew", { method: "POST", token: getToken(), body: { bookingRef: crew.bookingRef, crew: [crew] } }).then((data) => { setNotice(`Report ${data.report.ref} ready`); return load(); }).catch((err) => setError(err.message)); }} className="grid gap-2 rounded-3xl bg-white p-4 dark:bg-slate-900">
                <h2 className="font-black">Assign crew</h2>
                {["bookingRef", "name", "role", "certification"].map((key) => <input key={key} placeholder={key} value={crew[key]} onChange={(event) => setCrew({ ...crew, [key]: event.target.value })} className="rounded-xl border px-3 py-2" />)}
                <button className="rounded-xl bg-slate-950 py-2 text-sm font-bold text-white">Save crew and report</button>
              </form>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); aviationRequest("aircraft-ops", { method: "POST", token: getToken(), body: { aircraftId: doc.aircraftId, document: doc, availability: [{ from: "2026-01-01", to: "2027-12-31", status: "available" }] } }).then(() => setNotice("Document stored")).catch((err) => setError(err.message)); }} className="h-fit space-y-3 rounded-3xl bg-white p-5 dark:bg-slate-900">
              <h2 className="font-black">Flight documents</h2>
              <input placeholder="Aircraft id" value={doc.aircraftId} onChange={(event) => setDoc({ ...doc, aircraftId: event.target.value })} className="w-full rounded-xl border px-3 py-2" />
              <input placeholder="Document name" value={doc.name} onChange={(event) => setDoc({ ...doc, name: event.target.value })} className="w-full rounded-xl border px-3 py-2" />
              <input placeholder="https:// document URL" value={doc.url} onChange={(event) => setDoc({ ...doc, url: event.target.value })} className="w-full rounded-xl border px-3 py-2" />
              <button className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Upload document record</button>
              <p className="text-xs text-slate-500">Availability, pricing rules, and flight zones are stored with the aircraft. Use the fleet form to change hourly rates.</p>
            </form>
          </div>
        )}
      </div>
    </AviationLayout>
  );
}
