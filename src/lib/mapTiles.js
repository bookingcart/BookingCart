/**
 * Free, keyless basemap providers for Leaflet.
 *
 * Every provider here serves raster tiles over HTTPS without an API key, so a
 * map never breaks because a paid key is missing or a quota ran out. Attribution
 * is required by each provider's terms and is rendered by Leaflet.
 *
 * Do not add CARTO basemaps: basemaps.cartocdn.com now stamps "API KEY REQUIRED"
 * over every tile unless the request carries a CARTO key.
 */

export const MAP_PROVIDERS = {
  osm: {
    label: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  esriStreets: {
    label: 'Streets+',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, NGA',
    maxZoom: 19,
  },
  light: {
    label: 'Light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  },
  dark: {
    label: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    subdomains: 'abc',
    maxZoom: 17,
  },
};

/** Basemaps offered in the on-map switcher. */
export const BASEMAP_CHOICES = ['osm', 'light', 'satellite'];

/** Default basemap (OpenStreetMap is the canonical keyless raster source). */
export const DEFAULT_MAP_PROVIDER = 'osm';

/** Order used to recover when a provider starts failing (blocked, rate limited, offline). */
export const FALLBACK_ORDER = ['osm', 'esriStreets', 'satellite', 'terrain', 'light'];

export function getMapProvider(name) {
  return MAP_PROVIDERS[name] || MAP_PROVIDERS[DEFAULT_MAP_PROVIDER];
}

/** Props for react-leaflet's <TileLayer>, spread straight onto it. */
export function getBasemapProps(name) {
  const provider = getMapProvider(name);
  return {
    url: provider.url,
    attribution: provider.attribution,
    maxZoom: provider.maxZoom,
    ...(provider.subdomains ? { subdomains: provider.subdomains } : {}),
  };
}

/** Next provider to try after `current`, skipping ones that already failed. */
export function nextFallbackProvider(current, attempted = new Set()) {
  const start = FALLBACK_ORDER.indexOf(current);
  const ordered = start === -1 ? FALLBACK_ORDER : [...FALLBACK_ORDER.slice(start + 1), ...FALLBACK_ORDER.slice(0, start)];
  return ordered.find((name) => !attempted.has(name) && name !== current) || '';
}
