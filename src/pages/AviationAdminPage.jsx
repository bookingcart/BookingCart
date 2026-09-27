import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AviationAdminPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("analytics");

  function load() {
    return aviationRequest("admin-overview", { method: "POST", token: getToken() })
      .then(setData)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    document.title = "Aviation admin | BookingCart";
    load();
  }, []);

  async function act(action, body) {
    await aviationRequest(action, { method: "POST", token: getToken(), body });
    await load();
  }

  return (
    <AviationLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-4xl font-black">Aviation administration</h1>
        <p className="mt-2 text-slate-500">Verify operators, approve aircraft, monitor charters, resolve disputes, and audit safety files.</p>
        {error && <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {["analytics", "operators", "aircraft", "charters", "disputes", "compliance"].map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3 py-1.5 text-sm font-bold capitalize ${tab === item ? "bg-slate-950 text-white" : "bg-white dark:bg-slate-900"}`}>{item}</button>
          ))}
        </div>
        {data && tab === "analytics" && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Revenue", money(data.analytics.totalCharterRevenue)],
              ["Flights", data.analytics.flightsBooked],
              ["Average value", money(data.analytics.averageBookingValue)],
              ["Satisfaction", data.analytics.customerSatisfaction],
            ].map(([label, value]) => <div key={label} className="rounded-3xl bg-white p-5 dark:bg-slate-900"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
            <div className="rounded-3xl bg-white p-5 sm:col-span-3 dark:bg-slate-900">
              {(data.analytics.popularRoutes || []).map((route) => <p key={route.route} className="text-sm font-semibold">{route.route} · {route.count}</p>)}
              {(data.analytics.aircraftUtilization || []).slice(0, 6).map((item) => <p key={item.id} className="text-sm text-slate-500">{item.name}: {item.utilization}% utilization</p>)}
            </div>
          </div>
        )}
        {data && tab === "operators" && <ReviewList rows={data.operators} onAct={(row, status) => act("admin-operator", { id: row.id, status })} />}
        {data && tab === "aircraft" && <ReviewList rows={data.aircraft} onAct={(row, status) => act("admin-aircraft", { id: row.id, status })} />}
        {data && tab === "charters" && (
          <div className="mt-6 space-y-3">{data.charters.map((item) => <p key={item.ref} className="rounded-2xl bg-white p-4 text-sm font-semibold dark:bg-slate-900">{item.ref} · {item.status} · {item.email}</p>)}</div>
        )}
        {data && tab === "disputes" && (
          <div className="mt-6 space-y-3">
            {data.disputes.map((item) => (
              <article key={item.id} className="rounded-2xl bg-white p-4 dark:bg-slate-900">
                <p className="font-bold">{item.bookingRef} · {item.status}</p>
                <p className="text-sm text-slate-500">{item.reason}</p>
                {item.status === "open" && <button onClick={() => act("admin-dispute", { id: item.id, resolution: "Reviewed with operator and passenger. Refund or re-accommodation issued." })} className="mt-2 text-sm font-bold text-emerald-800">Resolve</button>}
              </article>
            ))}
          </div>
        )}
        {data && tab === "compliance" && (
          <div className="mt-6 space-y-3">
            {data.compliance.map((item) => <p key={item.id} className="rounded-2xl bg-white p-4 text-sm dark:bg-slate-900"><strong>{item.name}</strong> · {item.status} · {item.gaps.length ? item.gaps.join(", ") : "File complete"}</p>)}
          </div>
        )}
      </div>
    </AviationLayout>
  );
}

function ReviewList({ rows, onAct }) {
  return (
    <div className="mt-6 space-y-3">
      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing waiting for review.</p>}
      {rows.map((row) => (
        <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div>
            <p className="font-black">{row.companyName || row.name}</p>
            <p className="text-sm text-slate-500">{row.status} · {row.email || row.registration}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onAct(row, row.companyName ? "verified" : "approved")} className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Approve</button>
            <button onClick={() => onAct(row, "rejected")} className="rounded-full border px-3 py-1.5 text-xs font-bold">Reject</button>
          </div>
        </article>
      ))}
    </div>
  );
}
