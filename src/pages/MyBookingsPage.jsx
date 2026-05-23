import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  '/js/loading-ui.js',
  '/js/auth.js',
  '/js/my-bookings-page.js'
];

export default function MyBookingsPage() {
  useEffect(() => { document.title = 'My Bookings | BookingCart'; }, []);
  useLegacyScripts(SCRIPTS, 'my-bookings');
  return (
    <>
          <div className="container mx-auto px-6 py-8 flex gap-8 max-w-7xl">
      
              
              <aside className="w-64 flex-shrink-0 hidden lg:block">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 overflow-hidden">
                      
                      <div className="p-5 border-b border-slate-100" id="sidebar-user">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                  <i className="ph ph-user text-green-600 text-xl"></i>
                              </div>
                              <div>
                                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100" id="user-name">Guest</div>
                                  <div className="text-xs text-slate-400" id="user-email">Sign in to view bookings</div>
                              </div>
                          </div>
                      </div>
                      
                      <nav className="p-3">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">My Bookings</div>
                          <a href="#" data-sidebar-filter="all"
                              className="sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-green-600 bg-green-50 transition-all">
                              <i className="ph ph-list-bullets text-lg"></i> All
                          </a>
                          <a href="#" data-sidebar-filter="flights"
                              className="sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">
                              <i className="ph ph-airplane text-lg"></i> Flights
                          </a>
                          <div className="border-t border-slate-100 my-2 mx-3"></div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">Account</div>
                          <a href="#"
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">
                              <i className="ph ph-heart text-lg"></i> Saved
                          </a>
                          <a href="#"
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">
                              <i className="ph ph-bell text-lg"></i> Price Alerts
                          </a>
                      </nav>
                  </div>
              </aside>
      
              
              <main className="flex-1 min-w-0">
                  
                  <div className="flex items-center justify-between mb-6">
                      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">My Bookings</h1>
                      <div className="text-xs text-slate-400 font-medium" id="booking-count"></div>
                  </div>
      
                  
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-5 mb-6" id="lookup-section">
                      <div className="flex gap-3">
                          <div className="flex-1 relative">
                              <i className="ph ph-envelope absolute left-4 top-3.5 text-slate-400 text-xl"></i>
                              <input id="lookup-email" type="email" placeholder="Enter your email to find bookings"
                                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 pl-12 text-sm font-semibold" />
                          </div>
                          <button id="lookup-btn"
                              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 rounded-xl transition-all flex items-center gap-2 text-sm">
                              <i className="ph ph-magnifying-glass"></i> Find
                          </button>
                      </div>
                  </div>
      
                  
                  <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 p-1.5 mb-6">
                      <button data-tab="all"
                          className="tab-active flex-1 py-2.5 rounded-xl text-sm font-bold transition-all">All</button>
                      <button data-tab="new"
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">Awaiting
                          Confirmation</button>
                      <button data-tab="confirmed"
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">Confirmed</button>
                      <button data-tab="cancelled"
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">Cancelled</button>
                      <button data-tab="saved"
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all">Saved</button>
                  </div>
      
                  
                  <div id="loading" className="text-center py-12 text-slate-400" style={{"display":"none"}}>
                      <i className="ph ph-circle-notch text-3xl animate-spin"></i>
                      <p className="mt-2 text-sm font-medium">Finding your bookings...</p>
                  </div>
      
                  
                  <div id="empty-state" className="text-center py-16" style={{"display":"none"}}>
                      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
                          <i className="ph ph-airplane-tilt text-3xl text-slate-300"></i>
                      </div>
                      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No bookings found</h3>
                      <p className="text-sm text-slate-400 mb-6">Your booked trips will appear here.</p>
                      <a href="/"
                          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm">
                          <i className="ph ph-magnifying-glass"></i> Search Flights
                      </a>
                  </div>
      
                  
                  <div id="bookings-list" className="space-y-4"></div>

                  {/* Saved Flights Section */}
                  <div id="saved-flights-section" className="hidden">
                      <div id="saved-flights-list" className="space-y-4"></div>
                  </div>
              </main>
      
      
          </div>
          <FlightFooter />
    </>
  );
}
