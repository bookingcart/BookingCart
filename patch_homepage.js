const fs = require('fs');

const path = 'src/pages/HomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add state variable
if (!content.includes('const [recentSearches, setRecentSearches] = useState([]);')) {
  content = content.replace(
    'export default function HomePage() {',
    `export default function HomePage() {
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bc_recent_searches');
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch(e) {}
  }, []);

  const handleRecentSearchClick = (search) => {
    if (window.writeState) {
      window.writeState({ search, bookingRef: null, _bookingSaved: null, duffelPassengers: null });
      if (typeof window.__bcNavigate === "function") window.__bcNavigate("/results");
      else window.location.href = "/results";
    }
  };
`
  );
}

// 2. Add Recent Searches section right after the search widget section ends
const recentSection = `
        {/* Recent Searches Section */}
        {recentSearches.length > 0 && (
          <section className="max-w-7xl mx-auto px-6 pt-12 pb-4 dark:bg-slate-950 transition-colors">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">Your recent searches</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
              {recentSearches.map((search, idx) => {
                const isRoundTrip = search.tripType === 'round';
                
                // Helper to extract IATA
                const extractIata = (str) => {
                  if (!str) return '';
                  const m = str.match(/\\(([A-Z]{3})\\)/);
                  if (m) return m[1];
                  const m2 = str.match(/\\b([A-Z]{3})\\b/);
                  if (m2) return m2[1];
                  return str.split(',')[0].substring(0, 3).toUpperCase();
                };
                
                const fromCode = extractIata(search.from);
                const toCode = extractIata(search.to);
                
                // Format dates: '2026-04-30' -> 'Thu 4/30'
                const formatDate = (dateStr) => {
                  if (!dateStr) return '';
                  try {
                    const d = new Date(dateStr + "T12:00:00");
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return \`\${days[d.getDay()]} \${d.getMonth()+1}/\${d.getDate()}\`;
                  } catch(e) { return dateStr; }
                };

                return (
                  <div 
                    key={idx} 
                    onClick={() => handleRecentSearchClick(search)}
                    className="flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer transition-all snap-start flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                          <i className="ph-fill ph-airplane-tilt text-lg"></i>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {fromCode} 
                            <i className="ph ph-caret-right text-slate-400 text-xs"></i> 
                            {toCode}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {formatDate(search.depart)} {isRoundTrip && search.return ? \` • \${formatDate(search.return)}\` : ''}
                      </div>
                      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
                        1 traveler, {search.cabin || 'Economy'} <br/>
                        {isRoundTrip ? 'Round-trip' : 'One-way'}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-end mt-4">
                      <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-green-600 transition-colors">
                        View results
                      </div>
                      <button className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors shadow-sm shadow-orange-500/20">
                        <i className="ph-bold ph-magnifying-glass text-lg"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
              
              <div className="flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer transition-all snap-start flex flex-col items-center justify-center text-center"
                   onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
              >
                <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 mb-4 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <i className="ph ph-plus text-xl"></i>
                </div>
                <div className="font-bold text-slate-900 dark:text-white mb-4">Start a new search</div>
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded bg-orange-500 text-white flex items-center justify-center"><i className="ph-fill ph-airplane-tilt"></i></div>
                  <div className="w-8 h-8 rounded bg-orange-500 text-white flex items-center justify-center"><i className="ph-fill ph-bed"></i></div>
                  <div className="w-8 h-8 rounded bg-orange-500 text-white flex items-center justify-center"><i className="ph-fill ph-car"></i></div>
                </div>
              </div>
            </div>
          </section>
        )}
`;

content = content.replace(
  '        {/* USP Banner Section */}',
  recentSection + '\n        {/* USP Banner Section */}'
);

fs.writeFileSync(path, content);
