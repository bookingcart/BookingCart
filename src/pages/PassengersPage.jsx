import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js'];

export default function PassengersPage() {
  useEffect(() => { document.title = 'BookingCart — Passengers'; }, []);
  useLegacyScripts(SCRIPTS, 'passengers');
  return (
    <>
        <main className="flex-grow container mx-auto px-6 py-8" data-step="passengers">
      
          
          <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar steps text-sm font-medium">
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="search" href="/">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">1</span>
              Search
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="results" href="/results">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">2</span>
              Results
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="details" href="/details">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold">3</span>
              Details
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white border border-slate-900 whitespace-nowrap"
              data-step-id="passengers" href="/passengers">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">4</span>
              Passengers
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 whitespace-nowrap"
              data-step-id="extras" href="#">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold">5</span>
              Extras
            </a>
          </div>
      
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" data-passenger-page>
      
            
            <section className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Passenger Information</h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Add traveler details and contact info for ticket delivery.</p>
      
              <form data-passenger-form className="space-y-6">
      
                
                <div className="space-y-6" data-travelers>
                  
                </div>
      
                
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2"><i
                      className="ph-duotone ph-envelope-simple text-green-600 text-xl"></i> Booking Delivery & Contact</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This information is used by BookingCart to email your e-tickets and notify you of flight changes.</p>
                  <hr className="border-slate-100 mb-4" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Email
                        Address</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none"
                        name="email" type="email" placeholder="you@example.com" required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                      <input
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none"
                        name="phone" placeholder="+1 555 000 000" required />
                    </div>
                  </div>
                </div>
      
                <div className="flex justify-end pt-4">
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center gap-2"
                    type="submit">
                    Continue to Extras <i className="ph-bold ph-arrow-right"></i>
                  </button>
                </div>
              </form>
      
            </section>
      
            
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-lg p-6 sticky top-24">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">Traveler Tips</h2>
                  <a href="/" className="text-xs font-bold text-green-600 hover:underline">Change Pax</a>
                </div>
      
                <div className="bg-green-50 rounded-xl p-4 mb-4">
                  <div className="flex gap-3">
                    <i className="ph-fill ph-info text-green-600 text-xl flex-shrink-0"></i>
                    <div>
                      <div className="font-bold text-green-900 text-sm mb-1">Legal Names</div>
                      <div className="text-xs text-green-700 leading-relaxed">Please use the traveler's legal name as it appears on
                        their government ID.</div>
                    </div>
                  </div>
                </div>
      
                <hr className="border-slate-100 my-4" />
      
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                    <i className="ph-fill ph-lock-key text-emerald-500 text-lg"></i> Passenger details are used for this booking flow
                  </div>
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                    <i className="ph-fill ph-shield-check text-emerald-500 text-lg"></i> Secure checkout styling
                  </div>
                </div>
      
              </div>
            </aside>
      
          </div>
        </main>
      <FlightFooter />
    </>
  );
}
