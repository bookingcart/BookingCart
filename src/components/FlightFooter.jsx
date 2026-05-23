/* ─── FlightFooter.jsx ─── */

const PAYMENT_METHODS = [
  { label: "JCB",      bg: "#003087", color: "#fff" },
  { label: "MC",       bg: "#eb001b", color: "#fff" },
  { label: "VISA",     bg: "#1a1f71", color: "#fff" },
  { label: "AMEX",     bg: "#007bc1", color: "#fff" },
  { label: "UnionPay", bg: "#c0392b", color: "#fff" },
  { label: "Diners",   bg: "#4a4a4a", color: "#fff" },
  { label: "ApplePay", bg: "#000",    color: "#fff" },
  { label: "PayPal",   bg: "#003087", color: "#ffc439" },
  { label: "Stripe",   bg: "#635bff", color: "#fff" },
];

// Real airline IATA codes — logos served from Google Flights CDN
const AIRLINES = [
  { code: "QR", name: "Qatar Airways" },
  { code: "G9", name: "Air Arabia" },
  { code: "KL", name: "KLM" },
  { code: "AA", name: "American Airlines" },
  { code: "WN", name: "Southwest" },
  { code: "UA", name: "United" },
  { code: "TK", name: "Turkish Airlines" },
  { code: "EK", name: "Emirates" },
];

function AirlineLogo({ code, name }) {
  return (
    <span
      title={name}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:border-green-300 transition-colors"
    >
      <img
        src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
        alt={name}
        width={20}
        height={20}
        className="rounded-sm object-contain"
        onError={(e) => {
          // fallback: show IATA code chip if logo fails to load
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextSibling.style.display = 'inline';
        }}
      />
      <span
        style={{ display: 'none' }}
        className="text-[9px] font-bold text-slate-500"
      >
        {code}
      </span>
      <span className="text-xs font-semibold text-slate-600">{name}</span>
    </span>
  );
}

export function FlightFooter() {
  return (
    <footer className="bg-white border-t border-slate-100" aria-label="Site Footer">

      {/* ── Main link columns ── */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Column 1 – Contact us */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Contact us</h3>
            <ul className="space-y-2.5">
              {["Customer support", "Service Guarantee", "More service info"].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-500 hover:text-green-600 transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
            {/* Social icons */}
            <div className="flex gap-3 mt-6">
              {/* Facebook */}
              <a href="#" aria-label="Facebook"
                className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-green-600 hover:border-green-400 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
              {/* X / Twitter */}
              <a href="#" aria-label="X"
                className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-green-600 hover:border-green-400 transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* YouTube */}
              <a href="#" aria-label="YouTube"
                className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-green-600 hover:border-green-400 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2 – About */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">About</h3>
            <ul className="space-y-2.5">
              {[
                "About BookingCart",
                "News",
                "Careers",
                "Terms & Conditions",
                "Privacy Statement",
                "Accessibility Statement",
                "About BookingCart Group",
              ].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-500 hover:text-green-600 transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 – Other services */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Other services</h3>
            <ul className="space-y-2.5">
              {[
                "Investor relations",
                "BookingCart Rewards",
                "Affiliate program",
                "List your property",
                "All hotels",
                "Become a Supplier",
                "Security",
              ].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-500 hover:text-green-600 transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 – Payment methods + Partners */}
          <div className="space-y-8">
            {/* Payment methods */}
            <div>
              <p className="text-sm text-slate-500 mb-3">Payment methods</p>
              <div className="grid grid-cols-5 gap-1.5">
                {PAYMENT_METHODS.map(({ label, bg, color }) => (
                  <span
                    key={label}
                    title={label}
                    style={{ backgroundColor: bg, color }}
                    className="h-7 rounded flex items-center justify-center text-[9px] font-bold tracking-tight px-1 select-none"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Our partners */}
            <div>
              <p className="text-sm text-slate-500 mb-3">Our partners</p>
              <div className="flex items-center gap-4">
                {/* Google wordmark */}
                <svg viewBox="0 0 74 24" width="74" height="24" aria-label="Google">
                  <text x="0" y="19" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="20">
                    <tspan fill="#4285F4">G</tspan>
                    <tspan fill="#EA4335">o</tspan>
                    <tspan fill="#FBBC05">o</tspan>
                    <tspan fill="#4285F4">g</tspan>
                    <tspan fill="#34A853">l</tspan>
                    <tspan fill="#EA4335">e</tspan>
                  </text>
                </svg>
                {/* Tripadvisor */}
                <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
                  <svg width="18" height="18" viewBox="0 0 60 60" fill="none">
                    <circle cx="30" cy="30" r="30" fill="#34E0A1"/>
                    <circle cx="20" cy="30" r="8" fill="white"/>
                    <circle cx="40" cy="30" r="8" fill="white"/>
                    <circle cx="20" cy="30" r="4" fill="#000"/>
                    <circle cx="40" cy="30" r="4" fill="#000"/>
                  </svg>
                  Tripadvisor
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Supported Airlines strip ── */}
      <div className="border-t border-slate-100 py-5">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.2em] text-slate-400 uppercase mb-4">
            Supported Airlines
          </p>
          <div className="flex items-center justify-center flex-wrap gap-2">
            {AIRLINES.map(({ code, name }) => (
              <AirlineLogo key={code} code={code} name={name} />
            ))}
            <span className="text-xs text-slate-400 font-medium ml-1">+ many more</span>
          </div>
        </div>
      </div>

      {/* ── Copyright bar ── */}
      <div className="border-t border-slate-100 py-4 text-center">
        <p className="text-xs text-slate-400">
          Copyright &copy; {new Date().getFullYear()} BookingCart Travel Pte. Ltd. All rights reserved.
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Site Operator: BookingCart Travel Pte. Ltd.
        </p>
      </div>

    </footer>
  );
}
