export const CATEGORY_LABELS = {
  light_jet: "Light Jets",
  midsize_jet: "Mid-Size Jets",
  super_midsize_jet: "Super Mid-Size Jets",
  heavy_jet: "Heavy Jets",
  ultra_long_range: "Ultra Long Range Jets",
  business_jet: "Business Jets",
  executive_jet: "Executive Jets",
  vip_jet: "VIP Jets",
  on_demand: "On-Demand Charter",
  corporate: "Corporate Charters",
  group: "Group Charters",
  medevac: "Medical Evacuation",
  government: "Government Charters",
  tourism: "Tourism Charters",
  safari: "Safari Air Transfers",
  island: "Island Transfers",
  scenic: "Scenic Flights",
  aerial_tour: "Aerial Tours",
  vip_transfer: "VIP Transfers",
  airport_transfer: "Airport Transfers",
  emergency: "Emergency Services",
  corporate_flight: "Corporate Flights",
  private_jet: "Private Jets",
  air_charter: "Air Charters",
  helicopter: "Helicopters",
};

export const AMENITY_LABELS = {
  wifi: "Wi-Fi",
  entertainment: "Entertainment",
  conference: "Conference",
  private_bedrooms: "Private bedrooms",
  premium_catering: "Premium catering",
  luxury_seating: "Luxury seating",
  flight_attendant: "Flight attendant",
  vip_ground: "VIP ground handling",
};

export function categoryLabel(id) {
  return CATEGORY_LABELS[id] || id || "Aircraft";
}

export function money(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

export function durationLabel(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function searchQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function aviationRequest(action, options = {}) {
  const { method = "GET", token, body, query = {} } = options;
  const params = new URLSearchParams({ action });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const response = await fetch(`/api/aviation?${params.toString()}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify({ action, ...(body || {}) }),
  });
  const data = await response.json().catch(() => ({ ok: false, error: "Invalid server response" }));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
