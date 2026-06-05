(function () {
  const USER_APP_IDS_KEY = "bookingcart_visa_app_ids_v1";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function readAppIds() {
    const raw = localStorage.getItem(USER_APP_IDS_KEY);
    const parsed = safeJsonParse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }

  function writeAppIds(ids) {
    localStorage.setItem(USER_APP_IDS_KEY, JSON.stringify(ids));
  }

  function addAppId(id) {
    const ids = readAppIds();
    if (!ids.includes(id)) ids.unshift(id);
    writeAppIds(ids.slice(0, 50));
  }

  function setHtml(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  

  function badge(text) {
    return `<span class="pill" style="padding:6px 10px;font-size:12px">${escapeHtml(text)}</span>`;
  }

  const COUNTRY_ISO_CACHE_KEY = "bookingcart_country_iso2_v1";

  function normKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function flagEmojiFromIso2(iso2) {
    const code = String(iso2 || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "";
    const A = 0x1f1e6;
    const first = code.charCodeAt(0) - 65;
    const second = code.charCodeAt(1) - 65;
    return String.fromCodePoint(A + first, A + second);
  }

  async function loadCountryIso2Map() {
    try {
      const cached = safeJsonParse(localStorage.getItem(COUNTRY_ISO_CACHE_KEY) || "{}");
      if (cached && typeof cached === "object" && Object.keys(cached).length > 50) return cached;
    } catch {
    }

    const resp = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2,altSpellings");
    const data = await resp.json().catch(() => []);
    const map = {};

    (Array.isArray(data) ? data : []).forEach((c) => {
      const iso2 = String(c?.cca2 || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(iso2)) return;

      const names = [];
      if (c?.name?.common) names.push(String(c.name.common));
      if (c?.name?.official) names.push(String(c.name.official));
      const alt = Array.isArray(c?.altSpellings) ? c.altSpellings : [];
      alt.forEach((a) => names.push(String(a)));

      names
        .map(normKey)
        .filter(Boolean)
        .forEach((k) => {
          if (!map[k]) map[k] = iso2;
        });
    });

    try {
      localStorage.setItem(COUNTRY_ISO_CACHE_KEY, JSON.stringify(map));
    } catch {
    }

    return map;
  }

  const COUNTRIES = [
    "Afghanistan",
    "Albania",
    "Algeria",
    "Andorra",
    "Angola",
    "Antigua and Barbuda",
    "Argentina",
    "Armenia",
    "Australia",
    "Austria",
    "Azerbaijan",
    "Bahamas",
    "Bahrain",
    "Bangladesh",
    "Barbados",
    "Belarus",
    "Belgium",
    "Belize",
    "Benin",
    "Bhutan",
    "Bolivia",
    "Bosnia and Herzegovina",
    "Botswana",
    "Brazil",
    "Brunei",
    "Bulgaria",
    "Burkina Faso",
    "Burundi",
    "Cabo Verde",
    "Cambodia",
    "Cameroon",
    "Canada",
    "Central African Republic",
    "Chad",
    "Chile",
    "China",
    "Colombia",
    "Comoros",
    "Congo",
    "Costa Rica",
    "Cote d'Ivoire",
    "Croatia",
    "Cuba",
    "Cyprus",
    "Czech Republic",
    "Democratic Republic of the Congo",
    "Denmark",
    "Djibouti",
    "Dominica",
    "Dominican Republic",
    "Ecuador",
    "Egypt",
    "El Salvador",
    "Equatorial Guinea",
    "Eritrea",
    "Estonia",
    "Eswatini",
    "Ethiopia",
    "Fiji",
    "Finland",
    "France",
    "Gabon",
    "Gambia",
    "Georgia",
    "Germany",
    "Ghana",
    "Greece",
    "Grenada",
    "Guatemala",
    "Guinea",
    "Guinea-Bissau",
    "Guyana",
    "Haiti",
    "Honduras",
    "Hungary",
    "Iceland",
    "India",
    "Indonesia",
    "Iran",
    "Iraq",
    "Ireland",
    "Israel",
    "Italy",
    "Jamaica",
    "Japan",
    "Jordan",
    "Kazakhstan",
    "Kenya",
    "Kiribati",
    "Kuwait",
    "Kyrgyzstan",
    "Laos",
    "Latvia",
    "Lebanon",
    "Lesotho",
    "Liberia",
    "Libya",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Madagascar",
    "Malawi",
    "Malaysia",
    "Maldives",
    "Mali",
    "Malta",
    "Marshall Islands",
    "Mauritania",
    "Mauritius",
    "Mexico",
    "Micronesia",
    "Moldova",
    "Monaco",
    "Mongolia",
    "Montenegro",
    "Morocco",
    "Mozambique",
    "Myanmar",
    "Namibia",
    "Nauru",
    "Nepal",
    "Netherlands",
    "New Zealand",
    "Nicaragua",
    "Niger",
    "Nigeria",
    "North Korea",
    "North Macedonia",
    "Norway",
    "Oman",
    "Pakistan",
    "Palau",
    "Panama",
    "Papua New Guinea",
    "Paraguay",
    "Peru",
    "Philippines",
    "Poland",
    "Portugal",
    "Qatar",
    "Romania",
    "Russia",
    "Rwanda",
    "Saint Kitts and Nevis",
    "Saint Lucia",
    "Saint Vincent and the Grenadines",
    "Samoa",
    "San Marino",
    "Sao Tome and Principe",
    "Saudi Arabia",
    "Senegal",
    "Serbia",
    "Seychelles",
    "Sierra Leone",
    "Singapore",
    "Slovakia",
    "Slovenia",
    "Solomon Islands",
    "Somalia",
    "South Africa",
    "South Korea",
    "South Sudan",
    "Spain",
    "Sri Lanka",
    "Sudan",
    "Suriname",
    "Sweden",
    "Switzerland",
    "Syria",
    "Taiwan",
    "Tajikistan",
    "Tanzania",
    "Thailand",
    "Timor-Leste",
    "Togo",
    "Tonga",
    "Trinidad and Tobago",
    "Tunisia",
    "Turkey",
    "Turkmenistan",
    "Tuvalu",
    "Uganda",
    "Ukraine",
    "United Arab Emirates",
    "United Kingdom",
    "United States",
    "Uruguay",
    "Uzbekistan",
    "Vanuatu",
    "Vatican City",
    "Venezuela",
    "Vietnam",
    "Yemen",
    "Zambia",
    "Zimbabwe"
  ];

  function normCountry(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  const VISA_FREE_GROUP = new Set(
    ["Mauritius", "Seychelles", "Barbados", "Bahamas", "Fiji"].map(normCountry)
  );

  function localVisaRules() {
    return {
      "United Arab Emirates": {
        tourism: { type: "eVisa", governmentFee: 95, documents: ["Passport bio page", "Passport photo", "Accommodation details", "Return ticket (recommended)"] },
        business: { type: "eVisa", governmentFee: 125, documents: ["Passport bio page", "Passport photo", "Invitation letter (if applicable)"] },
        transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
      },
      Turkey: {
        tourism: { type: "eVisa", governmentFee: 60, documents: ["Passport bio page", "Passport photo"] },
        business: { type: "eVisa", governmentFee: 75, documents: ["Passport bio page", "Passport photo"] },
        transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
      },
      Kenya: {
        tourism: { type: "eTA", governmentFee: 35, documents: ["Passport bio page", "Passport photo", "Accommodation details", "Return ticket"] },
        business: { type: "eTA", governmentFee: 35, documents: ["Passport bio page", "Passport photo", "Invitation letter (if applicable)"] },
        transit: { type: "Visa-free / Transit rules", governmentFee: 0, documents: ["Valid passport", "Onward ticket"] }
      },
      India: {
        tourism: { type: "eVisa", governmentFee: 40, documents: ["Passport bio page", "Passport photo"] },
        business: { type: "eVisa", governmentFee: 80, documents: ["Passport bio page", "Passport photo", "Business card / invitation (if applicable)"] },
        transit: { type: "Embassy visa", governmentFee: 0, documents: ["Passport bio page", "Passport photo", "Onward ticket"] }
      }
    };
  }

  function computeEligibilityLocal({ nationality, destination, purpose }) {
    const dest = String(destination || "").trim();
    const nat = String(nationality || "").trim();
    const purp = String(purpose || "tourism").trim();

    if (!dest || !nat) {
      return {
        destination: dest,
        nationality: nat,
        purpose: purp,
        visaType: "Visa required",
        summary: "Please provide nationality and destination.",
        processingOptions: [],
        requiredDocuments: []
      };
    }

    // Same country
    if (dest.toLowerCase() === nat.toLowerCase()) {
      return {
        destination: dest,
        nationality: nat,
        purpose: purp,
        visaType: "Visa-free",
        summary: "Based on your input, you may not need a visa to travel domestically. Confirm with official government guidance.",
        processingOptions: [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }],
        requiredDocuments: ["Valid passport"]
      };
    }

    // Try to get ISO2 codes
    const natIso2 = COUNTRY_TO_ISO2[nat];
    const destIso2 = COUNTRY_TO_ISO2[dest];

    // Use dataset if we have ISO2 mappings
    if (natIso2 && destIso2 && typeof getVisaRequirement === 'function') {
      const requirement = getVisaRequirement(natIso2, destIso2);
      const visaType = normalizeDatasetRequirement(requirement);
      
      return {
        destination: dest,
        nationality: nat,
        purpose: purp,
        visaType: visaType,
        summary: `Based on current data: ${visaType} for ${purp}. Always confirm with official government guidance before travel.`,
        processingOptions: getProcessingOptions(visaType),
        requiredDocuments: getRequiredDocuments(visaType)
      };
    }

    // Fallback to mutual visa-free group
    if (VISA_FREE_GROUP.has(normCountry(dest)) && VISA_FREE_GROUP.has(normCountry(nat))) {
      return {
        destination: dest,
        nationality: nat,
        purpose: purp,
        visaType: "Visa-free",
        summary: "Visa-free travel is typically allowed between these countries for short stays. Always confirm with official government guidance before travel.",
        processingOptions: [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }],
        requiredDocuments: ["Valid passport", "Return/onward ticket (recommended)"]
      };
    }

    // Final fallback to local rules
    const rules = localVisaRules();
    const byDest = rules[destination] || null;
    const rule = byDest ? byDest[purpose] || byDest.tourism : null;
    const visaType = rule ? rule.type : "Embassy visa";
    const govFee = rule ? Number(rule.governmentFee || 0) : 0;
    const docs = rule ? rule.documents : ["Passport bio page", "Passport photo"];

    const serviceBase = visaType === "Visa-free" ? 0 : 49;
    const serviceRush = visaType === "Visa-free" ? 0 : 89;

    const processingOptions = visaType === "Visa-free"
      ? [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }]
      : [
          {
            label: "Standard",
            daysMin: visaType === "Embassy visa" ? 10 : 3,
            daysMax: visaType === "Embassy visa" ? 20 : 7,
            governmentFee: govFee,
            serviceFee: serviceBase,
            note: "We prepare, review, and submit your application to the official portal."
          },
          {
            label: "Rush",
            daysMin: visaType === "Embassy visa" ? 7 : 1,
            daysMax: visaType === "Embassy visa" ? 14 : 3,
            governmentFee: govFee,
            serviceFee: serviceRush,
            note: "Prioritized review and submission support. Subject to portal availability."
          }
        ];

    return {
      destination,
      nationality,
      purpose: purp,
      visaType,
      summary: `Based on your input: ${visaType} for ${purp}. Always confirm with official government guidance before travel.`,
      processingOptions,
      requiredDocuments: docs
    };
  }

  function getProcessingOptions(visaType) {
    if (visaType === "Visa-free") {
      return [{ label: "Standard", daysMin: 0, daysMax: 0, governmentFee: 0, serviceFee: 0, note: "No visa required" }];
    }
    
    if (visaType === "eVisa" || visaType === "eTA" || visaType === "Visa on arrival") {
      return [
        {
          label: "Standard",
          daysMin: 1,
          daysMax: 7,
          governmentFee: 0,
          serviceFee: 49,
          note: "We prepare and guide your electronic application."
        },
        {
          label: "Rush",
          daysMin: 1,
          daysMax: 3,
          governmentFee: 0,
          serviceFee: 89,
          note: "Prioritized electronic application support."
        }
      ];
    }
    
    // Embassy visa
    return [
      {
        label: "Standard",
        daysMin: 10,
        daysMax: 20,
        governmentFee: 0,
        serviceFee: 49,
        note: "We prepare, review, and submit your application to the official portal."
      },
      {
        label: "Rush",
        daysMin: 7,
        daysMax: 14,
        governmentFee: 0,
        serviceFee: 89,
        note: "Prioritized review and submission support."
      }
    ];
  }

  function getRequiredDocuments(visaType) {
    if (visaType === "Visa-free") {
      return ["Valid passport", "Return/onward ticket (recommended)"];
    }
    
    if (visaType === "Visa on arrival") {
      return ["Valid passport", "Passport photos", "Return/onward ticket", "Proof of funds"];
    }
    
    if (visaType === "eVisa" || visaType === "eTA") {
      return ["Valid passport", "Passport photo", "Digital documents", "Email address"];
    }
    
    // Embassy visa
    return ["Passport bio page", "Passport photo", "Application form", "Supporting documents"];
  }

  function populateCountrySelect(selectEl, countries, iso2Map) {
    if (!selectEl) return;
    const current = String(selectEl.value || "");
    const firstOption = selectEl.querySelector("option");
    const placeholderHtml = firstOption ? firstOption.outerHTML : '<option value="">Select</option>';
    const options = countries
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((c) => {
        const iso2 = iso2Map ? iso2Map[normKey(c)] : "";
        const flag = iso2 ? flagEmojiFromIso2(iso2) : "";
        const label = flag ? `${flag} ${c}` : c;
        return `<option value="${escapeHtml(c)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    selectEl.innerHTML = placeholderHtml + options;
    if (current) selectEl.value = current;
  }

  function normalizeVisaCategory(visaType) {
    const vt = String(visaType || "").toLowerCase();
    if (vt.includes("visa-free")) return "visa_free";
    if (vt.includes("eta") || vt.includes("evisa")) return "evisa";
    if (vt.includes("visa on arrival")) return "visa_on_arrival";
    return "required";
  }

  function hashToUnit(str, seed) {
    const s = String(str || "");
    let h = seed || 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function renderPassportToolMap(mapEl, passport, groups) {
    if (!mapEl) return;
    const p = String(passport || "").trim();
    if (!p) {
      setHtml(mapEl, "");
      return;
    }

    const dots = [];
    function addDots(items, color) {
      items.forEach((name) => {
        const u = hashToUnit(name, 2166136261);
        const v = hashToUnit(name, 1315423911);
        const x = 40 + u * 920;
        const y = 30 + v * 400;
        dots.push({ x, y, color, name });
      });
    }

    addDots(groups.visa_free, "#03d10c");
    addDots(groups.evisa, "#f6c343");
    addDots(groups.visa_on_arrival, "#ff9500");
    addDots(groups.required, "#8aa59a");

    const total = dots.length || 1;
    const maxDots = 240;
    const step = Math.max(1, Math.floor(total / maxDots));
    const sampled = dots.filter((_, idx) => idx % step === 0).slice(0, maxDots);

    const svgDots = sampled
      .map(
        (d) =>
          `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="3.4" fill="${d.color}" fill-opacity="0.92"><title>${escapeHtml(
            d.name
          )}</title></circle>`
      )
      .join("");

    setHtml(
      mapEl,
      `<div class="card" style="box-shadow:none">
        <div class="card__body">
          <div class="row space" style="gap:12px;flex-wrap:wrap">
            <div>
              <div class="kpi">Map</div>
              <div class="muted" style="margin-top:6px">Summary for ${escapeHtml(p)}.</div>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              ${badge(`Visa-free: ${groups.visa_free.length}`)}
              ${badge(`eVisa / eTA: ${groups.evisa.length}`)}
              ${badge(`Visa on arrival: ${groups.visa_on_arrival.length}`)}
              ${badge(`Required: ${groups.required.length}`)}
            </div>
          </div>
          <div class="hr"></div>
          <svg viewBox="0 0 1000 460" width="100%" height="220" role="img" aria-label="Visa map" style="display:block;border-radius:12px;background:linear-gradient(180deg, rgba(3,209,12,.06), rgba(23,50,29,.02));border:1px solid var(--border)">
            <rect x="0" y="0" width="1000" height="460" fill="rgba(255,255,255,.4)" />
            <path d="M83 267c28-38 66-64 112-78 41-12 84-13 125-8 24 3 48 10 67 22 19 12 33 28 35 52 2 18-5 36-18 49-22 22-56 32-87 36-70 9-138-10-205-36-16-6-31-13-45-23-7-5-13-10-16-14-3-4-2-7 0-12Zm380-166c24-24 59-38 94-41 38-4 76 6 107 28 27 19 45 46 52 79 7 35 1 72-18 101-18 28-48 47-81 55-35 8-73 3-105-12-31-14-56-39-66-71-10-32-6-67 17-99Zm263 86c17-12 39-18 60-18 27 0 54 9 74 27 19 17 31 40 33 66 3 30-7 60-28 82-22 24-54 36-87 35-33-2-65-18-84-45-19-27-23-61-10-91 8-21 24-40 42-56Z" fill="rgba(23,50,29,.08)" />
            ${svgDots}
          </svg>
        </div>
      </div>`
    );
  }

  function renderPassportToolOutput(outEl, mapEl, passport, filterText, iso2Map) {
    if (!outEl) return;
    const p = String(passport || "").trim();
    if (!p) {
      setHtml(outEl, `<div class="muted">Choose a passport above to see results.</div>`);
      if (mapEl) setHtml(mapEl, "");
      return;
    }

    const q = String(filterText || "").trim().toLowerCase();
    const destinations = COUNTRIES.filter((d) => String(d || "") !== p).filter((d) => {
      if (!q) return true;
      return String(d || "").toLowerCase().includes(q);
    });

    const groups = { visa_free: [], evisa: [], visa_on_arrival: [], required: [] };
    for (const dest of destinations) {
      const res = computeEligibilityLocal({ nationality: p, destination: dest, purpose: "tourism" });
      const cat = normalizeVisaCategory(res.visaType);
      groups[cat].push(dest);
    }

    renderPassportToolMap(mapEl, p, groups);

    function listHtml(items) {
      if (!items.length) return `<div class="muted">None found.</div>`;
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${items
        .slice(0, 120)
        .map((x) => {
          const iso2 = iso2Map ? iso2Map[normKey(x)] : "";
          const flag = iso2 ? flagEmojiFromIso2(iso2) : "";
          const label = flag ? `${flag} ${x}` : x;
          return `<div class="row" style="gap:10px;align-items:center">
            <div class="result-dot"></div>
            <div style="font-size:18px;line-height:1.2;cursor:pointer" 
                 onclick="showCountryDetails('${escapeHtml(p)}', '${escapeHtml(x)}', '${iso2}')"
                 title="Click for details">${escapeHtml(label)}</div>
          </div>`;
        })
        .join("")}</div>`;
    }

    const total = destinations.length;

    setHtml(
      outEl,
      `<div class="row space" style="gap:12px;flex-wrap:wrap">
        <div>
          <div class="kpi" style="font-size:16px">${escapeHtml(p)} passport</div>
          <div class="muted" style="margin-top:6px">Showing ${escapeHtml(total)} destinations${q ? ` matching "${escapeHtml(filterText)}"` : ""}.</div>
        </div>
      </div>

      <div style="margin-top:12px;display:grid;gap:12px">
        <div class="card" style="box-shadow:none">
          <div class="card__body">
            <div class="kpi">Visa-free</div>
            <div class="hr"></div>
            ${listHtml(groups.visa_free)}
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <div class="card__body">
            <div class="kpi">eVisa / eTA</div>
            <div class="hr"></div>
            ${listHtml(groups.evisa)}
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <div class="card__body">
            <div class="kpi">Visa on arrival</div>
            <div class="hr"></div>
            ${listHtml(groups.visa_on_arrival)}
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <div class="card__body">
            <div class="kpi">Visa required</div>
            <div class="hr"></div>
            ${listHtml(groups.required)}
          </div>
        </div>
      </div>`
    );
  }

  function initVisaPassportTool(root, iso2Map) {
    const toolRoot = qs("[data-visa-passport-form]");
    if (!toolRoot) return;

    const passportSel = qs("select[name='passport']", toolRoot);
    const filterInput = qs("input[name='destFilter']", toolRoot);
    const mapEl = qs("[data-visa-passport-map]");
    const outEl = qs("[data-visa-passport-output]");
    if (!passportSel || !filterInput || !outEl) return;

    populateCountrySelect(passportSel, COUNTRIES, iso2Map);

    const rerender = () => {
      renderPassportToolOutput(outEl, mapEl, passportSel.value, filterInput.value, iso2Map);
    };

    passportSel.addEventListener("change", rerender);
    filterInput.addEventListener("input", rerender);
    rerender();
  }

  async function api(path, options) {
    const resp = await fetch(path, options);
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || !data.ok) {
      const msg = data && data.error ? data.error : `Request failed (${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function renderEligibilityResult(container, result) {
    const docs = Array.isArray(result.requiredDocuments) ? result.requiredDocuments : [];
    const proc = Array.isArray(result.processingOptions) ? result.processingOptions : [];
    const isVisaFree = result.visaType === "Visa-free";

    const procHtml = proc
      .map((p) => {
        const label = `${p.label} (${p.daysMin}-${p.daysMax} days)`;
        const fees = `${window.money(p.governmentFee)} + ${window.money(p.serviceFee)} service`;
        return `<div class="row space" style="gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <div class="kpi">${escapeHtml(label)}</div>
            <div class="muted" style="margin-top:6px">${escapeHtml(p.note || "")}</div>
          </div>
          <div style="text-align:right">
            <div class="kpi">${escapeHtml(fees)}</div>
            <div class="muted" style="margin-top:6px">Total: ${window.money((p.governmentFee || 0) + (p.serviceFee || 0))}</div>
          </div>
        </div>`;
      })
      .join('<div class="hr"></div>');

    const docsHtml = docs.map((d) => `<div class="row" style="gap:10px"><div class="result-dot"></div><div>${escapeHtml(d)}</div></div>`).join("");

    setHtml(
      container,
      `<div class="card">
        <div class="card__body">
          <div class="row space" style="gap:12px;flex-wrap:wrap">
            <div>
              <div class="kpi" style="font-size:18px">${escapeHtml(result.destination)} — ${escapeHtml(result.visaType)}</div>
              <div class="muted" style="margin-top:6px">${escapeHtml(result.summary || "")}</div>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              ${badge(`Purpose: ${result.purpose}`)}
              ${badge(`From: ${result.nationality}`)}
            </div>
          </div>

          <div class="hr"></div>

          <div class="kpi">Processing options</div>
          <div style="margin-top:10px;display:grid;gap:12px">${procHtml}</div>

          <div class="hr"></div>

          <div class="kpi">Required documents</div>
          <div class="muted" style="margin-top:6px">${isVisaFree ? "Ensure you meet entry requirements." : "We will verify document requirements during expert review and submit through the official portal."}</div>
          <div style="margin-top:10px;display:grid;gap:8px">${docsHtml}</div>

          <div class="hr"></div>

          <div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1;min-width:240px">
              <div class="kpi">${isVisaFree ? "Good to know" : "Disclosure"}</div>
              <div class="muted" style="margin-top:6px">${isVisaFree ? "No visa required for this trip. Always check official government sources before travel as rules can change." : "Government fees are mandatory. Service fees cover application preparation, review, and submission support. We are not affiliated with governments and do not issue visas."}</div>
            </div>
            <div style="width:min(320px,100%)">
              ${isVisaFree
                ? `<a class="btn btn-secondary" href="/visa/dashboard" style="width:100%;height:44px">Go to dashboard</a>`
                : `<button class="btn btn-primary" type="button" data-start-visa style="width:100%">Start application</button>
                   <a class="btn btn-secondary" href="/visa/dashboard" style="margin-top:10px;width:100%;height:44px">Go to dashboard</a>`
              }
            </div>
          </div>
        </div>
      </div>`
    );
  }

  function initVisaChecker() {
    const root = qs("[data-visa-checker]");
    if (!root) return;

    const form = qs("[data-visa-form]", root);
    const resultEl = qs("[data-visa-result]", root);
    if (!form || !resultEl) return;

    const nationalitySelect = qs("select[name='nationality']", form);
    const destinationSelect = qs("select[name='destination']", form);
    populateCountrySelect(nationalitySelect, COUNTRIES);
    populateCountrySelect(destinationSelect, COUNTRIES);

    loadCountryIso2Map()
      .then((iso2Map) => {
        populateCountrySelect(nationalitySelect, COUNTRIES, iso2Map);
        populateCountrySelect(destinationSelect, COUNTRIES, iso2Map);
        initVisaPassportTool(iso2Map);
      })
      .catch(() => {
        initVisaPassportTool();
      });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        nationality: String(fd.get("nationality") || ""),
        destination: String(fd.get("destination") || ""),
        purpose: String(fd.get("purpose") || ""),
        arrivalDate: String(fd.get("arrivalDate") || "")
      };

      if (!payload.nationality || !payload.destination || !payload.purpose || !payload.arrivalDate) {
        return;
      }

      resultEl.style.display = "block";
      setHtml(resultEl, `<div class="skeleton"></div>`);

      try {
        let result;
        try {
          const data = await api("/api/visa/eligibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          result = data.result;
        } catch {
          result = computeEligibilityLocal(payload);
        }

        renderEligibilityResult(resultEl, result);

        const startBtn = qs("[data-start-visa]", resultEl);
        if (startBtn) {
          startBtn.addEventListener("click", async () => {
            startBtn.disabled = true;
            try {
              const created = await api("/api/visa/application/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eligibility: result })
              });
              addAppId(created.id);
              if (created.fallback === "local") {
                throw new Error("Visa applications are not connected to the server.");
              }
              if (typeof window.__bcNavigate === "function") window.__bcNavigate(`/visa/dashboard?app=${encodeURIComponent(created.id)}`);
              else window.location.href = `/visa/dashboard?app=${encodeURIComponent(created.id)}`;
            } catch (err) {
              startBtn.disabled = false;
              alert(err && err.message ? err.message : "Failed to create application");
            }
          });
        }
      } catch (err) {
        setHtml(
          resultEl,
          `<div class="card"><div class="card__body"><div class="kpi">Unable to check eligibility</div><div class="muted" style="margin-top:6px">${escapeHtml(
            err && err.message ? err.message : "Unknown error"
          )}</div></div></div>`
        );
      }
    });

    const dateInput = qs("input[name='arrivalDate']", form);
    if (dateInput && !dateInput.value) {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
  }

  function renderDashboardItem(app) {
    const status = app.status || "Draft";
    const dest = app.eligibility?.destination || "";
    const nat = app.eligibility?.nationality || "";
    const visaType = app.eligibility?.visaType || "";
    const createdAt = app.createdAt ? new Date(app.createdAt).toLocaleString() : "";

    return `<div class="card" style="box-shadow:none;margin-top:12px">
      <div class="card__body">
        <div class="row space" style="gap:12px;flex-wrap:wrap">
          <div>
            <div class="kpi">${escapeHtml(dest)} — ${escapeHtml(visaType)}</div>
            <div class="muted" style="margin-top:6px">From ${escapeHtml(nat)} · Created ${escapeHtml(createdAt)}</div>
          </div>
          <div class="row" style="gap:10px;flex-wrap:wrap">
            ${badge(`Status: ${status}`)}
            <a class="btn btn-secondary" href="/visa" style="height:42px">Edit</a>
          </div>
        </div>
      </div>
    </div>`;
  }

  async function initVisaDashboard() {
    const root = qs("[data-visa-dashboard]");
    if (!root) return;

    const listEl = qs("[data-visa-dashboard-list]", root);
    if (!listEl) return;

    // Read ?app= query param to highlight a specific app
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get("app") || "";

    const ids = readAppIds();
    if (!ids.length) {
      setHtml(
        listEl,
        `<div class="muted">No applications yet. Start with the eligibility checker on <a href="/visa" style="text-decoration:underline">Visa</a>.</div>`
      );
      return;
    }

    setHtml(listEl, `<div class="skeleton"></div>`);

    const apps = [];
    for (const id of ids) {
      try {
        if (String(id).startsWith("local_")) {
          const localRaw = localStorage.getItem(`bookingcart_visa_local_app_${id}`);
          const localApp = safeJsonParse(localRaw || "{}");
          if (localApp && localApp.id) apps.push(localApp);
        } else {
          const data = await api(`/api/visa/application?id=${encodeURIComponent(id)}`, { method: "GET" });
          apps.push(data.application);
        }
      } catch {
        // ignore missing
      }
    }

    if (!apps.length) {
      setHtml(
        listEl,
        `<div class="muted">No applications found. Start with the eligibility checker on <a href="/visa" style="text-decoration:underline">Visa</a>.</div>`
      );
      return;
    }

    // If ?app= is present, move that app to the top and highlight it
    let ordered = apps;
    if (highlightId) {
      const idx = apps.findIndex((a) => a.id === highlightId);
      if (idx !== -1) {
        const [highlighted] = apps.splice(idx, 1);
        ordered = [highlighted, ...apps];
      }
    }

    setHtml(listEl, ordered.map(renderDashboardItem).join(""));
  }

  function renderAdminRow(app) {
    const status = app.status || "Draft";
    const id = app.id || "";
    const dest = app.eligibility?.destination || "";
    const nat = app.eligibility?.nationality || "";
    const createdAt = app.createdAt ? new Date(app.createdAt).toLocaleString() : "";

    const statuses = ["Draft", "Needs correction", "Ready to submit", "Submitted", "Under government review", "Approved", "Rejected"];

    return `<div class="card" style="box-shadow:none;margin-top:12px">
      <div class="card__body">
        <div class="row space" style="gap:12px;flex-wrap:wrap">
          <div>
            <div class="kpi">${escapeHtml(dest)} — ${escapeHtml(nat)}</div>
            <div class="muted" style="margin-top:6px">${escapeHtml(id)} · Created ${escapeHtml(createdAt)}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select class="control select" data-status style="height:42px">
              ${statuses
                .map((s) => `<option value="${escapeHtml(s)}" ${s === status ? "selected" : ""}>${escapeHtml(s)}</option>`)
                .join("")}
            </select>
            <button class="btn btn-primary" type="button" data-save style="height:42px">Save</button>
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <div class="label">Notes to applicant (optional)</div>
          <input class="control" data-notes placeholder="Request missing docs, corrections, etc" />
        </div>
      </div>
    </div>`;
  }

  async function initVisaAdmin() {
    const root = qs("[data-visa-admin]");
    if (!root) return;

    const tokenInput = qs("[data-admin-token]", root);
    const loadBtn = qs("[data-admin-load]", root);
    const listEl = qs("[data-visa-admin-list]", root);

    if (!tokenInput || !loadBtn || !listEl) return;

    const saved = sessionStorage.getItem("bookingcart_admin_token") || "";
    tokenInput.value = saved;

    async function load() {
      const token = String(tokenInput.value || "").trim();
      if (!token) {
        alert("Admin token required");
        return;
      }

      sessionStorage.setItem("bookingcart_admin_token", token);
      setHtml(listEl, `<div class="skeleton"></div>`);

      try {
        const data = await api("/api/visa/admin/applications", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        });

        const apps = Array.isArray(data.applications) ? data.applications : [];
        if (!apps.length) {
          setHtml(listEl, `<div class="muted">No applications yet.</div>`);
          return;
        }

        setHtml(listEl, apps.map(renderAdminRow).join(""));

        qsa("[data-save]", listEl).forEach((btn) => {
          btn.addEventListener("click", async () => {
            const card = btn.closest(".card");
            if (!card) return;
            const statusSel = qs("[data-status]", card);
            const notesInput = qs("[data-notes]", card);
            const idLine = qs(".muted", card);
            const id = idLine ? (idLine.textContent || "").split(" · ")[0].trim() : "";
            const status = statusSel ? String(statusSel.value || "") : "";
            const notes = notesInput ? String(notesInput.value || "") : "";
            if (!id) return;

            btn.disabled = true;
            try {
              await api("/api/visa/admin/update", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id, status, notes })
              });
              btn.disabled = false;
              btn.textContent = "Saved";
              setTimeout(() => {
                btn.textContent = "Save";
              }, 900);
            } catch (err) {
              btn.disabled = false;
              alert(err && err.message ? err.message : "Failed to update");
            }
          });
        });
      } catch (err) {
        setHtml(
          listEl,
          `<div class="card"><div class="card__body"><div class="kpi">Unable to load admin queue</div><div class="muted" style="margin-top:6px">${escapeHtml(
            err && err.message ? err.message : "Unknown error"
          )}</div></div></div>`
        );
      }
    }

    loadBtn.addEventListener("click", load);
  }

  initVisaChecker();
  initVisaDashboard();
  initVisaAdmin();
})();
