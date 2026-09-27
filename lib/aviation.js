"use strict";

const JET_CATEGORIES = [
  { id: "light_jet", label: "Light Jets", group: "private_jet" },
  { id: "midsize_jet", label: "Mid-Size Jets", group: "private_jet" },
  { id: "super_midsize_jet", label: "Super Mid-Size Jets", group: "private_jet" },
  { id: "heavy_jet", label: "Heavy Jets", group: "private_jet" },
  { id: "ultra_long_range", label: "Ultra Long Range Jets", group: "private_jet" },
  { id: "business_jet", label: "Business Jets", group: "private_jet" },
  { id: "executive_jet", label: "Executive Jets", group: "private_jet" },
  { id: "vip_jet", label: "VIP Jets", group: "private_jet" },
];

const CHARTER_SERVICES = [
  { id: "on_demand", label: "On-Demand Charter Flights", group: "air_charter" },
  { id: "corporate", label: "Corporate Charters", group: "air_charter" },
  { id: "group", label: "Group Charters", group: "air_charter" },
  { id: "medevac", label: "Medical Evacuation Flights", group: "air_charter" },
  { id: "government", label: "Government Charters", group: "air_charter" },
  { id: "tourism", label: "Tourism Charters", group: "air_charter" },
  { id: "safari", label: "Safari Air Transfers", group: "air_charter" },
  { id: "island", label: "Island Transfers", group: "air_charter" },
];

const HELICOPTER_SERVICES = [
  { id: "scenic", label: "Scenic Flights", group: "helicopter" },
  { id: "aerial_tour", label: "Aerial Tours", group: "helicopter" },
  { id: "vip_transfer", label: "VIP Transfers", group: "helicopter" },
  { id: "airport_transfer", label: "Airport Transfers", group: "helicopter" },
  { id: "emergency", label: "Emergency Services", group: "helicopter" },
  { id: "corporate_flight", label: "Corporate Flights", group: "helicopter" },
];

const AMENITIES = [
  { id: "wifi", label: "Wi-Fi" },
  { id: "entertainment", label: "Entertainment System" },
  { id: "conference", label: "Conference Facilities" },
  { id: "private_bedrooms", label: "Private Bedrooms" },
  { id: "premium_catering", label: "Premium Catering" },
  { id: "luxury_seating", label: "Luxury Seating" },
  { id: "flight_attendant", label: "Flight Attendant Service" },
  { id: "vip_ground", label: "VIP Ground Handling" },
];

const AIRPORT_TYPES = ["airport", "airstrip", "heliport", "private_terminal", "vip_lounge"];
const AMENITY_IDS = new Set(AMENITIES.map((item) => item.id));
const CATEGORY_IDS = new Set([
  ...JET_CATEGORIES.map((item) => item.id),
  ...CHARTER_SERVICES.map((item) => item.id),
  ...HELICOPTER_SERVICES.map((item) => item.id),
]);
const SERVICE_GROUPS = new Set(["private_jet", "air_charter", "helicopter"]);

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=80`;

const SEED_AIRPORTS = [
  airport("EBB", "Entebbe International Airport", "airport", "Entebbe", "Uganda", 0.0424, 32.4435, 3658, true, ["fuel", "handling", "vip_lounge", "customs"]),
  airport("KLA", "Kampala Heliport", "heliport", "Kampala", "Uganda", 0.3476, 32.5825, 0, false, ["vip_lounge", "ground_transfer"]),
  airport("MFU", "Murchison Falls Airstrip", "airstrip", "Murchison Falls", "Uganda", 2.283, 31.583, 1500, false, ["handling", "safari_desk"]),
  airport("BWD", "Bwindi Airstrip", "airstrip", "Bwindi", "Uganda", -1.05, 29.62, 1200, false, ["handling"]),
  airport("KDP", "Kidepo Airstrip", "airstrip", "Kidepo", "Uganda", 3.72, 33.75, 1400, false, ["handling"]),
  airport("NBO", "Jomo Kenyatta International Airport", "airport", "Nairobi", "Kenya", -1.3192, 36.9278, 4117, true, ["fuel", "handling", "vip_lounge", "customs"]),
  airport("WIL", "Wilson Airport", "airport", "Nairobi", "Kenya", -1.3217, 36.8148, 1558, false, ["fuel", "handling"]),
  airport("JRO", "Kilimanjaro International Airport", "airport", "Arusha", "Tanzania", -3.4294, 37.0745, 3607, true, ["fuel", "handling", "customs"]),
  airport("ZNZ", "Abeid Amani Karume International Airport", "airport", "Zanzibar", "Tanzania", -6.222, 39.2249, 2462, true, ["fuel", "handling", "vip_lounge", "customs"]),
  airport("KGL", "Kigali International Airport", "airport", "Kigali", "Rwanda", -1.9686, 30.1395, 3500, true, ["fuel", "handling", "customs"]),
  airport("JNB", "O. R. Tambo International Airport", "airport", "Johannesburg", "South Africa", -26.1367, 28.2411, 4418, true, ["fuel", "handling", "vip_lounge", "customs"]),
  airport("SEZ", "Seychelles International Airport", "airport", "Mahe", "Seychelles", -4.6743, 55.5218, 2987, true, ["fuel", "handling", "customs"]),
  airport("DXB", "Dubai International Airport", "airport", "Dubai", "United Arab Emirates", 25.2532, 55.3657, 4000, true, ["fuel", "handling", "vip_lounge", "customs"]),
  airport("EBB-VIP", "Entebbe Private Terminal", "private_terminal", "Entebbe", "Uganda", 0.045, 32.45, 0, true, ["vip_lounge", "fast_track", "ground_transfer"]),
  airport("NBO-LOUNGE", "Nairobi VIP Lounge", "vip_lounge", "Nairobi", "Kenya", -1.319, 36.93, 0, true, ["vip_lounge", "conferencing"]),
];

function airport(code, name, type, city, country, lat, lon, runwayM, customs, groundServices) {
  return {
    code,
    name,
    type,
    city,
    country,
    lat,
    lon,
    runway: runwayM ? { lengthM: runwayM, surface: type === "airstrip" ? "murram" : "asphalt" } : null,
    customs: !!customs,
    groundServices,
    info: `${name} serves ${city}, ${country}. ${customs ? "Customs clearance is available." : "Domestic and scenic operations only."}`,
  };
}

function safety(extra = {}) {
  return {
    aoc: "UG-AOC-1042",
    certification: "UCAA / ICAO",
    insurance: "Hull and liability cover in force",
    maintenanceCurrent: true,
    pilotCertifications: ["ATPL", "Type rating"],
    regulatoryStatus: "compliant",
    ...extra,
  };
}

function aircraft(partial) {
  return {
    serviceType: "private_jet",
    charterServices: [],
    helicopterServices: [],
    crew: 2,
    maxAltitudeFt: 41000,
    baggageCuFt: 50,
    cabin: { lengthFt: 16, widthFt: 5, heightFt: 4.8 },
    amenities: ["wifi", "luxury_seating", "premium_catering"],
    petFriendly: false,
    smokingAllowed: false,
    international: true,
    domestic: true,
    currency: "USD",
    images: [img("photo-1540962351504-03099e0a754b")],
    flightZones: [],
    strictZones: false,
    pricing: { landingFee: 350, minimumHours: 1.5, overnightFee: 0, petFee: 250, internationalSurchargePct: 8 },
    availability: [{ from: "2026-01-01", to: "2027-12-31", status: "available" }],
    documents: [],
    status: "approved",
    featured: false,
    ...partial,
    safety: safety(partial.safety),
  };
}

const SEED_AIRCRAFT = [
  aircraft({
    id: "ac_nile_light",
    name: "Nile Light",
    category: "light_jet",
    manufacturer: "Cessna",
    model: "Citation CJ3+",
    year: 2019,
    registration: "5X-NLT",
    baseAirport: "EBB",
    operatorId: "op_sinrah",
    operatorName: "Sinrah Aviation",
    passengers: 7,
    rangeNm: 2040,
    cruiseSpeedKt: 416,
    baggageCuFt: 65,
    amenities: ["wifi", "entertainment", "luxury_seating", "premium_catering", "flight_attendant", "vip_ground"],
    petFriendly: true,
    charterServices: ["on_demand", "tourism", "safari", "corporate"],
    hourlyRate: 4200,
    flightZones: ["EBB", "KLA", "MFU", "BWD", "KDP", "NBO", "JRO", "KGL", "EBB-VIP"],
    images: [img("photo-1540962351504-03099e0a754b"), img("photo-1474302770737-173a5f7c4b3b")],
    featured: true,
  }),
  aircraft({
    id: "ac_rift_mid",
    name: "Rift Midsize",
    category: "midsize_jet",
    manufacturer: "Hawker",
    model: "900XP",
    year: 2016,
    registration: "5Y-RFT",
    baseAirport: "NBO",
    operatorId: "op_east_africa",
    operatorName: "East Africa Jets",
    passengers: 8,
    rangeNm: 2800,
    cruiseSpeedKt: 446,
    hourlyRate: 5600,
    amenities: ["wifi", "entertainment", "conference", "luxury_seating", "premium_catering", "flight_attendant"],
    charterServices: ["corporate", "on_demand"],
    flightZones: ["NBO", "EBB", "JRO", "KGL", "ZNZ", "JNB"],
    images: [img("photo-1559628233-100c798642d4")],
    safety: { aoc: "KE-AOC-220" },
    featured: true,
  }),
  aircraft({
    id: "ac_latitude",
    name: "Victoria Latitude",
    category: "super_midsize_jet",
    manufacturer: "Cessna",
    model: "Citation Latitude",
    year: 2021,
    registration: "5X-VLT",
    baseAirport: "EBB",
    operatorId: "op_sinrah",
    operatorName: "Sinrah Aviation",
    passengers: 9,
    rangeNm: 2700,
    cruiseSpeedKt: 446,
    cabin: { lengthFt: 21.9, widthFt: 6.4, heightFt: 6 },
    amenities: ["wifi", "entertainment", "conference", "luxury_seating", "premium_catering", "flight_attendant", "vip_ground"],
    hourlyRate: 6900,
    charterServices: ["corporate", "tourism"],
    petFriendly: true,
    images: [img("photo-1464037866556-6812c9d1c72e")],
  }),
  aircraft({
    id: "ac_heavy_imperial",
    name: "Imperial Heavy",
    category: "heavy_jet",
    manufacturer: "Gulfstream",
    model: "G450",
    year: 2014,
    registration: "ZS-IMP",
    baseAirport: "JNB",
    operatorId: "op_imperial",
    operatorName: "Imperial Charter",
    passengers: 14,
    crew: 3,
    rangeNm: 4350,
    cruiseSpeedKt: 476,
    maxAltitudeFt: 45000,
    cabin: { lengthFt: 45, widthFt: 7.3, heightFt: 6.2 },
    amenities: ["wifi", "entertainment", "conference", "private_bedrooms", "premium_catering", "luxury_seating", "flight_attendant", "vip_ground"],
    hourlyRate: 9800,
    charterServices: ["corporate", "government", "group"],
    flightZones: ["JNB", "NBO", "EBB", "DXB", "SEZ"],
    images: [img("photo-1436491865332-7a61a109cc05")],
    safety: { aoc: "ZA-AOC-088", certification: "SACAA" },
    featured: true,
  }),
  aircraft({
    id: "ac_g650",
    name: "Sovereign Range",
    category: "ultra_long_range",
    manufacturer: "Gulfstream",
    model: "G650ER",
    year: 2020,
    registration: "A6-SRA",
    baseAirport: "DXB",
    operatorId: "op_sovereign",
    operatorName: "Sovereign Air",
    passengers: 16,
    crew: 4,
    rangeNm: 7500,
    cruiseSpeedKt: 516,
    maxAltitudeFt: 51000,
    cabin: { lengthFt: 53, widthFt: 8.2, heightFt: 6.3 },
    amenities: ["wifi", "entertainment", "conference", "private_bedrooms", "premium_catering", "luxury_seating", "flight_attendant", "vip_ground"],
    hourlyRate: 14500,
    charterServices: ["on_demand", "corporate", "government"],
    images: [img("photo-1542296332-2e4473faf563")],
    safety: { aoc: "AE-AOC-650", certification: "GCAA" },
  }),
  aircraft({
    id: "ac_praetor",
    name: "Boardroom Praetor",
    category: "business_jet",
    manufacturer: "Embraer",
    model: "Praetor 500",
    year: 2022,
    registration: "5X-BIZ",
    baseAirport: "EBB",
    operatorId: "op_sinrah",
    operatorName: "Sinrah Aviation",
    passengers: 9,
    rangeNm: 3340,
    cruiseSpeedKt: 462,
    amenities: ["wifi", "entertainment", "conference", "luxury_seating", "premium_catering", "flight_attendant"],
    hourlyRate: 6400,
    charterServices: ["corporate", "on_demand"],
    images: [img("photo-1559628233-100c798642d4")],
  }),
  aircraft({
    id: "ac_falcon",
    name: "Executive Falcon",
    category: "executive_jet",
    manufacturer: "Dassault",
    model: "Falcon 2000LXS",
    year: 2018,
    registration: "5Y-EXC",
    baseAirport: "NBO",
    operatorId: "op_east_africa",
    operatorName: "East Africa Jets",
    passengers: 10,
    rangeNm: 4000,
    cruiseSpeedKt: 470,
    amenities: ["wifi", "entertainment", "conference", "luxury_seating", "premium_catering", "flight_attendant", "vip_ground"],
    hourlyRate: 7600,
    charterServices: ["corporate", "tourism"],
    safety: { aoc: "KE-AOC-220" },
    images: [img("photo-1474302770737-173a5f7c4b3b")],
  }),
  aircraft({
    id: "ac_bbj",
    name: "VIP Sovereign",
    category: "vip_jet",
    manufacturer: "Boeing",
    model: "BBJ",
    year: 2015,
    registration: "A6-VIP",
    baseAirport: "DXB",
    operatorId: "op_sovereign",
    operatorName: "Sovereign Air",
    passengers: 19,
    crew: 6,
    rangeNm: 6200,
    cruiseSpeedKt: 470,
    cabin: { lengthFt: 78, widthFt: 11.6, heightFt: 7.1 },
    amenities: ["wifi", "entertainment", "conference", "private_bedrooms", "premium_catering", "luxury_seating", "flight_attendant", "vip_ground"],
    smokingAllowed: false,
    hourlyRate: 18000,
    charterServices: ["government", "corporate"],
    images: [img("photo-1542296332-2e4473faf563")],
    safety: { aoc: "AE-AOC-650", certification: "GCAA" },
    featured: true,
  }),
  aircraft({
    id: "ac_heli_murchison",
    name: "Falls Scenic",
    category: "scenic",
    serviceType: "helicopter",
    manufacturer: "Airbus",
    model: "H125",
    year: 2020,
    registration: "5X-HLS",
    baseAirport: "MFU",
    operatorId: "op_murchison_heli",
    operatorName: "Murchison Heli",
    passengers: 5,
    crew: 1,
    rangeNm: 340,
    cruiseSpeedKt: 130,
    maxAltitudeFt: 15000,
    baggageCuFt: 12,
    cabin: { lengthFt: 6.4, widthFt: 5.3, heightFt: 4.2 },
    amenities: ["luxury_seating", "vip_ground"],
    hourlyRate: 1800,
    pricing: { landingFee: 80, minimumHours: 0.7, overnightFee: 0, petFee: 0, internationalSurchargePct: 0 },
    charterServices: ["safari", "tourism"],
    helicopterServices: ["scenic", "aerial_tour", "vip_transfer"],
    international: false,
    strictZones: true,
    flightZones: ["MFU", "KLA", "EBB", "BWD", "KDP"],
    images: [img("photo-1534787238916-9ba6764efd4f")],
    safety: { aoc: "UG-AOC-331", certification: "UCAA rotorcraft" },
    featured: true,
  }),
  aircraft({
    id: "ac_heli_entebbe",
    name: "Lake Transfer",
    category: "vip_transfer",
    serviceType: "helicopter",
    manufacturer: "Bell",
    model: "429",
    year: 2018,
    registration: "5X-VIP",
    baseAirport: "EBB",
    operatorId: "op_murchison_heli",
    operatorName: "Murchison Heli",
    passengers: 6,
    crew: 1,
    rangeNm: 380,
    cruiseSpeedKt: 140,
    maxAltitudeFt: 20000,
    amenities: ["wifi", "luxury_seating", "vip_ground"],
    hourlyRate: 2400,
    pricing: { landingFee: 120, minimumHours: 0.7, overnightFee: 0, petFee: 100, internationalSurchargePct: 0 },
    helicopterServices: ["vip_transfer", "airport_transfer", "corporate_flight", "emergency"],
    charterServices: ["on_demand"],
    international: false,
    strictZones: true,
    flightZones: ["EBB", "KLA", "MFU", "EBB-VIP"],
    images: [img("photo-1534787238916-9ba6764efd4f")],
    safety: { aoc: "UG-AOC-331", certification: "UCAA rotorcraft" },
    petFriendly: true,
  }),
  aircraft({
    id: "ac_caravan",
    name: "Savanna Caravan",
    category: "safari",
    serviceType: "air_charter",
    manufacturer: "Cessna",
    model: "208 Caravan",
    year: 2017,
    registration: "5X-SAF",
    baseAirport: "EBB",
    operatorId: "op_safari_air",
    operatorName: "Safari Air Uganda",
    passengers: 9,
    crew: 1,
    rangeNm: 900,
    cruiseSpeedKt: 175,
    maxAltitudeFt: 25000,
    baggageCuFt: 40,
    amenities: ["premium_catering", "vip_ground"],
    hourlyRate: 1600,
    pricing: { landingFee: 150, minimumHours: 1, overnightFee: 200, petFee: 50, internationalSurchargePct: 5 },
    charterServices: ["safari", "tourism", "on_demand", "group"],
    international: false,
    flightZones: ["EBB", "MFU", "BWD", "KDP", "JRO", "KGL"],
    images: [img("photo-1516426122078-c23e76319801")],
    safety: { aoc: "UG-AOC-208", certification: "UCAA" },
    featured: true,
    petFriendly: true,
  }),
  aircraft({
    id: "ac_otter",
    name: "Spice Otter",
    category: "island",
    serviceType: "air_charter",
    manufacturer: "De Havilland",
    model: "Twin Otter",
    year: 2015,
    registration: "5H-ISL",
    baseAirport: "ZNZ",
    operatorId: "op_island",
    operatorName: "Zanzibar Airlink",
    passengers: 13,
    rangeNm: 700,
    cruiseSpeedKt: 170,
    maxAltitudeFt: 20000,
    hourlyRate: 1900,
    charterServices: ["island", "tourism", "group"],
    international: true,
    flightZones: ["ZNZ", "JRO", "SEZ", "NBO"],
    images: [img("photo-1507525428034-b723cf961d3e")],
    safety: { aoc: "TZ-AOC-014", certification: "TCAA" },
  }),
  aircraft({
    id: "ac_medevac",
    name: "AeroMed Lear",
    category: "medevac",
    serviceType: "air_charter",
    manufacturer: "Bombardier",
    model: "Learjet 45",
    year: 2013,
    registration: "5Y-MED",
    baseAirport: "NBO",
    operatorId: "op_aeromed",
    operatorName: "AeroMed East Africa",
    passengers: 4,
    crew: 3,
    rangeNm: 2000,
    cruiseSpeedKt: 445,
    hourlyRate: 7200,
    amenities: ["flight_attendant"],
    charterServices: ["medevac", "emergency"],
    helicopterServices: [],
    images: [img("photo-1540962351504-03099e0a754b")],
    safety: { aoc: "KE-AOC-901", certification: "KCAA air ambulance", pilotCertifications: ["ATPL", "Air ambulance"] },
  }),
  aircraft({
    id: "ac_atr",
    name: "Regional Group",
    category: "group",
    serviceType: "air_charter",
    manufacturer: "ATR",
    model: "72-600",
    year: 2019,
    registration: "5X-GRP",
    baseAirport: "EBB",
    operatorId: "op_safari_air",
    operatorName: "Safari Air Uganda",
    passengers: 48,
    crew: 4,
    rangeNm: 800,
    cruiseSpeedKt: 275,
    maxAltitudeFt: 25000,
    hourlyRate: 4800,
    charterServices: ["group", "tourism", "corporate"],
    international: true,
    images: [img("photo-1436491865332-7a61a109cc05")],
    safety: { aoc: "UG-AOC-208" },
  }),
];

const SEED_OPERATORS = [
  operator("op_sinrah", "Sinrah Aviation", "ops@sinrah.example", "EBB", "UG-AOC-1042"),
  operator("op_east_africa", "East Africa Jets", "ops@eajets.example", "NBO", "KE-AOC-220"),
  operator("op_imperial", "Imperial Charter", "ops@imperial.example", "JNB", "ZA-AOC-088"),
  operator("op_sovereign", "Sovereign Air", "ops@sovereign.example", "DXB", "AE-AOC-650"),
  operator("op_murchison_heli", "Murchison Heli", "ops@mheli.example", "MFU", "UG-AOC-331"),
  operator("op_safari_air", "Safari Air Uganda", "ops@safariair.example", "EBB", "UG-AOC-208"),
  operator("op_island", "Zanzibar Airlink", "ops@airlink.example", "ZNZ", "TZ-AOC-014"),
  operator("op_aeromed", "AeroMed East Africa", "ops@aeromed.example", "NBO", "KE-AOC-901"),
];

function operator(id, companyName, email, baseAirport, aoc) {
  return {
    id,
    email,
    companyName,
    phone: "+256700000000",
    baseAirport,
    status: "verified",
    system: true,
    compliance: {
      aoc,
      insurance: "Operator liability cover in force",
      regulatoryStatus: "compliant",
    },
    documents: [],
    adminNote: "",
  };
}

function str(value, max = 240) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").toLowerCase());
}

function isoDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function makeRef(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineNm(a, b) {
  if (!a || !b) return 0;
  const earthNm = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function airportIndex(airports) {
  const map = new Map();
  for (const item of airports) map.set(String(item.code).toUpperCase(), item);
  return map;
}

function findAirport(airports, query) {
  const text = str(query, 80);
  if (!text) return null;
  const map = airportIndex(airports);
  const direct = map.get(text.toUpperCase());
  if (direct) return direct;
  const needle = text.toLowerCase();
  return airports.find((item) =>
    [item.code, item.name, item.city, item.country].some((field) => String(field).toLowerCase().includes(needle))
  ) || null;
}

function categoryMeta(id) {
  return [...JET_CATEGORIES, ...CHARTER_SERVICES, ...HELICOPTER_SERVICES].find((item) => item.id === id) || null;
}

function serviceGroup(aircraftItem) {
  if (aircraftItem.serviceType) return aircraftItem.serviceType;
  return categoryMeta(aircraftItem.category)?.group || "private_jet";
}

function complianceGaps(record, kind = "aircraft") {
  const safetyRecord = record.safety || record.compliance || {};
  const gaps = [];
  if (!str(safetyRecord.aoc, 80)) gaps.push("Air Operator Certificate");
  if (kind === "aircraft" && !str(safetyRecord.certification, 80)) gaps.push("Aircraft certification");
  if (!str(safetyRecord.insurance, 160)) gaps.push("Insurance coverage");
  if (kind === "aircraft" && !safetyRecord.maintenanceCurrent) gaps.push("Maintenance records");
  const pilots = Array.isArray(safetyRecord.pilotCertifications) ? safetyRecord.pilotCertifications : [];
  if (kind === "aircraft" && !pilots.length) gaps.push("Pilot certifications");
  if (safetyRecord.regulatoryStatus && safetyRecord.regulatoryStatus !== "compliant") gaps.push("Regulatory compliance");
  return gaps;
}

function publicAircraft(item) {
  const copy = { ...item, safety: item.safety ? { ...item.safety } : {} };
  delete copy.documents;
  if (copy.safety.insurance) copy.safety.insurance = "Covered";
  if (copy.safety.aoc) copy.safety.aoc = "Verified";
  copy.safety.pilotCertifications = (copy.safety.pilotCertifications || []).length ? ["Verified crew"] : [];
  copy.complianceReady = complianceGaps(item).length === 0;
  return copy;
}

function isAvailable(item, dates) {
  const blocks = Array.isArray(item.availability) ? item.availability : [];
  if (!blocks.length) return true;
  return dates.filter(Boolean).every((date) => {
    const blocked = blocks.some((block) => block.status === "blocked" && block.from <= date && date <= block.to);
    if (blocked) return false;
    const windows = blocks.filter((block) => block.status !== "blocked");
    if (!windows.length) return true;
    return windows.some((block) => block.from <= date && date <= block.to);
  });
}

function quoteFlight(aircraftItem, origin, destination, options = {}) {
  const tripType = options.tripType === "round" ? "round" : "oneway";
  const scenic = serviceGroup(aircraftItem) === "helicopter" && (!destination || destination.code === origin.code);
  const legNm = scenic ? Math.min(80, aircraftItem.rangeNm * 0.25) : haversineNm(origin, destination);
  const speed = Math.max(80, num(aircraftItem.cruiseSpeedKt, 400));
  const airborneHours = legNm / speed;
  const minimum = num(aircraftItem.pricing?.minimumHours, aircraftItem.serviceType === "helicopter" ? 0.7 : 1.5);
  const blockHours = Math.max(minimum, airborneHours * 1.12);
  const base = findAirport(options.airports || SEED_AIRPORTS, aircraftItem.baseAirport);
  const positioningNm = base && origin && base.code !== origin.code ? haversineNm(base, origin) : 0;
  const positioningHours = positioningNm ? Math.max(0.4, positioningNm / speed) : 0;
  const flightHours = tripType === "round" ? blockHours * 2 + positioningHours : blockHours + positioningHours;
  const hourly = num(aircraftItem.hourlyRate || aircraftItem.pricing?.hourlyRate, 0);
  let price = hourly * flightHours;
  price += num(aircraftItem.pricing?.landingFee, 0) * (tripType === "round" ? 2 : 1);
  if (options.petFriendly && aircraftItem.petFriendly) price += num(aircraftItem.pricing?.petFee, 0);
  const international = origin && destination && origin.country !== destination.country;
  if (international) price += price * (num(aircraftItem.pricing?.internationalSurchargePct, 0) / 100);
  if (tripType === "round" && aircraftItem.pricing?.overnightFee) price += num(aircraftItem.pricing.overnightFee, 0);
  const durationMinutes = Math.round((tripType === "round" ? airborneHours * 2 : airborneHours) * 60);
  return {
    distanceNm: Math.round(legNm),
    positioningNm: Math.round(positioningNm),
    durationMinutes,
    flightHours: Math.round(flightHours * 10) / 10,
    price: Math.round(price),
    currency: aircraftItem.currency || "USD",
    international: !!international,
    tripType,
  };
}

function matchesCategory(item, category) {
  if (!category) return true;
  if (SERVICE_GROUPS.has(category)) return serviceGroup(item) === category || (item.charterServices || []).length && category === "air_charter";
  if (item.category === category) return true;
  if ((item.charterServices || []).includes(category)) return true;
  if ((item.helicopterServices || []).includes(category)) return true;
  return false;
}

function withinZones(item, origin, destination) {
  const zones = (item.flightZones || []).map((code) => String(code).toUpperCase());
  if (!zones.length || !item.strictZones) return true;
  const codes = [origin?.code, destination?.code].filter(Boolean).map((code) => code.toUpperCase());
  return codes.every((code) => zones.includes(code));
}

function canFlyLeg(item, origin, destination) {
  if (!origin) return false;
  const dest = destination || origin;
  const distance = dest.code === origin.code ? 40 : haversineNm(origin, dest);
  const reserve = item.serviceType === "helicopter" ? 1.15 : 1.08;
  if (distance * reserve > num(item.rangeNm, 0)) return false;
  if (origin.country !== dest.country && !item.international) return false;
  if (origin.country === dest.country && item.domestic === false) return false;
  return withinZones(item, origin, dest);
}

function searchAircraft(catalog, airports, query = {}) {
  const origin = findAirport(airports, query.origin);
  const destinationInput = str(query.destination, 80);
  let destination = destinationInput ? findAirport(airports, query.destination) : null;
  if (!destination && origin && (query.category === "scenic" || query.service === "helicopter")) destination = origin;
  const errors = [];
  if (!origin) errors.push("Choose a departure airport");
  if (!destination) errors.push("Choose an arrival airport");
  const departDate = isoDate(query.departDate);
  const returnDate = isoDate(query.returnDate);
  if (query.tripType === "round" && query.departDate && !returnDate) errors.push("Return date is required for round trips");
  if (errors.length) return { ok: false, errors, origin, destination, results: [] };

  const passengers = Math.max(1, num(query.passengers, 1));
  const amenities = String(query.amenities || "").split(",").map((item) => item.trim()).filter(Boolean);
  const budgetMin = query.budgetMin === undefined || query.budgetMin === "" ? null : num(query.budgetMin, 0);
  const budgetMax = query.budgetMax === undefined || query.budgetMax === "" ? null : num(query.budgetMax, 0);
  const results = [];

  for (const item of catalog) {
    if (item.status !== "approved") continue;
    if (complianceGaps(item).length) continue;
    if (passengers > num(item.passengers, 0)) continue;
    if (!matchesCategory(item, query.category || query.service)) continue;
    if (query.manufacturer && !String(item.manufacturer).toLowerCase().includes(String(query.manufacturer).toLowerCase())) continue;
    if (query.minRange && num(item.rangeNm, 0) < num(query.minRange, 0)) continue;
    if (amenities.length && !amenities.every((amenity) => (item.amenities || []).includes(amenity))) continue;
    if (String(query.petFriendly) === "true" && !item.petFriendly) continue;
    if (String(query.smoking) === "true" && !item.smokingAllowed) continue;
    if (query.scope === "international" && !item.international) continue;
    if (query.scope === "domestic" && !item.domestic) continue;
    if (!canFlyLeg(item, origin, destination)) continue;
    if (!isAvailable(item, [departDate, returnDate])) continue;
    const quote = quoteFlight(item, origin, destination, { tripType: query.tripType, petFriendly: query.petFriendly === "true", airports });
    if (budgetMin !== null && quote.price < budgetMin) continue;
    if (budgetMax !== null && quote.price > budgetMax) continue;
    results.push({ aircraft: publicAircraft(item), quote, origin, destination });
  }

  results.sort((a, b) => a.quote.price - b.quote.price);
  return { ok: true, errors: [], origin, destination, passengers, results };
}

function validateAircraftInput(input) {
  const errors = [];
  const name = str(input.name, 80);
  const category = str(input.category, 40);
  const registration = str(input.registration, 12).toUpperCase();
  if (name.length < 2) errors.push("Aircraft name is required");
  if (!CATEGORY_IDS.has(category)) errors.push("Choose a valid aircraft category");
  if (!str(input.manufacturer, 60)) errors.push("Manufacturer is required");
  if (!str(input.model, 60)) errors.push("Model is required");
  const year = num(input.year, 0);
  const maxYear = new Date().getFullYear() + 1;
  if (year < 1950 || year > maxYear) errors.push("Year of manufacture is invalid");
  if (!/^[A-Z0-9-]{4,12}$/.test(registration)) errors.push("Registration number is invalid");
  if (!str(input.baseAirport, 12)) errors.push("Base airport is required");
  if (num(input.passengers, 0) < 1 || num(input.passengers, 0) > 80) errors.push("Passenger capacity must be between 1 and 80");
  if (num(input.rangeNm, 0) <= 0) errors.push("Flight range is required");
  if (num(input.cruiseSpeedKt, 0) <= 0) errors.push("Cruise speed is required");
  const amenities = Array.isArray(input.amenities) ? input.amenities.filter((id) => AMENITY_IDS.has(id)) : [];
  return { errors, amenities, registration, year, name, category };
}

function normalizeAircraft(input, existing = {}) {
  const checked = validateAircraftInput(input);
  if (checked.errors.length) return { ok: false, errors: checked.errors };
  const group = categoryMeta(checked.category)?.group || str(input.serviceType, 40) || "private_jet";
  const record = {
    ...existing,
    id: existing.id || `ac_${Date.now().toString(36)}`,
    name: checked.name,
    category: checked.category,
    serviceType: group === "private_jet" || group === "helicopter" || group === "air_charter" ? group : "air_charter",
    charterServices: Array.isArray(input.charterServices) ? input.charterServices.filter((id) => CHARTER_SERVICES.some((item) => item.id === id)) : existing.charterServices || [],
    helicopterServices: Array.isArray(input.helicopterServices) ? input.helicopterServices.filter((id) => HELICOPTER_SERVICES.some((item) => item.id === id)) : existing.helicopterServices || [],
    manufacturer: str(input.manufacturer, 60),
    model: str(input.model, 60),
    year: checked.year,
    registration: checked.registration,
    baseAirport: str(input.baseAirport, 12).toUpperCase(),
    operatorName: str(input.operatorName || existing.operatorName, 80),
    operatorId: existing.operatorId,
    operatorEmail: existing.operatorEmail,
    passengers: num(input.passengers, 1),
    crew: num(input.crew, 2),
    rangeNm: num(input.rangeNm, 0),
    cruiseSpeedKt: num(input.cruiseSpeedKt, 0),
    maxAltitudeFt: num(input.maxAltitudeFt, 0),
    baggageCuFt: num(input.baggageCuFt, 0),
    cabin: {
      lengthFt: num(input.cabin?.lengthFt, 0),
      widthFt: num(input.cabin?.widthFt, 0),
      heightFt: num(input.cabin?.heightFt, 0),
    },
    amenities: checked.amenities,
    petFriendly: !!input.petFriendly,
    smokingAllowed: !!input.smokingAllowed,
    international: input.international !== false,
    domestic: input.domestic !== false,
    hourlyRate: num(input.hourlyRate, existing.hourlyRate || 0),
    currency: str(input.currency || "USD", 3).toUpperCase() || "USD",
    images: (Array.isArray(input.images) ? input.images : existing.images || []).map((url) => str(url, 400)).filter((url) => url.startsWith("https://") || url.startsWith("/")).slice(0, 8),
    flightZones: (Array.isArray(input.flightZones) ? input.flightZones : []).map((code) => str(code, 12).toUpperCase()).filter(Boolean),
    strictZones: !!input.strictZones,
    pricing: {
      landingFee: num(input.pricing?.landingFee, 0),
      minimumHours: num(input.pricing?.minimumHours, group === "helicopter" ? 0.7 : 1.5),
      overnightFee: num(input.pricing?.overnightFee, 0),
      petFee: num(input.pricing?.petFee, 0),
      internationalSurchargePct: num(input.pricing?.internationalSurchargePct, 0),
    },
    availability: Array.isArray(input.availability) ? input.availability.slice(0, 40) : existing.availability || [],
    safety: {
      aoc: str(input.safety?.aoc, 80),
      certification: str(input.safety?.certification, 80),
      insurance: str(input.safety?.insurance, 160),
      maintenanceCurrent: !!input.safety?.maintenanceCurrent,
      pilotCertifications: (Array.isArray(input.safety?.pilotCertifications) ? input.safety.pilotCertifications : []).map((item) => str(item, 80)).filter(Boolean).slice(0, 8),
      regulatoryStatus: str(input.safety?.regulatoryStatus || "pending", 40),
    },
    documents: existing.documents || [],
    status: existing.status || "draft",
    adminNote: existing.adminNote || "",
    featured: false,
  };
  return { ok: true, aircraft: record };
}

function buildAnalytics(bookings, aircraftList, reviews) {
  const counted = bookings.filter((item) => ["confirmed", "completed"].includes(item.status));
  const revenue = counted.reduce((sum, item) => sum + num(item.quote?.price || item.total, 0), 0);
  const routes = new Map();
  for (const item of counted) {
    const key = `${item.origin?.code || item.origin || "?"} → ${item.destination?.code || item.destination || "?"}`;
    routes.set(key, (routes.get(key) || 0) + 1);
  }
  const byAircraft = new Map();
  for (const item of counted) byAircraft.set(item.aircraftId, (byAircraft.get(item.aircraftId) || 0) + 1);
  const utilization = aircraftList.map((item) => ({
    id: item.id,
    name: item.name,
    bookings: byAircraft.get(item.id) || 0,
    utilization: Math.min(100, Math.round(((byAircraft.get(item.id) || 0) / 12) * 100)),
  }));
  const scores = reviews.map((item) => num(item.score, 0)).filter((score) => score > 0);
  const satisfaction = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  return {
    totalCharterRevenue: revenue,
    flightsBooked: counted.length,
    popularRoutes: [...routes.entries()].map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    aircraftUtilization: utilization.sort((a, b) => b.bookings - a.bookings),
    averageBookingValue: counted.length ? Math.round(revenue / counted.length) : 0,
    customerSatisfaction: satisfaction,
    reviewCount: scores.length,
  };
}

function buildFlightReport(booking, aircraftItem) {
  return {
    title: "Flight report",
    ref: booking.ref,
    status: booking.status,
    route: `${booking.origin?.code || ""} → ${booking.destination?.code || ""}`,
    dates: [booking.departDate, booking.returnDate].filter(Boolean).join(" / "),
    passengers: booking.passengers,
    aircraft: aircraftItem ? `${aircraftItem.name} (${aircraftItem.registration})` : booking.aircraftId,
    operator: aircraftItem?.operatorName || "",
    durationMinutes: booking.quote?.durationMinutes || 0,
    price: booking.quote?.price || 0,
    currency: booking.quote?.currency || "USD",
    crew: booking.crew || [],
    documents: aircraftItem?.documents || [],
    compliance: complianceGaps(aircraftItem || { safety: {} }),
    generatedAt: new Date().toISOString(),
  };
}

function createAviationService(seed = {}) {
  const airports = [...(seed.airports || SEED_AIRPORTS)];
  const aircraftMap = new Map((seed.aircraft || SEED_AIRCRAFT).map((item) => [item.id, { ...item }]));
  const operators = new Map((seed.operators || SEED_OPERATORS).map((item) => [item.id, { ...item }]));
  const charters = new Map();
  const bookings = new Map();
  const itineraries = new Map();
  const reviews = [];
  const disputes = [];
  const audit = [];

  function listAircraft() {
    return [...aircraftMap.values()];
  }

  function ownedAircraft(email) {
    return listAircraft().filter((item) => item.operatorEmail && item.operatorEmail === email);
  }

  function operatorByEmail(email) {
    return [...operators.values()].find((item) => item.email === email) || null;
  }

  return {
    airports,
    aircraftMap,
    operators,
    charters,
    bookings,
    itineraries,
    reviews,
    disputes,
    audit,
    catalog() {
      return {
        jets: JET_CATEGORIES,
        charters: CHARTER_SERVICES,
        helicopters: HELICOPTER_SERVICES,
        amenities: AMENITIES,
        airportTypes: AIRPORT_TYPES,
      };
    },
    searchAirports(query = {}) {
      const needle = str(query.q || query.query, 80).toLowerCase();
      const type = str(query.type, 40);
      return airports.filter((item) => {
        if (type && item.type !== type) return false;
        if (!needle) return true;
        return [item.code, item.name, item.city, item.country, item.type].some((field) => String(field).toLowerCase().includes(needle));
      });
    },
    search(query) {
      return searchAircraft(listAircraft(), airports, query);
    },
    getAircraft(id, { full = false } = {}) {
      const item = aircraftMap.get(id);
      if (!item) return null;
      return full ? item : publicAircraft(item);
    },
    saveOperator(email, input) {
      const companyName = str(input.companyName, 80);
      if (companyName.length < 2) return { ok: false, error: "Operator name is required" };
      if (!emailOk(email)) return { ok: false, error: "Valid email is required" };
      const existing = operatorByEmail(email);
      const record = {
        id: existing?.id || `op_${Date.now().toString(36)}`,
        email,
        companyName,
        phone: str(input.phone, 40),
        baseAirport: str(input.baseAirport, 12).toUpperCase(),
        contactName: str(input.contactName, 80),
        status: existing?.status === "verified" ? "verified" : "pending",
        system: false,
        compliance: {
          aoc: str(input.aoc || input.compliance?.aoc, 80),
          insurance: str(input.insurance || input.compliance?.insurance, 160),
          regulatoryStatus: str(input.regulatoryStatus || input.compliance?.regulatoryStatus || "pending", 40),
        },
        documents: existing?.documents || [],
        adminNote: existing?.adminNote || "",
        updatedAt: new Date().toISOString(),
      };
      operators.set(record.id, record);
      return { ok: true, operator: record, gaps: complianceGaps(record, "operator") };
    },
    getOperator(email) {
      const record = operatorByEmail(email);
      if (!record) return null;
      return {
        operator: record,
        fleet: ownedAircraft(email),
        charters: operatorByEmail(email)?.status === "verified" ? [...charters.values()] : [],
        bookings: [...bookings.values()].filter((item) => item.operatorEmail === email),
        analytics: buildAnalytics([...bookings.values()].filter((item) => item.operatorEmail === email), ownedAircraft(email), reviews.filter((item) => item.operatorEmail === email)),
      };
    },
    saveAircraft(email, input) {
      const owner = operatorByEmail(email);
      if (!owner) return { ok: false, error: "Register as an operator before adding aircraft" };
      const existing = input.id ? aircraftMap.get(input.id) : null;
      if (existing && existing.operatorEmail !== email) return { ok: false, error: "You can only edit your own aircraft" };
      const normalized = normalizeAircraft({ ...input, operatorName: owner.companyName }, existing || { operatorId: owner.id, operatorEmail: email, status: "draft" });
      if (!normalized.ok) return { ok: false, error: normalized.errors[0], errors: normalized.errors };
      normalized.aircraft.operatorId = owner.id;
      normalized.aircraft.operatorEmail = email;
      normalized.aircraft.operatorName = owner.companyName;
      if (input.submit) {
        const gaps = complianceGaps(normalized.aircraft);
        if (gaps.length) return { ok: false, error: `Safety file incomplete: ${gaps[0]}`, gaps };
        if (owner.status !== "verified") return { ok: false, error: "Operator must be verified before an aircraft can be submitted" };
        normalized.aircraft.status = "pending";
      }
      aircraftMap.set(normalized.aircraft.id, normalized.aircraft);
      return { ok: true, aircraft: normalized.aircraft };
    },
    setAircraftOps(email, aircraftId, patch) {
      const item = aircraftMap.get(aircraftId);
      if (!item || item.operatorEmail !== email) return { ok: false, error: "Aircraft not found" };
      if (Array.isArray(patch.availability)) item.availability = patch.availability.slice(0, 40);
      if (patch.pricing) item.pricing = { ...item.pricing, ...patch.pricing };
      if (patch.hourlyRate) item.hourlyRate = num(patch.hourlyRate, item.hourlyRate);
      if (Array.isArray(patch.flightZones)) item.flightZones = patch.flightZones.map((code) => str(code, 12).toUpperCase());
      if (patch.strictZones !== undefined) item.strictZones = !!patch.strictZones;
      if (patch.document) {
        const url = str(patch.document.url, 400);
        if (!(url.startsWith("https://") || url.startsWith("/"))) return { ok: false, error: "Document URL must be HTTPS" };
        item.documents = [...(item.documents || []), { id: makeRef("DOC"), type: str(patch.document.type, 40), name: str(patch.document.name, 80), url, uploadedAt: new Date().toISOString() }];
      }
      aircraftMap.set(item.id, item);
      return { ok: true, aircraft: item };
    },
    createCharter(input) {
      const contactEmail = str(input.email, 120).toLowerCase();
      if (!emailOk(contactEmail)) return { ok: false, error: "A valid email is required" };
      const legs = (Array.isArray(input.legs) ? input.legs : []).map((leg) => ({
        from: str(leg.from, 80),
        to: str(leg.to, 80),
        date: isoDate(leg.date),
        time: str(leg.time, 8),
      })).filter((leg) => leg.from && leg.to && leg.date);
      if (!legs.length) return { ok: false, error: "Add at least one itinerary leg with airports and a date" };
      const record = {
        ref: makeRef("CHT"),
        email: contactEmail,
        name: str(input.name, 80),
        phone: str(input.phone, 40),
        tripType: input.tripType === "round" ? "round" : "oneway",
        passengers: Math.max(1, num(input.passengers, 1)),
        legs,
        aircraftCategory: str(input.aircraftCategory, 40),
        preferredAircraftId: str(input.preferredAircraftId, 40),
        catering: str(input.catering, 400),
        groundTransport: !!input.groundTransport,
        vipServices: !!input.vipServices,
        notes: str(input.notes, 800),
        status: "requested",
        quotations: [],
        schedule: null,
        negotiation: [],
        createdAt: new Date().toISOString(),
      };
      const preferred = record.preferredAircraftId ? aircraftMap.get(record.preferredAircraftId) : null;
      if (preferred) record.operatorEmail = preferred.operatorEmail || "";
      charters.set(record.ref, record);
      return { ok: true, charter: record };
    },
    listCharters({ email, operatorEmail } = {}) {
      return [...charters.values()].filter((item) => {
        if (email) return item.email === email;
        if (operatorEmail) return item.operatorEmail === operatorEmail || ownedAircraft(operatorEmail).some((plane) => plane.category === item.aircraftCategory || plane.id === item.preferredAircraftId);
        return false;
      });
    },
    submitQuotation(operatorEmail, charterRef, quote) {
      const charter = charters.get(charterRef);
      if (!charter) return { ok: false, error: "Charter request not found" };
      const owner = operatorByEmail(operatorEmail);
      if (!owner || owner.status !== "verified") return { ok: false, error: "Only verified operators can quote" };
      const plane = aircraftMap.get(quote.aircraftId);
      if (!plane || plane.operatorEmail !== operatorEmail || plane.status !== "approved") return { ok: false, error: "Choose one of your approved aircraft" };
      const amount = num(quote.amount, 0);
      if (amount < 100) return { ok: false, error: "Quotation amount is too low" };
      const quotation = {
        id: makeRef("QTE"),
        operatorId: owner.id,
        operatorEmail,
        operatorName: owner.companyName,
        aircraftId: plane.id,
        aircraftName: plane.name,
        alternative: plane.id !== charter.preferredAircraftId,
        amount,
        currency: str(quote.currency || plane.currency || "USD", 3).toUpperCase(),
        notes: str(quote.notes, 600),
        validUntil: isoDate(quote.validUntil),
        schedule: str(quote.schedule, 200),
        status: "offered",
        createdAt: new Date().toISOString(),
      };
      charter.quotations.push(quotation);
      charter.status = "quoted";
      charter.operatorEmail = operatorEmail;
      charters.set(charter.ref, charter);
      return { ok: true, charter };
    },
    decideCharter(email, charterRef, decision) {
      const charter = charters.get(charterRef);
      if (!charter || charter.email !== email) return { ok: false, error: "Charter request not found" };
      const action = str(decision.action, 40);
      if (action === "reject") {
        charter.status = "rejected";
        charters.set(charter.ref, charter);
        return { ok: true, charter };
      }
      if (action === "negotiate") {
        charter.status = "negotiating";
        charter.negotiation.push({ from: "customer", message: str(decision.message, 600), at: new Date().toISOString() });
        charters.set(charter.ref, charter);
        return { ok: true, charter };
      }
      if (action !== "accept") return { ok: false, error: "Unknown charter decision" };
      const quotation = charter.quotations.find((item) => item.id === decision.quotationId);
      if (!quotation) return { ok: false, error: "Select a quotation to accept" };
      charter.status = "confirmed";
      charter.schedule = quotation.schedule;
      const booking = this.createBooking({
        email,
        aircraftId: quotation.aircraftId,
        origin: charter.legs[0].from,
        destination: charter.legs[0].to,
        departDate: charter.legs[0].date,
        returnDate: charter.legs[1]?.date || "",
        tripType: charter.tripType,
        passengers: charter.passengers,
        priceOverride: quotation.amount,
        charterRef: charter.ref,
        skipSearch: true,
      });
      if (!booking.ok) return booking;
      charter.bookingRef = booking.booking.ref;
      charters.set(charter.ref, charter);
      return { ok: true, charter, booking: booking.booking };
    },
    operatorCharterAction(operatorEmail, charterRef, decision) {
      const charter = charters.get(charterRef);
      if (!charter) return { ok: false, error: "Charter request not found" };
      const action = str(decision.action, 40);
      if (action === "reject") {
        charter.status = "rejected";
        charters.set(charter.ref, charter);
        return { ok: true, charter };
      }
      if (action === "negotiate") {
        charter.status = "negotiating";
        charter.negotiation.push({ from: "operator", message: str(decision.message, 600), at: new Date().toISOString() });
        charters.set(charter.ref, charter);
        return { ok: true, charter };
      }
      if (action === "confirm_schedule") {
        charter.schedule = str(decision.schedule, 200);
        charter.status = charter.status === "requested" ? "quoted" : charter.status;
        charters.set(charter.ref, charter);
        return { ok: true, charter };
      }
      return this.submitQuotation(operatorEmail, charterRef, decision);
    },
    createBooking(input) {
      const contactEmail = str(input.email, 120).toLowerCase();
      if (!emailOk(contactEmail)) return { ok: false, error: "A valid email is required" };
      const plane = aircraftMap.get(input.aircraftId);
      if (!plane || plane.status !== "approved") return { ok: false, error: "Aircraft is not available to book" };
      const origin = findAirport(airports, input.origin);
      const destination = findAirport(airports, input.destination) || (plane.serviceType === "helicopter" ? origin : null);
      if (!origin || !destination) return { ok: false, error: "Departure and arrival airports are required" };
      if (!input.skipSearch && !canFlyLeg(plane, origin, destination)) return { ok: false, error: "Selected aircraft cannot operate this route" };
      const passengers = Math.max(1, num(input.passengers, 1));
      if (passengers > plane.passengers) return { ok: false, error: "Passenger count exceeds aircraft capacity" };
      const departDate = isoDate(input.departDate);
      if (!departDate) return { ok: false, error: "Departure date is required" };
      if (!isAvailable(plane, [departDate, isoDate(input.returnDate)])) return { ok: false, error: "Aircraft is not available on those dates" };
      const quote = quoteFlight(plane, origin, destination, { tripType: input.tripType, petFriendly: input.petFriendly, airports });
      if (input.priceOverride) quote.price = num(input.priceOverride, quote.price);
      const record = {
        ref: makeRef("AVN"),
        email: contactEmail,
        name: str(input.name, 80),
        phone: str(input.phone, 40),
        aircraftId: plane.id,
        aircraftName: plane.name,
        operatorId: plane.operatorId,
        operatorEmail: plane.operatorEmail || "",
        operatorName: plane.operatorName,
        charterRef: str(input.charterRef, 40),
        itineraryRef: str(input.itineraryRef, 40),
        origin,
        destination,
        departDate,
        returnDate: isoDate(input.returnDate),
        tripType: input.tripType === "round" ? "round" : "oneway",
        passengers,
        quote,
        status: "pending_payment",
        payment: null,
        crew: [],
        createdAt: new Date().toISOString(),
      };
      bookings.set(record.ref, record);
      return { ok: true, booking: record };
    },
    confirmBooking(ref, payment = {}) {
      const booking = bookings.get(ref);
      if (!booking) return { ok: false, error: "Booking not found" };
      const method = str(payment.method, 40).toLowerCase();
      if (method !== "invoice" && method !== "card") return { ok: false, error: "Choose card or invoice confirmation" };
      if (method === "card" && payment.cardVerified !== true) return { ok: false, error: "Card payment has not been verified" };
      booking.payment = {
        method,
        sessionId: method === "card" ? str(payment.sessionId, 255) : "",
        status: method === "card" ? "paid" : "invoiced",
        paidAt: new Date().toISOString(),
      };
      booking.status = "confirmed";
      bookings.set(booking.ref, booking);
      return { ok: true, booking };
    },
    listBookings({ email, operatorEmail } = {}) {
      return [...bookings.values()].filter((item) => {
        if (email) return item.email === email;
        if (operatorEmail) return item.operatorEmail === operatorEmail;
        return false;
      });
    },
    getBooking(ref) {
      return bookings.get(ref) || null;
    },
    assignCrew(operatorEmail, bookingRef, crew) {
      const booking = bookings.get(bookingRef);
      if (!booking || booking.operatorEmail !== operatorEmail) return { ok: false, error: "Flight not found" };
      booking.crew = (Array.isArray(crew) ? crew : []).slice(0, 8).map((member) => ({
        name: str(member.name, 80),
        role: str(member.role, 40),
        certification: str(member.certification, 80),
      })).filter((member) => member.name);
      bookings.set(booking.ref, booking);
      return { ok: true, booking, report: buildFlightReport(booking, aircraftMap.get(booking.aircraftId)) };
    },
    addReview(input) {
      const booking = bookings.get(input.bookingRef);
      if (!booking) return { ok: false, error: "Booking not found" };
      if (booking.email !== str(input.email, 120).toLowerCase()) return { ok: false, error: "Only the passenger can review this flight" };
      const score = num(input.score, 0);
      if (score < 1 || score > 5) return { ok: false, error: "Score must be between 1 and 5" };
      const review = {
        id: makeRef("REV"),
        bookingRef: booking.ref,
        aircraftId: booking.aircraftId,
        operatorEmail: booking.operatorEmail,
        score,
        comment: str(input.comment, 600),
        createdAt: new Date().toISOString(),
      };
      reviews.push(review);
      return { ok: true, review };
    },
    saveItinerary(input) {
      const contactEmail = str(input.email, 120).toLowerCase();
      if (!emailOk(contactEmail)) return { ok: false, error: "A valid email is required" };
      const items = (Array.isArray(input.items) ? input.items : []).slice(0, 12).map((item) => ({
        type: str(item.type, 40),
        title: str(item.title, 120),
        price: Math.max(0, num(item.price, 0)),
        currency: str(item.currency || "USD", 3).toUpperCase(),
        details: str(item.details, 400),
        ref: str(item.ref, 40),
      })).filter((item) => item.title);
      if (!items.length) return { ok: false, error: "Add at least one itinerary item" };
      const allowed = new Set(["private_jet", "helicopter", "attraction", "event", "hotel", "ground_transport"]);
      if (items.some((item) => !allowed.has(item.type))) return { ok: false, error: "Itinerary item type is not supported" };
      const record = {
        ref: input.ref && itineraries.has(input.ref) ? input.ref : makeRef("ITN"),
        email: contactEmail,
        title: str(input.title || "Luxury travel itinerary", 120),
        items,
        total: items.reduce((sum, item) => sum + item.price, 0),
        currency: "USD",
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      itineraries.set(record.ref, record);
      return { ok: true, itinerary: record };
    },
    presetItinerary(preset, query = {}) {
      const search = this.search({
        origin: query.origin || "EBB",
        destination: query.destination || "MFU",
        passengers: query.passengers || 4,
        departDate: query.departDate || "2026-11-12",
        category: "light_jet",
      });
      const jet = search.results[0];
      const heli = this.search({ origin: "MFU", destination: "MFU", category: "scenic", passengers: query.passengers || 4, departDate: query.departDate || "2026-11-12" }).results[0];
      if (preset !== "murchison") return { ok: false, error: "Unknown itinerary preset" };
      const items = [
        { type: "private_jet", title: "Private jet from Entebbe to Murchison Falls", price: jet?.quote.price || 5400, details: jet ? `${jet.aircraft.name} · ${jet.quote.durationMinutes} min` : "Light jet charter", ref: jet?.aircraft.id || "" },
        { type: "helicopter", title: "Helicopter scenic tour over the falls", price: heli?.quote.price || 1800, details: heli?.aircraft.name || "Airbus H125", ref: heli?.aircraft.id || "" },
        { type: "hotel", title: "Luxury lodge reservation", price: 2400, details: "Two nights, full board" },
        { type: "attraction", title: "National park entry tickets", price: 180, details: "Murchison Falls National Park" },
        { type: "ground_transport", title: "Safari van transfer", price: 220, details: "Lodge to airstrip and game drive" },
      ];
      return {
        ok: true,
        preset: {
          title: "Murchison Falls air safari",
          items,
          total: items.reduce((sum, item) => sum + item.price, 0),
          currency: "USD",
        },
      };
    },
    getItinerary(ref) {
      return itineraries.get(ref) || null;
    },
    checkoutItinerary(ref, email) {
      const itinerary = itineraries.get(ref);
      if (!itinerary || itinerary.email !== email) return { ok: false, error: "Itinerary not found" };
      itinerary.status = "checked_out";
      itineraries.set(ref, itinerary);
      return { ok: true, itinerary };
    },
    openDispute(input) {
      const booking = bookings.get(input.bookingRef);
      if (!booking || booking.email !== str(input.email, 120).toLowerCase()) return { ok: false, error: "Booking not found" };
      const reason = str(input.reason, 800);
      if (reason.length < 8) return { ok: false, error: "Describe the dispute" };
      const dispute = { id: makeRef("DSP"), bookingRef: booking.ref, email: booking.email, reason, status: "open", resolution: "", createdAt: new Date().toISOString() };
      disputes.push(dispute);
      return { ok: true, dispute };
    },
    adminOverview() {
      return {
        operators: [...operators.values()].filter((item) => !item.system),
        aircraft: listAircraft().filter((item) => item.operatorEmail),
        charters: [...charters.values()],
        bookings: [...bookings.values()],
        disputes,
        compliance: listAircraft().filter((item) => item.operatorEmail).map((item) => ({ id: item.id, name: item.name, status: item.status, gaps: complianceGaps(item) })),
        analytics: buildAnalytics([...bookings.values()], listAircraft(), reviews),
      };
    },
    reviewOperator(id, status, note) {
      const record = operators.get(id);
      if (!record || record.system) return { ok: false, error: "Operator not found" };
      if (!["verified", "rejected", "pending"].includes(status)) return { ok: false, error: "Invalid operator status" };
      if (status === "verified" && complianceGaps(record, "operator").length) return { ok: false, error: "Cannot verify an operator with missing AOC or insurance" };
      record.status = status;
      record.adminNote = str(note, 400);
      operators.set(id, record);
      audit.push({ type: "operator", id, status, at: new Date().toISOString() });
      return { ok: true, operator: record };
    },
    reviewAircraft(id, status, note) {
      const record = aircraftMap.get(id);
      if (!record || !record.operatorEmail) return { ok: false, error: "Aircraft not found" };
      if (!["approved", "rejected", "suspended", "pending"].includes(status)) return { ok: false, error: "Invalid aircraft status" };
      if (status === "approved") {
        const gaps = complianceGaps(record);
        if (gaps.length) return { ok: false, error: `Cannot approve: ${gaps[0]}` };
        const owner = operators.get(record.operatorId);
        if (!owner || owner.status !== "verified") return { ok: false, error: "Operator is not verified" };
      }
      record.status = status;
      record.adminNote = str(note, 400);
      aircraftMap.set(id, record);
      audit.push({ type: "aircraft", id, status, at: new Date().toISOString() });
      return { ok: true, aircraft: record };
    },
    resolveDispute(id, resolution) {
      const dispute = disputes.find((item) => item.id === id);
      if (!dispute) return { ok: false, error: "Dispute not found" };
      dispute.status = "resolved";
      dispute.resolution = str(resolution, 800);
      return { ok: true, dispute };
    },
    analytics(operatorEmail) {
      const fleet = operatorEmail ? ownedAircraft(operatorEmail) : listAircraft();
      const relevant = [...bookings.values()].filter((item) => !operatorEmail || item.operatorEmail === operatorEmail);
      const relevantReviews = reviews.filter((item) => !operatorEmail || item.operatorEmail === operatorEmail);
      return buildAnalytics(relevant, fleet, relevantReviews);
    },
  };
}

module.exports = {
  AIRPORT_TYPES,
  AMENITIES,
  CHARTER_SERVICES,
  HELICOPTER_SERVICES,
  JET_CATEGORIES,
  SEED_AIRCRAFT,
  SEED_AIRPORTS,
  SEED_OPERATORS,
  buildAnalytics,
  buildFlightReport,
  complianceGaps,
  createAviationService,
  findAirport,
  haversineNm,
  publicAircraft,
  quoteFlight,
  searchAircraft,
  validateAircraftInput,
};
