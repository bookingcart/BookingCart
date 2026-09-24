import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import GuideCard from '../components/GuideCard.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const FAQ_ITEMS = [
  [
    {
      q: "How do I book a tour guide?",
      a: "Simply search for a destination, filter by your preferred language and specialties, and browse through our list of verified local experts. Once you find a match, select your dates and proceed to booking."
    },
    {
      q: "Can I customize my tour itinerary?",
      a: "Yes! Many of our guides offer customizable itineraries. You can message the guide directly after booking to adjust the tour to your preferences and interests."
    },
    {
      q: "Are the tour guides verified?",
      a: "Absolutely. We thoroughly vet all our guides, checking their certifications, background, and reviews to ensure you have a safe and enriching experience."
    }
  ],
  [
    {
      q: "How do I become a tour guide?",
      a: "If you're a local expert, you can apply to become a guide by clicking the 'For travel pros' section or navigating to our guide onboarding page. You'll need to provide your details, qualifications, and undergo our verification process."
    },
    {
      q: "What happens if I need to cancel my booking?",
      a: "Cancellation policies vary by guide. You can find the specific cancellation terms on each guide's profile before you complete your booking. We generally offer a full refund for cancellations made 48 hours in advance."
    },
    {
      q: "How do payments work?",
      a: "Payments are processed securely through our platform. Your funds are held in escrow and released to the guide only after your tour is successfully completed, ensuring your peace of mind."
    }
  ]
];

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
    const guideSkills = (guide.skills || []).map(s => (typeof s === 'string' ? s : (s?.name || '')).toLowerCase());
    const matched = criteria.skills.filter(s => guideSkills.some(gs => gs.includes((s || '').toLowerCase())));
    score += (matched.length / criteria.skills.length) * 15;
    if (matched.length > 0) reasons.push(`${matched[0]} specialist`);
  } else { score += 15; }

  // ── Language match (10%) ──────────────────────────────────────────────────
  if (criteria.languages?.length) {
    const guideLangs = (guide.languages || []).map(l => (typeof l === 'string' ? l : (l?.lang || l?.language || '')).toLowerCase());
    const matched = criteria.languages.filter(l => guideLangs.includes((l || '').toLowerCase()));
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
  const [openFaq, setOpenFaq] = useState({});

  const toggleFaq = (id) => {
    setOpenFaq(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
      if (searchLocation && !(g.country || '').toLowerCase().includes(searchLocation.toLowerCase()) && !(g.city || '').toLowerCase().includes(searchLocation.toLowerCase()) && !(g.areas?.attractions || []).some(a => (a || '').toLowerCase().includes(searchLocation.toLowerCase()))) return false;
      if (searchCategories.length && !searchCategories.some(c => (g.categories || []).some(gc => (typeof gc === 'string' ? gc : gc?.name || '') === c))) return false;
      if (searchLanguages.length && !searchLanguages.some(l => (g.languages || []).some(gl => (typeof gl === 'string' ? gl : (gl?.lang || gl?.language || '')) === l))) return false;
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

      {/* ── Hero & Search ── */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 min-h-[500px] flex flex-col items-center justify-center text-center px-4 dark:bg-slate-950 transition-colors" data-step="search">
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-white/90 dark:from-slate-950/95 via-white/50 dark:via-slate-950/70 to-white/20 dark:to-slate-950/30 z-10 rounded-b-[40px]"></div>
          <img
            src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=2000&q=80"
            className="absolute inset-0 w-full h-full object-cover object-center rounded-b-[40px] opacity-100 transition-opacity duration-1000 ease-in-out"
            alt="Tour Guides background"
          />
        </div>
        
        <div className="relative z-10 max-w-4xl w-full mx-auto">
          <h1 className="text-5xl lg:text-7xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight mb-4">
            Find Local Experts
          </h1>
          <p className="text-lg lg:text-xl text-slate-600 dark:text-slate-300 font-medium mb-8">
            Discover the world with verified local tour guides.
          </p>

          {/* Mode Switcher */}
          <div className="inline-flex bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl p-1 shadow-sm border border-white/80 dark:border-slate-700/80 mb-6 gap-1">
            <a href="/" className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white">
              <i className="ph ph-airplane-tilt text-base"></i> Flights
            </a>
            <button type="button" className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 bg-green-600 text-white shadow-md shadow-green-600/30">
              <i className="ph ph-compass text-base text-white"></i> Tour Guides
            </button>
            <a href="/?mode=stays" className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white">
              <i className="ph ph-bed text-base text-blue-600"></i> Stays
            </a>
            <a href="/?mode=attractions" className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white">
              <i className="ph ph-ticket text-base text-amber-500"></i> Attractions
            </a>
          </div>

          {/* Unified Search Bar */}
          <div className="mt-4 sm:mt-6 w-full max-w-7xl mx-auto text-left" role="region" aria-label="Search panel">
            <div className="relative z-10 max-w-4xl w-full mx-auto px-0">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-1 sm:p-1.5 shadow-lg ring-1 ring-slate-100/80 dark:ring-slate-700/80 transition-colors flex flex-col md:flex-row items-stretch gap-1">
                <div className="flex-1 w-full md:w-auto flex items-center gap-2 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 h-10 sm:h-12 border border-transparent focus-within:border-green-500/50 transition-colors">
                  <i className="ph ph-map-pin text-xl text-green-600" />
                  <input
                    type="text"
                    placeholder="Where are you going?"
                    className="w-full bg-transparent border-none text-slate-900 dark:text-white font-bold placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:ring-0 text-sm sm:text-base p-0"
                    value={searchLocation}
                    onChange={e => setSearchLocation(e.target.value)}
                  />
                </div>
                
                <div className="flex-1 w-full md:w-auto flex items-center gap-2 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 h-10 sm:h-12 border border-transparent focus-within:border-green-500/50 transition-colors">
                  <i className="ph ph-calendar text-xl text-amber-500" />
                  <input
                    type="date"
                    className="w-full bg-transparent border-none text-slate-900 dark:text-white font-bold text-sm sm:text-base focus:outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:opacity-50 dark:[&::-webkit-calendar-picker-indicator]:invert p-0"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`shrink-0 h-10 sm:h-12 px-6 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${showFilters ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}
                >
                  <i className="ph ph-faders text-lg" /> Filters
                </button>
              </div>
            </div>
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

      {/* For travel pros section */}
      <section className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-8 tracking-tight">For travel pros</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Become a Guide Card */}
          <a href="/guide-onboarding" className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer block">
            <div className="w-full flex flex-col items-start text-left mb-8">
              <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Become a Guide</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">List your services and expertise</p>
            </div>
            <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
              <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <i className="ph ph-user-plus text-5xl text-green-600 dark:text-green-400" />
              </div>
            </div>
          </a>

          {/* Manage Bookings Card */}
          <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
            <div className="w-full flex flex-col items-start text-left mb-8">
              <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-amber-600 transition-colors">Manage Bookings</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Keep your calendar organized</p>
            </div>
            <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
              <div className="w-24 h-24 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <i className="ph ph-calendar-check text-5xl text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>

          {/* Earn Money Card */}
          <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
            <div className="w-full flex flex-col items-start text-left mb-8">
              <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 transition-colors">Earn Money</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Get paid directly and securely</p>
            </div>
            <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
              <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <i className="ph ph-wallet text-5xl text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          {/* Grow Your Business Card */}
          <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
            <div className="w-full flex flex-col items-start text-left mb-8">
              <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-purple-600 transition-colors">Grow Your Business</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Get reviews and boost ranking</p>
            </div>
            <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
              <div className="w-24 h-24 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <i className="ph ph-trend-up text-5xl text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-100 dark:border-slate-800 dark:bg-slate-950 transition-colors">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-8">
          Frequently asked questions
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
          {/* Column 1 */}
          <div className="space-y-4">
            {FAQ_ITEMS[0].map((item, idx) => {
              const id = `col1-${idx}`;
              const isOpen = !!openFaq[id];
              return (
                <div key={id} className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-800 transition-all duration-300 ${isOpen ? 'border-green-500 shadow-sm shadow-green-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                  <button
                    onClick={() => toggleFaq(id)}
                    className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white transition-colors animate-fade-in"
                  >
                    <span>{item.q}</span>
                    <i className={`ph ph-caret-down text-lg text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-green-600' : ''}`}></i>
                  </button>
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      isOpen ? 'max-h-[300px] border-t border-slate-100 dark:border-slate-700' : 'max-h-0'
                    }`}
                  >
                    <div className="p-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900">
                      {item.a}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Column 2 */}
          <div className="space-y-4">
            {FAQ_ITEMS[1].map((item, idx) => {
              const id = `col2-${idx}`;
              const isOpen = !!openFaq[id];
              return (
                <div key={id} className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-800 transition-all duration-300 ${isOpen ? 'border-green-500 shadow-sm shadow-green-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                  <button
                    onClick={() => toggleFaq(id)}
                    className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white transition-colors animate-fade-in"
                  >
                    <span>{item.q}</span>
                    <i className={`ph ph-caret-down text-lg text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-green-600' : ''}`}></i>
                  </button>
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      isOpen ? 'max-h-[300px] border-t border-slate-100 dark:border-slate-700' : 'max-h-0'
                    }`}
                  >
                    <div className="p-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900">
                      {item.a}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <FlightFooter />
    </div>
  );
}
