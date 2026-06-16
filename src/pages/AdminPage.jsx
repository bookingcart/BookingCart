import { useEffect, useState, useRef } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { connectSupportStream, loadSupportThreads, patchSupportThread, postSupportMessage } from '../lib/supportClient.js';

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

export default function AdminPage() {
  useEffect(() => { document.title = 'BookingCart — Admin'; }, []);
  useLegacyScripts(SCRIPTS, 'admin');
  const [adminTab, setAdminTab] = useState('bookings');
  
  const { user } = useAuth();
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
              </div>
              {adminTab === 'support' && <SupportInbox />}
              {adminTab === 'users' && <UsersPanel />}
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
