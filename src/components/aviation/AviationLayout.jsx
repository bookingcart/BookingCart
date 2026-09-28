import { FlightFooter } from "../FlightFooter.jsx";

export default function AviationLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      <main>{children}</main>
      <FlightFooter />
    </div>
  );
}
