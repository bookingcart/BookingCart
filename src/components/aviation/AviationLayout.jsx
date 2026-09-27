import BookingCartNavbar from "../BookingCartNavbar.jsx";
import { FlightFooter } from "../FlightFooter.jsx";

export default function AviationLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f6f4ef] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <BookingCartNavbar activeNav="aviation" />
      <main>{children}</main>
      <FlightFooter />
    </div>
  );
}
