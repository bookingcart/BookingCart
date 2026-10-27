import { useEffect, useRef, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import { DEFAULT_MAP_PROVIDER, getBasemapProps, nextFallbackProvider } from '../lib/mapTiles.js';

// A single blocked tile is normal (pan/zoom boundary); a burst of them means the
// provider is unreachable, so switch to the next free basemap.
const TILE_ERROR_THRESHOLD = 6;

/**
 * Free basemap tiles with automatic failover between keyless providers.
 * Drop-in replacement for `<TileLayer>` inside a `<MapContainer>`.
 */
export default function BasemapLayer({ provider = DEFAULT_MAP_PROVIDER, onProviderChange, ...tileProps }) {
  const [failover, setFailover] = useState('');
  const attempted = useRef(new Set());
  const errors = useRef(0);

  const current = failover || provider;

  useEffect(() => {
    setFailover('');
    attempted.current = new Set();
    errors.current = 0;
  }, [provider]);

  function handleTileError() {
    errors.current += 1;
    if (errors.current < TILE_ERROR_THRESHOLD) return;
    errors.current = 0;

    const next = nextFallbackProvider(current, attempted.current);
    attempted.current.add(current);
    if (!next) return;

    setFailover(next);
    onProviderChange?.(next);
  }

  return (
    <TileLayer
      key={current}
      {...getBasemapProps(current)}
      {...tileProps}
      eventHandlers={{ tileerror: handleTileError }}
    />
  );
}
