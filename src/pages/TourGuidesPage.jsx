import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import GuideCard from '../components/GuideCard.jsx';

// ─── AI Matching Engine ───────────────────────────────────────────────────────
function scoreGuide(guide, criteria) {
  if (!criteria || (!criteria.location && !criteria.skills?.length && !criteria.languages?.length && !criteria.categories?.length)) {
    return null; // No criteria = no score shown
  }
  let score = 0;
  const reasons = [];

  // ── Location match (15%) ──────────────────────────────────────────────────
  if (criteria.location) {
    const loc = criteria.location.toLowerCase();
    const fields = [guide.country, guide.city, ...(guide.areas?.regions || []), ...(guide.areas?.cities || []), ...(guide.areas?.attractions || [])];
    if (fields.some(f => (f || '').toLowerCase().includes(loc))) { score += 15; reasons.push(`Covers ${criteria.location}`); }
  } else { score += 15; }

  // ── Skills match (15%) ────────────────────────────────────────────────────
  if (criteria.skills?.length) {
    const guideSkills = (guide.skills || []).map(s => s.toLowerCase());
    const matched = criteria.skills.filter(s => guideSkills.some(gs => gs.includes(s.toLowerCase())));
    score += (matched.length / criteria.skills.length) * 15;
    if (matched.length > 0) reasons.push(`${matched[0]} specialist`);
  } else { score += 15; }

  // ── Language match (10%) ──────────────────────────────────────────────────
  if (criteria.languages?.length) {
    const guideLangs = (guide.languages || []).map(l => l.lang.toLowerCase());
    const matched = criteria.languages.filter(l => guideLangs.includes(l.toLowerCase()));
    score += (matched.length / criteria.languages.length) * 10;
    if (matched.length > 0) reasons.push(`Speaks ${matched[0]}`);
  } else { score += 10; }

  // ── Availability match (10%) ──────────────────────────────────────────────
  if (criteria.startDate) {
    const status = guide.availability?.[criteria.startDate];
    if (status === 'available') { score += 10; reasons.push('Available on selected dates'); }
    else if (!status) { score += 5; }
  } else { score += 10; }

  // ── Rating Score (30%) ────────────────────────────────────────────────────
  const ratingScore = (Math.min(parseFloat(guide.rating) || 0, 5) / 5) * 30;
  score += ratingScore;
  if (parseFloat(guide.rating) >= 4.7) reasons.push('Highly rated');

  // ── Review Count (20%) ───────────────────────────────────────────────────
  // Logarithmic scale: a guide with 100+ reviews gets full 20 pts, 10 reviews = ~13 pts, 1 = ~7 pts
  const reviewCount = Math.max(0, parseInt(guide.reviewCount) || 0);
  const reviewScore = reviewCount === 0 ? 0 : Math.min(20, Math.log10(reviewCount + 1) / Math.log10(101) * 20);
  score += reviewScore;
  if (reviewCount >= 50) reasons.push(`${reviewCount}+ verified reviews`);

  return { score: Math.round(score), reasons };
}

const ALL_CATEGORIES = [
  'Adventure Guide', 'Safari Guide', 'Cultural Guide', 'Food Tour Guide',
  'Historical Guide', 'Wildlife Guide', 'Hiking Guide', 'Photography Guide',
  'Birding Guide', 'Luxury Guide', 'City Tour Guide', 'Museum Guide'
];
const ALL_LANGUAGES = ['English', 'French', 'German', 'Spanish', 'Chinese', 'Arabic', 'Swahili', 'Japanese'];

export default function TourGuidesPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search criteria
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCategories, setSearchCategories] = useState([]);
  const [searchLanguages, setSearchLanguages] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [sortBy, setSortBy] = useState('match');

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { document.title = 'BookingCart — Tour Guides'; }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        let res = await fetch('/api/guides');
        let data = await res.json();
        if (data.ok) {
          setGuides(data.guides || []);
        }
      } catch (err) {
        console.error('Failed to load guides:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const criteria = { location: searchLocation, categories: searchCategories, languages: searchLanguages, startDate };

  const scoredGuides = guides
    .filter(g => {
      if (searchLocation && !g.country.toLowerCase().includes(searchLocation.toLowerCase()) && !g.city.toLowerCase().includes(searchLocation.toLowerCase()) && !(g.areas?.attractions || []).some(a => a.toLowerCase().includes(searchLocation.toLowerCase()))) return false;
      if (searchCategories.length && !searchCategories.some(c => (g.categories || []).includes(c))) return false;
      if (searchLanguages.length && !searchLanguages.some(l => (g.languages || []).some(gl => gl.lang === l))) return false;
      return true;
    })
    .map(g => {
      const result = scoreGuide(g, criteria);
      return { ...g, _score: result?.score ?? null, _reasons: result?.reasons ?? [] };
    })
    .sort((a, b) => {
      if (sortBy === 'match') return (b._score ?? 50) - (a._score ?? 50);
      if (sortBy === 'rating') return parseFloat(b.rating) - parseFloat(a.rating);
      if (sortBy === 'price-asc') return (a.pricing?.perDay || 0) - (b.pricing?.perDay || 0);
      if (sortBy === 'price-desc') return (b.pricing?.perDay || 0) - (a.pricing?.perDay || 0);
      return 0;
    });

  function toggleFilter(arr, setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ── Minimal Hero & Search ── */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-10 pb-6 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Mode Switcher */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 shadow-inner">
              <a href="/" className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
                <i className="ph ph-airplane-tilt text-lg text-green-600"></i> Flights
              </a>
              <button className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-600/50">
                <i className="ph ph-compass text-lg text-amber-500"></i> Tour Guides
              </button>
              <a href="/stays" className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
                <i className="ph ph-bed text-lg text-blue-600"></i> Stays
              </a>
            </div>
          </div>

          {/* Unified Search Bar */}
          <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200 dark:border-slate-700 p-2 flex flex-col md:flex-row items-center gap-2 relative z-20">
            <div className="flex-1 w-full md:w-auto flex items-center gap-3 px-4 py-2 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700">
              <i className="ph ph-map-pin text-xl text-green-600" />
              <input
                type="text"
                placeholder="Where are you going?"
                className="w-full bg-transparent border-none text-slate-900 dark:text-white font-bold placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:ring-0 text-base"
                value={searchLocation}
                onChange={e => setSearchLocation(e.target.value)}
              />
            </div>
            
            <div className="flex-1 w-full md:w-auto flex items-center gap-3 px-4 py-2 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700">
              <i className="ph ph-calendar text-xl text-amber-500" />
              <input
                type="date"
                className="w-full bg-transparent border-none text-slate-900 dark:text-white font-bold text-base focus:outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:opacity-50 dark:[&::-webkit-calendar-picker-indicator]:invert"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`shrink-0 h-12 px-6 rounded-full font-bold text-sm transition-colors flex items-center gap-2 ${showFilters ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}
            >
              <i className="ph ph-faders text-lg" /> Filters
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="max-w-4xl mx-auto mt-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Guide Specialties</h4>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map(c => (
                      <button
                        key={c}
                        onClick={() => toggleFilter(searchCategories, setSearchCategories, c)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          searchCategories.includes(c)
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-green-500'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Languages</h4>
                  <div className="flex flex-wrap gap-2">
                    {ALL_LANGUAGES.map(l => (
                      <button
                        key={l}
                        onClick={() => toggleFilter(searchLanguages, setSearchLanguages, l)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                          searchLanguages.includes(l)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Main Grid ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        
        {/* Results Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              {scoredGuides.length} Guides Available
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Find the perfect local expert for your next adventure.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sort by</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="match">Best Match</option>
              <option value="rating">Highest Rated</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-3xl h-96 border border-slate-200 dark:border-slate-700 animate-pulse flex flex-col">
                <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-t-3xl" />
                <div className="p-5 space-y-4">
                  <div className="h-6 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-xl mt-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : scoredGuides.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {scoredGuides.map(guide => (
              <GuideCard
                key={guide.slug}
                guide={guide}
                matchScore={guide._score}
                matchReasons={guide._reasons}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="ph ph-magnifying-glass text-4xl text-slate-400" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">No guides found</h3>
            <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 max-w-md mx-auto">
              We couldn't find any guides matching your specific criteria. Try adjusting your filters or search location.
            </p>
            <button
              onClick={() => {
                setSearchLocation(''); setSearchCategories([]); setSearchLanguages([]); setStartDate('');
              }}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
