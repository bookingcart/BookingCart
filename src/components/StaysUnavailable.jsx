import { Link } from 'react-router-dom';
import { FlightFooter } from './FlightFooter.jsx';

export function StaysUnavailable({ title = 'Stays are unavailable' }) {
  return (
    <>
      <main className="max-w-4xl mx-auto px-4 py-14">
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <i className="ph ph-bed text-3xl text-slate-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
            Hotel inventory, pricing, room policies, and checkout are not connected to a live provider yet. BookingCart will not show demo hotel listings or estimated stay prices.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <Link to="/" className="btn-primary inline-flex">Search flights</Link>
            <Link to="/support" className="btn-secondary inline-flex">Contact support</Link>
          </div>
        </div>
      </main>
      <FlightFooter />
    </>
  );
}
