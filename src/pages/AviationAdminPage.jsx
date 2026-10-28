import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AviationLayout from "../components/aviation/AviationLayout.jsx";
import { aviationRequest, categoryLabel, durationLabel, money } from "../lib/aviationClient.js";
import { useAuth } from "../context/AuthContext.jsx";

const TABS = [
  { id: "analytics", label: "Overview", icon: "ph-chart-line-up" },
  { id: "operators", label: "Operators", icon: "ph-buildings" },
  { id: "aircraft", label: "Aircraft", icon: "ph-airplane-tilt" },
  { id: "charters", label: "Charters", icon: "ph-paper-plane-tilt" },
  { id: "disputes", label: "Disputes", icon: "ph-scales" },
  { id: "compliance", label: "Compliance", icon: "ph-shield-check" },
];

const STATUS_TONES = {
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  requested: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  quoted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
  open: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  suspended: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  draft: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const OPERATOR_FILTERS = ["all", "pending", "verified", "rejected"];
const AIRCRAFT_FILTERS = ["all", "pending", "approved", "rejected", "suspended"];

function statusLabel(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${STATUS_TONES[status] || STATUS_TONES.draft}`}>
      {statusLabel(status)}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeTime(value) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return "never";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function AviationAdminPage() {
  const { getToken, isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [tab, setTab] = useState("analytics");
  const [operatorQuery, setOperatorQuery] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [aircraftQuery, setAircraftQuery] = useState("");
  const [aircraftFilter, setAircraftFilter] = useState("all");
  const [resolutionDrafts, setResolutionDrafts] = useState({});

  async function load() {
    setLoading(true);
    try {
      const payload = await aviationRequest("admin-overview", { method: "POST", token: getToken() });
      setData(payload);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Aviation admin | BookingCart";
    load();
  }, []);

  async function act(action, body, key) {
    setBusyKey(key);
    setActionError("");
    try {
      await aviationRequest(action, { method: "POST", token: getToken(), body });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyKey("");
    }
  }

  const analytics = data?.analytics || {};
  const operators = data?.operators || [];
  const aircraft = data?.aircraft || [];
  const charters = data?.charters || [];
  const bookings = data?.bookings || [];
  const disputes = data?.disputes || [];
  const compliance = data?.compliance || [];

  const counts = useMemo(() => ({
    analytics: 0,
    operators: operators.filter((item) => item.status === "pending").length,
    aircraft: aircraft.filter((item) => item.status === "pending").length,
    charters: charters.filter((item) => item.status === "requested" || item.status === "quoted").length,
    disputes: disputes.filter((item) => item.status === "open").length,
    compliance: compliance.filter((item) => (item.gaps || []).length > 0).length,
  }), [operators, aircraft, charters, disputes, compliance]);

  const reviewQueue = counts.operators + counts.aircraft + counts.disputes + counts.compliance;

  const visibleOperators = operators.filter((item) => {
    if (operatorFilter !== "all" && item.status !== operatorFilter) return false;
    if (!operatorQuery) return true;
    const needle = operatorQuery.toLowerCase();
    return [item.companyName, item.email, item.baseAirport, item.contactName].some((field) => String(field || "").toLowerCase().includes(needle));
  });

  const visibleAircraft = aircraft.filter((item) => {
    if (aircraftFilter !== "all" && item.status !== aircraftFilter) return false;
    if (!aircraftQuery) return true;
    const needle = aircraftQuery.toLowerCase();
    return [item.name, item.registration, item.operatorName, item.manufacturer, item.model].some((field) => String(field || "").toLowerCase().includes(needle));
  });

  const recentBookings = [...bookings]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5);

  if (!isAuthenticated && !data) {
    return (
      <AviationLayout>
        <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <i className="ph ph-shield-lock text-2xl text-slate-500" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-black">Administrator sign-in required</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This console is restricted to BookingCart administrators.</p>
          <Link to="/auth?redirect=%2Fadmin%2Faviation" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800">
            Sign in
            <i className="ph ph-arrow-right text-sm" aria-hidden="true" />
          </Link>
        </div>
      </AviationLayout>
    );
  }

  return (
    <AviationLayout>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        {/* ── HEADER ── */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
          <i className="ph ph-shield-check pointer-events-none absolute -right-16 -top-16 text-[220px] leading-none text-white/[0.03]" aria-hidden="true" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-400">Aviation administration</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Operations centre</h1>
              <p className="mt-2 text-sm text-slate-300">
                Verify operators, approve aircraft, monitor charter demand and keep every safety file current.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:items-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  <i className={`ph ph-arrows-clockwise text-sm ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                  {loading ? "Syncing" : "Refresh"}
                </button>
                <Link to="/admin" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20">
                  <i className="ph ph-arrow-left text-sm" aria-hidden="true" />
                  Main admin
                </Link>
              </div>
              <p className="text-[11px] text-slate-400">
                <i className="ph ph-clock-counter-clockwise mr-1 inline" aria-hidden="true" />
                Synced {relativeTime(data?.generatedAt)}
              </p>
            </div>
          </div>

          <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Operators to verify", value: counts.operators, tab: "operators", icon: "ph-buildings" },
              { label: "Aircraft to approve", value: counts.aircraft, tab: "aircraft", icon: "ph-airplane-tilt" },
              { label: "Open disputes", value: counts.disputes, tab: "disputes", icon: "ph-scales" },
              { label: "Compliance gaps", value: counts.compliance, tab: "compliance", icon: "ph-shield-warning" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setTab(item.tab)}
                className="rounded-2xl bg-white/[0.04] p-3.5 text-left ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08]"
              >
                <div className="flex items-center justify-between">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</dt>
                  <i className={`ph ${item.icon} text-sm ${item.value ? "text-amber-300" : "text-emerald-400/80"}`} aria-hidden="true" />
                </div>
                <dd className={`mt-1 text-2xl font-black tabular-nums ${item.value ? "text-white" : "text-slate-200"}`}>{item.value}</dd>
              </button>
            ))}
          </dl>
        </section>

        {/* ── TABS ── */}
        <nav aria-label="Admin sections" className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  active ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <i className={`ph ${item.icon} text-base`} aria-hidden="true" />
                {item.label}
                {counts[item.id] > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${item.id === "disputes" || item.id === "compliance" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"}`}>
                    {counts[item.id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {actionError && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            <i className="ph ph-warning-circle mt-0.5 text-base" aria-hidden="true" />
            {actionError}
          </div>
        )}

        {error && !loading && (
          <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
            <i className="ph ph-shield-warning text-2xl text-rose-500" aria-hidden="true" />
            <p className="mt-2 font-black text-rose-700 dark:text-rose-300">
              {/admin|authoriz|authenticat|permission/i.test(error) ? "Admin access required" : "Could not load the aviation console"}
            </p>
            <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={load} className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white hover:bg-rose-800">Try again</button>
              {/admin|authoriz|authenticat|permission/i.test(error) && (
                <Link to="/auth?redirect=%2Fadmin%2Faviation" className="rounded-xl border border-rose-300 px-4 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300">Switch account</Link>
              )}
            </div>
          </div>
        )}

        {loading && !data && <LoadingSkeleton />}

        {/* ── OVERVIEW ── */}
        {data && tab === "analytics" && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Charter revenue", value: money(analytics.totalCharterRevenue || 0), hint: `${analytics.flightsBooked || 0} confirmed flights`, icon: "ph-money", tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300" },
                { label: "Average booking", value: money(analytics.averageBookingValue || 0), hint: "per confirmed charter", icon: "ph-chart-line-up", tone: "text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300" },
                { label: "Needs review", value: reviewQueue, hint: reviewQueue ? "operators, aircraft, disputes" : "Queue is clear", icon: "ph-list-checks", tone: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
                {
                  label: "Customer satisfaction",
                  value: analytics.reviewCount ? `${analytics.customerSatisfaction}/5` : "—",
                  hint: analytics.reviewCount ? `${analytics.reviewCount} passenger reviews` : "No reviews yet",
                  icon: "ph-star",
                  tone: "text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300",
                },
              ].map((card) => (
                <article key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>
                    <i className={`ph ${card.icon} text-lg`} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className={`mt-1 text-2xl font-black tabular-nums ${card.value === "—" ? "text-slate-300 dark:text-slate-600" : ""}`}>{card.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{card.hint}</p>
                </article>
              ))}
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-2">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black">Most requested routes</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Confirmed flights</span>
                </div>
                {(analytics.popularRoutes || []).length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No confirmed flights yet. Routes appear here once a charter is paid.</p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {(analytics.popularRoutes || []).map((route, index) => {
                      const max = Math.max(...analytics.popularRoutes.map((item) => item.count), 1);
                      return (
                        <li key={route.route} className="flex items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-bold">{route.route}</p>
                              <span className="text-xs font-black tabular-nums text-slate-500 dark:text-slate-400">{route.count}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((route.count / max) * 100)}%` }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black">Fleet utilisation</h2>
                  <button type="button" onClick={() => setTab("aircraft")} className="text-[11px] font-bold text-emerald-700 hover:underline dark:text-emerald-400">Manage fleet</button>
                </div>
                {(analytics.aircraftUtilization || []).length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No aircraft listed yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {(analytics.aircraftUtilization || []).slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-semibold">{item.name}</span>
                          <span className="shrink-0 font-black tabular-nums text-slate-500 dark:text-slate-400">{item.utilization}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={item.utilization} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.name} utilisation`}>
                          <div className="h-full rounded-full bg-slate-900 transition-all dark:bg-white" style={{ width: `${Math.min(item.utilization, 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h2 className="text-sm font-black">Latest bookings</h2>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{bookings.length} total</span>
              </div>
              {recentBookings.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No bookings yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentBookings.map((booking) => (
                    <li key={booking.ref} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-black tabular-nums">{booking.ref}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {booking.origin?.code} → {booking.destination?.code} · {booking.aircraftName} · {booking.passengers} pax
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black tabular-nums">{money(booking.quote?.price || 0, booking.quote?.currency || "USD")}</span>
                        <StatusPill status={booking.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ── OPERATORS ── */}
        {data && tab === "operators" && (
          <div className="mt-6 space-y-4">
            <Toolbar
              title="Operator verification"
              count={visibleOperators.length}
              query={operatorQuery}
              onQuery={setOperatorQuery}
              placeholder="Search company or email…"
              filters={OPERATOR_FILTERS}
              filter={operatorFilter}
              onFilter={setOperatorFilter}
            />
            {visibleOperators.length === 0 ? (
              <EmptyState icon="ph-buildings" title="No operators in this view" text="Try clearing the search or status filter." />
            ) : (
              <div className="space-y-3">
                {visibleOperators.map((row) => {
                  const busy = busyKey === `op-${row.id}`;
                  const openGaps = row.gaps || [];
                  return (
                    <article key={row.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black">{row.companyName || row.email}</h3>
                            <StatusPill status={row.status} />
                          </div>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {row.email} · base {row.baseAirport || "—"} {row.contactName ? `· ${row.contactName}` : ""}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[
                              ["AOC", row.aoc || row.compliance?.aoc],
                              ["Insurance", row.insurance || row.compliance?.insurance],
                              ["Regulatory", row.regulatoryStatus || row.compliance?.regulatoryStatus],
                            ].map(([label, value]) => {
                              const state = !value ? "missing" : /^(pending|in_review|submitted|expired)$/i.test(String(value)) ? "pending" : "met";
                              const tones = {
                                met: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                                pending: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                                missing: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                              };
                              const icons = { met: "ph-check", pending: "ph-clock", missing: "ph-x" };
                              return (
                                <span key={label} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${tones[state]}`}>
                                  <i className={`ph ${icons[state]} text-xs`} aria-hidden="true" />
                                  {label}
                                  {state !== "met" && <span className="font-black">{state === "pending" ? "· pending" : "· missing"}</span>}
                                </span>
                              );
                            })}
                          </div>
                          {row.status === "verified" && openGaps.length > 0 && (
                            <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                              Verified earlier — the safety file is still open. Ask the operator to resubmit {openGaps.join(", ").toLowerCase()}.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {row.status !== "verified" && (
                            <ActionButton tone="primary" busy={busy} onClick={() => act("admin-operator", { id: row.id, status: "verified" }, `op-${row.id}`)}>
                              <i className="ph ph-seal-check text-sm" aria-hidden="true" />
                              Verify
                            </ActionButton>
                          )}
                          {row.status !== "rejected" && (
                            <ActionButton tone="danger" busy={busy} onClick={() => act("admin-operator", { id: row.id, status: "rejected", note: "Documents did not meet the operator standard." }, `op-${row.id}`)}>
                              Reject
                            </ActionButton>
                          )}
                          <span className="text-[11px] text-slate-400">Updated {relativeTime(row.updatedAt)}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── AIRCRAFT ── */}
        {data && tab === "aircraft" && (
          <div className="mt-6 space-y-4">
            <Toolbar
              title="Aircraft approval queue"
              count={visibleAircraft.length}
              query={aircraftQuery}
              onQuery={setAircraftQuery}
              placeholder="Search aircraft or registration"
              filters={AIRCRAFT_FILTERS}
              filter={aircraftFilter}
              onFilter={setAircraftFilter}
            />
            {visibleAircraft.length === 0 ? (
              <EmptyState icon="ph-airplane-tilt" title="No aircraft in this view" text="Try clearing the search or status filter." />
            ) : (
              <div className="space-y-3">
                {visibleAircraft.map((row) => {
                  const gaps = (compliance.find((item) => item.id === row.id)?.gaps) || [];
                  const busy = busyKey === `ac-${row.id}`;
                  const canApprove = gaps.length === 0;
                  return (
                    <article key={row.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black">{row.name}</h3>
                            <StatusPill status={row.status} />
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{categoryLabel(row.category)}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {row.manufacturer} {row.model} · {row.registration} · {row.operatorName}
                          </p>
                          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <dt className="text-slate-400">Rate</dt>
                              <dd className="font-black tabular-nums">{money(row.hourlyRate || 0)}/hr</dd>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <dt className="text-slate-400">Seats</dt>
                              <dd className="font-bold tabular-nums">{row.passengers}</dd>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <dt className="text-slate-400">Range</dt>
                              <dd className="font-bold tabular-nums">{Number(row.rangeNm || 0).toLocaleString()} nm</dd>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <dt className="text-slate-400">Base</dt>
                              <dd className="font-bold">{row.baseAirport}</dd>
                            </div>
                          </dl>
                          {gaps.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {gaps.map((gap) => (
                                <span key={gap} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <i className="ph ph-warning text-xs" aria-hidden="true" />
                                  {gap}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {row.status !== "approved" && (
                            <ActionButton tone="primary" busy={busy} disabled={!canApprove} title={canApprove ? undefined : "Complete the safety file before approving"} onClick={() => act("admin-aircraft", { id: row.id, status: "approved" }, `ac-${row.id}`)}>
                              <i className="ph ph-check-circle text-sm" aria-hidden="true" />
                              Approve
                            </ActionButton>
                          )}
                          {row.status === "approved" && (
                            <ActionButton tone="neutral" busy={busy} onClick={() => act("admin-aircraft", { id: row.id, status: "suspended", note: "Suspended from the admin console." }, `ac-${row.id}`)}>
                              <i className="ph ph-pause-circle text-sm" aria-hidden="true" />
                              Suspend
                            </ActionButton>
                          )}
                          {row.status !== "rejected" && (
                            <ActionButton tone="danger" busy={busy} onClick={() => act("admin-aircraft", { id: row.id, status: "rejected", note: "Listing did not meet the compliance standard." }, `ac-${row.id}`)}>
                              Reject
                            </ActionButton>
                          )}
                        </div>
                      </div>
                      {row.adminNote && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">Admin note: {row.adminNote}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CHARTERS ── */}
        {data && tab === "charters" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">Charter activity</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Open requests and the itineraries operators are quoting on.</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{charters.length} requests</span>
            </div>
            {charters.length === 0 ? (
              <EmptyState icon="ph-paper-plane-tilt" title="No charter requests yet" text="Requests submitted from the charter page appear here with their itinerary legs." />
            ) : (
              <div className="space-y-3">
                {[...charters].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map((item) => (
                  <article key={item.ref} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black tabular-nums">{item.ref}</h3>
                          <StatusPill status={item.status} />
                          <span className="text-[11px] font-bold text-slate-400">{relativeTime(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                          {item.name || item.email} · {item.email} · {item.passengers} pax
                          {item.aircraftCategory ? ` · ${categoryLabel(item.aircraftCategory)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.groundTransport && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Ground transport</span>}
                        {item.vipServices && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">VIP services</span>}
                        {item.catering && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Catering</span>}
                      </div>
                    </div>

                    {(item.legs || []).length > 0 && (
                      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(item.legs || []).map((leg, index) => (
                          <li key={`${leg.from}-${leg.to}-${index}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-950/60">
                            <span className="font-black">{leg.from}</span>
                            <i className="ph ph-arrow-right text-slate-400" aria-hidden="true" />
                            <span className="font-black">{leg.to}</span>
                            <span className="ml-auto shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                              {formatDateTime(leg.date)}{leg.time ? ` · ${leg.time}` : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{item.tripType === "round" ? "Round trip" : "One way"}</span>
                      <span>{(item.quotations || []).length} quotations</span>
                      {item.notes && <span className="truncate">Note: {item.notes}</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DISPUTES ── */}
        {data && tab === "disputes" && (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-black">Dispute resolution</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Document the outcome before closing a case so both sides have a record.</p>
            </div>
            {disputes.length === 0 ? (
              <EmptyState icon="ph-scales" title="No disputes on record" text="Passenger disputes raised from a booking will appear here." />
            ) : (
              <div className="space-y-3">
                {disputes.map((item) => {
                  const busy = busyKey === `ds-${item.id}`;
                  return (
                    <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={item.status} />
                            <span className="text-xs font-black tabular-nums text-slate-500 dark:text-slate-400">{item.bookingRef}</span>
                            <span className="text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm font-bold">{item.reason}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.email}</p>
                          {item.resolution && (
                            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                              Resolution: {item.resolution}
                            </p>
                          )}
                        </div>
                      </div>
                      {item.status === "open" && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <label htmlFor={`resolution-${item.id}`} className="sr-only">Resolution</label>
                          <input
                            id={`resolution-${item.id}`}
                            value={resolutionDrafts[item.id] || ""}
                            onChange={(event) => setResolutionDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                            placeholder="What was agreed with the passenger and operator?"
                            className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                          <ActionButton
                            tone="primary"
                            busy={busy}
                            disabled={!(resolutionDrafts[item.id] || "").trim()}
                            onClick={() => act("admin-dispute", { id: item.id, resolution: resolutionDrafts[item.id].trim() }, `ds-${item.id}`)}
                          >
                            <i className="ph ph-check text-sm" aria-hidden="true" />
                            Resolve
                          </ActionButton>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── COMPLIANCE ── */}
        {data && tab === "compliance" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">Safety compliance audit</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Aircraft cannot go live until every document in the safety file is present.</p>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{compliance.filter((item) => !(item.gaps || []).length).length} complete</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{counts.compliance} with gaps</span>
              </div>
            </div>
            {compliance.length === 0 ? (
              <EmptyState icon="ph-shield-check" title="No aircraft to audit" text="Compliance records appear once an operator submits an aircraft." />
            ) : (
              <div className="space-y-3">
                {compliance.map((item) => {
                  const gaps = item.gaps || [];
                  const busy = busyKey === `cp-${item.id}`;
                  return (
                    <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${gaps.length ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
                            <h3 className="text-sm font-black">{item.name}</h3>
                            <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">{item.registration}</span>
                            <StatusPill status={item.status} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {item.operatorName} {item.operatorEmail ? `· ${item.operatorEmail}` : ""}
                          </p>
                          {gaps.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {gaps.map((gap) => (
                                <span key={gap} className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{gap}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {gaps.length === 0 && item.status !== "approved" ? (
                            <ActionButton tone="primary" busy={busy} onClick={() => act("admin-aircraft", { id: item.id, status: "approved" }, `cp-${item.id}`)}>
                              <i className="ph ph-shield-check text-sm" aria-hidden="true" />
                              Approve
                            </ActionButton>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${gaps.length ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                              <i className={`ph ${gaps.length ? "ph-warning" : "ph-check-circle"} text-sm`} aria-hidden="true" />
                              {gaps.length ? `${gaps.length} gap${gaps.length > 1 ? "s" : ""}` : "File complete"}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AviationLayout>
  );
}

function Toolbar({ title, count, query, onQuery, placeholder, filters, filter, onFilter }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{count} {count === 1 ? "record" : "records"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilter(value)}
              className={`min-h-8 rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize transition-colors ${filter === value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="relative">
          <span className="sr-only">Search</span>
          <i className="ph ph-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={placeholder}
            className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:w-72"
          />
        </label>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, tone = "neutral", busy = false, disabled = false, title }) {
  const tones = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800",
    danger: "border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30",
    neutral: "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {busy && <i className="ph ph-circle-notch animate-spin text-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <i className={`ph ${icon} text-3xl text-slate-300 dark:text-slate-600`} aria-hidden="true" />
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="h-32 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
