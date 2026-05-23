/**
 * deals.js — Top Flight Deals client module (v2)
 * 
 * Changes from v1:
 * - Client-side IP geolocation via ipapi.co (works on localhost & production)
 * - Curated destination images (stable URLs, no Unsplash dependency)
 * - Better card design with country flag emojis
 * - AI personalization via search history
 */
(function () {
    'use strict';

    const CACHE_KEY = 'bc_deals_cache';
    const HISTORY_KEY = 'bc_search_history';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    // ── Curated destination images (reliable, beautiful) ─────────────────────────
    const DEST_IMAGES = {
        'dubai': 'https://images.pexels.com/photos/325193/pexels-photo-325193.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'london': 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'paris': 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'new-york': 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'new york': 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'nairobi': 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'johannesburg': 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'cairo': 'https://images.pexels.com/photos/3290075/pexels-photo-3290075.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'istanbul': 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'singapore': 'https://images.pexels.com/photos/777059/pexels-photo-777059.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'bangkok': 'https://images.pexels.com/photos/1682748/pexels-photo-1682748.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'amsterdam': 'https://images.pexels.com/photos/2031706/pexels-photo-2031706.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'mumbai': 'https://images.pexels.com/photos/2104152/pexels-photo-2104152.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'miami': 'https://images.pexels.com/photos/421655/pexels-photo-421655.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'los-angeles': 'https://images.pexels.com/photos/2263683/pexels-photo-2263683.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
        'cancun': 'https://images.pexels.com/photos/1174732/pexels-photo-1174732.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
    };
    const FALLBACK_IMAGE = 'https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop';

    // ── Country flag emojis ──────────────────────────────────────────────────────
    const FLAGS = {
        'UAE': '🇦🇪', 'UK': '🇬🇧', 'Kenya': '🇰🇪', 'South Africa': '🇿🇦',
        'Egypt': '🇪🇬', 'Turkey': '🇹🇷', 'USA': '🇺🇸', 'France': '🇫🇷',
        'Netherlands': '🇳🇱', 'Singapore': '🇸🇬', 'Thailand': '🇹🇭',
        'India': '🇮🇳', 'Mexico': '🇲🇽', 'Uganda': '🇺🇬',
    };

    // ── City → IATA (client-side mapping for geo override) ───────────────────────
    const CITY_TO_IATA = {
        'kampala': 'EBB', 'entebbe': 'EBB', 'nairobi': 'NBO',
        'dar es salaam': 'DAR', 'johannesburg': 'JNB',
        'cape town': 'CPT', 'lagos': 'LOS', 'accra': 'ACC',
        'cairo': 'CAI', 'dubai': 'DXB', 'london': 'LHR',
        'paris': 'CDG', 'amsterdam': 'AMS', 'frankfurt': 'FRA',
        'new delhi': 'DEL', 'delhi': 'DEL', 'mumbai': 'BOM',
        'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD',
        'toronto': 'YYZ', 'sydney': 'SYD', 'singapore': 'SIN',
        'bangkok': 'BKK', 'istanbul': 'IST',
    };
    const COUNTRY_TO_IATA = {
        'Uganda': 'EBB', 'Kenya': 'NBO', 'Tanzania': 'DAR',
        'South Africa': 'JNB', 'Nigeria': 'LOS', 'Ghana': 'ACC',
        'Egypt': 'CAI', 'United Kingdom': 'LHR', 'France': 'CDG',
        'Germany': 'FRA', 'Netherlands': 'AMS', 'Italy': 'FCO',
        'Spain': 'MAD', 'United States': 'JFK', 'Canada': 'YYZ',
        'United Arab Emirates': 'DXB', 'India': 'DEL', 'Singapore': 'SIN',
        'Australia': 'SYD', 'Japan': 'NRT', 'China': 'PEK',
        'Turkey': 'IST', 'Brazil': 'GRU', 'Thailand': 'BKK',
    };

    // ── Helpers ────────────────────────────────────────────────────────
    

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
    }
    function recordSearch(destination) {
        const h = getHistory();
        h.unshift(destination);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
    }

    function getClientCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { data, expires } = JSON.parse(raw);
            if (Date.now() < expires) return data;
        } catch { }
        return null;
    }
    function setClientCache(data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, expires: Date.now() + CACHE_TTL })); } catch { }
    }

    function getImage(key) {
        return DEST_IMAGES[(key || '').toLowerCase()] || DEST_IMAGES[(key || '').toLowerCase().replace(/ /g, '-')] || FALLBACK_IMAGE;
    }

    // ── Client-side IP Geolocation ──────────────────────────────────────────
    async function detectUserLocation() {
        // Try ipapi.co first (works from browser, no API key, returns JSON)
        const apis = [
            { url: 'https://ipapi.co/json/', parse: d => ({ city: d.city, country: d.country_name, iata: CITY_TO_IATA[(d.city || '').toLowerCase()] || COUNTRY_TO_IATA[d.country_name] || '' }) },
            { url: 'https://ip-api.com/json/?fields=city,country', parse: d => ({ city: d.city, country: d.country, iata: CITY_TO_IATA[(d.city || '').toLowerCase()] || COUNTRY_TO_IATA[d.country] || '' }) },
        ];
        for (const api of apis) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4000);
                const resp = await fetch(api.url, { signal: controller.signal });
                clearTimeout(timeout);
                if (resp.ok) {
                    const data = await resp.json();
                    const result = api.parse(data);
                    if (result.city) return result;
                }
            } catch { }
        }
        return { city: '', country: '', iata: '' };
    }

    // ── AI Personalization ───────────────────────────────────────────────
    function personalizeDeals(deals) {
        const history = getHistory();
        const favMap = {};
        history.forEach(d => { favMap[d] = (favMap[d] || 0) + 1; });
        return deals.map(d => ({ ...d, personalScore: (favMap[d.to] || 0) + (favMap[d.city] || 0) }));
    }

    // ── Sorting ──────────────────────────────────────────────────────────
    function sortDeals(deals, mode) {
        const clone = [...deals];
        if (mode === 'price') return clone.sort((a, b) => a.price - b.price);
        if (mode === 'popular') return clone.sort((a, b) => (b.personalScore - a.personalScore) || (a.stops - b.stops) || (a.price - b.price));
        if (mode === 'trending') return clone.sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || (a.price - b.price));
        return clone;
    }

    // ── Filtering ──────────────────────────────────────────────────────────
    function filterDeals(deals, filters) {
        return deals.filter(d => {
            if (filters.directOnly && d.stops > 0) return false;
            if (d.price < filters.minPrice || d.price > filters.maxPrice) return false;
            if (filters.month) {
                const dealMonth = (d.date || '').slice(5, 7);
                if (dealMonth !== filters.month) return false;
            }
            return true;
        });
    }

    // ── Skeleton ──────────────────────────────────────────────────────────
    function renderSkeletons(container) {
        if (window.bookingcartLoading && typeof window.bookingcartLoading.renderSkeletons === 'function') {
            window.bookingcartLoading.renderSkeletons(container, 'deal', 6);
            return;
        }
        container.innerHTML = Array(6).fill(0).map(() => `
      <div class="flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm animate-pulse">
        <div class="h-44 bg-gradient-to-br from-slate-200 dark:from-slate-700 to-slate-100 dark:to-slate-600"></div>
        <div class="p-5 space-y-3">
          <div class="flex justify-between"><div class="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/2"></div><div class="h-6 bg-green-100 dark:bg-green-900/50 rounded-lg w-1/4"></div></div>
          <div class="h-3 bg-slate-100 dark:bg-slate-700 rounded w-2/3"></div>
          <div class="flex gap-2"><div class="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg w-16"></div><div class="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg w-20"></div></div>
          <div class="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl w-full mt-2"></div>
        </div>
      </div>`).join('');
    }

    // ── Card HTML ──────────────────────────────────────────────────────────
    function renderCard(deal, originCode) {
        const price = window.money(deal.price, deal.currency);
        const stops = deal.stops === 0 ? 'Direct' : `${deal.stops} stop${deal.stops > 1 ? 's' : ''}`;
        const stopsIcon = deal.stops === 0 ? 'ph-check-circle' : 'ph-arrow-bend-right-down';
        const stopsColor = deal.stops === 0 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';
        const dateStr = deal.date ? new Date(deal.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const flag = FLAGS[deal.country] || '🌍';
        const imgUrl = getImage(deal.image || deal.city);
        const hotBadge = deal.hot
            ? '<span class="absolute top-3 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1"><i class="ph-fill ph-fire-simple"></i> Hot Deal</span>'
            : '';



        return `
    <div class="group flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300">
      <!-- Image -->
      <div class="relative h-44 overflow-hidden">
        <img data-src="${imgUrl}" alt="${deal.city}" loading="lazy"
          class="lazy-img w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-0" />
        ${hotBadge}
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
        <div class="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div class="text-white">
            <div class="flex items-center gap-1.5 text-xs font-medium opacity-90 mb-0.5">
              <i class="ph ph-airplane-takeoff"></i> ${originCode} → ${deal.to}
            </div>
            <div class="font-extrabold text-lg leading-tight">${flag} ${deal.city}</div>
          </div>
          <div class="bg-white dark:bg-slate-800/20 dark:bg-black/40 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg">
            ${deal.tripType || 'One-way'}
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="p-5">
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="text-sm font-bold text-slate-900 dark:text-white">${deal.city}, ${deal.country}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 mt-0.5">${deal.country}</div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-extrabold text-green-600 leading-tight">${price}</div>
            <div class="text-[10px] text-slate-400 font-medium">per person</div>
          </div>
        </div>

        <!-- Tags -->
        <div class="flex items-center gap-1.5 mb-4 flex-wrap">
          ${deal.airline ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg"><i class="ph ph-airplane-tilt"></i> ${deal.airline}</span>` : ''}
          <span class="inline-flex items-center gap-1 text-[11px] font-semibold ${stopsColor} px-2.5 py-1 rounded-lg"><i class="ph ${stopsIcon}"></i> ${stops}</span>
          ${dateStr ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg"><i class="ph ph-calendar-blank"></i> ${dateStr}</span>` : ''}
        </div>

        <!-- CTA -->
        <button onclick="window.dealsModule.bookDeal('${originCode}','${deal.to}','${deal.date || ''}','${deal.city}')"
           class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all text-sm cursor-pointer group-hover:shadow-lg group-hover:shadow-green-600/20">
          <i class="ph ph-paper-plane-tilt"></i> Book Now
        </button>
      </div>
    </div>`;
    }

    // ── Lazy Image Loader ──────────────────────────────────────────────────
    function initLazyImages() {
        const imgs = document.querySelectorAll('.lazy-img[data-src]');
        if ('IntersectionObserver' in window) {
            const obs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        const img = e.target;
                        img.src = img.dataset.src;
                        img.onload = () => { img.classList.remove('opacity-0'); img.classList.add('opacity-100'); };
                        img.onerror = () => { img.src = FALLBACK_IMAGE; img.classList.remove('opacity-0'); };
                        obs.unobserve(img);
                    }
                });
            }, { rootMargin: '300px' });
            imgs.forEach(img => obs.observe(img));
        } else {
            imgs.forEach(img => { img.src = img.dataset.src; img.classList.remove('opacity-0'); });
        }
    }

    // ── SEO ──────────────────────────────────────────────────────────────────
    function updateSEO(origin, city, deals) {
        const c = city || origin;
        document.title = `Cheap Flights from ${c} | BookingCart`;
        let md = document.querySelector('meta[name="description"]');
        if (!md) { md = document.createElement('meta'); md.name = 'description'; document.head.appendChild(md); }
        md.content = `Find the best flight deals from ${c}. Compare prices and book cheap flights instantly on BookingCart.`;

        const old = document.getElementById('flight-schema');
        if (old) old.remove();
        const s = document.createElement('script');
        s.id = 'flight-schema';
        s.type = 'application/ld+json';
        s.textContent = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            'name': `Top Flight Deals from ${c}`,
            'itemListElement': deals.slice(0, 5).map((d, i) => ({
                '@type': 'ListItem', 'position': i + 1,
                'item': { '@type': 'Flight', 'name': `${c} to ${d.city}`, 'offers': { '@type': 'Offer', 'price': d.price, 'priceCurrency': d.currency || 'USD' } }
            }))
        });
        document.head.appendChild(s);
    }

    // ── State ──────────────────────────────────────────────────────────────
    let currentDeals = [];
    let currentOrigin = '';
    let currentCity = '';
    let currentCountry = '';
    let currentFilters = { minPrice: 0, maxPrice: 5000, directOnly: false, month: '' };
    let currentSort = 'price';

    function renderDeals() {
        const grid = document.getElementById('deals-grid');
        if (!grid) return;
        if (window.bookingcartLoading && typeof window.bookingcartLoading.setBusy === 'function') {
            window.bookingcartLoading.setBusy(grid, false);
        }
        let deals = personalizeDeals(currentDeals);
        deals = filterDeals(deals, currentFilters);
        deals = sortDeals(deals, currentSort);
        if (!deals.length) {
            grid.innerHTML = '<div class="text-center py-16 text-slate-400"><div class="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3"><i class="ph ph-airplane-tilt text-3xl"></i></div><p class="font-medium">No deals match your filters.</p></div>';
            return;
        }
        grid.innerHTML = deals.map(d => renderCard(d, currentOrigin)).join('');
        initLazyImages();
        // Update popular routes section
        if (typeof renderPopularRoutes === 'function') {
            renderPopularRoutes();
        }
        // Update carousel arrow visibility
        if (typeof window._dealsUpdateArrows === 'function') {
            setTimeout(window._dealsUpdateArrows, 50);
        }
    }

    window.dealsModule = {
        trackBook(iata, city) { recordSearch(iata); recordSearch(city); },
        bookDeal(from, to, date, city) {
            // Write search state to localStorage so results.html picks it up
            const STORAGE_KEY = 'bookingcart_flights_v1';
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const current = raw ? JSON.parse(raw) : {};
                current.search = { from, to, depart: date, return: '', cabin: 'Economy' };
                current.tripType = 'oneway';
                current.passengers = current.passengers || { adults: 1, children: 0, infants: 0 };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            } catch (e) {
                console.error('Failed to write deal state:', e);
            }
            recordSearch(to);
            recordSearch(city);
            if (typeof window.__bcNavigate === 'function') window.__bcNavigate('results.html');
            else window.location.href = 'results.html';
        }
    };

    // ── Init ──────────────────────────────────────────────────────────────────
    async function initDeals() {
        const section = document.getElementById('deals-section');
        const grid = document.getElementById('deals-grid');
        const titleEl = document.getElementById('deals-title');
        const originInput = document.getElementById('deals-origin-input');
        if (!section || !grid) return;

        renderSkeletons(grid);

        // Check client cache
        const cached = getClientCache();
        if (cached) {
            currentDeals = cached.deals;
            currentOrigin = cached.origin;
            currentCity = cached.city;
            currentCountry = cached.country || '';
            if (titleEl) titleEl.textContent = `Top Deals from ${currentCity || currentOrigin}`;
            if (originInput) originInput.value = currentOrigin;
            updateSEO(currentOrigin, currentCity, currentDeals);
            renderDeals();
            return;
        }

        // Step 1: Detect user location from browser (client-side IP geo)
        let detectedOrigin = '';
        let detectedCity = '';
        let detectedCountry = '';
        try {
            const loc = await detectUserLocation();
            detectedCity = loc.city || '';
            detectedCountry = loc.country || '';
            detectedOrigin = loc.iata || '';
        } catch { }

        // Step 2: Fetch deals from server, passing detected origin
        try {
            const resp = await fetch('/api/flight-deals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: detectedOrigin, city: detectedCity, country: detectedCountry })
            });
            const data = await resp.json();
            if (data.ok && data.deals && data.deals.length) {
                currentDeals = data.deals;
                currentOrigin = data.origin;
                // Use the detected city for display (more accurate)
                currentCity = detectedCity || data.city || currentOrigin;
                currentCountry = detectedCountry || '';
                if (titleEl) titleEl.textContent = `Top Deals from ${currentCity}`;
                if (originInput) originInput.value = currentOrigin;
                setClientCache({ deals: currentDeals, origin: currentOrigin, city: currentCity, country: currentCountry });
                updateSEO(currentOrigin, currentCity, currentDeals);
                renderDeals();
            } else {
                grid.innerHTML = '<div class="text-center py-16 text-slate-400"><p class="font-medium">Could not load deals right now.</p></div>';
            }
        } catch (err) {
            grid.innerHTML = '<div class="text-center py-16 text-slate-400"><p class="font-medium">Could not load deals right now.</p></div>';
        }
    }

    // ── Controls ──────────────────────────────────────────────────────────
    function initControls() {
        // Sort buttons
        document.querySelectorAll('[data-sort]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentSort = btn.dataset.sort;
                document.querySelectorAll('[data-sort]').forEach(b => {
                    b.className = b.dataset.sort === currentSort
                        ? 'px-4 py-2 rounded-xl text-sm font-bold bg-green-600 text-white transition-all'
                        : 'px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 transition-all';
                });
                renderDeals();
            });
        });

        // Price sliders
        const minSlider = document.getElementById('deals-min-price');
        const maxSlider = document.getElementById('deals-max-price');
        const priceLabel = document.getElementById('deals-price-label');
        function updatePrice() {
            currentFilters.minPrice = parseInt(minSlider.value);
            currentFilters.maxPrice = parseInt(maxSlider.value);
            if (priceLabel) priceLabel.textContent = `$${currentFilters.minPrice} – $${currentFilters.maxPrice >= 5000 ? '5000+' : currentFilters.maxPrice}`;
            renderDeals();
        }
        if (minSlider) minSlider.addEventListener('input', updatePrice);
        if (maxSlider) maxSlider.addEventListener('input', updatePrice);

        // Direct only
        const directToggle = document.getElementById('deals-direct-only');
        if (directToggle) directToggle.addEventListener('change', () => { currentFilters.directOnly = directToggle.checked; renderDeals(); });

        // Month
        const monthSelect = document.getElementById('deals-month');
        if (monthSelect) monthSelect.addEventListener('change', () => { currentFilters.month = monthSelect.value; renderDeals(); });

        // Change origin
        const originInput = document.getElementById('deals-origin-input');
        const originBtn = document.getElementById('deals-origin-btn');
        if (originBtn) originBtn.addEventListener('click', async () => {
            const val = (originInput.value || '').trim().toUpperCase();
            if (val.length === 3) {
                localStorage.removeItem(CACHE_KEY);
                const grid = document.getElementById('deals-grid');
                renderSkeletons(grid);
                try {
                    const resp = await fetch(`/api/flight-deals?origin=${val}`);
                    const data = await resp.json();
                    if (data.ok) {
                        currentDeals = data.deals;
                        currentOrigin = data.origin;
                        currentCity = data.city || val;
                        currentCountry = getCountryByIata(val);
                        const titleEl = document.getElementById('deals-title');
                        if (titleEl) titleEl.textContent = `Top Deals from ${currentCity}`;
                        setClientCache({ deals: currentDeals, origin: val, city: currentCity, country: currentCountry });
                        renderDeals();
                    }
                } catch { }
            }
        });

        // ── Carousel arrow buttons ────────────────────────────────────────
        const grid = document.getElementById('deals-grid');
        const prevBtn = document.getElementById('deals-prev');
        const nextBtn = document.getElementById('deals-next');
        const SCROLL_AMOUNT = 220;

        function updateArrows() {
            if (!grid || !prevBtn || !nextBtn) return;
            prevBtn.style.display = grid.scrollLeft <= 4 ? 'none' : 'flex';
            nextBtn.style.display = (grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 4) ? 'none' : 'flex';
        }

        if (prevBtn) prevBtn.addEventListener('click', () => { grid.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' }); });
        if (nextBtn) nextBtn.addEventListener('click', () => { grid.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' }); });
        if (grid) {
            grid.addEventListener('scroll', updateArrows);
            // Re-check after deals render (called from renderDeals via a small delay)
            window._dealsUpdateArrows = updateArrows;
        }
    }

    // ── Helper IATA Reverse Lookups ──────────────────────────────────────────
    function getCityByIata(iata) {
        for (const [city, code] of Object.entries(CITY_TO_IATA)) {
            if (code === iata) return city.charAt(0).toUpperCase() + city.slice(1);
        }
        return iata;
    }

    function getCountryByIata(iata) {
        for (const [country, code] of Object.entries(COUNTRY_TO_IATA)) {
            if (code === iata) return country;
        }
        return '';
    }

    // ── Popular Routes Data ──────────────────────────────────────────────────
    const POPULAR_ROUTES_DATA = {
        popular: [
            { label: 'London', to: 'LHR', city: 'London', imageKey: 'london' },
            { label: 'Istanbul', to: 'IST', city: 'Istanbul', imageKey: 'istanbul' },
            { label: 'Dubai', to: 'DXB', city: 'Dubai', imageKey: 'dubai' },
            { label: 'Paris', to: 'CDG', city: 'Paris', imageKey: 'paris' },
            { label: 'New York', to: 'JFK', city: 'New York', imageKey: 'new-york' },
            { label: 'Amsterdam', to: 'AMS', city: 'Amsterdam', imageKey: 'amsterdam' },
            { label: 'Singapore', to: 'SIN', city: 'Singapore', imageKey: 'singapore' },
            { label: 'Bangkok', to: 'BKK', city: 'Bangkok', imageKey: 'bangkok' },
            { label: 'Cairo', to: 'CAI', city: 'Cairo', imageKey: 'cairo' }
        ],
        cities: [
            { label: 'Johannesburg', to: 'JNB', city: 'Johannesburg', imageKey: 'johannesburg' },
            { label: 'Mumbai', to: 'BOM', city: 'Mumbai', imageKey: 'mumbai' },
            { label: 'Los Angeles', to: 'LAX', city: 'Los Angeles', imageKey: 'los-angeles' },
            { label: 'Miami', to: 'MIA', city: 'Miami', imageKey: 'miami' },
            { label: 'Nairobi', to: 'NBO', city: 'Nairobi', imageKey: 'nairobi' },
            { label: 'London', to: 'LHR', city: 'London', imageKey: 'london' },
            { label: 'Paris', to: 'CDG', city: 'Paris', imageKey: 'paris' },
            { label: 'Dubai', to: 'DXB', city: 'Dubai', imageKey: 'dubai' },
            { label: 'Istanbul', to: 'IST', city: 'Istanbul', imageKey: 'istanbul' }
        ],
        countries: [
            { label: 'United Kingdom', to: 'LHR', city: 'London', imageKey: 'london' },
            { label: 'Turkey', to: 'IST', city: 'Istanbul', imageKey: 'istanbul' },
            { label: 'France', to: 'CDG', city: 'Paris', imageKey: 'paris' },
            { label: 'Egypt', to: 'CAI', city: 'Cairo', imageKey: 'cairo' },
            { label: 'United States', to: 'JFK', city: 'New York', imageKey: 'new-york' },
            { label: 'Singapore', to: 'SIN', city: 'Singapore', imageKey: 'singapore' },
            { label: 'Thailand', to: 'BKK', city: 'Bangkok', imageKey: 'bangkok' },
            { label: 'Netherlands', to: 'AMS', city: 'Amsterdam', imageKey: 'amsterdam' },
            { label: 'India', to: 'BOM', city: 'Mumbai', imageKey: 'mumbai' }
        ],
        regions: [
            { label: 'Middle East', to: 'DXB', city: 'Dubai', imageKey: 'dubai' },
            { label: 'Southeast Asia', to: 'SIN', city: 'Singapore', imageKey: 'singapore' },
            { label: 'East Africa', to: 'NBO', city: 'Nairobi', imageKey: 'nairobi' },
            { label: 'Asia-Pacific', to: 'BKK', city: 'Bangkok', imageKey: 'bangkok' },
            { label: 'North America', to: 'JFK', city: 'New York', imageKey: 'new-york' },
            { label: 'Western Europe', to: 'CDG', city: 'Paris', imageKey: 'paris' },
            { label: 'Northern Europe', to: 'LHR', city: 'London', imageKey: 'london' },
            { label: 'Southern Europe', to: 'IST', city: 'Istanbul', imageKey: 'istanbul' },
            { label: 'North Africa', to: 'CAI', city: 'Cairo', imageKey: 'cairo' }
        ],
        airports: [
            { label: 'London Heathrow (LHR)', to: 'LHR', city: 'London', imageKey: 'london' },
            { label: 'Istanbul Airport (IST)', to: 'IST', city: 'Istanbul', imageKey: 'istanbul' },
            { label: 'Charles de Gaulle (CDG)', to: 'CDG', city: 'Paris', imageKey: 'paris' },
            { label: 'Dubai Intl (DXB)', to: 'DXB', city: 'Dubai', imageKey: 'dubai' },
            { label: 'JFK International (JFK)', to: 'JFK', city: 'New York', imageKey: 'new-york' },
            { label: 'Amsterdam Schiphol (AMS)', to: 'AMS', city: 'Amsterdam', imageKey: 'amsterdam' },
            { label: 'Singapore Changi (SIN)', to: 'SIN', city: 'Singapore', imageKey: 'singapore' },
            { label: 'Suvarnabhumi Airport (BKK)', to: 'BKK', city: 'Bangkok', imageKey: 'bangkok' },
            { label: 'Cairo International (CAI)', to: 'CAI', city: 'Cairo', imageKey: 'cairo' }
        ]
    };

    let currentPopularRoutesTab = 'popular';

    function renderPopularRoutes() {
        const grid = document.getElementById('popular-routes-grid');
        const title = document.getElementById('popular-routes-title');
        const subtitle = document.getElementById('popular-routes-subtitle');
        if (!grid) return;

        const displayCity = currentCity || getCityByIata(currentOrigin) || 'your location';
        
        if (title) title.textContent = `Top flights from ${displayCity}`;
        if (subtitle) subtitle.textContent = `Explore destinations you can reach from ${displayCity} and start making new plans`;

        const routes = POPULAR_ROUTES_DATA[currentPopularRoutesTab] || [];
        grid.innerHTML = routes.map(route => {
            const imgUrl = getImage(route.imageKey);
            return `
            <div onclick="window.dealsModule.bookDeal('${currentOrigin || 'EBB'}', '${route.to}', '', '${route.city}')"
                 class="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 dark:bg-slate-900 border border-transparent hover:border-slate-100 transition-all cursor-pointer group">
              <img src="${imgUrl}" alt="${route.city}" class="w-14 h-14 object-cover rounded-xl shadow-sm group-hover:scale-105 transition-transform duration-300" />
              <div>
                <div class="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-green-600 transition-colors">
                  ${displayCity} → ${route.label}
                </div>
                <span class="text-xs text-slate-400 font-medium">Flights from ${displayCity}</span>
              </div>
            </div>`;
        }).join('');
    }

    function initPopularRoutes() {
        const tabsContainer = document.getElementById('popular-routes-tabs');
        if (!tabsContainer) return;

        tabsContainer.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPopularRoutesTab = btn.dataset.tab;
                
                // Update active tab styling
                tabsContainer.querySelectorAll('[data-tab]').forEach(b => {
                    if (b.dataset.tab === currentPopularRoutesTab) {
                        b.className = "px-4 py-2 text-sm font-bold rounded-full border border-green-600 bg-green-50 text-green-600 transition-all cursor-pointer";
                    } else {
                        b.className = "px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 transition-all cursor-pointer";
                    }
                });

                renderPopularRoutes();
            });
        });

        renderPopularRoutes();
    }

    function bootDeals() {
        initDeals();
        initControls();
        initPopularRoutes();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootDeals);
    } else {
        bootDeals();
    }
})();
