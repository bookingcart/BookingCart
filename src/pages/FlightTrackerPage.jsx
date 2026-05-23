import React, { useState } from 'react';

export default function FlightTrackerPage() {
  const [activeTab, setActiveTab] = useState('flightNumber');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  return (
    <div 
      className="min-h-[calc(100vh-80px)] w-full flex items-center justify-center p-6 relative"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1542224566-6e85f2e6772f?q=80&w=2000&auto=format&fit=crop")',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Dark overlay for better readability if needed, though Kayak screenshot doesn't have one, the image is quite contrasting */}
      <div className="absolute inset-0 bg-black/10"></div>
      
      <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-6 tracking-tight">Flight Tracker</h1>
        
        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
          <button 
            type="button"
            onClick={() => setActiveTab('flightNumber')}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === 'flightNumber' 
                ? 'border-slate-900 text-slate-900' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Flight number
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('airport')}
            className={`pb-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === 'airport' 
                ? 'border-slate-900 text-slate-900' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Airport
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'flightNumber' && (
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Airline" 
              className="w-full bg-slate-50 border-none rounded-md px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 transition-shadow"
            />
            <input 
              type="text" 
              placeholder="Flight Number" 
              className="w-full bg-slate-50 border-none rounded-md px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 transition-shadow"
            />
            <div className="relative">
              <i className="ph ph-calendar-blank absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-md pl-11 pr-4 py-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-orange-500 transition-shadow"
              />
            </div>
            
            <button 
              type="button"
              className="w-full mt-2 bg-[#FF5C35] hover:bg-[#e04a25] text-white font-bold py-3.5 rounded-md transition-colors"
              onClick={() => alert('Flight tracking feature coming soon!')}
            >
              Track Flight
            </button>
          </div>
        )}

        {activeTab === 'airport' && (
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Airport (required)" 
              className="w-full bg-slate-50 border-none rounded-md px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 transition-shadow"
            />
            <input 
              type="text" 
              placeholder="Airline (optional)" 
              className="w-full bg-slate-50 border-none rounded-md px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500 transition-shadow"
            />
            
            <div className="flex gap-4">
              <div className="relative flex-1">
                <i className="ph ph-calendar-blank absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-md pl-10 pr-3 py-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-orange-500 transition-shadow"
                />
              </div>
              <div className="relative flex-1">
                <select className="w-full bg-slate-50 border-none rounded-md px-3 py-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-orange-500 transition-shadow appearance-none">
                  <option>Morning 6:00am - 12:00pm</option>
                  <option>Afternoon 12:00pm - 6:00pm</option>
                  <option>Evening 6:00pm - 12:00am</option>
                  <option>Night 12:00am - 6:00am</option>
                </select>
                <i className="ph ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
              </div>
            </div>

            <button 
              type="button"
              className="w-full mt-2 bg-[#FF5C35] hover:bg-[#e04a25] text-white font-bold py-3.5 rounded-md transition-colors"
              onClick={() => alert('Airport tracking feature coming soon!')}
            >
              Track Flight
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
