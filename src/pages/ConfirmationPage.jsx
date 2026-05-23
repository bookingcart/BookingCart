import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js'];

export default function ConfirmationPage() {
  useEffect(() => { document.title = 'BookingCart — Confirmed'; }, []);
  useLegacyScripts(SCRIPTS, 'confirmation');
  return (
    <>
        <main className="flex-grow flex flex-col items-center justify-center p-6 bg-[#16a34a] min-h-[80vh]"
          data-step="confirmation">
      
          
          <div className="text-center mb-10 w-full max-w-2xl px-4">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight leading-tight">Thank you for booking
              with us!</h1>
            <p className="text-green-100/90 text-lg md:text-xl font-medium">Your trip has been confirmed and your ticket is ready.
            </p>
          </div>
      
          <div className="w-full max-w-[600px] relative px-4" data-confirmation>
      
            
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl overflow-hidden relative pb-[1px] w-full">
      
              
              <div className="p-8 pb-10">
                
                <div className="flex justify-between items-center mb-10">
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-200 tracking-tight" data-confirm-airline>TransitZen</div>
                  <div className="px-4 py-1.5 bg-rose-50 text-rose-600 font-bold text-xs rounded-full uppercase tracking-wider">
                    Confirmed</div>
                </div>
      
                
                <div className="flex items-center justify-between relative z-10">
      
                  
                  <div className="text-left w-[38%]">
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-2 leading-none" data-confirm-origin-city>London
                    </div>
                    <div className="text-sm font-semibold text-slate-400 mb-2 truncate max-w-full">Origin</div>
                    <div className="text-sm font-bold text-slate-600 dark:text-slate-400" data-confirm-origin-time>Wed Aug, 11:30</div>
                  </div>
      
                  
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-4 flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-24 md:w-32 flex items-center justify-center relative">
                      
                      <div className="absolute w-full h-[2px] border-t-2 border-dashed border-slate-200 top-1/2 -translate-y-1/2">
                      </div>
                      
                      <div className="bg-white dark:bg-slate-800 px-3 relative z-10 text-[#16a34a] flex items-center justify-center">
                        <i className="ph-fill ph-airplane-tilt text-3xl mb-1"></i>
                      </div>
                    </div>
                    <div className="text-xs font-extrabold text-slate-400 text-center mt-3" data-confirm-duration>4h 30m<br /><span
                        className="font-semibold opacity-70">Direct</span></div>
                  </div>
      
                  
                  <div className="text-right w-[38%]">
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-2 leading-none" data-confirm-dest-city>Bristol</div>
                    <div className="text-sm font-semibold text-slate-400 mb-2 truncate max-w-full">Destination</div>
                    <div className="text-sm font-bold text-slate-600 dark:text-slate-400" data-confirm-dest-time>Wed Aug, 13:30</div>
                  </div>
      
                </div>
              </div>
      
              
              <div className="relative flex items-center justify-center w-full z-20">
                
                <div
                  className="absolute left-0 w-10 h-10 rounded-full bg-[#16a34a] -translate-x-1/2 top-[50%] -translate-y-[50%]">
                </div>
      
                
                <div className="w-full border-t-[3px] border-dashed border-slate-200 mx-8"></div>
      
                
                <div
                  className="absolute right-0 w-10 h-10 rounded-full bg-[#16a34a] translate-x-1/2 top-[50%] -translate-y-[50%]">
                </div>
              </div>
      
              
              <div className="p-8 pt-8 flex sm:flex-row flex-col gap-6 justify-between sm:items-center bg-white dark:bg-slate-800 relative z-10">
      
                <div className="flex gap-8 justify-between w-full sm:w-auto">
                  
                  <div>
                    <div className="text-sm font-semibold text-slate-400 mb-1">Seats</div>
                    <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-200" data-confirm-seats>42</div>
                  </div>
      
                  
                  <div>
                    <div className="text-sm font-semibold text-slate-400 mb-1">Gate</div>
                    <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-200" data-confirm-platform>56</div>
                  </div>
      
                  
                  <div className="self-start">
                    <div className="text-sm font-semibold text-slate-400 mb-1">Price</div>
                    <div className="text-2xl font-extrabold text-[#16a34a]" data-confirm-total>$320</div>
                  </div>
                </div>
      
                
                <a href="/my-bookings"
                  className="bg-[#16a34a] hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg shadow-green-600/30 whitespace-nowrap text-center text-lg flex items-center justify-center mt-6 sm:mt-0">
                  View Details
                </a>
      
              </div>
      
            </div>
      
            
            <div className="text-center mt-6 tracking-wide">
              <span className="text-green-100/60 text-xs font-bold uppercase tracking-widest">Booking Ref: <span data-booking-ref
                  className="text-white ml-2">-------</span></span>
              <div className="mt-2 text-sm font-semibold text-green-100/90" data-payment-status>Waiting for payment confirmation</div>
            </div>
      
          </div>
        </main>
      <FlightFooter />
    </>
  );
}
