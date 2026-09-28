import { useEffect, useState, useRef, Fragment } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { connectSupportStream, loadSupportThreads, patchSupportThread, postSupportMessage } from '../lib/supportClient.js';
import { aviationRequest } from '../lib/aviationClient.js';

/* ─── Support Inbox ─────────────────────────────────────────────── */
async function fetchSupportMessages() {
  return loadSupportThreads();
}

async function updateThread(id, updates) {
  return patchSupportThread(id, updates);
}

async function replyToThread(threadId, text) {
  return postSupportMessage({ threadId, message: text });
}

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

function AttractionsAnalytics() {
  const { getToken } = useAuth();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { const token = getToken(); fetch('/api/attractions/analytics', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (response) => ({ response, body: await response.json() })).then(({ response, body }) => { if (!response.ok) throw new Error(body.error); setData(body); }).catch((err) => setError(err.message)); }, [getToken]);
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-8">Loading Attractions analytics…</div>;
  const totalResults = Number(data.totals.results_loaded || 0) + Number(data.totals.results_partial || 0); const clicks = Number(data.totals.outbound_booking_click || 0); const views = Number(data.totals.detail_viewed || 0);
  const metrics = [['Searches', data.totals.search_submitted || 0],['Zero results', data.totals.zero_results || 0],['Partial results', data.totals.results_partial || 0],['Detail views', views],['Saved', data.totals.saved || 0],['Booking clicks', clicks],['Click-through', views ? `${Math.round(clicks / views * 100)}%` : '0%']];
  return <section><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>)}</div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"><h2 className="text-lg font-black">Most engaged attractions</h2>{data.topAttractions.length ? <ol className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">{data.topAttractions.map((item) => <li key={`${item.source}:${item.attraction_id}`} className="flex justify-between py-3 text-sm"><span className="truncate">{item.attraction_id || 'Unknown attraction'} <small className="text-slate-400">{item.source}</small></span><strong>{item.count}</strong></li>)}</ol> : <p className="mt-3 text-slate-500">No attraction engagement recorded yet.</p>}</div><p className="mt-3 text-xs text-slate-400">Results sessions: {totalResults}. Booking clicks are outbound handoffs, not completed purchases.</p></section>;
}

function SupportInbox() {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [transportMode, setTransportMode] = useState('connecting');
  const bottomRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const firstLoadRef = useRef(true);

  function mergeThread(nextThread) {
    if (!nextThread?.id) return;
    setThreads((prev) => {
      const existingIndex = prev.findIndex((thread) => thread.id === nextThread.id);
      if (existingIndex === -1) {
        return [nextThread, ...prev].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
      }
      const updated = [...prev];
      updated[existingIndex] = nextThread;
      updated.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
      return updated;
    });
    setSelected((prev) => (prev?.id === nextThread.id ? nextThread : prev));
  }

  async function loadData() {
    const fresh = await fetchSupportMessages();
    if (!fresh.ok) {
      setError(fresh.error || 'Could not load support inbox');
      return;
    }

    setError('');
    setThreads(fresh.threads);

    setSelected(prev => {
      if (!prev) return prev;
      const up = fresh.threads.find(t => t.id === prev.id);
      return up || prev;
    });

    const unreadCount = fresh.threads.filter(t => !t.adminRead).length;
    if (!firstLoadRef.current && unreadCount > prevUnreadRef.current) {
      playNotificationSound();
    }
    firstLoadRef.current = false;
    prevUnreadRef.current = unreadCount;
  }

  useEffect(() => {
    loadData();
    let pollId = null;
    const stopStream = connectSupportStream({
      onReady() {
        setTransportMode('live');
        setError('');
      },
      onThread(thread) {
        mergeThread(thread);
      },
      onError(err) {
        setTransportMode('polling');
        setError(String(err?.message || '').includes('Admin access is not configured')
          ? 'Support inbox is not available until admin emails are configured.'
          : 'Live updates are unavailable. Falling back to auto-refresh.');
        if (!pollId) pollId = setInterval(loadData, 4000);
      }
    });

    return () => {
      stopStream();
      if (pollId) clearInterval(pollId);
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selected, threads]);

  const filtered = threads.filter(t =>
    filter === 'all' ? true :
    filter === 'unread' ? !t.adminRead :
    filter === 'open' ? t.status !== 'closed' :
    t.status === 'closed'
  );

  async function markRead(id) {
    const updated = threads.map(t => t.id === id ? { ...t, adminRead: true } : t);
    setThreads(updated);
    const result = await updateThread(id, { adminRead: true });
    if (!result?.ok) setError(result?.error || 'Could not update thread state');
  }

  async function sendReply(threadId) {
    if (!reply.trim()) return;
    const txt = reply.trim();
    setReply('');
    const updated = threads.map(t => t.id === threadId ? {
      ...t, adminRead: true, status: 'open',
      messages: [...t.messages, { from: 'admin', text: txt, ts: Date.now() }]
    } : t);
    setThreads(updated);
    const result = await replyToThread(threadId, txt);
    if (!result?.ok) setError(result?.error || 'Could not send reply');
  }

  async function closeThread(threadId) {
    const updated = threads.map(t => t.id === threadId ? { ...t, status: 'closed' } : t);
    setThreads(updated);
    if (selected?.id === threadId) setSelected(updated.find(t => t.id === threadId));
    const result = await updateThread(threadId, { status: 'closed' });
    if (!result?.ok) setError(result?.error || 'Could not close thread');
  }

  async function reopenThread(threadId) {
    const updated = threads.map(t => t.id === threadId ? { ...t, status: 'open' } : t);
    setThreads(updated);
    if (selected?.id === threadId) setSelected(updated.find(t => t.id === threadId));
    const result = await updateThread(threadId, { status: 'open' });
    if (!result?.ok) setError(result?.error || 'Could not reopen thread');
  }

  function selectThread(t) {
    setSelected(t);
    if (!t.adminRead) markRead(t.id);
  }

  const unread = threads.filter(t => !t.adminRead).length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ minHeight: 480 }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <i className="ph ph-chat-dots text-teal-600 text-xl" />
          <h2 className="font-extrabold text-slate-900 dark:text-slate-100">Support Inbox</h2>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>
          )}
          <span className="text-xs text-slate-400">
            {transportMode === 'live' ? 'Live updates' : transportMode === 'polling' ? 'Auto-refresh' : 'Connecting'}
          </span>
        </div>
        <div className="flex gap-1">
          {['all', 'unread', 'open', 'closed'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all
                ${filter === f ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="flex" style={{ minHeight: 440 }}>
        {/* thread list */}
        <div className="w-72 shrink-0 border-r border-slate-100 overflow-y-auto">
          {!error && filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <i className="ph ph-chat-slash text-4xl mb-2 block" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs mt-1">Customer chats appear here</p>
            </div>
          )}
          {filtered.map(t => {
            const last = t.messages[t.messages.length - 1];
            const isSelected = selected?.id === t.id;
            return (
              <button key={t.id} onClick={() => selectThread(t)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors
                  ${isSelected ? 'bg-teal-50 border-l-4 border-l-teal-500' : 'hover:bg-slate-50 dark:bg-slate-900 border-l-4 border-l-transparent'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                      <i className="ph ph-user text-teal-600 text-sm" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${!t.adminRead ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                        {t.email || 'Guest'}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{last?.text || ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!t.adminRead && <span className="w-2 h-2 bg-teal-500 rounded-full" />}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                      ${t.status === 'closed' ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' : 'bg-green-100 text-green-700'}`}>
                      {t.status || 'open'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-300 mt-1 ml-10">
                  {new Date(t.createdAt).toLocaleString()}
                </p>
              </button>
            );
          })}
        </div>

        {/* thread detail */}
        {selected ? (
          <div className="flex-1 flex flex-col">
            {/* detail header */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white dark:bg-slate-800">
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{selected.email || 'Guest'}</p>
                <p className="text-xs text-slate-400">{selected.topic || 'General enquiry'}</p>
              </div>
              <div className="flex gap-2">
                {selected.status !== 'closed'
                  ? <button onClick={() => closeThread(selected.id)}
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-900">
                      <i className="ph ph-check-circle mr-1" />Close
                    </button>
                  : <button onClick={() => reopenThread(selected.id)}
                      className="text-xs font-semibold text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
                      <i className="ph ph-arrow-counter-clockwise mr-1" />Reopen
                    </button>
                }
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50 dark:bg-slate-900">
              {(threads.find(t => t.id === selected.id)?.messages || []).map((m, i) => (
                <div key={i} className={`flex ${m.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  {m.from !== 'admin' && (
                    <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                      <i className="ph ph-user text-teal-600 text-sm" />
                    </div>
                  )}
                  <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm shadow-sm
                    ${m.from === 'admin'
                      ? 'bg-teal-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-sm border border-slate-100'}`}>
                    {m.from === 'admin' && <p className="text-[10px] text-teal-200 mb-0.5 font-semibold">You (Admin)</p>}
                    {m.text}
                    <p className={`text-[10px] mt-1 ${m.from === 'admin' ? 'text-teal-200' : 'text-slate-300'}`}>
                      {new Date(m.ts).toLocaleTimeString()}
                    </p>
                  </div>
                  {m.from === 'admin' && (
                    <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center ml-2 shrink-0 mt-1">
                      <i className="ph ph-shield-check text-white text-sm" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* reply box */}
            {selected.status !== 'closed' ? (
              <div className="p-4 border-t border-slate-100 bg-white dark:bg-slate-800 flex gap-2">
                <textarea
                  rows={2}
                  className="flex-1 bg-slate-50 dark:bg-slate-900 rounded-xl px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  placeholder="Type your reply…"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(selected.id); } }}
                />
                <button onClick={() => sendReply(selected.id)}
                  className="w-10 h-10 self-end rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors shrink-0">
                  <i className="ph ph-paper-plane-tilt text-lg" />
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-slate-100 bg-slate-50 dark:bg-slate-900 text-center text-sm text-slate-400">
                This thread is closed.
                <button onClick={() => reopenThread(selected.id)} className="ml-2 text-teal-600 font-semibold hover:underline">Reopen to reply</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <i className="ph ph-chat-dots text-5xl mb-3 block text-slate-200" />
              <p className="font-medium">Select a conversation</p>
              <p className="text-xs mt-1">Click a message on the left to view and reply</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SCRIPTS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  '/js/loading-ui.js',
  '/js/auth.js',
  '/js/admin-page.js'
];

/* ─── Users Panel ───────────────────────────────────────────────── */
function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const t = localStorage.getItem('bookingcart_jwt_token') || localStorage.getItem('bookingcart_google_id_token') || '';
      const resp = await fetch('/api/user?action=list', {
        headers: t ? { 'Authorization': `Bearer ${t}` } : {}
      });
      const data = await resp.json();
      if (data.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error || 'Failed to load users');
      }
    } catch (e) {
      setError('Network error — could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function deleteUser(email) {
    if (!confirm(`Are you sure you want to delete ${email}? This action cannot be undone.`)) return;
    try {
      const t = localStorage.getItem('bookingcart_jwt_token') || localStorage.getItem('bookingcart_google_id_token') || '';
      const resp = await fetch(`/api/user?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: t ? { 'Authorization': `Bearer ${t}` } : {}
      });
      const data = await resp.json();
      if (data.ok) {
        alert('User successfully deleted.');
        loadUsers();
      } else {
        alert('Failed to delete user: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Network error while deleting user.');
    }
  }

  function copyEmail(email) {
    navigator.clipboard?.writeText(email).then(() => {
      setCopied(email);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const filtered = users.filter(u =>
    !search ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.name || '').toLowerCase().includes(search.toLowerCase())
  );

  function initials(u) {
    const name = u.name || u.email || '?';
    return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function avatarColor(email) {
    const colors = [
      'bg-violet-100 text-violet-700',
      'bg-blue-100 text-blue-700',
      'bg-teal-100 text-teal-700',
      'bg-rose-100 text-rose-700',
      'bg-amber-100 text-amber-700',
      'bg-indigo-100 text-indigo-700',
    ];
    let h = 0;
    for (let i = 0; i < (email || '').length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff;
    return colors[h % colors.length];
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <i className="ph ph-users text-white text-lg" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-slate-100">Registered Users</h2>
            <p className="text-xs text-slate-400">{loading ? 'Loading…' : `${filtered.length} of ${users.length} users`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search email or name…"
              className="pl-8 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 w-56 transition-all"
            />
          </div>
          <button onClick={loadUsers}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Refresh">
            <i className="ph ph-arrows-clockwise" />
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
          <i className="ph ph-spinner-gap text-3xl animate-spin" />
          <p className="text-sm font-medium">Loading users…</p>
        </div>
      ) : error ? (
        <div className="py-16 flex flex-col items-center gap-3 text-red-400">
          <i className="ph ph-warning-circle text-3xl" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={loadUsers} className="text-xs text-blue-600 hover:underline mt-1">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
          <i className="ph ph-users-three text-4xl" />
          <p className="text-sm font-medium">{search ? 'No users match your search' : 'No users yet'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200">
                <th className="text-left px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs w-12">#</th>
                <th className="text-left px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">User</th>
                <th className="text-left px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Email</th>
                <th className="text-left px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Auth</th>
                <th className="text-left px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Joined</th>
                <th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Copy</th>
                <th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id || u.email} className="border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 text-slate-400 text-xs font-mono">{i + 1}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(u.email)}`}>
                        {initials(u)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px]">
                          {u.name || <span className="text-slate-400 italic">No name</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-slate-700 dark:text-slate-300 select-all">{u.email || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    {u.authMethod === 'email' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                        <i className="ph ph-envelope" /> Email
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                        <i className="ph ph-google-logo" /> Google
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => copyEmail(u.email)}
                      title="Copy email"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        copied === u.email
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700'
                      }`}>
                      <i className={`ph ${copied === u.email ? 'ph-check' : 'ph-copy'} mr-1`} />
                      {copied === u.email ? 'Copied!' : 'Copy'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteUser(u.email)}
                      title="Delete user"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 hover:text-red-700">
                      <i className="ph ph-trash mr-1" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Private Jets Panel ──────────────────────────────────────────── */
function PrivateJetsPanel({ getToken }) {
  const [operators, setOperators] = useState([]);
  const [aircraft, setAircraft] = useState([]);
  const [charters, setCharters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'aircraft' | 'charters'
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');

  const token = getToken ? getToken() : null;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [opsData, acData, charterData] = await Promise.all([
        aviationRequest('list-operators', { token }).catch(() => ({ operators: [] })),
        aviationRequest('list-aircraft', { token }).catch(() => ({ aircraft: [] })),
        aviationRequest('list-charters', { token }).catch(() => ({ charters: [] })),
      ]);
      setOperators(opsData.operators || []);
      setAircraft(acData.aircraft || []);
      setCharters(charterData.charters || []);
    } catch (err) {
      setError(err.message || 'Failed to load aviation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCharterStatus = async (charterId, status) => {
    try {
      await aviationRequest('update-charter', {
        method: 'POST',
        token,
        body: { id: charterId, status },
      });
      setActionMsg(`Charter #${charterId} marked as ${status}`);
      setCharters(prev => prev.map(c => c.id === charterId ? { ...c, status } : c));
    } catch (err) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending:   'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-green-100 text-green-700',
      completed: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return `inline-block px-2 py-0.5 rounded-full text-xs font-bold ${map[status] || 'bg-slate-100 text-slate-600'}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <i className="ph ph-airplane-takeoff text-4xl animate-pulse mr-3" />
      <span className="font-semibold">Loading aviation data…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
      <i className="ph ph-warning-circle mr-2" />{error}
    </div>
  );

  const totalRevenue = charters.reduce((sum, c) => sum + Number(c.total_price || 0), 0);
  const pendingCharters = charters.filter(c => c.status === 'pending').length;
  const confirmedCharters = charters.filter(c => c.status === 'confirmed').length;

  return (
    <section>
      {/* Action message */}
      {actionMsg && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-green-700 text-sm font-medium flex items-center gap-2">
          <i className="ph ph-check-circle" />{actionMsg}
          <button onClick={() => setActionMsg('')} className="ml-auto text-green-400 hover:text-green-600"><i className="ph ph-x" /></button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Operators', value: operators.length, icon: 'ph-building', color: 'text-green-600' },
          { label: 'Aircraft Listed', value: aircraft.length, icon: 'ph-airplane', color: 'text-blue-600' },
          { label: 'Charter Requests', value: charters.length, icon: 'ph-paper-plane-tilt', color: 'text-purple-600' },
          { label: 'Est. Revenue', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalRevenue), icon: 'ph-currency-dollar', color: 'text-amber-600' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-5">
            <div className="flex items-center gap-2 mb-1">
              <i className={`ph ${icon} ${color}`} />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
            </div>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'overview', label: 'Overview', icon: 'ph-chart-bar' },
          { id: 'aircraft', label: 'Aircraft', icon: 'ph-airplane' },
          { id: 'charters', label: 'Charter Requests', icon: 'ph-paper-plane-tilt' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${activeTab === tab.id ? 'bg-green-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-green-50'}`}>
            <i className={`ph ${tab.icon}`} />{tab.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-all">
          <i className="ph ph-arrow-clockwise" /> Refresh
        </button>
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Charter status breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-6">
            <h3 className="font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <i className="ph ph-chart-pie text-green-600" /> Charter Status Breakdown
            </h3>
            {[
              { label: 'Pending', count: pendingCharters, color: 'bg-yellow-400' },
              { label: 'Confirmed', count: confirmedCharters, color: 'bg-green-500' },
              { label: 'Completed', count: charters.filter(c => c.status === 'completed').length, color: 'bg-blue-500' },
              { label: 'Cancelled', count: charters.filter(c => c.status === 'cancelled').length, color: 'bg-red-400' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 py-2">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.color}`} />
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">{row.label}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{row.count}</span>
              </div>
            ))}
          </div>

          {/* Top operators */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-6">
            <h3 className="font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <i className="ph ph-building text-green-600" /> Operators
            </h3>
            {operators.length === 0 ? (
              <p className="text-slate-400 text-sm">No operators registered yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {operators.slice(0, 8).map(op => (
                  <li key={op.id} className="py-2.5 flex items-center gap-3">
                    <i className="ph ph-building-office text-green-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{op.name || 'Unnamed Operator'}</p>
                      <p className="text-xs text-slate-400">{op.country || op.base_airport || '—'}</p>
                    </div>
                    <span className={statusBadge(op.status || 'active')}>{op.status || 'active'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Aircraft tab */}
      {activeTab === 'aircraft' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden">
          {aircraft.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <i className="ph ph-airplane text-4xl mb-2 block" />
              <p>No aircraft listed yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    {['Aircraft', 'Category', 'Capacity', 'Range', 'Base Airport', 'Price / hr', 'Status'].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {aircraft.map(ac => (
                    <tr key={ac.id} className="hover:bg-green-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{ac.name || `${ac.manufacturer} ${ac.model}`}</p>
                        <p className="text-xs text-slate-400">{ac.registration_number || '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{ac.category || '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{ac.passenger_capacity ? `${ac.passenger_capacity} pax` : '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{ac.flight_range ? `${ac.flight_range} nm` : '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{ac.base_airport || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-green-600">{ac.price_per_hour ? `$${Number(ac.price_per_hour).toLocaleString()}` : '—'}</td>
                      <td className="px-5 py-3"><span className={statusBadge(ac.status || 'available')}>{ac.status || 'available'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Charters tab */}
      {activeTab === 'charters' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden">
          {charters.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <i className="ph ph-paper-plane-tilt text-4xl mb-2 block" />
              <p>No charter requests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    {['Ref', 'Client', 'Route', 'Date', 'Passengers', 'Total', 'Status', 'Actions'].map(h => (
                      <th key={h} className={`text-left px-5 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {charters.map(c => (
                    <tr key={c.id} className="hover:bg-green-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">#{String(c.id).slice(0, 8)}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{c.client_name || 'Guest'}</p>
                        <p className="text-xs text-slate-400">{c.client_email || '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">{c.departure_airport || '?'}</span>
                        <i className="ph ph-arrow-right mx-1 text-slate-300" />
                        <span className="font-semibold">{c.arrival_airport || '?'}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{c.departure_date ? new Date(c.departure_date).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{c.passengers || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-green-600">{c.total_price ? `$${Number(c.total_price).toLocaleString()}` : '—'}</td>
                      <td className="px-5 py-3"><span className={statusBadge(c.status)}>{c.status}</span></td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'pending' && (
                            <button onClick={() => handleCharterStatus(c.id, 'confirmed')}
                              className="px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors">
                              Confirm
                            </button>
                          )}
                          {c.status !== 'cancelled' && c.status !== 'completed' && (
                            <button onClick={() => handleCharterStatus(c.id, 'cancelled')}
                              className="px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-xs font-semibold hover:bg-red-200 transition-colors">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Events Panel ────────────────────────────────────────────────── */
function EventsPanel({ getToken }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [filter, setFilter] = useState('pending'); // 'pending' | 'approved' | 'rejected'

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(getToken ? { 'Authorization': `Bearer ${getToken()}` } : {})
  });

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/event-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'admin-list', statusFilter: filter })
      });
      const data = await res.json();
      if (data.ok) {
        setProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error('Failed to load event profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfiles(); }, [filter]);

  const handleReview = async (profileId, newStatus, note = '') => {
    if (!window.confirm(`Mark this event listing as ${newStatus}?`)) return;
    try {
      const res = await fetch('/api/event-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'admin-review', profileId, status: newStatus, note })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Listing marked as ${newStatus}`);
        loadProfiles();
      } else {
        alert(data.error || 'Failed to review listing');
      }
    } catch (err) {
      console.error('Failed to review listing:', err);
      alert('Network error');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
            <i className="ph ph-ticket text-white text-lg" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-slate-100">Event & Attraction Listings</h2>
            <p className="text-xs text-slate-400">Review organizer submissions</p>
          </div>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === f ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
              {f}
            </button>
          ))}
          <button onClick={loadProfiles}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Refresh">
            <i className="ph ph-arrows-clockwise" />
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="mx-6 mt-4 p-3 bg-emerald-50 text-emerald-700 text-sm font-bold border border-emerald-200 rounded-xl flex items-center gap-2">
          <i className="ph ph-check-circle" /> {actionMsg}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400"><i className="ph ph-spinner-gap text-3xl animate-spin" /></div>
      ) : profiles.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <i className="ph ph-ticket text-4xl mb-2" />
          <p className="text-sm font-medium">No {filter} event listings found.</p>
        </div>
      ) : (
        <div className="p-6 grid gap-6">
          {profiles.map(p => {
            const info = p.step_event_info || {};
            const loc = p.step_location || {};
            const tickets = p.step_tickets?.list || [];
            const banner = p.ticket_banner_image;
            return (
              <div key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 relative">
                <div className="flex flex-col lg:flex-row gap-6">
                  {banner ? (
                    <img src={banner} className="w-full lg:w-48 h-32 object-cover rounded-xl" alt="Ticket Banner" />
                  ) : (
                    <div className="w-full lg:w-48 h-32 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                      No Banner Image
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{info.eventName || 'Unnamed Event'}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{loc.city}{loc.country ? `, ${loc.country}` : ''}</p>
                        <p className="text-xs text-slate-400 mt-1"><span className="font-bold">Organizer:</span> {info.organizerName || p.email}</p>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase ${
                        p.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        p.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-3 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl">
                        <span className="text-slate-400 block mb-0.5">Tickets</span>
                        <span className="font-bold text-slate-900 dark:text-white">{tickets.length} Types</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl">
                        <span className="text-slate-400 block mb-0.5">Completeness</span>
                        <span className="font-bold text-slate-900 dark:text-white">{p.completeness}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {p.status !== 'approved' && (
                      <button onClick={() => handleReview(p.id, 'approved')} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded-xl transition-colors text-left w-full sm:w-auto">
                        <i className="ph ph-check-circle mr-1" /> Approve Listing
                      </button>
                    )}
                    {p.status !== 'rejected' && (
                      <button onClick={() => handleReview(p.id, 'rejected')} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors text-left w-full sm:w-auto">
                        <i className="ph ph-x-circle mr-1" /> Reject Listing
                      </button>
                    )}
                    <a href={`mailto:${p.email}`} className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 text-left w-full sm:w-auto">
                      <i className="ph ph-envelope mr-1" /> Contact Organizer
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuidesPanel({ getToken }) {
  const [guides, setGuides] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pending' | 'reviews'
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Country filter and sorting
  const [countryFilter, setCountryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('country'); // 'country' | 'name' | 'rating'

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(getToken ? { 'Authorization': `Bearer ${getToken()}` } : {})
  });

  const loadGuides = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guides');
      const data = await res.json();
      if (data.ok && data.guides) {
        setGuides(data.guides);
      }
    } catch (err) {
      console.error('Failed to load guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      const headers = authHeaders();
      // Fetch both pending (submitted) and draft (in-progress) profiles
      const [resPending, resDraft] = await Promise.all([
        fetch('/api/guide-profiles', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'admin-list', statusFilter: 'pending' })
        }),
        fetch('/api/guide-profiles', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'admin-list', statusFilter: 'draft' })
        })
      ]);
      const [dataPending, dataDraft] = await Promise.all([resPending.json(), resDraft.json()]);
      const pending = dataPending.ok ? (dataPending.profiles || []) : [];
      const drafts = dataDraft.ok ? (dataDraft.profiles || []) : [];
      setPendingProfiles([...pending, ...drafts]);
    } catch (err) {
      console.error('Failed to load pending profiles:', err);
    }
  };

  useEffect(() => {
    loadGuides();
    loadPending();
  }, []);

  const loadReviews = async () => {
    setReviewsLoading(true);
    try {
      const res = await fetch('/api/guide-reviews', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'admin-list' })
      });
      const data = await res.json();
      if (data.ok) setReviews(data.reviews || []);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleModerateReview = async (reviewId, status) => {
    try {
      const res = await fetch('/api/guide-reviews', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'moderate', reviewId, status })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Review ${status}`);
        if (status === 'deleted') {
          setReviews(prev => prev.filter(r => r.id !== reviewId));
        } else {
          setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status } : r));
        }
      }
    } catch (err) {
      console.error('Moderation error:', err);
    }
  };

  // Load reviews when tab becomes active
  useEffect(() => {
    if (activeTab === 'reviews') loadReviews();
  }, [activeTab]);

  const handleStatusChange = async (guideId, newStatus) => {
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'status', id: guideId, status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Updated status for guide #${guideId} to ${newStatus}`);
        loadGuides();
      }
    } catch (err) {
      console.error('Failed to update guide status:', err);
    }
  };

  const handleToggleVerified = async (guideId, currentVerified) => {
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'toggle-verified', id: guideId, verified: !currentVerified })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Verification badge ${!currentVerified ? 'awarded to' : 'revoked from'} guide #${guideId}`);
        setGuides(prev => prev.map(g => (String(g.id) === String(guideId) ? { ...g, verified: !currentVerified } : g)));
      }
    } catch (err) {
      console.error('Failed to toggle verification badge:', err);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' })
      });
      const data = await res.json();
      if (data.ok || data.seeded) {
        setActionMsg(`Demo guides seeded successfully! (${data.seeded || 0} guides)`);
        loadGuides();
      }
    } catch (err) {
      console.error('Failed to seed guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemo = async () => {
    if (!window.confirm('Are you sure you want to remove all demo guides?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-demo' })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg('Demo guides cleared successfully!');
        loadGuides();
      }
    } catch (err) {
      console.error('Failed to clear demo guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRealGuides = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'sync-real-guides' })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Restored and synced ${data.syncedCount || 0} real registered guide accounts!`);
        loadGuides();
      }
    } catch (err) {
      console.error('Failed to sync real guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileReview = async (profileId, status, note = '') => {
    try {
      const res = await fetch('/api/guide-profiles', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'admin-review', profileId, status, note })
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`Profile marked as ${status}`);
        loadPending();
        if (status === 'approved') loadGuides();
      }
    } catch (err) {
      console.error('Failed to review profile:', err);
    }
  };

  const activeCount = guides.filter(g => g.status === 'active').length;

  const countriesList = Array.from(new Set(guides.map(g => g.country).filter(Boolean))).sort();

  const processedGuides = [...guides]
    .filter(g => countryFilter === 'all' || (g.country || '').toLowerCase() === countryFilter.toLowerCase())
    .sort((a, b) => {
      if (sortBy === 'country') {
        const cComp = (a.country || 'Unknown').localeCompare(b.country || 'Unknown');
        if (cComp !== 0) return cComp;
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'rating') return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
      return 0;
    });

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm flex justify-between items-center">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')} className="text-emerald-400 hover:text-white">&times;</button>
        </div>
      )}

      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Guides</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{guides.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-5">
          <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Active Guides</div>
          <div className="text-2xl font-extrabold text-emerald-600">{activeCount}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Guide Database</div>
            <div className="text-xs text-slate-500">Manage real & demo accounts</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncRealGuides}
              disabled={loading}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold text-xs rounded-xl transition-colors"
              title="Restore & sync all registered guide profiles"
            >
              Restore Real Guides
            </button>
            <button
              onClick={handleClearDemo}
              disabled={loading}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-bold text-xs rounded-xl transition-colors"
            >
              Clear Demo
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-px">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'all' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          Active Guides
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pending' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          Pending Review
          {pendingProfiles.length > 0 && (
            <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 px-1.5 py-0.5 rounded text-xs font-black">
              {pendingProfiles.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'reviews' ? 'border-rose-500 text-rose-600 dark:text-rose-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          Review Moderation
        </button>
      </div>

      {activeTab === 'pending' ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Applicant</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Completeness</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Registered</th>
                  <th className="text-right px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {pendingProfiles.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400">
                      <i className="ph ph-user-plus text-3xl block mb-2" />
                      No guide registrations found.
                    </td>
                  </tr>
                ) : (
                  pendingProfiles.map(p => {
                    const personal = p.step_personal || {};
                    const categories = p.step_categories || {};
                    const catList = Array.isArray(categories.selected) ? categories.selected : [];
                    const statusColors = {
                      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                      draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                      approved: 'bg-green-100 text-green-700',
                      rejected: 'bg-red-100 text-red-600',
                      revision: 'bg-purple-100 text-purple-700',
                    };
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {personal.photo ? (
                              <img src={personal.photo} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 font-bold text-sm">
                                {(personal.fullName || p.email || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100">{personal.fullName || '(No name yet)'}</p>
                              <p className="text-xs text-slate-500">{p.email}</p>
                              {catList.length > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5">{catList.slice(0, 2).join(', ')}{catList.length > 2 ? ` +${catList.length - 2}` : ''}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold capitalize ${statusColors[p.status] || statusColors.draft}`}>
                            {p.status === 'pending' ? '⏳ Awaiting Review' : p.status === 'draft' ? '✏️ In Progress' : p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${(p.completeness || 0) >= 80 ? 'bg-emerald-500' : (p.completeness || 0) >= 50 ? 'bg-amber-500' : 'bg-rose-400'}`}
                                style={{ width: `${p.completeness || 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{p.completeness || 0}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(p.created_at || p.updated_at || Date.now()).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {p.status === 'pending' && (
                            <>
                              <button onClick={() => handleProfileReview(p.id, 'rejected')} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors">Reject</button>
                              <button onClick={() => handleProfileReview(p.id, 'revision')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors">Revision</button>
                              <button onClick={() => handleProfileReview(p.id, 'approved')} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors">✓ Approve</button>
                            </>
                          )}
                          {p.status === 'draft' && (
                            <span className="text-xs text-slate-400 italic">Awaiting submission</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'reviews' ? (
        /* Review Moderation Tab */
        <div className="space-y-4">
          {reviewsLoading ? (
            <div className="text-center py-10 text-slate-400">Loading reviews…</div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
              <i className="ph ph-chat-circle text-3xl mb-2 block" />
              No reviews to moderate.
            </div>
          ) : (
            reviews.map(r => (
              <div key={r.id} className={`bg-white dark:bg-slate-800 rounded-2xl border p-5 shadow-sm ${
                r.status === 'hidden' ? 'border-slate-300 dark:border-slate-600 opacity-60' : 'border-slate-200 dark:border-slate-700'
              }`}>
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900 dark:text-white">{r.authorName}</p>
                      <span className="text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded capitalize">{r.status}</span>
                      <span className="text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded">✓ Verified Booking</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">Guide: {r.guideId} · {new Date(r.createdAt).toLocaleDateString()}</p>
                    <div className="flex gap-0.5 mb-2">
                      {Array.from({length: 5}).map((_,i) => <i key={i} className={`ph${r.rating > i ? '-fill' : ''} ph-star text-amber-400`} />)}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">{r.text}</p>
                    {r.tags?.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {r.tags.map(t => <span key={t} className="text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <button onClick={() => handleModerateReview(r.id, 'approved')} disabled={r.status === 'approved'} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold">Approve</button>
                    <button onClick={() => handleModerateReview(r.id, 'hidden')} disabled={r.status === 'hidden'} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold">Hide</button>
                    <button onClick={() => { if(window.confirm('Permanently delete this review?')) handleModerateReview(r.id, 'deleted'); }} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 dark:text-rose-400 rounded-lg text-xs font-bold">Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
        {/* Country Filter & Sort Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter Country:</span>
            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <option value="all">🌍 All Countries ({guides.length})</option>
              {countriesList.map(c => (
                <option key={c} value={c}>📍 {c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sort Guides:</span>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
              <button
                onClick={() => setSortBy('country')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${sortBy === 'country' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                🌍 By Country
              </button>
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${sortBy === 'name' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                👤 By Name
              </button>
              <button
                onClick={() => setSortBy('rating')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${sortBy === 'rating' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                ⭐ By Rating
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Guide</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Country / Location</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Rating</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-right px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">Loading tour guides...</td>
                  </tr>
                ) : processedGuides.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">
                      No guides found for selected country filter. Click <strong>Restore Real Guides</strong> or <strong>Seed Guides</strong>.
                    </td>
                  </tr>
                ) : (
                  processedGuides.map((g, idx) => {
                    const showCountryHeader = sortBy === 'country' && (idx === 0 || (processedGuides[idx - 1].country || 'Other') !== (g.country || 'Other'));
                    return (
                      <Fragment key={g.id || g.slug}>
                        {showCountryHeader && (
                          <tr className="bg-emerald-50/80 dark:bg-emerald-950/40 border-y border-emerald-200 dark:border-emerald-800">
                            <td colSpan="5" className="px-6 py-2.5 font-black text-xs text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                              <span>📍 {g.country || 'Other Locations'}</span>
                              <span className="bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                {processedGuides.filter(x => (x.country || 'Other') === (g.country || 'Other')).length} Guides
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-750">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={g.photo || (Array.isArray(g.gallery) && (g.gallery[0]?.url || g.gallery[0])) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'}
                          alt={g.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                            {g.name}
                            {g.verified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title="Verified Guide">
                                <i className="ph-fill ph-seal-check text-emerald-500 text-xs"></i> Verified
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 italic">Unverified</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{g.yearsExp || 5}+ years experience</div>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {g.registrationFeeType === 'free_early_bird' || idx < 200 ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                🎁 Reg: Free (Early 200)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                                💳 Reg: $10 Paid
                              </span>
                            )}

                            {g.verificationFeePaid || g.verificationStatus === 'pending_admin' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200" title="$50 USD Verification Fee Paid">
                                💵 Verif: $50 Paid
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                Verif: Not Paid
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {g.city}{g.city && g.country ? ', ' : ''}{g.country}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                        <i className="ph-fill ph-star text-amber-400"></i>
                        <span>{g.rating || '4.9'}</span>
                        <span className="text-xs text-slate-400 font-normal">({g.reviewCount || 0})</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          g.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                        }`}
                      >
                        {g.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {g.verified ? (
                        <button
                          onClick={() => handleToggleVerified(g.id, true)}
                          className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          title="Revoke Verification Badge awarded by Admin"
                        >
                          <i className="ph-fill ph-seal-check text-emerald-500"></i> Revoke Badge
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleVerified(g.id, false)}
                          className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          title="Award Verification Badge to Guide"
                        >
                          <i className="ph-bold ph-seal-check text-emerald-600"></i> Award Badge
                        </button>
                      )}
                      {g.status === 'active' ? (
                        <button
                          onClick={() => handleStatusChange(g.id, 'suspended')}
                          className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(g.id, 'active')}
                          className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Approve
                        </button>
                      )}
                      <a
                        href={`/tour-guides/${g.id || g.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors inline-block"
                      >
                        View Profile
                      </a>
                    </td>
                  </tr>
                </Fragment>
              );
            })
          )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}
    </div>
  );
}

export default function AdminPage() {
  useEffect(() => { document.title = 'BookingCart — Admin'; }, []);
  useLegacyScripts(SCRIPTS, 'admin');
  const [adminTab, setAdminTab] = useState('bookings');
  
  const { user, getToken } = useAuth();
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const isAdmin = user && adminEmails.includes(user.email.toLowerCase());

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ph-fill ph-lock-key text-red-600 text-3xl"></i>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mb-2">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md">You must be signed in with an administrator account to access this dashboard.</p>
        {!user ? (
          <HeaderAuthCluster />
        ) : (
          <a href="/" className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">
            Return to Home
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      
          
          <div id="upload-overlay"
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden items-center justify-center">
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-lg w-full mx-4 relative max-h-[90vh] overflow-y-auto">
                  <button onClick={() => window.closeUploadModal?.()} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:text-slate-400">
                      <i className="ph-bold ph-x text-2xl"></i>
                  </button>
                  <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 text-xl">
                          <i className="ph-fill ph-upload-simple"></i>
                      </div>
                      <div>
                          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Upload Ticket</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Ref: <span id="upload-ref"
                                  className="font-bold text-slate-700 dark:text-slate-300"></span></p>
                      </div>
                  </div>
      
                  <div
                      className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-6 border border-slate-100 flex justify-between items-center text-sm">
                      <div>
                          <div className="text-slate-500 dark:text-slate-400 font-bold mb-1">Route</div>
                          <div id="upload-route" className="font-medium text-slate-900 dark:text-slate-100"></div>
                      </div>
                      <div className="text-right">
                          <div className="text-slate-500 dark:text-slate-400 font-bold mb-1">Passengers</div>
                          <div id="upload-pax" className="font-medium text-slate-900 dark:text-slate-100"></div>
                      </div>
                  </div>
      
                  <form id="upload-form" className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Ticket Number /
                              PNR</label>
                          <input id="ticket-num" required type="text" placeholder="e.g. 1234567890"
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Operating
                              Airline</label>
                          <input id="ticket-airline" required type="text" placeholder="e.g. Emirates"
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Ticket File (PDF
                              / Image)</label>
                          <input id="ticket-file" required type="file" accept="application/pdf,image/*"
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                      </div>
                      <button type="submit" id="upload-btn"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 mt-4 flex items-center justify-center gap-2">
                          <i className="ph-bold ph-upload-simple"></i> Upload & Issue Ticket
                      </button>
                  </form>
              </div>
          </div>
          <main className="flex-grow container mx-auto px-6 py-8">
              {/* Tab switcher */}
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setAdminTab('bookings')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'bookings' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-airplane" /> Bookings
                </button>
                <button onClick={() => setAdminTab('support')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'support' ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-chat-dots" /> Support Inbox
                </button>
                <button onClick={() => setAdminTab('users')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'users' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-users" /> Users
                </button>
                <button onClick={() => setAdminTab('aviation')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'aviation' ? 'bg-green-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-airplane-takeoff" /> Private Jets
                </button>
                <button onClick={() => setAdminTab('attractions')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${adminTab === 'attractions' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-binoculars" /> Attractions
                </button>
                <button onClick={() => setAdminTab('guides')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'guides' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-compass" /> Tour Guides
                </button>
                <button onClick={() => setAdminTab('events')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${adminTab === 'events' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900'}`}>
                  <i className="ph ph-ticket" /> Events & Attractions
                </button>
              </div>
              {adminTab === 'support' && <SupportInbox />}
              {adminTab === 'users' && <UsersPanel />}
              {adminTab === 'aviation' && <PrivateJetsPanel getToken={getToken} />}
              {adminTab === 'attractions' && <AttractionsAnalytics />}
              {adminTab === 'guides' && <GuidesPanel getToken={getToken} />}
              {adminTab === 'events' && <EventsPanel getToken={getToken} />}
              {adminTab === 'bookings' && <>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-8" id="stats">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Bookings</div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100" id="stat-total">0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-1">New / Pending</div>
                      <div className="text-2xl font-extrabold text-yellow-600" id="stat-new">0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-green-500 uppercase tracking-wider mb-1">Confirmed</div>
                      <div className="text-2xl font-extrabold text-green-600" id="stat-confirmed">0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Tickets Issued</div>
                      <div className="text-2xl font-extrabold text-purple-600" id="stat-issued">0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Downloads</div>
                      <div className="text-2xl font-extrabold text-indigo-600" id="stat-downloads">0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Revenue</div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100" id="stat-revenue">$0</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 p-5">
                      <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1"><i className="ph ph-users"></i>
                          Total Users</div>
                      <div className="text-2xl font-extrabold text-blue-600" id="stat-users">0</div>
                  </div>
              </div>
      
              
              <div className="flex items-center gap-3 mb-6">
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Filter:</span>
                  <button className="admin-filter px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-900 text-white"
                      data-filter="all">All</button>
                  <button
                      className="admin-filter px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700"
                      data-filter="new">New</button>
                  <button
                      className="admin-filter px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700"
                      data-filter="confirmed">Confirmed</button>
                  <button
                      className="admin-filter px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700"
                      data-filter="cancelled">Cancelled</button>
              </div>
      
              
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm" id="bookings-table">
                          <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200">
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Ref</th>
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Client</th>
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Route</th>
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Date</th>
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Total</th>
                                  <th className="text-left px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Status</th>
                                  <th className="text-right px-6 py-4 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">
                                      Actions</th>
                              </tr>
                          </thead>
                          <tbody id="bookings-body"></tbody>
                      </table>
                  </div>
                  <div id="empty-state" className="py-16 text-center text-slate-400 font-medium" style={{"display":"none"}}>
                      <i className="ph ph-airplane-tilt text-4xl mb-2"></i>
                      <p>No bookings yet.</p>
                  </div>
              </div>
              </>}
          </main>
    </>
  );
}
