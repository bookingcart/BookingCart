/**
 * Free, keyless basemap providers for Leaflet.
 *
 * Every provider here serves raster tiles over HTTPS without an API key, so a
 * map never breaks because a paid key is missing or a quota ran out. Attribution
 * is required by each provider's terms and is rendered by Leaflet.
 */

export const MAP_PROVIDERS = {
  osm: {
    label: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  voyager: {
    label: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  light: {
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    subdomains: 'abc',
    maxZoom: 17,
  },
};

/** Basemaps offered in the on-map switcher. */
export const BASEMAP_CHOICES = ['voyager', 'osm', 'satellite'];

/** Visually closest reliable default (matches the previous hard-coded tiles). */
export const DEFAULT_MAP_PROVIDER = 'voyager';

/** Order used to recover when a provider starts failing (blocked, rate limited, offline). */
export const FALLBACK_ORDER = ['voyager', 'osm', 'light', 'satellite', 'terrain'];

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
