import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js'];

export default function DetailsPage() {
  useEffect(() => { document.title = 'BookingCart — Details'; }, []);
  useLegacyScripts(SCRIPTS, 'details');
  return (
    <>
        <main className="flex-grow container mx-auto px-6 py-8" data-step="details">
      
          
          <div className="flex items-center gap-4 mb-8 overflow-x-auto no-scrollbar steps text-sm font-medium">
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="search" href="/">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-medium">1</span>
              Search
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
              data-step-id="results" href="/results">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-xs font-medium">2</span>
              Results
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white border border-slate-900 whitespace-nowrap"
              data-step-id="details" href="#">
              <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium">3</span>
              Details
            </a>
            <a className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 whitespace-nowrap"
              data-step-id="passengers" href="#">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium">4</span>
              Passengers
            </a>
          </div>
      
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" data-details>
      
            
            
      
            <section className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-medium text-slate-900 dark:text-slate-100">Flight Details</h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Review the full breakdown, fare rules, and baggage allowances.</p>
      
              
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6" id="flight-segments-container">
                <h2 className="font-medium text-lg text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><i
                    className="ph-duotone ph-airplane-tilt text-green-600 text-xl"></i> Trip Breakdown</h2>
                <hr className="border-slate-100 my-4" />
                <div className="text-sm text-slate-500 dark:text-slate-400 py-4 flex justify-center items-center"><i
                    className="ph-bold ph-spinner-gap animate-spin mr-2"></i> Loading flight details...</div>
              </div>
      
              
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="font-medium text-lg text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><i
                    className="ph-duotone ph-receipt text-green-600 text-xl"></i> Fare Rules</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Typical rules for this fare class.</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">Refund Policy</span>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Refundable with fee</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">Changes</span>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Allowed (fare difference applies)</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">No-show</span>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Ticket forfeited</span>
                  </div>
                </div>
              </div>
      
              
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="font-medium text-lg text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><i
                    className="ph-duotone ph-suitcase text-green-600 text-xl"></i> Baggage</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
                    <i className="ph-fill ph-bag text-2xl text-slate-400 mb-2"></i>
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Personal Item</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Included</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
                    <i className="ph-fill ph-suitcase-rolling text-2xl text-slate-400 mb-2"></i>
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Carry-on</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">7kg Included</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-center border border-dashed border-slate-300">
                    <i className="ph-fill ph-archive-box text-2xl text-slate-300 mb-2"></i>
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">Checked Bag</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">0-1 (Varies)</div>
                  </div>
                </div>
              </div>
      
            </section>
      
            
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 shadow-lg p-6 sticky top-24">
                <h2 className="font-medium text-lg text-slate-900 dark:text-slate-100 mb-4">Your Selection</h2>
      
                <div className="mb-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Airline</div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 flex items-center justify-center overflow-hidden shadow-sm"
                      data-airline-logo>
                      <div className="w-full h-full flex items-center justify-center text-slate-900 dark:text-slate-100 font-medium">â€”</div>
                    </div>
                    <div className="text-xl font-medium text-slate-900 dark:text-slate-100" data-airline>â€”</div>
                  </div>
                </div>
      
                <div className="mb-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Schedule</div>
                  <div className="font-medium text-slate-900 dark:text-slate-100" data-times>â€”</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1" data-duration>â€”</div>
                </div>
      
                <hr className="border-slate-100 my-4" />
      
                <div className="flex justify-between items-end mb-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Total Price</span>
                  <span className="text-2xl font-semibold text-green-600" data-price>â€”</span>
                </div>
                <div className="text-xs text-right text-slate-400 mb-6">Includes taxes and fees</div>
      
                <button
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2"
                  data-select-flight>
                  Select Flight <i className="ph-bold ph-arrow-right"></i>
                </button>
              </div>
            </aside>
      
          </div>
        </main>
      <FlightFooter />
    </>
  );
}
