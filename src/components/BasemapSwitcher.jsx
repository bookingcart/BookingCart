import { BASEMAP_CHOICES, MAP_PROVIDERS } from '../lib/mapTiles.js';

/**
 * Small pill switcher for choosing a free basemap inside a Leaflet map.
 * Render it inside the same positioned container as the `<MapContainer>`.
 */
export default function BasemapSwitcher({ value, onChange, className = '' }) {
  return (
    <div
      className={`absolute top-3 right-3 z-[800] flex items-center gap-1 rounded-full bg-white/95 backdrop-blur p-1 shadow-md ring-1 ring-slate-200 ${className}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {BASEMAP_CHOICES.map((name) => {
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            aria-pressed={active}
            title={`${MAP_PROVIDERS[name].label} map`}
            onClick={() => onChange?.(name)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
              active ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {MAP_PROVIDERS[name].label}
          </button>
        );
      })}
    </div>
  );
}
