import { MapContainer, Marker, Popup, useMapEvents } from 'react-leaflet';
import BasemapLayer from './BasemapLayer.jsx';

function BoundsWatcher({ onBoundsChange }) {
  useMapEvents({ moveend(event) { const b = event.target.getBounds(); onBoundsChange?.(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`); } });
  return null;
}

export default function AttractionMap({ items, center, activeId, onSelect, onBoundsChange }) {
  const valid = items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  return (
    <MapContainer center={center || [0, 0]} zoom={center ? 12 : 2} className="h-full w-full" scrollWheelZoom>
      <BasemapLayer provider="osm" />
      <BoundsWatcher onBoundsChange={onBoundsChange} />
      {valid.map((item) => <Marker key={item.id} position={[item.lat, item.lon]} eventHandlers={{ click: () => onSelect?.(item.id) }}>
        <Popup><button type="button" onClick={() => onSelect?.(item.id)} className="text-left"><strong>{item.name}</strong><br />{item.category}{activeId === item.id ? ' · Selected' : ''}</button></Popup>
      </Marker>)}
    </MapContainer>
  );
}
