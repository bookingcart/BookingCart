// src/components/GuideProfileCompleteness.jsx
// Circular progress ring showing guide profile completeness score.
// Score: 0-59% = Incomplete (red), 60-79% = Good (amber), 80-100% = Excellent (green)

export default function GuideProfileCompleteness({ score = 0, size = 120, showLabel = true, animated = true }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const dashOffset = circumference - (progress / 100) * circumference;

  const getConfig = (s) => {
    if (s >= 80) return { color: '#16a34a', trackColor: '#dcfce7', label: 'Excellent', emoji: '🏆' };
    if (s >= 60) return { color: '#d97706', trackColor: '#fef3c7', label: 'Good', emoji: '✨' };
    return { color: '#dc2626', trackColor: '#fee2e2', label: 'Incomplete', emoji: '📝' };
  };
  const cfg = getConfig(progress);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={cfg.trackColor}
            strokeWidth={10}
            className="dark:opacity-20"
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={cfg.color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: animated ? 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' : 'none' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-black text-slate-900 dark:text-white" style={{ fontSize: size * 0.22 }}>
            {progress}%
          </span>
          {size >= 80 && (
            <span className="text-xs font-bold text-slate-400" style={{ fontSize: size * 0.09 }}>
              Complete
            </span>
          )}
        </div>
      </div>
      {showLabel && (
        <div className="text-center">
          <span className="text-xs font-bold" style={{ color: cfg.color }}>
            {cfg.emoji} {cfg.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Mini inline bar version ──────────────────────────────────────────────────
export function CompletenessBar({ score = 0, label = true }) {
  const progress = Math.min(100, Math.max(0, score));
  const color = progress >= 80 ? 'bg-green-500' : progress >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = progress >= 80 ? 'text-green-600' : progress >= 60 ? 'text-amber-600' : 'text-red-600';
  const status = progress >= 80 ? 'Excellent' : progress >= 60 ? 'Good' : 'Incomplete';

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className="text-slate-500 dark:text-slate-400">Profile Completeness</span>
          <span className={textColor}>{progress}% — {status}</span>
        </div>
      )}
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
