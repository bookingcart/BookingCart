// Shared Utilities
window.STORAGE_KEY = 'bookingcart_flights_v1';

window.money = function(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount);
  } catch (e) {
    const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
    return sym + amount;
  }
};

window.flightPriceAmount = function(flight) {
  if (!flight || flight.price == null) return 0;
  if (typeof flight.price === "object") {
    return parseFloat(flight.price.amount || 0) || 0;
  }
  return Number(flight.price) || 0;
};

window.readState = function() {
  try {
    const raw = window.localStorage.getItem(window.STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

window.writeState = function(patch) {
  const current = window.readState();
  const next = Object.assign({}, current, patch);
  window.localStorage.setItem(window.STORAGE_KEY, JSON.stringify(next));
  return next;
};

window.computeTotals = function(state) {
  const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
  const totalPax = pax.adults + pax.children + pax.infants;
  const flight = (state.flights || []).find((f) => f.id === state.selectedFlightId)
    || state.selectedFlight
    || (state.flights || [])[0];
  const base = flight ? window.flightPriceAmount(flight) * totalPax : 0;

  const extras = state.extras || {};
  const baggagePrice = state._baggagePrice || 45;
  const seatPrice = state._seatPrice || 14;

  const baggage = Number(extras.baggage || 0) * baggagePrice;
  const seats = typeof state._seatCost === 'number' ? state._seatCost : 
                (extras.seat === "standard" ? seatPrice * totalPax : extras.seat === "extra" ? (seatPrice * 2) * totalPax : 0);
  const insurance = extras.insurance ? 19 * totalPax : 0;
  const meals = extras.meal === "premium" ? 12 * totalPax : extras.meal === "standard" ? 7 * totalPax : 0;

  const subtotal = base + baggage + seats + insurance + meals;
  const taxes = Math.round(subtotal * 0.11);
  const total = subtotal + taxes;
  const currency = flight ? (flight.currency || "USD") : "USD";

  const flightCost = base + baggage + seats;
  const markupCost = insurance + meals + taxes;

  return { totalPax, base, baggage, seats, insurance, meals, taxes, total, flightCost, markupCost, currency };
};

// Toast functions
window.ensureToast = function() {
  let toast = document.querySelector(".toast");
  if (toast) return toast;
  toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = '<p class="toast__title" id="toastTitle"></p><p class="toast__desc" id="toastDesc"></p>';
  document.body.appendChild(toast);
  return toast;
};

window.toast = function(title, desc) {
  const t = window.ensureToast();
  const tTitle = document.getElementById("toastTitle");
  const tDesc = document.getElementById("toastDesc");
  if (tTitle) tTitle.textContent = title;
  if (tDesc) tDesc.textContent = desc;
  t.setAttribute("data-open", "true");
  window.clearTimeout(window._toastTimer);
  window._toastTimer = window.setTimeout(() => {
    t.setAttribute("data-open", "false");
  }, 2600);
};

window.setText = function(el, text) {
  if (!el) return;
  el.textContent = text;
};

window.clamp = function(n, min, max) {
  return Math.max(min, Math.min(max, n));
};

window.getQuery = function() {
  const params = new URLSearchParams(window.location.search);
  const obj = {};
  params.forEach((v, k) => {
    obj[k] = v;
  });
  return obj;
};

// Visa Shared functions
window.showCountryDetails = function(country) {
  const modal = document.getElementById('visa-modal');
  if (!modal) return;
  
  const content = document.getElementById('visa-modal-content');
  if (content) {
    const isVisaFree = country.visaType.toLowerCase() === 'visa free' || country.visaType.toLowerCase() === 'visa not required';
    const hasETa = country.visaType.toLowerCase() === 'eta';
    
    let html = '';
    html += '<div class="mb-4">';
    html += '<h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">' + country.name + '</h3>';
    html += '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ' + window.getVisaTypeStyle(country.visaType) + '">';
    html += '<i class="ph-fill ph-' + (isVisaFree ? 'check-circle' : (hasETa ? 'file-text' : 'warning-circle')) + '"></i>';
    html += country.visaType;
    html += '</div>';
    html += '</div>';
    
    html += '<div class="space-y-4">';
    html += '<div class="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl">';
    html += '<h4 class="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-2">Requirements</h4>';
    html += '<ul class="text-sm text-slate-600 dark:text-slate-400 space-y-2">';
    if (isVisaFree) {
      html += '<li class="flex gap-2"><i class="ph-bold ph-passport text-slate-400 mt-0.5"></i>Valid passport (usually 6+ months validity)</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-airplane-landing text-slate-400 mt-0.5"></i>Return or onward ticket</li>';
    } else {
      html += '<li class="flex gap-2"><i class="ph-bold ph-passport text-slate-400 mt-0.5"></i>Valid passport (6+ months validity)</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-file-text text-slate-400 mt-0.5"></i>Completed visa application form</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-camera text-slate-400 mt-0.5"></i>Recent passport-sized photographs</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-airplane-landing text-slate-400 mt-0.5"></i>Flight itinerary</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-building-office text-slate-400 mt-0.5"></i>Proof of accommodation</li>';
      html += '<li class="flex gap-2"><i class="ph-bold ph-bank text-slate-400 mt-0.5"></i>Proof of financial means</li>';
    }
    html += '</ul>';
    html += '</div>';
    html += '</div>';
    
    content.innerHTML = html;
  }
  
  modal.classList.remove('hidden');
  setTimeout(() => modal.querySelector('> div').classList.remove('scale-95', 'opacity-0'), 10);
};

window.closeVisaModal = function() {
  const modal = document.getElementById('visa-modal');
  if (!modal) return;
  modal.querySelector('> div').classList.add('scale-95', 'opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 200);
};

window.getVisaTypeStyle = function(type) {
  const t = (type || '').toLowerCase();
  if (t === 'visa free' || t === 'visa not required') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (t === 'visa on arrival' || t === 'voa') return 'bg-blue-100 text-blue-800 border border-blue-200';
  if (t === 'eta' || t === 'evisa') return 'bg-teal-100 text-teal-800 border border-teal-200';
  if (t === 'visa required') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (t === 'admission refused') return 'bg-red-100 text-red-800 border border-red-200';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200';
};
