import { useEffect, useState } from "react";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const TABS = ["analytics", "operators", "aircraft", "charters", "disputes", "compliance"];

export default function AviationAdminPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("analytics");
  const [searchQ, setSearchQ] = useState("");

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

  const analytics = data?.analytics || {};

  return (
    <AviationLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Administration</p>
            <h1 className="mt-1 text-4xl font-black">Aviation command centre</h1>
            <p className="mt-2 text-slate-500 text-sm max-w-xl">Verify operators, approve aircraft listings, monitor charter activity, resolve disputes, and audit safety compliance.</p>
          </div>
          <a href="/admin" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-700">
            <i className="ph ph-arrow-left text-sm" /> Main admin
          </a>
        </div>

        {error && <div className="mb-6 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-700 text-sm">{error}</div>}

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1.5 mb-8 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition-all ${tab === item ? "bg-white text-slate-950 shadow dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
            >
              {item}
              {item === "operators" && data && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">{data.operators.filter((o) => o.status === "pending").length}</span>}
              {item === "aircraft" && data && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">{data.aircraft.filter((a) => a.status === "pending").length}</span>}
              {item === "disputes" && data && data.disputes.filter((d) => d.status === "open").length > 0 && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-700">{data.disputes.filter((d) => d.status === "open").length}</span>}
            </button>
          ))}
        </div>

        {/* ── ANALYTICS ── */}
        {data && tab === "analytics" && (
          <div className="space-y-6">
            {/* KPI grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total charter revenue", value: money(analytics.totalCharterRevenue), icon: "ph-money", trend: "+14%", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
                { label: "Flights booked", value: analytics.flightsBooked || 0, icon: "ph-airplane-tilt", trend: "+8%", color: "text-sky-600 bg-sky-50 dark:bg-sky-950/40" },
                { label: "Average booking value", value: money(analytics.averageBookingValue), icon: "ph-chart-line-up", trend: "+5%", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
                { label: "Customer satisfaction", value: analytics.customerSatisfaction || "—", icon: "ph-star", trend: "4.8/5", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40" },
              ].map(({ label, value, icon, trend, color }) => (
                <div key={label} className="rounded-3xl bg-white p-5 border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-3`}>
                    <i className={`ph ${icon} text-lg`} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-3xl font-black">{value}</p>
                  <p className="text-xs text-emerald-600 font-semibold mt-1">{trend}</p>
                </div>
              ))}
            </div>

            {/* Routes & utilization */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h2 className="font-black mb-4">Most popular routes</h2>
                {(analytics.popularRoutes || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No routes tracked yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(analytics.popularRoutes || []).map((route, i) => (
                      <div key={route.route} className="flex items-center gap-3">
                        <span className="h-6 w-6 shrink-0 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black dark:bg-emerald-900/40 dark:text-emerald-300">{i + 1}</span>
                        <p className="flex-1 text-sm font-semibold">{route.route}</p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold dark:bg-slate-800">{route.count} flights</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <h2 className="font-black mb-4">Aircraft utilization</h2>
                {(analytics.aircraftUtilization || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No utilization data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(analytics.aircraftUtilization || []).slice(0, 6).map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between mb-1 text-xs">
                          <span className="font-semibold">{item.name}</span>
                          <span className="font-black text-emerald-700">{item.utilization}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(item.utilization, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── OPERATORS ── */}
        {data && tab === "operators" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-black">Operator verification</h2>
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search operators…" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
            </div>
            <ReviewList
              rows={data.operators.filter((o) => !searchQ || (o.companyName || o.name || "").toLowerCase().includes(searchQ.toLowerCase()))}
              onAct={(row, status) => act("admin-operator", { id: row.id, status })}
              approveLabel="Verify operator"
              approveStatus="verified"
              fields={[
                (row) => `AOC: ${row.aoc || "Not provided"}`,
                (row) => `Insurance: ${row.insurance || "Not provided"}`,
                (row) => `Base: ${row.baseAirport || "—"}`,
              ]}
            />
          </div>
        )}

        {/* ── AIRCRAFT ── */}
        {data && tab === "aircraft" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-black">Aircraft approval queue</h2>
              <div className="flex gap-2">
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option>All status</option>
                  <option>pending</option>
                  <option>approved</option>
                  <option>rejected</option>
                </select>
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search aircraft…" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
            </div>
            <ReviewList
              rows={data.aircraft.filter((a) => !searchQ || (a.name || "").toLowerCase().includes(searchQ.toLowerCase()))}
              onAct={(row, status) => act("admin-aircraft", { id: row.id, status })}
              approveLabel="Approve listing"
              approveStatus="approved"
              fields={[
                (row) => `Registration: ${row.registration || "—"}`,
                (row) => `AOC: ${row.safety?.aoc || "Not provided"}`,
                (row) => `Maintenance: ${row.safety?.maintenanceCurrent ? "Current ✓" : "Pending"}`,
              ]}
            />
          </div>
        )}

        {/* ── CHARTERS ── */}
        {data && tab === "charters" && (
          <div className="space-y-4">
            <h2 className="text-xl font-black">Charter activity</h2>
            {data.charters.map((item) => (
              <div key={item.ref} className="rounded-3xl bg-white border border-slate-100 p-4 dark:bg-slate-900 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-black">{item.ref}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{item.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DISPUTES ── */}
        {data && tab === "disputes" && (
          <div className="space-y-4">
            <h2 className="text-xl font-black">Dispute resolution</h2>
            {data.disputes.length === 0 && <p className="text-sm text-slate-500">No disputes on record.</p>}
            {data.disputes.map((item) => (
              <article key={item.id} className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.status === "open" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                        {item.status}
                      </span>
                      <span className="text-xs font-bold text-slate-400">{item.bookingRef}</span>
                    </div>
                    <p className="font-black">{item.reason}</p>
                    {item.resolution && <p className="mt-2 text-sm text-slate-500">{item.resolution}</p>}
                  </div>
                  {item.status === "open" && (
                    <button
                      onClick={() => act("admin-dispute", { id: item.id, resolution: "Reviewed with operator and passenger. Refund or re-accommodation issued." })}
                      className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      Resolve dispute
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* ── COMPLIANCE ── */}
        {data && tab === "compliance" && (
          <div className="space-y-4">
            <h2 className="text-xl font-black">Safety compliance audit</h2>
            {data.compliance.map((item) => (
              <div key={item.id} className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.gaps?.length === 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <p className="font-black">{item.name}</p>
                    </div>
                    <p className="text-sm text-slate-500">{item.status} · {item.registration}</p>
                  </div>
                  <div className="text-right">
                    {item.gaps?.length > 0 ? (
                      <div>
                        <p className="text-xs font-bold text-amber-600 mb-1">Compliance gaps:</p>
                        {item.gaps.map((gap) => (
                          <span key={gap} className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 mr-1 mb-1">{gap}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <i className="ph ph-shield-check" /> File complete
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AviationLayout>
  );
}

function ReviewList({ rows, onAct, approveLabel, approveStatus, fields = [] }) {
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-slate-500">Nothing waiting for review.</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-3xl bg-white border border-slate-100 p-5 dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-black">{row.companyName || row.name}</p>
              <p className="text-sm text-slate-500 mt-0.5">{row.email || row.registration}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                {fields.map((fn, i) => (
                  <p key={i} className="text-xs text-slate-500">{fn(row)}</p>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "pending" ? "bg-amber-100 text-amber-800" : row.status === "approved" || row.status === "verified" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
                {row.status}
              </span>
              {row.status !== "approved" && row.status !== "verified" && (
                <button onClick={() => onAct(row, approveStatus)} className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors">
                  {approveLabel}
                </button>
              )}
              {row.status !== "rejected" && (
                <button onClick={() => onAct(row, "rejected")} className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors dark:border-rose-800 dark:text-rose-400">
                  Reject
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
