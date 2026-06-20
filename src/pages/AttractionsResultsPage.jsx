import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AttractionsResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const query = new URLSearchParams(location.search).get('q') || '';
  
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noKey, setNoKey] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [searchQuery, setSearchQuery] = useState(query);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }

    async function fetchTours() {
      setLoading(true);
      setError(null);
      setNoKey(false);
      
      try {
        const res = await fetch(`/api/gyg-search?q=${encodeURIComponent(query)}&currency=${currency}`);
        const data = await res.json();
        
        if (data.error && data.error.includes('GETYOURGUIDE_API_KEY not configured')) {
          setNoKey(true);
        } else if (!data.ok) {
          setError(data.error || 'Failed to fetch tours');
        } else {
          setTours(data.tours || []);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Network error while fetching tours');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTours();
  }, [query, currency]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/attractions/results?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const renderStars = (rating) => {
    if (!rating) return null;
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const stars = [];
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={`full-${i}`} className="ph-fill ph-star text-yellow-400"></i>);
    }
    if (hasHalf) {
      stars.push(<i key="half" className="ph-fill ph-star-half text-yellow-400"></i>);
    }
    
    return <div className="flex gap-0.5">{stars}</div>;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header / Search Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i className="ph ph-ticket text-green-600"></i>
              Experiences in {query || '...'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Book tickets, tours, and activities</p>
          </div>
          
          <form onSubmit={handleSearch} className="w-full sm:w-auto flex flex-1 max-w-md items-center gap-2 bg-slate-100 dark:bg-slate-700/50 rounded-xl px-2 py-1">
            <i className="ph ph-magnifying-glass text-slate-400 text-lg ml-2"></i>
            <input 
              type="text" 
              placeholder="Search destination or activity..."
              className="w-full bg-transparent border-none text-slate-900 dark:text-white placeholder:text-slate-500 py-2 focus:ring-0 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="bg-slate-900 dark:bg-slate-600 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">
              Search
            </button>
          </form>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="h-48 bg-slate-200 dark:bg-slate-700"></div>
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
                  <div className="pt-2"><div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div></div>
                </div>
              </div>
            ))}
          </div>
        ) : noKey ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center shadow-sm border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mt-12">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ph ph-key text-3xl text-slate-400"></i>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">GetYourGuide API Key Missing</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              To fetch live attractions and tours, you need to configure the GetYourGuide Partner API key.
            </p>
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl text-left border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-600 dark:text-slate-300">
              # In your .env file:<br />
              GETYOURGUIDE_API_KEY=your_token_here
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-2xl text-center border border-red-100 dark:border-red-900/50">
            <i className="ph ph-warning-circle text-3xl mb-2"></i>
            <p className="font-medium">{error}</p>
          </div>
        ) : tours.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center shadow-sm border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mt-12">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ph ph-magnifying-glass text-3xl text-slate-400"></i>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No experiences found</h2>
            <p className="text-slate-500 dark:text-slate-400">Try searching for a different city or landmark.</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4 px-1">
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                Showing {tours.length} results
              </p>
              <div className="flex gap-2">
                <select 
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 outline-none"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {tours.map(tour => (
                <a 
                  key={tour.id} 
                  href={tour.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 transition-all group flex flex-col"
                >
                  <div className="relative h-48 overflow-hidden bg-slate-100">
                    {tour.image_url ? (
                      <img 
                        src={tour.image_url} 
                        alt={tour.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <i className="ph ph-image text-3xl"></i>
                      </div>
                    )}
                    {tour.duration && (
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                        <i className="ph ph-clock"></i> {tour.duration}
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <div className="text-xs font-bold text-green-600 mb-1 flex gap-1 items-center uppercase tracking-wide">
                      {tour.categories && tour.categories[0] ? tour.categories[0].name : 'Experience'}
                    </div>
                    
                    <h3 className="font-bold text-slate-900 dark:text-white leading-snug mb-2 flex-1 group-hover:text-green-600 transition-colors line-clamp-3">
                      {tour.title}
                    </h3>
                    
                    <div className="flex items-center gap-1.5 mb-4">
                      {renderStars(tour.rating)}
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {tour.rating ? tour.rating.toFixed(1) : 'New'}
                      </span>
                      {tour.review_count > 0 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({tour.review_count.toLocaleString()})
                        </span>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-end justify-between mt-auto">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">From</p>
                        <p className="font-black text-lg text-slate-900 dark:text-white leading-none">
                          {tour.price ? `${tour.currency} ${tour.price}` : 'Check price'}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-green-50 group-hover:text-green-600 transition-colors">
                        <i className="ph-bold ph-arrow-up-right"></i>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
            
            <div className="mt-8 text-center text-sm text-slate-500">
              Powered by <a href="https://www.getyourguide.com" target="_blank" rel="noreferrer" className="font-bold text-slate-700 dark:text-slate-300 hover:text-green-600">GetYourGuide</a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
