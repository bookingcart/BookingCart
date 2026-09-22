export default function GuideActivityLog({ logs = [], approvals = [] }) {
  const defaultLogs = logs.length > 0 ? logs : [
    { date: 'May 10', action: 'Uploaded New Gallery Photos', category: 'Gallery' },
    { date: 'May 8', action: 'Added French Language (Fluent)', category: 'Languages' },
    { date: 'May 5', action: 'Updated Tour Pricing Rates ($60/hr)', category: 'Pricing' },
    { date: 'Apr 28', action: 'Added Wilderness First Aid Certification', category: 'Certifications' }
  ];

  const defaultApprovals = approvals.length > 0 ? approvals : [
    { id: 1, type: 'Verification Document', detail: 'National Tour Guide License #UG-8821', status: 'approved', date: 'May 1' },
    { id: 2, type: 'Certification Update', detail: 'Advanced Wilderness First Aid', status: 'approved', date: 'Apr 28' },
    { id: 3, type: 'Profile Name Edit', detail: 'Requested change to "Miguel Santos Professional Guide"', status: 'pending', date: 'May 12' }
  ];

  const APPROVAL_BADGES = {
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
  };

  return (
    <div className="space-y-8">
      {/* ── PROFILE CHANGE APPROVALS ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <i className="ph-fill ph-shield-check text-emerald-500 text-xl" />
              Profile Change Approvals
            </h3>
            <p className="text-xs text-slate-500">Sensitive changes (Name, Licenses, Verification Docs) are reviewed by admin for quality control.</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {defaultApprovals.map((app) => (
            <div key={app.id} className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{app.type}</span>
                  <span className="text-[10px] text-slate-400 font-normal">· {app.date}</span>
                </div>
                <div className="text-xs text-slate-500 font-medium">{app.detail}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${APPROVAL_BADGES[app.status] || APPROVAL_BADGES.pending}`}>
                {app.status === 'pending' ? 'Pending Approval' : app.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CHRONOLOGICAL ACTIVITY LOG ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <i className="ph-fill ph-clock-counter-clockwise text-emerald-500 text-xl" />
          Recent Activity Log
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {defaultLogs.map((log, i) => (
            <div key={i} className="relative flex items-start justify-between gap-4">
              <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">{log.action}</div>
                <div className="text-[11px] text-slate-400 font-semibold">{log.category}</div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 shrink-0">{log.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
