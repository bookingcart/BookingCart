import { useEffect, useState } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';

const FLIGHT_SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js?v=4','/js/deals.js?v=1'];

const HERO_IMAGES = [
  '/images/hero-bg.jpg',
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop'
];

const FAQ_ITEMS = [
  [
    {
      q: "How do I find the cheapest flights on BookingCart?",
      a: "You can easily find the cheapest flights on BookingCart by sorting by 'Lowest Price', filtering by your budget, and looking for our orange 'Hot Deal' badge, which highlights flights with exceptional discounts."
    },
    {
      q: "Can I book one-way flights on BookingCart?",
      a: "Yes, you can book one-way, round-trip, or multi-city flights on BookingCart. Simply select the 'One-Way Trip' or 'Round Trip' tab at the top of the search panel before hitting search."
    },
    {
      q: "How far in advance can I book a flight?",
      a: "You can book flights up to 1 year (365 days) in advance on BookingCart. Planning ahead usually gives you access to the best prices and seat availability."
    }
  ],
  [
    {
      q: "Do flights get cheaper closer to departure?",
      a: "Generally, flight prices tend to increase as the departure date gets closer. Booking at least 3 to 4 weeks in advance is highly recommended to secure the best rates."
    },
    {
      q: "What is a flexible ticket?",
      a: "A flexible ticket allows you to change your flight date or time with the same airline without paying any change fees. You only need to pay the fare difference if the new flight is more expensive."
    },
    {
      q: "Does BookingCart charge credit card fees?",
      a: "No, BookingCart does not charge credit card fees, hidden payment fees, or service fees. The price you see at checkout is the final price you will pay."
    }
  ]
];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState({});
  const toggleFaq = (id) => {
    setOpenFaq(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { document.title = 'BookingCart — Fly Anywhere'; }, []);
  useLegacyScripts(FLIGHT_SCRIPTS, 'home');

  return (
    <>
        <section
          className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 min-h-[500px] flex flex-col items-center justify-center text-center px-4 dark:bg-slate-950 transition-colors"
          data-step="search">
      
          
          <div className="absolute inset-0 z-0 select-none pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-white/90 dark:from-slate-950/95 via-white/50 dark:via-slate-950/70 to-white/20 dark:to-slate-950/30 z-10 rounded-b-[40px]"></div>
            {HERO_IMAGES.map((src, index) => (
              <img
                key={src}
                src={src}
                className={`absolute inset-0 w-full h-full object-cover object-center rounded-b-[40px] transition-opacity duration-1000 ease-in-out ${index === currentHeroIndex ? 'opacity-100' : 'opacity-0'}`}
                alt="Sky background"
                onError={(e) => {
                  if (e.currentTarget.src !== HERO_IMAGES[1]) {
                    e.currentTarget.src = HERO_IMAGES[1];
                  }
                }}
              />
            ))}
          </div>
      
          
          <div className="relative z-10 max-w-4xl w-full mx-auto">
            <h1 className="text-5xl lg:text-7xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight mb-4">
              Fly Anywhere
            </h1>
            <p className="text-lg lg:text-xl text-slate-600 dark:text-slate-300 font-medium mb-8">
              Affordable Flights, Premium Service.
            </p>
      
      
            
            <div className="mt-6 sm:mt-8 w-full max-w-7xl mx-auto text-left" role="region" aria-label="Search panel">
      
              
              <div className="inline-flex bg-white dark:bg-slate-800/60 dark:bg-slate-800/80 backdrop-blur rounded-xl p-1 shadow-sm border border-white/80 dark:border-slate-700/80 mb-2 tabs"
                role="tablist">
                <button type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 tab sm:text-sm sm:px-4 sm:py-2 sm:rounded-xl sm:gap-2" role="tab"
                  aria-selected="true" data-trip="round">
                  <i className="ph ph-arrows-left-right text-base"></i> Round Trip
                </button>
                <button type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 tab sm:text-sm sm:px-4 sm:py-2 sm:rounded-xl sm:gap-2" role="tab"
                  aria-selected="false" data-trip="oneway">
                  <i className="ph ph-arrow-right text-base"></i> One-Way Trip
                </button>
      
              </div>
      
              
              <div className="relative z-10 max-w-7xl w-full mx-auto px-0">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-1 sm:p-1.5 shadow-lg ring-1 ring-slate-100/80 dark:ring-slate-700/80 transition-colors">
                  <form data-search-form
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] gap-0">
      
                    
                    <div className="min-w-0 sm:min-w-[11rem] lg:min-w-0 px-2 sm:px-3 py-1.5 relative suggest border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2 lg:col-start-1 lg:row-start-1">
                      <label className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="search-from">From</label>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                        <i className="ph ph-airplane-takeoff text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                        <input id="search-from"
                          className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                          name="from" data-airport-input placeholder="City or code" autoComplete="off" />
                      </div>
                      <ul className="suggest__list" role="listbox"></ul>
                    </div>
      
                    
                    <div className="min-w-0 sm:min-w-[11rem] lg:min-w-0 px-2 sm:px-3 py-1.5 relative suggest border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2 lg:col-start-2 lg:row-start-1">
                      <label className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="search-to">To</label>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                        <i className="ph ph-airplane-landing text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                        <input id="search-to"
                          className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                          name="to" data-airport-input placeholder="City or code" autoComplete="off" />
                      </div>
                      <ul className="suggest__list" role="listbox"></ul>
                    </div>
      
                    
                    <div className="min-w-0 w-full px-2 sm:px-3 py-1.5 flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0 border-b lg:border-b-0 lg:border-t border-slate-100/90 lg:col-span-3 lg:row-start-2">
                      <div className="flex-1 min-w-0 field flex flex-row items-center gap-2 sm:pr-2">
                        <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Out</span>
                        <button type="button" data-cal-trigger="depart"
                          className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                          <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="depart">Select</span>
                        </button>
                        <input type="hidden" name="depart" />
                      </div>
                      <div className="hidden sm:block w-px bg-slate-100 dark:bg-slate-700 self-center" style={{"minHeight":"2rem"}}></div>
                      <div className="flex-1 min-w-0 field group flex flex-row items-center gap-2 sm:pl-2" data-return-field>
                        <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Back</span>
                        <button type="button" data-cal-trigger="return"
                          className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                          <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="return">Select</span>
                        </button>
                        <input type="hidden" name="return" />
                      </div>
                    </div>
      
                    
                    <div className="px-2 sm:px-3 py-1.5 flex flex-row items-center gap-2 lg:gap-2.5 lg:pl-3 lg:pr-1.5 lg:col-start-3 lg:row-start-1">
                      <div className="dropdown relative flex-1 min-w-0 flex flex-row items-center gap-2" data-dropdown>
                        <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Pax</span>
                        <button className="flex-1 min-w-0 flex items-center gap-1.5 text-left bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 control sm:min-w-[6.5rem]" type="button"
                          data-dropdown-trigger data-passengers-trigger>
                          <i className="ph ph-users text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span className="font-semibold text-slate-900 dark:text-slate-200 text-xs sm:text-sm truncate" data-passengers-summary>1 traveler</span>
                        </button>
                        <input type="hidden" name="passengers" value="" />
      
                        <div className="dropdown__panel" role="dialog">
                          <div data-passengers className="space-y-4">
                            <div className="flex justify-between items-center counter">
                              <div className="counter__meta">
                                <div className="font-medium text-slate-900 dark:text-slate-200">Adults</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Age 12+</div>
                              </div>
                              <div className="flex items-center gap-3 counter__controls">
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-minus="adults"><i className="ph ph-minus"></i></button>
                                <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="adults">1</span>
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-plus="adults"><i className="ph ph-plus"></i></button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center counter">
                              <div className="counter__meta">
                                <div className="font-medium text-slate-900 dark:text-slate-200">Children</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Age 2–11</div>
                              </div>
                              <div className="flex items-center gap-3 counter__controls">
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-minus="children"><i className="ph ph-minus"></i></button>
                                <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="children">0</span>
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-plus="children"><i className="ph ph-plus"></i></button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center counter">
                              <div className="counter__meta">
                                <div className="font-medium text-slate-900 dark:text-slate-200">Infants</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Under 2</div>
                              </div>
                              <div className="flex items-center gap-3 counter__controls">
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-minus="infants"><i className="ph ph-minus"></i></button>
                                <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="infants">0</span>
                                <button
                                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors"
                                  type="button" data-plus="infants"><i className="ph ph-plus"></i></button>
                              </div>
                            </div>
      
                            <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-700">
                              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Cabin</label>
                              <select
                                className="w-full bg-slate-50 dark:bg-slate-700 dark:text-slate-200 border-none rounded-lg text-sm font-semibold p-2 focus:ring-2 focus:ring-green-500 control select transition-colors"
                                name="cabin">
                                <option>Economy</option>
                                <option>Premium Economy</option>
                                <option>Business</option>
                                <option>First</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
      
                      <button
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 sm:h-10 px-4 sm:px-5 rounded-lg sm:rounded-xl shadow-md shadow-green-600/25 transition-all flex items-center justify-center gap-1.5 btn btn-primary shrink-0 text-xs sm:text-sm"
                        type="submit">
                        <i className="ph ph-magnifying-glass text-base sm:text-lg"></i>
                        Search
                      </button>
                    </div>
      
                      <div data-multicity style={{"display":"none"}} className="p-2 border-t border-slate-100 dark:border-slate-700 lg:col-span-3">
                        <div className="text-sm text-slate-500 dark:text-slate-400">Multi-city is a UI preview.</div>
                      </div>
      
                  </form>
      
                  
                  <div id="cal-popup" className="cal-popup" style={{"display":"none"}}>
                    <div className="cal-header">
                      <button type="button" className="cal-nav" data-cal-prev><i className="ph-bold ph-caret-left"></i></button>
                      <span className="cal-title" data-cal-title></span>
                      <button type="button" className="cal-nav" data-cal-next><i className="ph-bold ph-caret-right"></i></button>
                    </div>
                    <div className="cal-weekdays">
                      <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                    </div>
                    <div className="cal-grid" data-cal-grid></div>
                  </div>
                </div>
              </div>
      
            </div>
          </div>
        </section>

        {/* USP Banner Section */}
        <section className="max-w-7xl mx-auto px-6 py-10 mb-2 dark:bg-slate-950 transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Search a huge selection */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Globe Background in Soft Green Grid */}
                  <circle cx="24" cy="24" r="18" fill="#F0FDF4" />
                  <circle cx="24" cy="24" r="18" stroke="#86EFAC" strokeWidth="1.5" strokeDasharray="3 3" />
                  {/* Longitudes & Latitudes */}
                  <path d="M24 6C24 6 29.5 13 29.5 24C29.5 35 24 42 24 42" stroke="#86EFAC" strokeWidth="1" />
                  <path d="M24 6C24 6 18.5 13 18.5 24C18.5 35 24 42 24 42" stroke="#86EFAC" strokeWidth="1" />
                  <line x1="6" y1="24" x2="42" y2="24" stroke="#86EFAC" strokeWidth="1" />
                  {/* Magnifying Glass */}
                  <circle cx="31" cy="31" r="6.5" fill="#FFFFFF" stroke="#16A34A" strokeWidth="2.5" />
                  <path d="M35.5 35.5L41.5 41.5" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Search a huge selection</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Easily compare flights, airlines, and prices – all in one place</p>
              </div>
            </div>

            {/* Pay no hidden fees */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Coin 1 Stack (Bottom Left) */}
                  <path d="M12 26C12 28.2 16 30 21 30C26 30 30 28.2 30 26V31C30 33.2 26 35 21 35C16 35 12 33.2 12 31V26Z" fill="#15803D" />
                  <path d="M12 20C12 22.2 16 24 21 24C26 24 30 22.2 30 20V25C30 27.2 26 29 21 29C16 29 12 27.2 12 25V20Z" fill="#16A34A" />
                  <ellipse cx="21" cy="20" rx="9" ry="4" fill="#4ADE80" stroke="#15803D" strokeWidth="1.5" />
                  
                  {/* Coin 2 Stack (Top Right) */}
                  <path d="M20 15C20 17.2 24 19 29 19C34 19 38 17.2 38 15V20C38 22.2 34 24 29 24C24 24 20 22.2 20 20V15Z" fill="#15803D" />
                  <ellipse cx="29" cy="15" rx="9" ry="4" fill="#86EFAC" stroke="#15803D" strokeWidth="1.5" />

                  {/* Checkmark badge */}
                  <circle cx="34" cy="26" r="7" fill="#16A34A" />
                  <circle cx="34" cy="26" r="7" stroke="#FFFFFF" strokeWidth="1.5" />
                  <path d="M31 26L33 28L37 24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Pay no hidden fees</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Get a clear price breakdown every step of the way</p>
              </div>
            </div>

            {/* Get more flexibility */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Underneath Ticket (Soft Green) */}
                  <path d="M12 28L28 38C30 39.2 32.5 38.6 33.7 36.6L38.7 28.6C39.9 26.6 39.3 24.1 37.3 22.9L21.7 12.9" fill="#DCFCE7" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" />
                  
                  {/* Top Ticket (Bright Green) */}
                  <rect x="8" y="14" width="28" height="18" rx="3" transform="rotate(-15 8 14)" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2.2" />
                  
                  {/* Ticket punch details */}
                  <path d="M19 14.5C20.1 14.2 20.7 13 20.4 11.9" stroke="#16A34A" strokeWidth="2" />
                  <path d="M22.5 27.5C21.4 27.8 20.8 29 21.1 30.1" stroke="#16A34A" strokeWidth="2" />
                  
                  {/* Airplane icon on top ticket */}
                  <path d="M20 23.5L23.5 20.5L25 23L27.5 22.5L26.5 24.2L28.2 26L26.8 26.3L25.5 25.2L23.8 26.5L23.8 24.8L20 23.5Z" fill="#16A34A" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Get more flexibility</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Change your travel dates with the Flexible ticket option</p>
              </div>
            </div>
          </div>
        </section>
      
        
        <section id="deals-section" className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">
      
          
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
            <div>
              <div
                className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold text-xs px-3 py-1.5 rounded-full mb-3">
                <i className="ph ph-fire text-base"></i> Personalized for You
              </div>
              <h2 id="deals-title" className="text-3xl font-extrabold text-slate-900 dark:text-white">Top Flight Deals</h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Real-time prices · Updated every 2 hours</p>
            </div>
      
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm transition-colors">
                <i className="ph ph-map-pin text-green-600 dark:text-green-400"></i>
                <input id="deals-origin-input" type="text" maxLength="3" placeholder="IATA e.g. LHR"
                  className="w-20 bg-transparent font-semibold text-slate-700 dark:text-slate-200 uppercase" />
              </div>
              <button id="deals-origin-btn"
                className="bg-slate-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-700 transition-all">
                Change
              </button>
            </div>
          </div>
      
          
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-6 transition-colors">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
      
              
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Sort:</span>
                <button data-sort="price"
                  className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-green-600 text-white transition-all">💰 Lowest
                  Price</button>
                <button data-sort="popular"
                  className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-all">⭐
                  Popular</button>
                <button data-sort="trending"
                  className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-all">🔥
                  Trending</button>
              </div>
      
              <div className="hidden lg:block w-px h-8 bg-slate-200 dark:bg-slate-600 mx-2"></div>
      
              
              <div className="flex items-center gap-4 flex-wrap text-sm">
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Budget:</span>
                  <input id="deals-min-price" type="range" min="0" max="2000" step="50" value="0"
                    className="w-20 accent-green-600" />
                  <input id="deals-max-price" type="range" min="200" max="5000" step="50" value="5000"
                    className="w-20 accent-green-600" />
                  <span id="deals-price-label" className="text-xs font-semibold text-slate-600 dark:text-slate-300">$0 – $5000+</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Month:</span>
                  <select id="deals-month"
                    className="bg-slate-50 dark:bg-slate-700 dark:text-slate-200 border-none rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <option value="">Any</option>
                    <option value="03">Mar</option>
                    <option value="04">Apr</option>
                    <option value="05">May</option>
                    <option value="06">Jun</option>
                    <option value="07">Jul</option>
                    <option value="08">Aug</option>
                    <option value="09">Sep</option>
                    <option value="10">Oct</option>
                    <option value="11">Nov</option>
                    <option value="12">Dec</option>
                  </select>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input id="deals-direct-only" type="checkbox" className="accent-green-600 w-4 h-4" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Direct only</span>
                </label>
              </div>
            </div>
          </div>
      
          
          <div className="relative">
            {/* Left arrow */}
            <button
              id="deals-prev"
              className="absolute -left-4 top-[45%] -translate-y-1/2 z-10 w-9 h-9 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white hover:shadow-xl transition-all hidden sm:flex"
              aria-label="Scroll left"
            >
              <i className="ph ph-caret-left text-sm font-bold"></i>
            </button>

            <div
              id="deals-grid"
              className="flex flex-row gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"
            ></div>

            {/* Right arrow */}
            <button
              id="deals-next"
              className="absolute -right-4 top-[45%] -translate-y-1/2 z-10 w-9 h-9 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white hover:shadow-xl transition-all hidden sm:flex"
              aria-label="Scroll right"
            >
              <i className="ph ph-caret-right text-sm font-bold"></i>
            </button>
          </div>
      
          
          <div className="text-center mt-10">
            <a href="/results"
              className="inline-flex items-center gap-2 border-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-bold px-8 py-3 rounded-2xl transition-all text-sm">
              <i className="ph ph-magnifying-glass"></i> Search More Flights
            </a>
          </div>
        </section>

        {/* For travel pros section */}
        <section className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-8 tracking-tight">For travel pros</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Explore Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Explore</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">See destinations on your budget</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="70" cy="70" r="50" fill="#E2E8F0" className="dark:fill-slate-700" />
                  <circle cx="70" cy="70" r="50" fill="url(#globe-grad)" opacity="0.8" />
                  <path d="M40 50C55 40 85 40 100 50C110 60 110 80 100 90C85 100 55 100 40 90C30 80 30 60 40 50Z" stroke="white" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
                  <circle cx="85" cy="55" r="24" fill="white" stroke="#16A34A" strokeWidth="4" />
                  <path d="M102 72L116 86" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" />
                  <path d="M78 50L85 57L92 50" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="globe-grad" x1="20" y1="20" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#38BDF8" />
                      <stop offset="1" stopColor="#818CF8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Trips Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Trips</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Keep all your plans in one place</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="25" y="45" width="90" height="60" rx="4" fill="#F1F5F9" className="dark:fill-slate-700" transform="rotate(-10 70 75)" />
                  <path d="M30 50L110 35M25 70L105 55M20 90L100 75" stroke="#CBD5E1" strokeWidth="1" className="dark:stroke-slate-600" />
                  <rect x="50" y="30" width="40" height="50" rx="4" fill="#F8FAFC" stroke="#16A34A" strokeWidth="2" className="dark:fill-slate-800" />
                  <path d="M55 40H85M55 48H75M55 56H80" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
                  <rect x="40" y="70" width="30" height="20" rx="2" fill="#F59E0B" />
                  <circle cx="48" cy="90" r="4" fill="#475569" />
                  <circle cx="62" cy="90" r="4" fill="#475569" />
                  <path d="M45 75H65M45 80H65" stroke="white" strokeWidth="1" opacity="0.5" />
                </svg>
              </div>
            </div>

            {/* Price Alerts Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Price Alerts</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Know when prices change</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="45" y="30" width="50" height="85" rx="8" fill="#38BDF8" transform="rotate(15 70 72)" />
                  <rect x="49" y="35" width="42" height="75" rx="4" fill="white" className="dark:fill-slate-800" transform="rotate(15 70 72)" />
                  <path d="M55 50L85 58M53 58L83 66M51 66L81 74" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-slate-700" />
                  <circle cx="50" cy="45" r="16" fill="#F97316" />
                  <path d="M50 38C46 38 44 41 44 44C44 47 41 49 41 51H59C59 49 56 47 56 44C56 41 54 38 50 38Z" fill="white" />
                  <circle cx="50" cy="53" r="2" fill="white" />
                  <path d="M30 80L35 85M110 50L105 55M95 100L100 95M40 40L35 35" stroke="#F97316" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                  <circle cx="35" cy="65" r="2" fill="#38BDF8" />
                  <circle cx="105" cy="75" r="3" fill="#16A34A" />
                  <circle cx="85" cy="35" r="2" fill="#F59E0B" />
                </svg>
              </div>
            </div>

            {/* Flight Tracker Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Flight Tracker</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">See real-time delays</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="20" y="65" width="100" height="60" rx="6" fill="#1E293B" transform="rotate(-15 70 95)" />
                  <rect x="25" y="70" width="90" height="50" rx="3" fill="#38BDF8" transform="rotate(-15 70 95)" opacity="0.9" />
                  <path d="M35 85Q70 60 105 95" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M45 45L70 30L65 40L90 45L45 75L50 60L35 55L45 45Z" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1" />
                  <path d="M70 30L65 40L90 45" fill="#E2E8F0" />
                  <circle cx="100" cy="50" r="12" fill="#F59E0B" />
                  <circle cx="95" cy="55" r="8" fill="#F8FAFC" opacity="0.9" />
                  <circle cx="105" cy="55" r="6" fill="#F8FAFC" opacity="0.9" />
                  <rect x="90" y="85" width="24" height="24" rx="4" fill="white" className="dark:fill-slate-800" stroke="#16A34A" strokeWidth="2" transform="rotate(-15 102 97)" />
                  <path d="M96 92L108 102M108 92L96 102" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" transform="rotate(-15 102 97)" />
                </svg>
              </div>
            </div>

          </div>
        </section>

        {/* Dynamic Top Flights from Location Section */}
        <section id="popular-routes-section" className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-100 dark:border-slate-800 dark:bg-slate-950 transition-colors">
          <h2 id="popular-routes-title" className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
            Top flights from Romania
          </h2>
          <p id="popular-routes-subtitle" className="text-slate-500 dark:text-slate-400 font-medium mb-6">
            Explore destinations you can reach from Romania and start making new plans
          </p>

          {/* Dynamic tabs list */}
          <div id="popular-routes-tabs" className="flex flex-wrap gap-2 mb-8">
            <button data-tab="popular" className="px-4 py-2 text-sm font-bold rounded-full border border-green-600 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 transition-all cursor-pointer">
              Popular routes
            </button>
            <button data-tab="cities" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Cities
            </button>
            <button data-tab="countries" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Countries
            </button>
            <button data-tab="regions" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Regions
            </button>
            <button data-tab="airports" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Airports
            </button>
          </div>

          {/* Grid of routes */}
          <div id="popular-routes-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {/* Populated dynamically by deals.js */}
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
      
    </>

  );
}
