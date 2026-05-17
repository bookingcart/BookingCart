(function () {
  console.log("🔥 BOOKINGCART JS LOADED!"); // Simple test
  const STORAGE_KEY = "bookingcart_flights_v1";
  const FLIGHT_RESULTS_CACHE_KEY = "bookingcart_flight_results_cache_v1";
  const FLIGHT_RESULTS_CACHE_TTL_MS = 30 * 60 * 1000;

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeState(patch) {
    const current = readState();
    const next = Object.assign({}, current, patch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  window.readState = readState;
  window.writeState = writeState;



  function flightStorageKey(search, state) {
    const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
    return JSON.stringify({
      from: search.from || "",
      to: search.to || "",
      depart: search.depart || "",
      return: search.return || "",
      tripType: state.tripType || search.tripType || "round",
      cabin: search.cabin || "Economy",
      adults: Number(pax.adults || 0),
      children: Number(pax.children || 0),
      infants: Number(pax.infants || 0)
    });
  }

  function slimFlightForStorage(flight) {
    if (!flight || typeof flight !== "object") return flight;
    const next = Object.assign({}, flight);
    delete next._duffelOffer;
    return next;
  }

  function slimFlightsForStorage(flights) {
    return Array.isArray(flights) ? flights.map(slimFlightForStorage) : [];
  }

  // Saved flights for later functionality
  const SAVED_FLIGHTS_KEY = 'bookingcart_saved_flights';

  function getSavedFlights() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_FLIGHTS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveFlightForLater(flight) {
    const saved = getSavedFlights();
    // Check if already saved
    if (saved.some(f => f.id === flight.id)) {
      showToast('Flight already saved!', 'error');
      return;
    }
    // Add savedAt timestamp
    const flightToSave = {
      ...slimFlightForStorage(flight),
      savedAt: new Date().toISOString()
    };
    saved.push(flightToSave);
    localStorage.setItem(SAVED_FLIGHTS_KEY, JSON.stringify(saved));
    showToast('Flight saved for later!', 'success');
  }

  function removeSavedFlight(flightId) {
    const saved = getSavedFlights();
    const filtered = saved.filter(f => f.id !== flightId);
    localStorage.setItem(SAVED_FLIGHTS_KEY, JSON.stringify(filtered));
  }

  // Make functions available globally for other scripts
  window.saveFlightForLater = saveFlightForLater;
  window.getSavedFlights = getSavedFlights;
  window.removeSavedFlight = removeSavedFlight;

  // Toast notification for saved flights
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
      // Create container if it doesn't exist
      const newContainer = document.createElement('div');
      newContainer.id = 'toast-container';
      newContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(newContainer);
    }
    const toast = document.createElement('div');
    const icon = type === 'success' ? '✓' : '✕';
    const bgClass = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    toast.className = `${bgClass} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[200px] animate-fade-in`;
    toast.innerHTML = `<span class="font-bold">${icon}</span><span>${message}</span>`;
    (document.getElementById('toast-container') || document.body).appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function readFlightCache(signature) {
    try {
      const raw = localStorage.getItem(FLIGHT_RESULTS_CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (!cache || cache.signature !== signature) return null;
      if (Date.now() - Number(cache.savedAt || 0) > FLIGHT_RESULTS_CACHE_TTL_MS) return null;
      return Array.isArray(cache.flights) ? cache.flights : null;
    } catch (e) {
      return null;
    }
  }

  function writeFlightCache(signature, search, flights) {
    try {
      localStorage.setItem(
        FLIGHT_RESULTS_CACHE_KEY,
        JSON.stringify({
          signature,
          search,
          flights: slimFlightsForStorage(flights),
          savedAt: Date.now()
        })
      );
    } catch (e) {
      // Cache is best-effort only.
    }
  }

  function getQuery() {
    const params = new URLSearchParams(window.location.search);
    const obj = {};
    params.forEach((v, k) => { obj[k] = v; });
    return obj;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function ensureToast() {
    let t = document.querySelector(".toast");
    if (t) return t;
    t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<p class="toast__title" id="toastTitle"></p><p class="toast__desc" id="toastDesc"></p>';
    document.body.appendChild(t);
    return t;
  }

  function toast(title, desc) {
    const t = ensureToast();
    setText(document.getElementById("toastTitle"), title);
    setText(document.getElementById("toastDesc"), desc);
    t.setAttribute("data-open", "true");
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
      t.setAttribute("data-open", "false");
    }, 2600);
  }

  window.getQuery = getQuery;
  window.setText = setText;
  window.clamp = clamp;
  window.toast = toast;

  function initStepper() {
    const stepEl = document.querySelector("[data-step]");
    if (!stepEl) return;

    const step = stepEl.getAttribute("data-step");
    const steps = Array.from(document.querySelectorAll(".step"));
    steps.forEach((s) => {
      s.setAttribute("data-active", s.getAttribute("data-step-id") === step ? "true" : "false");
    });
  }

  function closeAllDropdowns(except) {
    const panels = Array.from(document.querySelectorAll(".dropdown__panel[data-open='true']"));
    panels.forEach((p) => {
      if (except && except === p) return;
      p.setAttribute("data-open", "false");
    });
  }

  function initDropdowns() {
    const dropdowns = Array.from(document.querySelectorAll("[data-dropdown]"));
    dropdowns.forEach((root) => {
      const trigger = root.querySelector("[data-dropdown-trigger]");
      const panel = root.querySelector(".dropdown__panel");
      if (!trigger || !panel) return;

      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        const isOpen = panel.getAttribute("data-open") === "true";
        closeAllDropdowns(isOpen ? null : panel);
        panel.setAttribute("data-open", isOpen ? "false" : "true");
      });
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const inside = target.closest("[data-dropdown]");
      if (!inside) closeAllDropdowns(null);
    });
  }

  async function searchDuffelAirports(keyword) {
    console.log("🔍 searchDuffelAirports called with:", keyword);
    if (!keyword || keyword.length < 2) {
      console.log("❌ Keyword too short, returning []");
      return [];
    }
    try {
      console.log("🔍 Searching Duffel airports for:", keyword);
      const resp = await fetch(`/api/duffel-airports?keyword=${encodeURIComponent(keyword)}`);
      console.log("🔍 Duffel API response status:", resp.status);
      const data = await resp.json().catch(() => null);
      console.log("🔍 Duffel API data:", data);
      if (data && data.ok && Array.isArray(data.airports)) {
        console.log("✅ Found airports:", data.airports.length);
        return data.airports;
      }
    } catch (e) {
      console.error("❌ Duffel airport search failed:", e);
    }
    console.log("❌ Returning empty array");
    return [];
  }

  function initAirportSuggest(input) {
    const root = input.closest(".suggest");
    if (!root) return;
    const list = root.querySelector(".suggest__list");
    if (!list) return;

    let searchTimeout = null;

    function render(items) {
      console.log("🔍 Rendering airport results:", items.length, items);
      list.innerHTML = "";
      if (!items.length) {
        console.log("🔍 No results, hiding dropdown");
        list.setAttribute("data-open", "false");
        return;
      }
      console.log("🔍 Showing dropdown with results");
      list.setAttribute("data-open", "true");
      items.slice(0, 8).forEach((a) => {
        const li = document.createElement("li");
        li.className = "suggest__item";
        li.setAttribute("role", "option");
        li.setAttribute("tabindex", "0");
        const displayName = a.name && a.name !== a.city ? a.name : "";
        li.innerHTML =
          '<span>' +
          a.city +
          (displayName ? ' <span class="small">' + displayName + "</span>" : "") +
          "</span><span class=\"suggest__code\">" +
          a.code +
          "</span>";
        li.addEventListener("click", () => {
          console.log("Airport selected:", a.city, a.code); // Debug log
          input.value = a.city + " (" + a.code + ")";
          input.setAttribute("data-airport-code", a.code);
          console.log("Set data-airport-code to:", a.code); // Debug log
          list.setAttribute("data-open", "false");
        });
        li.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            li.click();
          }
        });
        list.appendChild(li);
      });
      list.setAttribute("data-open", "true");
    }

    async function performSearch(q) {
      if (q.length < 1) {
        render([]);
        return;
      }

      // Only use Duffel API
      let results = await searchDuffelAirports(q);

      // Only use API results - no local fallback
      render(results);
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      console.log("🔍 Airport input changed:", q);

      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      // Only search with API calls for 2+ characters
      if (q.length >= 2) {
        console.log("🔍 Starting search for:", q);
        searchTimeout = setTimeout(() => performSearch(q), 300);
      } else {
        console.log("🔍 Too short, clearing results");
        render([]);
      }
    });

    input.addEventListener("focus", () => {
      if (input.value.trim().length) input.dispatchEvent(new Event("input"));
    });

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const inside = t.closest(".suggest");
      if (inside !== root) list.setAttribute("data-open", "false");
    });
  }

  function initAirportSuggestAll() {
    const inputs = Array.from(document.querySelectorAll("input[data-airport-input]"));
    inputs.forEach(initAirportSuggest);
  }

  function initTripTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab[data-trip]"));
    if (!tabs.length) return;

    const multi = document.querySelector("[data-multicity]");
    const returnField = document.querySelector("[data-return-field]");

    function setMode(mode) {
      tabs.forEach((t) => {
        const isActive = t.getAttribute("data-trip") === mode;
        t.setAttribute("aria-selected", isActive ? "true" : "false");

        // Explicit Styling Management for Reliability
        if (isActive) {
          t.classList.remove("text-slate-500", "hover:text-slate-900", "hover:bg-white/50");
          t.classList.add("text-green-600", "bg-green-50/50");
        } else {
          t.classList.remove("text-green-600", "bg-green-50/50");
          t.classList.add("text-slate-500", "hover:text-slate-900", "hover:bg-white/50");
        }
      });

      if (returnField) {
        returnField.classList.toggle("hidden", mode !== "round");
        returnField.classList.toggle("block", mode === "round");
      }
      if (multi) {
        multi.style.display = mode === "multi" ? "block" : "none";
      }
      window.writeState({ tripType: mode });
    }

    tabs.forEach((t) => {
      t.addEventListener("click", () => setMode(t.getAttribute("data-trip")));
    });

    const st = window.readState();
    setMode(st.tripType || "round");
  }

  function initPassengerControls() {
    const root = document.querySelector("[data-passengers]");
    if (!root) return;

    const adultsEl = root.querySelector("[data-count='adults']");
    const childrenEl = root.querySelector("[data-count='children']");
    const infantsEl = root.querySelector("[data-count='infants']");

    const trigger = document.querySelector("[data-passengers-trigger]");
    const triggerSummary = trigger && trigger.querySelector("[data-passengers-summary]");
    const hidden = document.querySelector("input[name='passengers']");

    function readCounts() {
      const st = window.readState();
      const c = st.passengers || { adults: 1, children: 0, infants: 0 };
      c.adults = window.clamp(Number(c.adults || 1), 1, 9);
      c.children = window.clamp(Number(c.children || 0), 0, 9);
      c.infants = window.clamp(Number(c.infants || 0), 0, c.adults);
      return c;
    }

    function writeCounts(c) {
      window.writeState({ passengers: c });
      if (adultsEl) window.setText(adultsEl, String(c.adults));
      if (childrenEl) window.setText(childrenEl, String(c.children));
      if (infantsEl) window.setText(infantsEl, String(c.infants));

      const total = c.adults + c.children + c.infants;
      const label = total === 1 ? "1 traveler" : total + " travelers";
      if (triggerSummary) window.setText(triggerSummary, label);
      else if (trigger) window.setText(trigger, label);
      if (hidden) hidden.value = JSON.stringify(c);
    }

    function bind(kind) {
      const minus = root.querySelector("[data-minus='" + kind + "']");
      const plus = root.querySelector("[data-plus='" + kind + "']");
      if (minus)
        minus.addEventListener("click", (e) => {
          e.preventDefault();
          const c = readCounts();
          c[kind] = c[kind] - 1;
          if (kind === "adults") c.adults = window.clamp(c.adults, 1, 9);
          if (kind === "children") c.children = window.clamp(c.children, 0, 9);
          if (kind === "infants") c.infants = window.clamp(c.infants, 0, c.adults);
          if (c.infants > c.adults) c.infants = c.adults;
          writeCounts(c);
        });
      if (plus)
        plus.addEventListener("click", (e) => {
          e.preventDefault();
          const c = readCounts();
          c[kind] = c[kind] + 1;
          if (kind === "adults") c.adults = window.clamp(c.adults, 1, 9);
          if (kind === "children") c.children = window.clamp(c.children, 0, 9);
          if (kind === "infants") c.infants = window.clamp(c.infants, 0, c.adults);
          writeCounts(c);
        });
    }

    bind("adults");
    bind("children");
    bind("infants");

    writeCounts(readCounts());
  }

  /* ─── Custom Calendar ─── */
  function initCalendar() {
    const popup = document.getElementById("cal-popup");
    if (!popup) return;

    const titleEl = popup.querySelector("[data-cal-title]");
    const gridEl = popup.querySelector("[data-cal-grid]");
    const prevBtn = popup.querySelector("[data-cal-prev]");
    const nextBtn = popup.querySelector("[data-cal-next]");

    let activeField = null; // "depart" or "return"
    let viewYear, viewMonth; // current calendar view
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const MONTHS = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];

    function formatLabel(dateStr) {
      if (!dateStr) return "Select date";
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function pad(n) { return String(n).padStart(2, "0"); }

    function renderMonth() {
      if (!titleEl || !gridEl) return;
      titleEl.textContent = MONTHS[viewMonth] + " " + viewYear;
      gridEl.innerHTML = "";

      const firstDay = new Date(viewYear, viewMonth, 1);
      let startDow = firstDay.getDay(); // 0=Sun
      startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

      // Get currently selected value for this field
      const form = document.querySelector("form[data-search-form]");
      const hiddenInput = form ? form.querySelector("input[name='" + activeField + "']") : null;
      const selectedVal = hiddenInput ? hiddenInput.value : "";

      let weekIndex = 0;

      // Empty cells before first day
      for (let i = 0; i < startDow; i++) {
        const cell = document.createElement("div");
        cell.className = "cal-cell cal-cell--empty" + (weekIndex % 2 === 1 ? " cal-cell--stripe" : "");
        gridEl.appendChild(cell);
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const colIndex = (startDow + d - 1) % 7;
        if (colIndex === 0 && d > 1) weekIndex++;

        const dateObj = new Date(viewYear, viewMonth, d);
        const dateStr = viewYear + "-" + pad(viewMonth + 1) + "-" + pad(d);
        const isPast = dateObj < today;
        const isToday = dateObj.getTime() === today.getTime();
        const isSelected = dateStr === selectedVal;

        const cell = document.createElement("div");
        let cls = "cal-cell";
        if (weekIndex % 2 === 1) cls += " cal-cell--stripe";
        if (isPast) cls += " cal-cell--disabled";
        if (isToday) cls += " cal-cell--today";
        if (isSelected) cls += " cal-cell--selected";
        cell.className = cls;

        // Day number
        const daySpan = document.createElement("span");
        daySpan.className = "cal-day";
        daySpan.textContent = d;
        cell.appendChild(daySpan);

        if (!isPast) {
          cell.addEventListener("click", () => {
            selectDate(dateStr);
          });
        }

        gridEl.appendChild(cell);
      }

      // Fill remaining cells in last row
      const totalCells = startDow + daysInMonth;
      const remainder = totalCells % 7;
      if (remainder > 0) {
        for (let i = 0; i < 7 - remainder; i++) {
          const cell = document.createElement("div");
          cell.className = "cal-cell cal-cell--empty" + (weekIndex % 2 === 1 ? " cal-cell--stripe" : "");
          gridEl.appendChild(cell);
        }
      }
    }

    function selectDate(dateStr) {
      const form = document.querySelector("form[data-search-form]");
      if (!form) return;

      // Set hidden input
      const hiddenInput = form.querySelector("input[name='" + activeField + "']");
      if (hiddenInput) hiddenInput.value = dateStr;

      // Update label
      const label = document.querySelector("[data-cal-label='" + activeField + "']");
      if (label) label.textContent = formatLabel(dateStr);

      closeCalendar();
    }

    function openCalendar(field) {
      activeField = field;
      const trigger = document.querySelector("[data-cal-trigger='" + field + "']");
      if (!trigger) return;

      // Position the popup near the trigger
      const parent = trigger.closest(".field") || trigger.parentElement;
      popup.style.display = "block";
      parent.style.position = "relative";
      parent.appendChild(popup);

      // Set view month based on existing value or today
      const form = document.querySelector("form[data-search-form]");
      const hiddenInput = form ? form.querySelector("input[name='" + field + "']") : null;
      const val = hiddenInput ? hiddenInput.value : "";
      if (val) {
        const d = new Date(val + "T00:00:00");
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
      } else {
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
      }

      renderMonth();
    }

    function closeCalendar() {
      popup.style.display = "none";
      activeField = null;
    }

    // Wire triggers
    document.querySelectorAll("[data-cal-trigger]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const field = btn.getAttribute("data-cal-trigger");
        if (activeField === field) {
          closeCalendar();
        } else {
          openCalendar(field);
        }
      });
    });

    // Nav buttons
    if (prevBtn) prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderMonth();
    });
    if (nextBtn) nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderMonth();
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (activeField && !popup.contains(e.target) && !e.target.closest("[data-cal-trigger]")) {
        closeCalendar();
      }
    });

    // Restore labels from state
    const st = window.readState();
    if (st.search) {
      if (st.search.depart) {
        const lbl = document.querySelector("[data-cal-label='depart']");
        if (lbl) lbl.textContent = formatLabel(st.search.depart);
      }
      if (st.search.return) {
        const lbl = document.querySelector("[data-cal-label='return']");
        if (lbl) lbl.textContent = formatLabel(st.search.return);
      }
    }
  }

  function initSearchForm() {
    const form = document.querySelector("form[data-search-form]");
    if (!form) return;

    const st = window.readState();
    const from = form.querySelector("input[name='from']");
    const to = form.querySelector("input[name='to']");
    const depart = form.querySelector("input[name='depart']");
    const ret = form.querySelector("input[name='return']");
    const cabin = form.querySelector("select[name='cabin']");

    if (from && st.search && st.search.from) from.value = st.search.from;
    if (to && st.search && st.search.to) to.value = st.search.to;
    if (depart && st.search && st.search.depart) depart.value = st.search.depart;
    if (ret && st.search && st.search.return) ret.value = st.search.return;
    if (cabin && st.search && st.search.cabin) cabin.value = st.search.cabin;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const mode = (window.readState().tripType || "round").toString();
      const payload = {
        tripType: mode,
        from: from ? from.value.trim() : "",
        to: to ? to.value.trim() : "",
        depart: depart ? depart.value : "",
        return: ret ? ret.value : "",
        cabin: cabin ? cabin.value : "Economy"
      };

      if (!payload.from || !payload.to) {
        window.toast("Missing route", "Please choose a departure and destination airport.");
        return;
      }

      if (!payload.depart) {
        window.toast("Missing date", "Please select a departure date.");
        return;
      }

      if (payload.tripType === "round" && !payload.return) {
        window.toast("Missing return date", "Select a return date or switch to one-way.");
        return;
      }

      window.writeState({ search: payload, bookingRef: null, _bookingSaved: null, duffelPassengers: null });
      if (typeof window.__bcNavigate === "function") window.__bcNavigate("/results");
      else window.location.href = "/results";
    });
  }

  function money(n, currency = "USD") {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency, maximumFractionDigits: 0 }).format(n);
    } catch (e) {
      const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
      return sym + n;
    }
  }
  window.money = money;

  function durationLabel(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h + "h " + String(m).padStart(2, "0") + "m";
  }

  function extractIata(value) {
    if (typeof value !== "string") return "";
    const m = value.toUpperCase().match(/\(([A-Z]{3})\)\s*$/);
    if (m && m[1]) return m[1];
    const m2 = value.toUpperCase().match(/\b([A-Z]{3})\b/);
    return m2 && m2[1] ? m2[1] : "";
  }

  async function fetchDuffelFlights(state, search) {
    try {
      const payload = {
        originLocationCode: extractIata(search.from),
        destinationLocationCode: extractIata(search.to),
        departureDate: search.depart,
        returnDate: search.tripType === "round" ? search.return : "",
        adults: state.passengers?.adults || 1,
        children: state.passengers?.children || 0,
        infants: state.passengers?.infants || 0,
        travelClass: search.cabin || "Economy",
        currencyCode: "USD",
        max: 30
      };

      const resp = await fetch("/api/duffel-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => null);
      if (data && data.ok && Array.isArray(data.flights)) {
        console.log(`Duffel search successful: ${data.flights.length} flights`);
        // Persist Duffel passenger IDs — needed by /api/duffel-orders (Step 3)
        if (Array.isArray(data.duffelPassengers) && data.duffelPassengers.length > 0) {
          window.writeState({ duffelPassengers: data.duffelPassengers });
        }
        return data.flights;
      } else if (data && !data.ok) {
        console.error("Duffel search error:", data.error);
      }
    } catch (e) {
      console.error("Duffel API error:", e);
    }
    return [];
  }

  function initResults() {
    const root = document.querySelector("[data-results]");
    if (!root) return;

    const filtersRoot = document.querySelector("[data-results-filters]");
    if (filtersRoot) {
      filtersRoot.querySelectorAll("details.filter-chip").forEach((det) => {
        det.addEventListener("toggle", function () {
          if (!this.open) return;
          filtersRoot.querySelectorAll("details.filter-chip").forEach((o) => {
            if (o !== this) o.removeAttribute("open");
          });
        });
      });
    }

    function syncFilterChips() {
      const p = document.querySelector("input[name='maxPrice']");
      const s = document.querySelector("select[name='stops']");
      const a = document.querySelector("select[name='airline']");
      const d = document.querySelector("select[name='departTime']");
      const chipP = document.querySelector("[data-chip-price]");
      const chipS = document.querySelector("[data-chip-stops]");
      const chipA = document.querySelector("[data-chip-airline]");
      const chipD = document.querySelector("[data-chip-time]");
      const maxLbl = document.querySelector("[data-price-max-label]");
      
      const ccy = currentFlights.length > 0 ? (currentFlights[0].currency || "USD") : "USD";
      const v = Number(p ? p.value : 0);
      const mx = Number(p ? p.max : 2000);

      if (maxLbl) {
        maxLbl.textContent = window.money(mx, ccy) + "+";
      }
      if (chipP && p) {
        chipP.textContent = v >= mx - 1 ? "No max" : "≤ " + window.money(v, ccy);
      }
      if (chipS && s) {
        const map = { any: "Any", "0": "Nonstop", "1": "≤1 stop" };
        chipS.textContent = map[s.value] != null ? map[s.value] : "Any";
      }
      if (chipA && a && a.selectedOptions[0]) {
        chipA.textContent = a.value === "any" ? "Any" : a.selectedOptions[0].text;
      }
      if (chipD && d) {
        if (d.value === "any") chipD.textContent = "Any";
        else if (d.value === "morning") chipD.textContent = "Morning";
        else if (d.value === "afternoon") chipD.textContent = "Afternoon";
        else if (d.value === "evening") chipD.textContent = "Evening";
        else chipD.textContent = d.selectedOptions[0] ? d.selectedOptions[0].text : "Any";
      }
    }

    const state = window.readState();
    const search = state.search || {};
    const searchSignature = flightStorageKey(search, state);
    const cachedFlights = readFlightCache(searchSignature);

    // Update header
    const headerRouteDest = document.querySelector("[data-route-dest]");
    if (headerRouteDest) window.setText(headerRouteDest, search.to || "Destination");

    const headerSearchFrom = document.querySelector("#search-from");
    const headerSearchTo = document.querySelector("#search-to");
    const headerSearchDepart = document.querySelector("[data-cal-label='depart']");
    const headerSearchReturn = document.querySelector("[data-cal-label='return']");
    const headerPaxSummary = document.querySelector("[data-passengers-summary]");

    if (headerSearchFrom) headerSearchFrom.value = search.from || "";
    if (headerSearchTo) headerSearchTo.value = search.to || "";
    if (headerSearchDepart) headerSearchDepart.textContent = search.depart || "Depart";
    if (headerSearchReturn) headerSearchReturn.textContent = search.return || "Return";
    if (headerPaxSummary) {
      const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
      const total = pax.adults + pax.children + pax.infants;
      headerPaxSummary.textContent = `${total} traveler${total > 1 ? 's' : ''} - ${search.cabin || 'Economy'}`;
    }

    const listEl = root.querySelector("[data-results-list]");
    const sortEl = document.querySelector("select[name='sort']");
    let currentFlights = [];
    let controlsBound = false;

    const filters = {
      maxPrice: 2000,
      stops: "any",
      airline: "any",
      departBucket: "any"
    };

    function readFiltersFromUI() {
      const p = document.querySelector("input[name='maxPrice']");
      const s = document.querySelector("select[name='stops']");
      const a = document.querySelector("select[name='airline']");
      const d = document.querySelector("select[name='departTime']");
      if (p) filters.maxPrice = Number(p.value || 2000);
      if (s) filters.stops = s.value;
      if (a) filters.airline = a.value;
      if (d) filters.departBucket = d.value;
    }

    function inDepartBucket(time, bucket) {
      if (bucket === "any") return true;
      const h = Number((time || "0").split(":")[0] || 0);
      if (bucket === "morning") return h >= 5 && h < 12;
      if (bucket === "afternoon") return h >= 12 && h < 18;
      if (bucket === "evening") return h >= 18 || h < 5;
      return true;
    }

    function apply(list) {
      readFiltersFromUI();
      let out = list.filter((f) => {
        const price = typeof f.price === "object" ? parseFloat(f.price.amount || 0) : f.price;
        if (price > filters.maxPrice) return false;
        if (filters.stops !== "any" && String(f.stops) !== String(filters.stops)) return false;
        if (filters.airline !== "any" && f.airline.code !== filters.airline) return false;
        if (!inDepartBucket(f.departTime, filters.departBucket)) return false;
        return true;
      });

      const sort = sortEl ? sortEl.value : "price";
      out = out.slice().sort((a, b) => {
        const priceA = typeof a.price === "object" ? parseFloat(a.price.amount || 0) : a.price;
        const priceB = typeof b.price === "object" ? parseFloat(b.price.amount || 0) : b.price;
        if (sort === "price") return priceA - priceB;
        if (sort === "duration") return (a.durationMin || 0) - (b.durationMin || 0);
        if (sort === "depart") return (a.departTime || "").localeCompare(b.departTime || "");
        return 0;
      });

      return out;
    }

    function updateResultsView() {
      syncFilterChips();
      render(apply(currentFlights));
    }

    function bindFilterControls() {
      if (controlsBound) return;
      controlsBound = true;
      const inputs = Array.from(document.querySelectorAll("input[name='maxPrice'], select[name='stops'], select[name='airline'], select[name='departTime'], select[name='sort']"));
      inputs.forEach((i) => {
        i.addEventListener("input", updateResultsView);
        i.addEventListener("change", updateResultsView);
      });
    }

    function render(list) {
      if (!listEl) return;
      listEl.innerHTML = "";
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm";
        empty.innerHTML = '<div class="text-lg font-medium text-slate-900 mb-2">No flights match your filters</div><div class="text-slate-500">Try increasing your max price or changing stops/airlines.</div>';
        listEl.appendChild(empty);
        return;
      }

      list.forEach((f, i) => {
        const priceVal = typeof f.price === "object" ? parseFloat(f.price.amount || 0) : f.price;
        const card = document.createElement("div");
        card.className = "bg-white border border-slate-200 hover:border-green-600 transition-colors p-0 flex flex-col md:flex-row mb-3 group shadow-sm relative";
        
        let badgesHtml = '';
        if (i === 0) {
          badgesHtml += '<span class="bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">Cheapest</span>';
        }
        badgesHtml += '<span class="bg-green-50 text-green-600 text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-1"><i class="ph ph-suitcase-rolling"></i> Carry-on baggage included</span>';
        
        const logoHtml = f.airline.logoUrl 
          ? '<img src="' + f.airline.logoUrl + '" alt="' + f.airline.name + '" class="max-w-full max-h-full object-contain" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';"><div class="w-full h-full items-center justify-center text-slate-900 font-medium" style="display:none;">' + f.airline.logo + '</div>' 
          : '<div class="w-full h-full flex items-center justify-center text-slate-900 font-medium">' + f.airline.logo + '</div>';

        const stopsText = f.stops === 0 ? "Nonstop" : f.stops + " stop" + (f.stops > 1 ? "s" : "");

        card.innerHTML = 
          '<div class="absolute top-0 left-0 flex gap-1 -mt-2.5 ml-4 z-10">' + badgesHtml + '</div>' +
          '<div class="flex-1 flex flex-col justify-center p-5 pt-6">' +
            '<div class="flex items-center gap-8">' +
              '<div class="flex items-center gap-3 w-40 shrink-0">' +
                '<div class="w-8 h-8 flex items-center justify-center">' + logoHtml + '</div>' +
                '<span class="text-sm font-medium text-slate-700">' + f.airline.name + '</span>' +
              '</div>' +
              '<div class="flex-1 flex items-center justify-center gap-6">' +
                '<div class="text-right">' +
                  '<div class="text-xl font-bold text-slate-900">' + (f.departTime || "--:--") + '</div>' +
                  '<div class="text-xs text-slate-500 font-medium">' + extractIata(search.from) + '</div>' +
                '</div>' +
                '<div class="flex-1 max-w-[150px] flex flex-col items-center">' +
                  '<div class="text-xs text-slate-400 font-medium mb-1">' + durationLabel(f.durationMin || 0) + '</div>' +
                  '<div class="w-full relative flex items-center justify-center">' +
                    '<div class="w-full h-px bg-slate-300"></div>' +
                    '<div class="absolute bg-white px-2 text-slate-400"><span class="text-[10px] uppercase">' + stopsText + '</span></div>' +
                  '</div>' +
                '</div>' +
                '<div class="text-left">' +
                  '<div class="text-xl font-bold text-slate-900">' + (f.arriveTime || "--:--") + '</div>' +
                  '<div class="text-xs text-slate-500 font-medium">' + extractIata(search.to) + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="w-full md:w-48 border-t md:border-t-0 md:border-l border-slate-100 p-5 flex flex-col justify-center items-end bg-slate-50/30">' +
            '<div class="text-2xl font-bold text-green-600">' + window.money(priceVal, f.currency) + '</div>' +
            '<div class="text-[10px] text-slate-400 font-medium mb-3">per adult</div>' +
            '<a href="#" data-flight-link class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded text-sm w-full text-center flex items-center justify-center gap-1 transition-colors">' +
              'Select <i class="ph-bold ph-caret-right"></i>' +
            '</a>' +
            '<button data-save-flight class="mt-2 text-slate-500 hover:text-green-600 text-sm font-medium flex items-center justify-center gap-1 transition-colors w-full py-2">' +
              '<i class="ph ph-heart"></i> Save for later' +
            '</button>' +
          '</div>';

        const link = card.querySelector("[data-flight-link]");
        if (link) link.setAttribute("href", "/details?flight=" + encodeURIComponent(f.id));

        // Add save functionality
        const saveBtn = card.querySelector("[data-save-flight]");
        if (saveBtn) {
          saveBtn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            saveFlightForLater(f);
          });
        }

        listEl.appendChild(card);
      });
    }

    function hydrateResults(flights) {
      currentFlights = Array.isArray(flights) ? flights : [];
      window.writeState({ flights: slimFlightsForStorage(currentFlights) });
      if (currentFlights.length) {
        writeFlightCache(searchSignature, search, currentFlights);
      }

      const maxPriceEl = document.querySelector("input[name='maxPrice']");
      if (maxPriceEl) {
        const mx = Math.max(300, ...currentFlights.map((f) => {
          return typeof f.price === "object" ? parseFloat(f.price.amount || 0) : Number(f.price || 0);
        }));
        const sliderMax = Math.ceil(mx / 50) * 50;
        maxPriceEl.max = String(sliderMax);
        maxPriceEl.value = String(sliderMax);
        filters.maxPrice = sliderMax;
      }

      const airlineList = document.getElementById("sidebar-airline-list");
      if (airlineList) {
        airlineList.innerHTML = "";
        const codes = Array.from(new Set(currentFlights.map((f) => f.airline.code)));
        codes.forEach((c) => {
          const airlineRef = currentFlights.find((f) => f.airline.code === c).airline;
          const label = airlineRef.name;
          const minPrice = Math.min(...currentFlights.filter(f => f.airline.code === c).map(f => typeof f.price === "object" ? parseFloat(f.price.amount || 0) : f.price));
          
          const lbl = document.createElement("label");
          lbl.className = "flex justify-between items-center cursor-pointer group";
          lbl.innerHTML = `
            <div class="flex items-center gap-3">
              <input type="checkbox" value="${c}" class="w-4 h-4 rounded border-slate-300 accent-green-600" />
              <span class="text-sm text-slate-700 group-hover:text-slate-900 flex items-center gap-2">
                <div class="w-4 h-4 rounded-sm flex items-center justify-center overflow-hidden"><img src="${airlineRef.logoUrl}" onerror="this.style.display='none'"></div>
                ${label}
              </span>
            </div>
            <span class="text-xs text-slate-400 font-medium">${window.money(minPrice, currentFlights[0].currency)}</span>
          `;
          airlineList.appendChild(lbl);
        });
      }

      const flightCountEl = document.querySelector("[data-flight-count]");
      if (flightCountEl) window.setText(flightCountEl, currentFlights.length);

      const priceTrend = document.getElementById("price-trend-graph");
      if (priceTrend) priceTrend.style.display = "block";

      renderPriceTrends(currentFlights, search);

      bindFilterControls();
      if (window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
        window.bookingcartLoading.setBusy(listEl, false);
      }
      updateResultsView();
    }

    function renderPriceTrends(flights, search) {
      if (!flights || !flights.length) return;
      
      const basePrice = Math.min(...flights.map((f) => typeof f.price === "object" ? parseFloat(f.price.amount || 0) : Number(f.price || 0)));
      const currency = flights[0].currency || "USD";
      const departDate = search.depart ? new Date(search.depart + "T12:00:00") : new Date();
      
      const ribbon = document.getElementById("date-ribbon");
      if (ribbon) {
        ribbon.innerHTML = "";
        for (let i = -3; i <= 4; i++) {
          const d = new Date(departDate.getTime() + i * 86400000);
          const dayStr = d.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
          let variation = 1.0;
          if (i === 0) variation = 1.0;
          else if (Math.abs(i) === 1) variation = 1.05 + (i * 0.02);
          else if (Math.abs(i) === 2) variation = 0.95 - (i * 0.01);
          else variation = 1.1 + (i * 0.03);
          if (d.getDay() === 0 || d.getDay() === 6) variation += 0.15;
          const price = basePrice * variation;
          const isActive = i === 0;
          
          const div = document.createElement("div");
          div.className = `flex-1 min-w-[100px] py-2 cursor-pointer flex flex-col items-center justify-center border-b-2 transition-colors ${isActive ? 'border-green-600 bg-green-50/30' : 'border-transparent hover:bg-slate-50'} border-r border-slate-100 last:border-r-0`;
          div.innerHTML = `
            <span class="text-xs font-semibold ${isActive ? 'text-green-600' : 'text-slate-600'}">${dayStr}</span>
            <span class="text-[11px] ${isActive ? 'text-green-600 font-bold' : 'text-slate-400 font-medium'}">${window.money(price, currency)}</span>
          `;
          ribbon.appendChild(div);
        }
      }

      const trendGraph = document.getElementById("price-trend-graph");
      if (trendGraph) {
        trendGraph.style.display = "block";
        const lowestLabel = trendGraph.querySelector(".font-bold.text-green-600");
        if (lowestLabel) lowestLabel.textContent = window.money(basePrice, currency);
        
        const labels = trendGraph.querySelectorAll(".absolute.right-0.text-slate-400");
        if (labels.length >= 2) {
          labels[0].textContent = window.money(basePrice * 1.4, currency);
          labels[1].textContent = window.money(basePrice * 1.05, currency);
        }
        
        const titleLabel = trendGraph.querySelector("h3");
        const icon = trendGraph.querySelector(".ph-fill.ph-chart-line-up, .ph-fill.ph-chart-line-down");
        if (titleLabel && icon) {
          if (basePrice < 150) {
             titleLabel.innerHTML = `Prices are currently <span class="text-green-600">low</span>—book now!`;
             icon.className = "ph-fill ph-chart-line-down text-green-600 text-xl";
          } else {
             titleLabel.innerHTML = `Prices are likely to <span class="text-orange-500">increase</span>—book now!`;
             icon.className = "ph-fill ph-chart-line-up text-orange-500 text-xl";
          }
        }
      }
    }

    // Render cached results immediately when they match the current search.
    if (cachedFlights && cachedFlights.length) {
      hydrateResults(cachedFlights);
    } else if (listEl) {
      if (window.bookingcartLoading && typeof window.bookingcartLoading.renderSkeletons === "function") {
        window.bookingcartLoading.renderSkeletons(listEl, "flight", 4);
      } else {
        listEl.innerHTML = "";
        for (let i = 0; i < 4; i++) {
          const sk = document.createElement("div");
          sk.className = "skeleton";
          listEl.appendChild(sk);
        }
      }
    }

    if (!search.from || !search.to || !search.depart) {
      if (listEl) {
        if (window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
          window.bookingcartLoading.setBusy(listEl, false);
        }
        listEl.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm"><div class="text-red-500">No search data found. Please go back and search again.</div></div>';
      }
      return;
    }

    (async () => {
      try {
        const flights = await fetchDuffelFlights(state, search);

        if (!flights || flights.length === 0) {
          if (listEl) {
            if (window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
              window.bookingcartLoading.setBusy(listEl, false);
            }
            listEl.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm"><div class="text-lg font-medium text-slate-900 mb-2">No flights found</div><div class="text-slate-500">No flights available for this route and dates. Try different airports or dates.</div></div>';
          }
          const countEl = document.querySelector("[data-flight-count]");
          if (countEl) window.setText(countEl, "0");
          window.writeState({ flights: [] });
          return;
        }

        hydrateResults(flights);
      } catch (e) {
        console.error("API error:", e);
        if (listEl) {
          if (window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
            window.bookingcartLoading.setBusy(listEl, false);
          }
          listEl.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm"><div class="text-red-500">Error loading flights. Please try again.</div></div>';
        }
        const countEl = document.querySelector("[data-flight-count]");
        if (countEl) window.setText(countEl, "0");
        window.writeState({ flights: [] });
      }
    })();

    // Price Alert Modal Logic
    const alertBtn = document.querySelector("[data-price-alert-btn]");
    const alertText = document.querySelector("[data-price-alert-text]");
    const modal = document.getElementById("price-alert-modal");
    const modalContent = document.getElementById("price-alert-modal-content");
    const closeModalBtn = document.getElementById("close-price-alert");
    const enableAlertBtn = document.getElementById("enable-price-alert-btn");

    if (alertBtn && modal && enableAlertBtn) {
      const alertKey = "price_alert_" + (search.from || "") + "_" + (search.to || "");
      let isAlertActive = localStorage.getItem(alertKey) === "true";
      let selectedTargetPrice = 0; // Outer scope for slider value
      
      const updateAlertUI = () => {
        if (isAlertActive) {
          alertBtn.classList.remove("text-green-600", "hover:bg-green-50");
          alertBtn.classList.add("text-green-800", "bg-green-100");
          if (alertText) alertText.textContent = "Price alert active";
          const icon = alertBtn.querySelector("i");
          if (icon) icon.className = "ph-fill ph-bell-ringing text-green-800";
        } else {
          alertBtn.classList.add("text-green-600", "hover:bg-green-50");
          alertBtn.classList.remove("text-green-800", "bg-green-100");
          if (alertText) alertText.textContent = "Create price alert";
          const icon = alertBtn.querySelector("i");
          if (icon) icon.className = "ph-fill ph-bell-ringing text-green-600";
        }
      };
      
      updateAlertUI();

      const openModal = () => {
        if (isAlertActive) {
          // If already active, just deactivate it directly
          isAlertActive = false;
          localStorage.setItem(alertKey, "false");
          updateAlertUI();
          window.toast("Alert Deactivated", "You will no longer receive price alerts for this route.");
          return;
        }

        // Populate modal data
        const elFrom = modal.querySelector("[data-alert-from]");
        const elTo = modal.querySelector("[data-alert-to]");
        const elType = modal.querySelector("[data-alert-trip-type]");
        const elDate = modal.querySelector("[data-alert-date]");
        const elTargetPrice = modal.querySelectorAll("[data-alert-target-price]");
        const elMinPrice = modal.querySelector("[data-alert-min-price]");
        
        if (elFrom) elFrom.textContent = search.from || "Origin";
        if (elTo) elTo.textContent = search.to || "Destination";
        if (elType) elType.textContent = (search.tripType === "round" ? "Round-trip" : search.tripType === "multi" ? "Multi-city" : "One-way");
        if (elDate && search.depart) {
          const d = new Date(search.depart + "T12:00:00");
          elDate.textContent = d.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
        }
        
        const currentFlights = window.readState().flights || [];
        const basePrice = currentFlights.length ? Math.min(...currentFlights.map(f => typeof f.price === "object" ? parseFloat(f.price.amount || 0) : Number(f.price || 0))) : 150;
        const currency = currentFlights[0]?.currency || "USD";
        
        // Define range
        const maxLimit = basePrice * 1.05; // Maximum limit of the slider
        const minLimit = basePrice * 0.50; // Minimum limit of the slider
        
        selectedTargetPrice = basePrice * 0.95; // Recommended drop
        
        const updateSliderVisuals = (val) => {
           selectedTargetPrice = val;
           elTargetPrice.forEach(el => el.textContent = window.money(selectedTargetPrice, currency));
           
           // Calculate percentage (0 to 100)
           const percent = ((selectedTargetPrice - minLimit) / (maxLimit - minLimit)) * 100;
           const clamped = window.clamp(percent, 0, 100);
           
           const slider = modal.querySelector("[data-alert-price-slider]");
           const sliderFill = modal.querySelector("[data-alert-slider-fill]");
           const sliderThumb = modal.querySelector("[data-alert-slider-thumb]");
           const sliderEmoji = modal.querySelector("[data-alert-slider-emoji]");
           
           if (slider) slider.value = clamped;
           if (sliderFill) sliderFill.style.width = clamped + "%";
           if (sliderThumb) sliderThumb.style.left = clamped + "%";
           
           if (sliderEmoji) {
              if (clamped < 25) sliderEmoji.textContent = "🤑";
              else if (clamped < 50) sliderEmoji.textContent = "😄";
              else if (clamped < 75) sliderEmoji.textContent = "😊";
              else sliderEmoji.textContent = "😐";
           }
        };
        
        const slider = modal.querySelector("[data-alert-price-slider]");
        if (slider) {
           slider.addEventListener("input", (e) => {
              const p = parseFloat(e.target.value);
              const val = minLimit + (p / 100) * (maxLimit - minLimit);
              updateSliderVisuals(val);
           });
        }
        
        updateSliderVisuals(selectedTargetPrice);
        if (elMinPrice) elMinPrice.textContent = window.money(minLimit, currency);

        // Show modal
        modal.classList.remove("hidden");
        modal.classList.add("flex"); // Ensure flex layout for centering
        // Trigger reflow
        void modal.offsetWidth;
        modal.classList.remove("opacity-0");
        modalContent.classList.remove("scale-95");
      };

      const closeModal = () => {
        modal.classList.add("opacity-0");
        modalContent.classList.add("scale-95");
        setTimeout(() => {
          modal.classList.add("hidden");
          modal.classList.remove("flex");
        }, 200);
      };

      alertBtn.addEventListener("click", openModal);
      
      if (closeModalBtn) {
        closeModalBtn.addEventListener("click", closeModal);
      }
      
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });

      // Flexible Dates Picker Logic
      const flexDateTrigger = modal.querySelector("[data-alert-date]");
      const dpModal = document.getElementById("date-picker-modal");
      const dpModalContent = document.getElementById("date-picker-modal-content");
      const dpCloseBtn = document.getElementById("close-date-picker");
      const dpConfirmBtn = document.getElementById("confirm-dates-btn");
      const dpContainer = document.getElementById("dp-calendars-container");
      const dpPrev = document.querySelector("[data-dp-prev]");
      const dpNext = document.querySelector("[data-dp-next]");
      const dpSelectedText = document.getElementById("dp-selected-text");

      let currentMonth = search.depart ? new Date(search.depart + "T12:00:00") : new Date();
      currentMonth.setDate(1); // Start of month
      
      let selectedRange = [search.depart ? new Date(search.depart + "T12:00:00") : new Date()];

      const renderCalendars = () => {
         if (!dpContainer) return;
         dpContainer.innerHTML = "";
         
         const renderMonth = (dateObj) => {
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth();
            const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
            
            let html = `<div class="w-full">
               <div class="text-center font-bold text-slate-800 mb-4">${monthName}</div>
               <div class="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 mb-2">
                  <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
               </div>
               <div class="grid grid-cols-7 gap-y-2 text-center text-sm font-medium">`;
               
            for (let i = 0; i < firstDayIndex; i++) {
               html += `<div></div>`;
            }
            
            for (let i = 1; i <= daysInMonth; i++) {
               const currentDayDate = new Date(year, month, i);
               const dateStr = currentDayDate.toISOString().split('T')[0];
               const isSelected = selectedRange.some(d => d.toISOString().split('T')[0] === dateStr);
               
               let classes = "w-8 h-8 flex items-center justify-center mx-auto rounded-full cursor-pointer hover:bg-green-50 transition-colors";
               if (isSelected) {
                  classes = "w-8 h-8 flex items-center justify-center mx-auto rounded-full cursor-pointer bg-green-600 text-white font-bold shadow-sm";
               } else if (currentDayDate < new Date().setHours(0,0,0,0)) {
                  classes = "w-8 h-8 flex items-center justify-center mx-auto rounded-full text-slate-300 cursor-not-allowed";
               }
               
               html += `<div class="${classes}" data-date="${dateStr}">${i}</div>`;
            }
            
            html += `</div></div>`;
            return html;
         };
         
         dpContainer.innerHTML = renderMonth(currentMonth) + renderMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
         
         dpContainer.querySelectorAll("[data-date]").forEach(el => {
            el.addEventListener("click", (e) => {
               const dateStr = e.target.getAttribute("data-date");
               const d = new Date(dateStr + "T12:00:00");
               if (d < new Date().setHours(0,0,0,0)) return;
               
               const existingIdx = selectedRange.findIndex(sd => sd.toISOString().split('T')[0] === dateStr);
               if (existingIdx >= 0) {
                  if (selectedRange.length > 1) selectedRange.splice(existingIdx, 1);
               } else {
                  selectedRange.push(d);
               }
               selectedRange.sort((a,b) => a - b);
               
               if (selectedRange.length === 1) {
                  if (dpSelectedText) dpSelectedText.textContent = "Depart: " + selectedRange[0].toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
               } else {
                  if (dpSelectedText) dpSelectedText.textContent = "Depart: " + selectedRange[0].toLocaleDateString("en-US", { month: 'short', day: 'numeric' }) + " - " + selectedRange[selectedRange.length-1].toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
               }
               
               renderCalendars();
            });
         });
      };

      if (flexDateTrigger && dpModal) {
         flexDateTrigger.addEventListener("click", () => {
            dpModal.classList.remove("hidden");
            dpModal.classList.add("flex");
            void dpModal.offsetWidth;
            dpModal.classList.remove("opacity-0");
            if (dpModalContent) dpModalContent.classList.remove("scale-95");
            if (dpSelectedText) {
               if (selectedRange.length === 1) {
                  dpSelectedText.textContent = "Depart: " + selectedRange[0].toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
               } else {
                  dpSelectedText.textContent = "Depart: " + selectedRange[0].toLocaleDateString("en-US", { month: 'short', day: 'numeric' }) + " - " + selectedRange[selectedRange.length-1].toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
               }
            }
            renderCalendars();
         });
         
         const closeDp = () => {
            dpModal.classList.add("opacity-0");
            if (dpModalContent) dpModalContent.classList.add("scale-95");
            setTimeout(() => {
               dpModal.classList.add("hidden");
               dpModal.classList.remove("flex");
            }, 200);
         };
         
         if (dpCloseBtn) dpCloseBtn.addEventListener("click", closeDp);
         dpModal.addEventListener("click", (e) => {
            if (e.target === dpModal) closeDp();
         });
         
         if (dpPrev) dpPrev.addEventListener("click", () => {
            currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
            renderCalendars();
         });
         if (dpNext) dpNext.addEventListener("click", () => {
            currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
            renderCalendars();
         });
         
         if (dpConfirmBtn) dpConfirmBtn.addEventListener("click", () => {
            const elDate = modal.querySelector("[data-alert-date]");
            if (elDate && selectedRange.length > 0) {
               if (selectedRange.length === 1) {
                  elDate.textContent = selectedRange[0].toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
               } else {
                  elDate.textContent = selectedRange[0].toLocaleDateString("en-US", { month: 'short', day: 'numeric' }) + " - " + selectedRange[selectedRange.length-1].toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
               }
            }
            closeDp();
         });
      }

      enableAlertBtn.addEventListener("click", async () => {
        const emailInput = modal.querySelector("[data-alert-email-input]");
        const email = emailInput ? emailInput.value.trim() : "bookingcart.business@gmail.com";
        if (!email) {
          window.toast("Error", "Please enter a valid email address.", "error");
          return;
        }

        const originalText = enableAlertBtn.innerHTML;
        enableAlertBtn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Activating...';
        enableAlertBtn.disabled = true;

        try {
          const currentFlights = window.readState().flights || [];
          const currency = currentFlights[0]?.currency || "USD";
          
          const checkbox = modal.querySelector('input[type="checkbox"]');
          const isNonstop = checkbox ? checkbox.checked : false;

          const res = await fetch("/api/price-alert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              from: search.from || "Origin",
              to: search.to || "Destination",
              departDate: selectedRange.map(d => d.toISOString().split('T')[0]).join(','),
              targetPrice: selectedTargetPrice.toFixed(2),
              currency,
              isNonstop
            })
          });

          if (!res.ok) throw new Error("Failed to activate price alert");

          isAlertActive = true;
          localStorage.setItem(alertKey, "true");
          updateAlertUI();
          closeModal();
          window.toast("Alert Activated", `We'll email you when prices drop for ${search.from || "this route"}.`);
        } catch (err) {
          console.error(err);
          window.toast("Error", "Could not set up price alert. Please try again.", "error");
        } finally {
          enableAlertBtn.innerHTML = originalText;
          enableAlertBtn.disabled = false;
        }
      });
    }
  }

  function initDetails() {
    const root = document.querySelector("[data-details]");
    if (!root) return;

    const q = window.getQuery();
    const state = window.readState();
    const flights = state.flights || [];
    const id = (q.flight || "").toString();

    const flight = flights.find((f) => f.id === id) || flights[0];
    if (!flight) {
      window.toast("No selection", "Go back to results and pick a flight.");
      return;
    }

    window.writeState({ selectedFlightId: flight.id, selectedFlight: flight });

    // Sidebar Info
    const priceVal = typeof flight.price === "object" ? parseFloat(flight.price.amount || 0) : flight.price;
    const airline = root.querySelector("[data-airline]");
    const airlineLogo = root.querySelector("[data-airline-logo]");
    const times = root.querySelector("[data-times]");
    const duration = root.querySelector("[data-duration]");
    const price = root.querySelector("[data-price]");

    if (airline) window.setText(airline, flight.airline.name);
    if (airlineLogo) airlineLogo.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-900 font-medium">' + flight.airline.logo + '</div>';
    if (times) window.setText(times, (flight.departTime || "--:--") + " → " + (flight.arriveTime || "--:--"));
    if (duration) window.setText(duration, durationLabel(flight.durationMin || 0) + " • " + (flight.stops === 0 ? "Non-stop" : flight.stops + " stop" + (flight.stops > 1 ? "s" : "")));
    if (price) window.setText(price, window.money(priceVal, flight.currency));

    // Dynamic Trip Breakdown
    const segmentsContainer = document.getElementById("flight-segments-container");
    if (segmentsContainer && flight.segments && flight.segments.length > 0) {
      let segmentsHtml = `
        <h2 class="font-medium text-lg text-slate-900 mb-4 flex items-center gap-2">
          <i class="ph-duotone ph-airplane-tilt text-green-600 text-xl"></i> Trip Breakdown
        </h2>
        <div class="flex flex-wrap gap-3 mb-6">
          <span class="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium">Gate closes 20 min before</span>
          <span class="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">Mobile boarding pass</span>
        </div>
        <div class="space-y-0 relative before:absolute before:inset-y-0 before:left-3 before:w-0.5 border-slate-200">
      `;

      flight.segments.forEach((seg, index) => {
        // Layover block if not the first segment
        if (index > 0) {
          const prevArr = flight.segments[index - 1].arriveTime;
          const currDep = seg.departTime;
          segmentsHtml += `
            <div class="py-4 pl-10 relative">
              <div class="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-orange-400 border-[3px] border-orange-100 z-10"></div>
              <div class="absolute inset-y-0 left-3 w-0.5 bg-dashed border-l-2 border-dashed border-orange-200"></div>
              <div class="bg-orange-50 text-orange-700 text-sm font-medium px-4 py-2 rounded-xl inline-flex items-center gap-2">
                <i class="ph-bold ph-clock"></i> Layover in ${seg.departCity || seg.departAirport}
              </div>
            </div>
          `;
        }

        // Flight Segment block
        segmentsHtml += `
          <div class="relative pl-10 py-2">
            <!-- Timeline Line -->
            <div class="absolute top-0 bottom-0 left-3 w-0.5 bg-slate-200 -z-10"></div>
            <!-- Airplane Icon in middle of line -->
            <div class="absolute left-[3px] top-1/2 -translate-y-1/2 bg-white text-slate-400 py-2 z-10"><i class="ph-fill ph-airplane-in-flight text-xl" style="transform: rotate(90deg); display: block;"></i></div>
            
            <!-- Departure Node -->
            <div class="absolute left-[9px] top-4 w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-300 z-10"></div>
            
            <!-- Departure Info -->
            <div class="flex justify-between items-start mb-6 pt-2">
              <div>
                <div class="text-xl font-semibold text-slate-900">${seg.departTime}</div>
                <div class="text-sm font-medium text-slate-700 mt-1">${seg.departCity || seg.departAirport} <span class="text-slate-400 font-normal">(${seg.departCode})</span></div>
                ${seg.departTerminal ? `<div class="text-xs text-slate-500 mt-1">Terminal ${seg.departTerminal}</div>` : ''}
              </div>
            </div>
            
            <!-- Flight Meta (Duration, Airline, Aircraft) -->
            <div class="flex gap-4 items-center mb-6 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div class="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-800 shadow-sm">${seg.airlineCode || 'FL'}</div>
              <div>
                <div class="text-sm font-medium text-slate-900">${seg.airlineName} <span class="text-slate-500 font-normal ml-1">Flight ${seg.flightNumber || 'TBD'}</span></div>
                <div class="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>${durationLabel(seg.durationMin)}</span>
                  <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span>${seg.aircraft}</span>
                  ${seg.cabin_class ? `<span class="w-1 h-1 rounded-full bg-slate-300"></span><span class="capitalize">${seg.cabin_class}</span>` : ''}
                </div>
              </div>
            </div>
            
            <!-- Arrival Node -->
            <div class="absolute left-[9px] bottom-5 w-3.5 h-3.5 rounded-full bg-slate-800 z-10"></div>
            
            <!-- Arrival Info -->
            <div class="flex justify-between items-start pb-2">
              <div>
                <div class="text-xl font-semibold text-slate-900">${seg.arriveTime}</div>
                <div class="text-sm font-medium text-slate-700 mt-1">${seg.arriveCity || seg.arriveAirport} <span class="text-slate-400 font-normal">(${seg.arriveCode})</span></div>
                ${seg.arriveTerminal ? `<div class="text-xs text-slate-500 mt-1">Terminal ${seg.arriveTerminal}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      });

      segmentsHtml += `</div>`;
      segmentsContainer.innerHTML = segmentsHtml;
    }

    const cta = root.querySelector("[data-select-flight]");
    if (cta)
      cta.addEventListener("click", (e) => {
        e.preventDefault();
        window.toast("Flight selected", "Next: traveler details.");
        window.setTimeout(() => {
          if (typeof window.__bcNavigate === "function") window.__bcNavigate("/passengers");
          else window.location.href = "/passengers";
        }, 450);
      });
  }

  function initPassengers() {
    const root = document.querySelector("[data-passenger-page]");
    if (!root) return;

    const state = window.readState();
    const pax = state.passengers || { adults: 1, children: 0, infants: 0 };
    const total = pax.adults + pax.children + pax.infants;

    const list = root.querySelector("[data-travelers]");
    if (!list) return;

    function travelerCard(i) {
      const wrap = document.createElement("div");
      wrap.className = "traveler-card bg-white rounded-2xl border border-slate-200 shadow-sm p-6";
      wrap.innerHTML =
        '<div class="font-medium text-lg text-slate-900 mb-2">Traveler ' + (i + 1) + '</div>' +
        '<div class="text-xs text-slate-500 font-medium mb-6">Enter details exactly as they appear on the travel document.</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
        // Title
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Title</label>' +
        '<select class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="title" required>' +
        '<option value="">Select title</option>' +
        '<option value="mr">Mr</option><option value="ms">Ms</option><option value="mrs">Mrs</option>' +
        '<option value="miss">Miss</option><option value="dr">Dr</option>' +
        '</select></div>' +
        // Gender
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Gender</label>' +
        '<select class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="gender" required>' +
        '<option value="">Select gender</option>' +
        '<option value="m">Male</option><option value="f">Female</option>' +
        '</select></div>' +
        // First / Last name
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">First Name</label><input class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="firstName" placeholder="e.g., Amina" required></div>' +
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Last Name</label><input class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="lastName" placeholder="e.g., Hassan" required></div>' +
        // DOB / Passport
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Date of Birth</label><input class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="dob" type="date" required></div>' +
        '<div><label class="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Passport / ID</label><input class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" name="doc" placeholder="Passport Number" required></div>' +
        '</div>';
      return wrap;
    }

    list.innerHTML = "";
    for (let i = 0; i < total; i++) list.appendChild(travelerCard(i));

    const form = root.querySelector("form[data-passenger-form]");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const travelerEls = Array.from(list.querySelectorAll(".traveler-card"));
      const travelers = travelerEls.map((c) => {
        const title  = c.querySelector("select[name='title']");
        const gender = c.querySelector("select[name='gender']");
        const f   = c.querySelector("input[name='firstName']");
        const l   = c.querySelector("input[name='lastName']");
        const d   = c.querySelector("input[name='dob']");
        const doc = c.querySelector("input[name='doc']");
        return {
          title:     title  ? title.value.trim()  : "",
          gender:    gender ? gender.value.trim() : "",
          firstName: f   ? f.value.trim()   : "",
          lastName:  l   ? l.value.trim()   : "",
          dob:       d   ? d.value          : "",
          doc:       doc ? doc.value.trim() : ""
        };
      });

      const contactEmail = (form.querySelector("input[name='email']") || {}).value || "";
      const phone = (form.querySelector("input[name='phone']") || {}).value || "";

      if (!contactEmail.trim()) {
        window.toast("Contact required", "Please enter an email for ticket delivery.");
        return;
      }

      // Phone is required — Duffel orders.create needs a valid E.164 phone number
      const phoneClean = (phone || "").trim();
      if (!phoneClean) {
        window.toast("Phone required", "Please enter a phone number for your booking (e.g. +14155550100).");
        return;
      }
      if (!/^\+[1-9]\d{6,14}$/.test(phoneClean)) {
        window.toast("Invalid phone", "Phone must be in international format, e.g. +14155550100.");
        return;
      }

      if (travelers.some((t) => !t.title || !t.gender || !t.firstName || !t.lastName || !t.dob || !t.doc)) {
        window.toast("Missing traveler info", "Fill all required traveler fields including title and gender.");
        return;
      }

      window.writeState({ travelers, contact: { email: contactEmail.trim(), phone: phoneClean } });
      if (typeof window.__bcNavigate === "function") window.__bcNavigate("/extras");
      else window.location.href = "/extras";
    });
  }



  function initExtras() {
    const root = document.querySelector("[data-extras]");
    if (!root) return;

    const state = window.readState();
    const extras = state.extras || { baggage: 0, seat: "none", insurance: false, meal: "none" };

    const baggage = root.querySelector("input[name='baggage']");
    const seat = root.querySelector("select[name='seat']");
    const insurance = root.querySelector("input[name='insurance']");
    const meal = root.querySelector("select[name='meal']");

    if (baggage) baggage.value = String(extras.baggage || 0);
    if (seat) seat.value = extras.seat || "none";
    if (insurance) insurance.checked = Boolean(extras.insurance);
    if (meal) meal.value = extras.meal || "none";

    const summary = {
      base: document.querySelector("[data-sum-base]"),
      extras: document.querySelector("[data-sum-extras]"),
      taxes: document.querySelector("[data-sum-taxes]"),
      total: document.querySelector("[data-sum-total]"),
    };

    const updateSummary = () => {
      const stateNow = window.readState();
      const totals = window.computeTotals(stateNow);
      const ccy = totals.currency;
      const extrasCost = totals.baggage + totals.seats + totals.insurance + totals.meals;
      if (summary.base) window.setText(summary.base, window.money(totals.base, ccy));
      if (summary.extras) window.setText(summary.extras, window.money(extrasCost, ccy));
      if (summary.taxes) window.setText(summary.taxes, window.money(totals.taxes, ccy));
      if (summary.total) window.setText(summary.total, window.money(totals.total, ccy));
      window.dispatchEvent(new CustomEvent("bookingcart_totals_updated"));
    };

    if (state.selectedFlightId && state.selectedFlightId.startsWith("off_")) {
      (async () => {
        try {
          const resp = await fetch('/api/duffel-offer?id=' + encodeURIComponent(state.selectedFlightId));
          const data = await resp.json().catch(()=>null);
          if (data && data.ok && data.offer && data.offer.available_services) {
            const bags = data.offer.available_services.filter(s => s.type === 'baggage');
            if (bags.length > 0) {
              window.writeState({ _baggageServiceId: bags[0].id, _baggagePrice: parseFloat(bags[0].total_amount) });
              updateSummary();
            }
          }
        } catch(e){}
      })();

      (async () => {
        try {
          const resp = await fetch('/api/duffel-seat-maps?offer_id=' + encodeURIComponent(state.selectedFlightId));
          const data = await resp.json().catch(()=>null);
          if (data && data.ok && data.seatMaps) {
            const seatsArr = [];
            data.seatMaps.forEach(map => {
              (map.cabins || []).forEach(cabin => {
                 (cabin.rows || []).forEach(row => {
                    (row.sections || []).forEach(section => {
                       (section.elements || []).forEach(element => {
                          if (element.type === 'seat' && element.available_services && element.available_services.length > 0) {
                             seatsArr.push({
                               designator: element.designator,
                               services: element.available_services
                             });
                          }
                       })
                    })
                 })
              })
            });

            const seatMapContainer = document.getElementById('dynamic-seat-map');
            if (seatMapContainer) {
                if (seatsArr.length > 0) {
                    const duffelPax = state.duffelPassengers || [];
                    const paxCount = duffelPax.length;
                    
                    let html = '';
                    for (let i = 0; i < paxCount; i++) {
                        const dPax = duffelPax[i];
                        if (dPax.type === 'infant_without_seat') continue;

                        const validSeatsForPax = seatsArr.map(s => {
                            const matchingService = s.services.find(srv => srv.passenger_id === dPax.id);
                            return matchingService ? { designator: s.designator, service: matchingService } : null;
                        }).filter(Boolean);

                        if (validSeatsForPax.length === 0) continue;

                        html += `
                        <div class="mb-3">
                            <label class="block text-sm font-bold text-slate-700 mb-1">Passenger ${i + 1}</label>
                            <select class="seat-select-dynamic w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" data-pax-id="${dPax.id}">
                                <option value="none">No specific seat preference</option>
                                ${validSeatsForPax.map(s => `<option value="${s.service.id}" data-price="${s.service.total_amount}">${s.designator} - ${window.money(s.service.total_amount, s.service.total_currency)}</option>`).join('')}
                            </select>
                        </div>
                        `;
                    }
                    seatMapContainer.innerHTML = html || '<div class="text-sm text-slate-500">No seats available for selection.</div>';

                    seatMapContainer.querySelectorAll('select').forEach(sel => {
                        sel.addEventListener('change', () => {
                            const selections = [];
                            let seatCost = 0;
                            seatMapContainer.querySelectorAll('select').forEach(s => {
                                if (s.value !== 'none') {
                                    selections.push({ id: s.value, passenger_id: s.dataset.paxId });
                                    const opt = s.options[s.selectedIndex];
                                    seatCost += parseFloat(opt.dataset.price || 0);
                                }
                            });
                            window.writeState({ _selectedSeats: selections, _seatCost: seatCost });
                            updateSummary();
                        });
                    });
                } else {
                    seatMapContainer.innerHTML = '<div class="text-sm text-slate-500">No seats available for selection.</div>';
                }
            }
          } else {
            const smc = document.getElementById('dynamic-seat-map');
            if (smc) smc.innerHTML = '<div class="text-sm text-slate-500">Seat maps not available for this flight.</div>';
          }
        } catch(e){
            console.error(e);
            const smc = document.getElementById('dynamic-seat-map');
            if (smc) smc.innerHTML = '<div class="text-sm text-slate-500">Unable to load seats.</div>';
        }
      })();
    }

    function refresh() {
      const next = {
        baggage: baggage ? Number(baggage.value || 0) : 0,
        seat: seat ? seat.value : "none",
        insurance: insurance ? Boolean(insurance.checked) : false,
        meal: meal ? meal.value : "none"
      };
      window.writeState({ extras: next });
      updateSummary();
    }

    [baggage, seat, insurance, meal].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", refresh);
      el.addEventListener("change", refresh);
    });

    updateSummary();

    const form = root.querySelector("form[data-extras-form]");
    if (form)
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (typeof window.__bcNavigate === "function") window.__bcNavigate("/payment");
        else window.location.href = "/payment";
      });
  }

  async function createDuffelOrder(state, totals, hold = false) {
    const flight = (state.flights || []).find(f => f.id === state.selectedFlightId) || (state.flights || [])[0];
    if (!flight || !flight.id || !flight.id.startsWith('off_')) return { ref: null, id: null };

    const duffelPax = state.duffelPassengers || [];
    const travelers = state.travelers || [];
    let contactObj = state.contact || {};
    if (!contactObj.email) {
      try {
        const gu = JSON.parse(localStorage.getItem('bookingcart_user') || '{}');
        if (gu.email) contactObj = { email: gu.email, phone: contactObj.phone || '' };
      } catch (e) { }
    }

    const duffelOrderPassengers = duffelPax.map((dp, idx) => {
      const t = travelers[idx] || {};
      let phoneStr = String(contactObj.phone || '+10000000000').trim();
      if (!phoneStr.startsWith('+')) phoneStr = '+' + phoneStr.replace(/[^0-9]/g, '');
      if (phoneStr === '+') phoneStr = '+10000000000';

      return {
        id: dp.id,
        given_name: (t.firstName || '').trim() || 'Traveler',
        family_name: (t.lastName || '').trim() || String(idx + 1),
        born_on: t.dob || '1990-01-01',
        title: t.title || (dp.type === 'infant_without_seat' ? 'miss' : 'mr'),
        gender: t.gender || (dp.type === 'infant_without_seat' ? 'f' : 'm'),
        email: contactObj.email || 'guest@bookingcart.com',
        phone_number: phoneStr
      };
    });

    const adultPaxIds = duffelPax.filter(dp => dp.type === 'adult').map(dp => dp.id);
    duffelPax.forEach((dp) => {
      if (dp.type === 'infant_without_seat' && adultPaxIds.length > 0) {
        const adultOrderPax = duffelOrderPassengers.find(p => p.id === adultPaxIds[0]);
        if (adultOrderPax) adultOrderPax.infant_passenger_id = dp.id;
      }
    });

    let confirmedAmount = String(flight.price || totals.total);
    let confirmedCurrency = flight.currency || 'USD';
    try {
      const offerRefreshResp = await fetch('/api/duffel-offer?id=' + encodeURIComponent(flight.id));
      const offerRefreshData = await offerRefreshResp.json().catch(() => null);
      if (offerRefreshResp.ok && offerRefreshData && offerRefreshData.ok && offerRefreshData.offer) {
        if (offerRefreshData.offer.available) {
          confirmedAmount = offerRefreshData.offer.total_amount;
          confirmedCurrency = offerRefreshData.offer.total_currency;
        }
      }
    } catch (err) { }

    const services = [];
    if (state.extras && state.extras.baggage > 0 && state._baggageServiceId && adultPaxIds.length > 0) {
      services.push({
        id: state._baggageServiceId,
        quantity: Math.min(Number(state.extras.baggage), 6),
        passengers: [adultPaxIds[0]]
      });
    }

    if (state._selectedSeats && state._selectedSeats.length > 0) {
      state._selectedSeats.forEach(sel => {
        services.push({
          id: sel.id,
          quantity: 1,
          passengers: [sel.passenger_id]
        });
      });
    }

    try {
      const orderResp = await fetch('/api/duffel-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: flight.id,
          totalAmount: confirmedAmount,
          currency: confirmedCurrency,
          passengers: duffelOrderPassengers,
          hold: hold,
          services: services.length > 0 ? services : undefined
        })
      });
      const orderData = await orderResp.json().catch(() => null);
      if (orderResp.ok && orderData && orderData.ok) {
        return { ref: orderData.bookingReference, id: orderData.orderId, error: null };
      }
      return { ref: null, id: null, error: orderData?.error || 'Failed to book with airline' };
    } catch (err) { }
    return { ref: null, id: null, error: 'Network error communicating with server' };
  }

  function initPayment() {
    const root = document.querySelector("[data-payment]");
    if (!root) {
      console.log("[initPayment] data-payment root not found, retrying...");
      // Retry up to 50 times (5 seconds) then give up
      if (!window.__paymentRetryCount) window.__paymentRetryCount = 0;
      window.__paymentRetryCount++;
      if (window.__paymentRetryCount < 50) {
        setTimeout(initPayment, 100);
      } else {
        console.warn("[initPayment] Giving up after 50 retries - payment form never found");
      }
      return;
    }
    console.log("[initPayment] Found data-payment root");

    const query = window.getQuery();
    if (query.canceled === "1") {
      window.toast("Checkout canceled", "Your Stripe payment was canceled. You can try again whenever you're ready.");
    }

    const currentState = window.readState();
    if (!currentState.bookingRef) {
      window.writeState({ bookingRef: "BC" + Math.random().toString(36).slice(2, 8).toUpperCase() });
    }

    const totals = window.computeTotals(window.readState());
    const ccy = totals.currency;

    const totalEl = document.querySelector("[data-pay-total]");
    if (totalEl) window.setText(totalEl, window.money(totals.total, ccy));
    const totalInlineEl = document.querySelector("[data-pay-total-inline]");
    if (totalInlineEl) window.setText(totalInlineEl, window.money(totals.total, ccy));
    const totalBtnEl = document.querySelector("[data-pay-total-btn]");
    if (totalBtnEl) window.setText(totalBtnEl, window.money(totals.total, ccy));

    const bookingRefEl = root.querySelector("[data-stripe-booking-ref]");
    if (bookingRefEl) window.setText(bookingRefEl, window.readState().bookingRef || "—");
    const amountEl = document.querySelector("[data-stripe-amount]");
    if (amountEl) window.setText(amountEl, window.money(totals.total, ccy));

    const form = root.querySelector("form[data-payment-form]");
    if (!form) {
      console.log("[initPayment] form[data-payment-form] not found, retrying...");
      // Retry after a short delay if form not found (React might still be rendering)
      setTimeout(initPayment, 100);
      return;
    }
    console.log("[initPayment] Found payment form");

    const submitBtn = form.querySelector("button[type='submit']");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const state = window.readState();
      const bookingRef = state.bookingRef || "BC" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const contactEmail = (state.contact && state.contact.email) || "";

      window.writeState({ bookingRef, _bookingSaved: null, _stripeSessionId: null, payment: null });

      const amountCents = Math.round(Number(totals.total) * 100);
      if (!Number.isFinite(amountCents) || amountCents < 50) {
        window.toast(
          "Invalid payment amount",
          "We could not calculate a valid total. Go back to results and pick a flight again, or refresh this page."
        );
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> Redirecting...';
      }

      try {
        const resp = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents,
            currency: "usd",
            description: "BookingCart flight booking " + bookingRef,
            bookingRef,
            customerEmail: contactEmail,
            successPath: "/confirmation",
            cancelPath: "/payment"
          })
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data || !data.ok || !data.url) {
          throw new Error((data && data.error) || "Unable to create Stripe checkout session");
        }

        window.location.href = data.url;
      } catch (err) {
        console.error("Stripe checkout error:", err);
        window.toast("Stripe checkout unavailable", err.message || "Unable to start checkout.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Continue to Stripe Checkout <span data-pay-total-btn></span> <i class="ph-bold ph-lock-key"></i>';
          const totalBtnInner = submitBtn.querySelector("[data-pay-total-btn]");
          if (totalBtnInner) window.setText(totalBtnInner, window.money(totals.total, ccy));
        }
      }
    });

    const holdBtn = form.querySelector("[data-hold-order-btn]");
    if (holdBtn) {
      console.log("[initPayment] Found hold order button, attaching listener");
      holdBtn.addEventListener("click", async (e) => {
        console.log("[holdBtn] Hold order button clicked");
        e.preventDefault();
        const state = window.readState();
        const bookingRef = state.bookingRef || "BC" + Math.random().toString(36).slice(2, 8).toUpperCase();
        window.writeState({ bookingRef, _bookingSaved: null, _stripeSessionId: null, payment: null });

        if (submitBtn) submitBtn.disabled = true;
        holdBtn.disabled = true;
        holdBtn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> Holding...';

        const duffelRes = await createDuffelOrder(state, totals, true);
        if (!duffelRes.id) {
          holdBtn.innerHTML = 'Hold Failed';
          holdBtn.disabled = false;
          if (submitBtn) submitBtn.disabled = false;
          alert(duffelRes.error || "Failed to create hold order with airline.");
          return;
        }

        const nextState = window.writeState({
          bookingRef: duffelRes.ref || bookingRef,
          _duffelOrderId: duffelRes.id
        });

        const s = nextState.search || {};
        const flight = (nextState.flights || []).find(f => f.id === nextState.selectedFlightId) || (nextState.flights || [])[0];
        let contactObj = nextState.contact || {};
        if (!contactObj.email) {
            try {
                const gu = JSON.parse(localStorage.getItem('bookingcart_user') || '{}');
                if (gu.email) contactObj = { ...contactObj, email: gu.email };
            } catch(e) {}
        }

        const booking = {
          ref: nextState.bookingRef,
          route: (s.from || "") + " \u2192 " + (s.to || ""),
          dates: (s.depart || "") + (s.return ? " \u2192 " + s.return : ""),
          flight: flight ? { airline: flight.airline.name, time: flight.departTime + " \u2192 " + flight.arriveTime } : null,
          contact: contactObj,
          passengers: nextState.travelers || nextState.passengers || [],
          total: totals.total,
          extras: nextState.extras || {},
          status: "held",
          duffelOrderId: duffelRes.id || null,
          duffelBookingReference: duffelRes.ref || null,
          payment: { provider: "none", status: "pending", amountTotal: totals.total * 100, currency: totals.currency }
        };

        try {
          const saveResp = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", booking })
          });
          if (saveResp.ok) {
            window.writeState({ _bookingSaved: true });
            if (typeof window.__bcNavigate === "function") window.__bcNavigate("/confirmation?held=1");
            else window.location.href = "/confirmation?held=1";
            return;
          }
        } catch (e) { }

        window.toast("Error", "Could not hold order. Please try again.");
        holdBtn.disabled = false;
        holdBtn.innerHTML = 'Hold Order (Pay Later)';
        if (submitBtn) submitBtn.disabled = false;
      });
    } else {
      console.warn("[initPayment] Hold order button NOT found - looking for [data-hold-order-btn]");
    }
  }

  function initConfirmation() {
    const root = document.querySelector("[data-confirmation]");
    if (!root) return;

    const state = window.readState();
    const query = window.getQuery();
    const sessionId = String(query.session_id || "").trim();
    const refEl = root.querySelector("[data-booking-ref]");
    if (refEl) window.setText(refEl, state.bookingRef || "—");
    const statusEl = root.querySelector("[data-payment-status]");
    const headlineEl = document.querySelector('main[data-step="confirmation"] h1');
    const subtitleEl = document.querySelector('main[data-step="confirmation"] p');

    if (query.held === "1") {
      if (statusEl && window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
        window.bookingcartLoading.setBusy(statusEl, false);
      }
      if (statusEl) statusEl.textContent = "Order Held";
      if (headlineEl) headlineEl.textContent = "Your order has been held";
      if (subtitleEl) subtitleEl.textContent = "Please go to My Bookings and complete your payment to issue the ticket.";
      return;
    }

    if (!sessionId) {
      if (statusEl && window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
        window.bookingcartLoading.setBusy(statusEl, false);
      }
      if (statusEl) statusEl.textContent = "Waiting for Stripe payment confirmation";
      if (headlineEl) headlineEl.textContent = "Complete payment to confirm your booking";
      if (subtitleEl) subtitleEl.textContent = "Your booking will be saved after Stripe confirms the payment.";
    }

    if (sessionId) {
      if (statusEl) {
        statusEl.innerHTML = '<span class="bc-skeleton bc-skeleton-line" style="display:inline-block;width:180px;height:14px;border-radius:999px"></span>';
      }
      (async () => {
      try {
        const resp = await fetch("/api/stripe/session?session_id=" + encodeURIComponent(sessionId));
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data || !data.ok || !data.session) {
          throw new Error((data && data.error) || "Unable to verify Stripe payment");
        }

        const stripeSession = data.session;
        const paid = stripeSession.payment_status === "paid" || stripeSession.status === "complete";
        if (!paid) {
          if (statusEl && window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
            window.bookingcartLoading.setBusy(statusEl, false);
          }
          if (statusEl) statusEl.textContent = "Stripe payment not completed";
          if (headlineEl) headlineEl.textContent = "Payment not completed";
          if (subtitleEl) subtitleEl.textContent = "Your payment was not confirmed by Stripe.";
          return;
        }

        if (statusEl && window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
          window.bookingcartLoading.setBusy(statusEl, false);
        }
        if (statusEl) statusEl.textContent = "Stripe payment confirmed";
        if (headlineEl) headlineEl.textContent = "Thank you for booking with us!";
        if (subtitleEl) subtitleEl.textContent = "Your trip has been confirmed and your ticket is ready.";

        const payingBookingStr = localStorage.getItem('bc_paying_booking');
        let payingBooking = null;
        try { if (payingBookingStr) payingBooking = JSON.parse(payingBookingStr); } catch(e){}

        if (payingBooking && payingBooking.ref) {
           if (payingBooking.duffelOrderId) {
               try {
                   await fetch('/api/duffel-payments', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({
                           orderId: payingBooking.duffelOrderId,
                           amount: payingBooking.amount,
                           currency: payingBooking.currency
                       })
                   });
               } catch (e) { console.error('Duffel payment error', e); }
           }

           const bookingUpdate = {
             ref: payingBooking.ref,
             status: 'confirmed',
             payment: {
                provider: "stripe",
                sessionId: stripeSession.id,
                status: stripeSession.payment_status || stripeSession.status,
                amountTotal: stripeSession.amount_total,
                currency: stripeSession.currency
             }
           };

           await fetch("/api/bookings", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ action: "save", booking: bookingUpdate })
           });

           localStorage.removeItem('bc_paying_booking');
           if (refEl) window.setText(refEl, payingBooking.ref);
           return;
        }

        const recoveredBookingRef = stripeSession.client_reference_id || stripeSession.metadata?.bookingRef || state.bookingRef || "";
        const nextState = window.writeState({
          bookingRef: recoveredBookingRef || state.bookingRef || "",
          payment: {
            provider: "stripe",
            sessionId: stripeSession.id,
            status: stripeSession.payment_status || stripeSession.status,
            amountTotal: stripeSession.amount_total,
            currency: stripeSession.currency
          }
        });

        if (nextState.bookingRef && !nextState._bookingSaved) {
          const s = nextState.search || {};
          const flight = (nextState.flights || []).find(f => f.id === nextState.selectedFlightId) || (nextState.flights || [])[0];
          const totals = window.computeTotals(nextState);

          let contactObj = nextState.contact || {};
          if (!contactObj.email) {
            try {
              const gu = JSON.parse(localStorage.getItem('bookingcart_user') || '{}');
              if (gu.email) contactObj = { email: gu.email, phone: contactObj.phone || '' };
            } catch (e) { }
          }

          // ── Step 3: Create Duffel order with the real airline ─────────────────
          let duffelOrderRef = null;
          let duffelOrderId = null;
          const duffelRes = await createDuffelOrder(nextState, totals, false);
          if (duffelRes.ref) {
            window.writeState({ bookingRef: duffelRes.ref, _duffelOrderId: duffelRes.id });
            nextState.bookingRef = duffelRes.ref;
            duffelOrderRef = duffelRes.ref;
            duffelOrderId = duffelRes.id;
            if (refEl) window.setText(refEl, duffelRes.ref);
            console.log('✅ Duffel order created — PNR:', duffelOrderRef, 'Order ID:', duffelOrderId);
          } else {
            console.warn('Duffel order failed (non-fatal, booking will still be saved locally)');
          }
          // ─────────────────────────────────────────────────────────────────────

          const booking = {
            ref: nextState.bookingRef,
            route: (s.from || "") + " \u2192 " + (s.to || ""),
            dates: (s.depart || "") + (s.return ? " \u2192 " + s.return : ""),
            flight: flight ? { airline: flight.airline.name, time: flight.departTime + " \u2192 " + flight.arriveTime } : null,
            contact: contactObj,
            passengers: nextState.travelers || nextState.passengers || [],
            total: totals.total,
            extras: nextState.extras || {},
            status: "confirmed",
            duffelOrderId: duffelOrderId || null,
            duffelBookingReference: duffelOrderRef || null,
            payment: {
              provider: "stripe",
              sessionId: stripeSession.id,
              status: stripeSession.payment_status || stripeSession.status,
              amountTotal: stripeSession.amount_total,
              currency: stripeSession.currency
            }
          };

          const saveResp = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", booking })
          });
          const saveData = await saveResp.json().catch(() => null);
          if (!saveResp.ok || !saveData || !saveData.ok) {
            throw new Error((saveData && saveData.error) || "Booking save failed");
          }

          window.writeState({ _bookingSaved: true, _stripeSessionId: stripeSession.id });
          console.log("\u2705 Booking saved to server:", nextState.bookingRef);
        }
      } catch (err) {
        console.error("Stripe confirmation error:", err);
        if (statusEl && window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === "function") {
          window.bookingcartLoading.setBusy(statusEl, false);
        }
        if (statusEl) statusEl.textContent = "Unable to verify payment";
        if (headlineEl) headlineEl.textContent = "Payment verification failed";
        if (subtitleEl) subtitleEl.textContent = "Please retry from the payment page or contact support.";
      }
      })();
    }

    const totals = window.computeTotals(state);
    const totalEl = root.querySelector("[data-confirm-total]");
    if (totalEl) window.setText(totalEl, window.money(totals.total, totals.currency));

    const flight = (state.flights || []).find((f) => f.id === state.selectedFlightId) || (state.flights || [])[0];
    const flightEl = root.querySelector("[data-confirm-airline]");
    if (flightEl && flight) {
      const s = state.search || {};

      const elAirline = root.querySelector("[data-confirm-airline]");
      const elOriginCity = root.querySelector("[data-confirm-origin-city]");
      const elOriginTime = root.querySelector("[data-confirm-origin-time]");
      const elDestCity = root.querySelector("[data-confirm-dest-city]");
      const elDestTime = root.querySelector("[data-confirm-dest-time]");
      const elDuration = root.querySelector("[data-confirm-duration]");
      const elSeats = root.querySelector("[data-confirm-seats]");
      const elPlatform = root.querySelector("[data-confirm-platform]");

      if (elAirline) window.setText(elAirline, flight.airline.name);
      if (elOriginCity) window.setText(elOriginCity, s.from || "Origin");
      if (elOriginTime) window.setText(elOriginTime, (s.depart || "") + (s.depart && flight.departTime ? " • " : "") + (flight.departTime || ""));
      if (elDestCity) window.setText(elDestCity, s.to || "Destination");
      if (elDestTime) window.setText(elDestTime, (s.return || s.depart || "") + ((s.return || s.depart) && flight.arriveTime ? " • " : "") + (flight.arriveTime || ""));

      if (elDuration) {
        const directText = "Direct";
        const dur = flight.durationMin ? durationLabel(flight.durationMin) : (flight.departTime + " → " + flight.arriveTime);
        elDuration.innerHTML = dur + "<br><span class=\"font-semibold opacity-70\">" + directText + "</span>";
      }

      const travelers = state.travelers || state.passengers || [];
      const passCount = travelers.length || 1;
      const ranSeat = flight.id ? flight.id.slice(-2).replace(/[^0-9]/g, '4') : '42';
      const ranGate = flight.id ? flight.id.slice(0, 2).toUpperCase() : 'B';

      if (elSeats) window.setText(elSeats, passCount > 1 ? passCount + " Seats" : ranSeat + "A");
      if (elPlatform) window.setText(elPlatform, ranGate + "12");
    }

    const downloadBtn = root.querySelector("[data-download]");
    if (downloadBtn)
      downloadBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const lines = [];
        const s = state.search || {};
        lines.push("Booking Reference: " + (state.bookingRef || ""));
        lines.push("Route: " + (s.from || "") + " -> " + (s.to || ""));
        lines.push("Dates: " + (s.depart || "") + (s.return ? " -> " + s.return : ""));
        if (flight) lines.push("Flight: " + flight.airline.name + " (" + flight.id + ") " + flight.departTime + " -> " + flight.arriveTime);
        lines.push("Total Paid: " + window.money(totals.total));
        lines.push("Contact: " + ((state.contact || {}).email || ""));

        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ticket-" + (state.bookingRef || "booking") + ".txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });

    const emailBtn = root.querySelector("[data-email]");
    if (emailBtn)
      emailBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const email = ((state.contact || {}).email || "").trim();
        if (!email) {
          window.toast("No email", "Go back and add a contact email.");
          return;
        }
        window.toast("Ticket queued", "Demo: ticket would be emailed to " + email + ".");
      });
  }

  /* ─── Profile Dropdown ─── */
  function initProfileDropdown() {
    const trigger = document.querySelector("[data-profile-trigger]");
    const menu = document.querySelector("[data-profile-menu]");
    if (!trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !trigger.contains(e.target)) {
        menu.classList.add("hidden");
      }
    });

    // Sign out
    const signout = menu.querySelector("[data-signout]");
    if (signout) {
      signout.addEventListener("click", () => {
        try {
          localStorage.removeItem("bookingcart_user");
          localStorage.removeItem("bookingcart_google_id_token");
          localStorage.removeItem("bc_user");
        } catch (e) {}
        window.location.reload();
      });
    }
  }

  function init() {
    console.log("🚀 BookingCart initializing...");
    initStepper();
    initDropdowns();
    initProfileDropdown();
    initAirportSuggestAll();
    initTripTabs();
    initPassengerControls();
    initCalendar();
    initSearchForm();
    initResults();
    initDetails();
    // Note: fetchFlightsAndDisplay, displayFlights, fetchFlightsFromSearch, extractAirportCode
    // are legacy functions kept below for backward compatibility but initResults handles everything.
    initPassengers();
    initExtras();
    // initPayment(); // Disabled for React-based Duffel Component
    initConfirmation();
    console.log("✅ BookingCart initialization complete");
  }

  // Legacy functions removed — initResults now handles all flight fetching and display

  // Google Sign-In: implemented in js/auth.js (window.handleGoogleSignIn)

  function updateAuthUI() {
    if (typeof window.applyAuthUI === "function") {
      window.applyAuthUI();
    }
  }

  window.BookingCart = {
    readState,
    writeState,
    money,
    toast,
    updateAuthUI
  };

  init();
  updateAuthUI();
})();
