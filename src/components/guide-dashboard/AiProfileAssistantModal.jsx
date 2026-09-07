import { useState } from 'react';

export default function AiProfileAssistantModal({ isOpen, onClose, profile, onApplySuggestion }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [applied, setApplied] = useState({});

  if (!isOpen) return null;

  const suggestions = [
    {
      id: 'gallery',
      title: 'Upload 4+ High-Res Photos',
      impact: '+35% Bookings',
      desc: 'Profiles with 10+ photos receive 35% more traveler inquiries. Add vibrant photos of your tours in action.',
      actionText: 'Go to Gallery Editor'
    },
    {
      id: 'bio',
      title: 'Enhance Bio Storytelling Hook',
      impact: '+20% Conversion',
      desc: 'Add a personal opening line highlighting your local roots and passion for wildlife and culture.',
      suggestedValue: 'Passionate safari guide born and raised near Bwindi & Queen Elizabeth Parks, with 7+ years leading unforgettable wildlife expeditions.',
      actionText: 'Apply Bio Suggestion'
    },
    {
      id: 'skills',
      title: 'Add High-Demand Skills',
      impact: '+15% Search Match',
      desc: 'Travelers frequently search for guides with First Aid, Wildlife Tracking, and Photography assistance.',
      suggestedValue: ['First Aid & Safety', 'Wildlife Tracking', 'Photography & Composition'],
      actionText: 'Add Suggested Skills'
    },
    {
      id: 'pricing',
      title: 'Enable Half-Day & Full-Day Pricing Rates',
      impact: '+25% Order Value',
      desc: 'Offering clear half-day ($90) and full-day ($150) package rates reduces booking hesitation.',
      actionText: 'Apply Pricing Benchmark'
    }
  ];

  const handleApply = (sugg) => {
    setApplied(prev => ({ ...prev, [sugg.id]: true }));
    if (onApplySuggestion) onApplySuggestion(sugg);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold"
        >
          &times;
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <i className="ph-fill ph-sparkle text-2xl animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              AI Profile Assistant
              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                Pro Optimization
              </span>
            </h3>
            <p className="text-xs text-slate-500">Real-time profile analysis based on top-performing booking data.</p>
          </div>
        </div>

        {/* Audit Banner */}
        <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-5 mb-6 flex items-center justify-between shadow-md">
          <div>
            <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">Overall Optimization Score</div>
            <div className="text-3xl font-black flex items-center gap-2">
              88 / 100
              <span className="text-xs bg-emerald-500/30 text-emerald-200 font-bold px-2 py-0.5 rounded-full">Great Rating</span>
            </div>
          </div>
          <i className="ph-fill ph-chart-line-up text-4xl text-emerald-400/80" />
        </div>

        {/* Suggestions List */}
        <div className="space-y-4">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Actionable Recommendations</h4>

          {suggestions.map((sugg) => (
            <div key={sugg.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{sugg.title}</span>
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {sugg.impact}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{sugg.desc}</p>
              </div>

              <button
                type="button"
                onClick={() => handleApply(sugg)}
                disabled={applied[sugg.id]}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs shrink-0 transition-all shadow-sm ${
                  applied[sugg.id]
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
              >
                {applied[sugg.id] ? '✓ Applied' : sugg.actionText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
