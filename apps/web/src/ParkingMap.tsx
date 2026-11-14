import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  Popup,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import { Link } from 'react-router-dom';
import { MapPin, WifiOff, RefreshCw } from 'lucide-react';
import { CAMPUS, detailsURL, directionsURL } from './booking-time';
import { money } from './api';
import type { Spot } from './types';
function Follow({ spot }: { spot?: Spot }) {
  const map = useMap();
  useEffect(() => {
    if (spot) map.setView([spot.latitude, spot.longitude], 16, { animate: false });
  }, [spot?.id, map]);
  useEffect(() => {
    let disposed = false;
    const resize = new ResizeObserver(() => {
      if (!disposed && map.getContainer().isConnected) map.invalidateSize();
    });
    resize.observe(map.getContainer());
    return () => {
      disposed = true;
      resize.disconnect();
    };
  }, [map]);
  return null;
}
export function ParkingMap({
  spots,
  selected,
  onSelect,
  linkParams = new URLSearchParams(),
}: {
  spots: Spot[];
  selected?: string;
  onSelect: (id: string) => void;
  linkParams?: URLSearchParams;
}) {
  const [offline, setOffline] = useState(false);
  const [version, setVersion] = useState(0);
  const url = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  return (
    <div className="map-wrap live-map">
      <div className="map-status">
        {offline ? <WifiOff size={15} /> : <MapPin size={15} />}
        <span>{offline ? 'Offline map · illustration' : 'OpenStreetMap · Sahyadri, Adyar'}</span>
        {offline && (
          <button
            aria-label="Retry live map"
            onClick={() => {
              setOffline(false);
              setVersion((v) => v + 1);
            }}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <MapContainer
        center={[CAMPUS.latitude + 0.001, CAMPUS.longitude + 0.001]}
        zoom={15}
        minZoom={12}
        maxZoom={19}
        className="parking-map"
        scrollWheelZoom={false}
        zoomControl={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <ZoomControl position="topright" />
        {offline ? (
          <ImageOverlay
            url="/demo/campus-map.svg"
            bounds={[
              [12.847, 74.905],
              [12.889, 74.947],
            ]}
          />
        ) : (
          <TileLayer
            key={version}
            url={url}
            attribution={
              import.meta.env.VITE_TILE_ATTRIBUTION ||
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            }
            eventHandlers={{ tileerror: () => setOffline(true) }}
          />
        )}
        <Marker
          position={[CAMPUS.latitude, CAMPUS.longitude]}
          icon={divIcon({
            className: 'campus-marker',
            html: '<span aria-label="Sahyadri College">S</span>',
            iconSize: [32, 32],
          })}
        >
          <Popup>
            <strong>Sahyadri College of Engineering & Management</strong>
            <p>Official contact-page map reference.</p>
          </Popup>
        </Marker>
        {spots.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={divIcon({
              className: 'price-pin-wrap',
              html: `<span class="price-pin ${selected === s.id ? 'active' : ''}">₹${Math.round(s.hourlyPrice / 100)}</span>`,
              iconSize: [66, 34],
              iconAnchor: [33, 34],
            })}
            eventHandlers={{ click: () => onSelect(s.id) }}
          >
            <Popup>
              <span className="small muted">FICTIONAL DEMO SPACE</span>
              <strong>{s.title}</strong>
              <p>{money(s.hourlyPrice)} / hour</p>
              <Link to={detailsURL(s.id, linkParams)}>View details & book →</Link>
              <p>
                <a href={directionsURL(s.latitude, s.longitude)} target="_blank" rel="noreferrer">
                  Google Maps directions ↗
                </a>
              </p>
            </Popup>
          </Marker>
        ))}
        <Follow spot={spots.find((s) => s.id === selected)} />
      </MapContainer>
      <div className="map-caption">
        {offline
          ? 'Live tiles unavailable. Local illustration shown; booking still works.'
          : 'Real map · fictional parking markers · distances from college'}
      </div>
    </div>
  );
}
