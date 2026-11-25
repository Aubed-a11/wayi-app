// ============================================================
// WAYI - Cartes (Leaflet + fond OpenStreetMap, sans cle API)
// LiveMap : suivi en direct du livreur (client et restaurant)
// PickLocationMap : le client place le point exact de livraison
// ============================================================
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Navigation } from 'lucide-react';

export const COTONOU = { lat: 6.3703, lng: 2.3912 };
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap';

const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// Traces des icones lucide (maison, toque, velo), en texte pour les epingles de la carte
const PATHS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  chef: '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>',
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
};
function pinIcon(name, bg, size = 38) {
  const s = Math.round(size * 0.48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return L.divIcon({
    className: 'wmap-pin',
    html: `<span style="width:${size}px;height:${size}px;background:${bg}">${svg}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
const ICONS = {
  delivery: () => pinIcon('home', '#F58A3D'),
  restaurant: () => pinIcon('chef', '#8A6A55'),
  driver: () => pinIcon('bike', '#4F8A68', 42),
};

function baseMap(el, center, zoom) {
  const map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([center.lat, center.lng], zoom);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

// Distance a vol d'oiseau en km
export function km(a, b) {
  if (!valid(a) || !valid(b)) return null;
  const R = 6371; const toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat); const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Lien d'itineraire Google Maps (ouvre l'appli Maps du telephone)
export const directionsLink = (to, from) => `https://www.google.com/maps/dir/?api=1${valid(from) ? `&origin=${from.lat},${from.lng}` : ''}&destination=${to.lat},${to.lng}&travelmode=driving`;

/**
 * restaurant, delivery, driver, pickup : { lat, lng } (facultatifs)
 * trail : [[lat, lng], ...] trajet deja parcouru par le livreur depuis le retrait du repas
 */
export function LiveMap({ restaurant, delivery, driver, pickup, trail = [], height = 260 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const lineRef = useRef(null);
  const trailRef = useRef(null);
  const startRef = useRef(null);
  const fittedKey = useRef('');
  const anim = useRef(null);

  const latest = useRef({});
  latest.current = { restaurant, delivery, driver };

  useEffect(() => {
    const start = [driver, delivery, restaurant].find(valid) || COTONOU;
    const map = baseMap(elRef.current, start, 14);
    mapRef.current = map;
    // Dans une fenetre qui s'ouvre, la carte n'a pas encore sa taille : on recadre une fois affichee
    const fix = setTimeout(() => {
      map.invalidateSize();
      const all = Object.values(latest.current).filter(valid).map(p => [p.lat, p.lng]);
      if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
    }, 250);
    return () => { clearTimeout(fix); cancelAnimationFrame(anim.current); map.remove(); mapRef.current = null; markers.current = {}; lineRef.current = null; trailRef.current = null; startRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = { restaurant, delivery, driver };
    for (const [k, p] of Object.entries(pts)) {
      const m = markers.current[k];
      if (!valid(p)) { if (m) { m.remove(); delete markers.current[k]; } continue; }
      if (!m) {
        markers.current[k] = L.marker([p.lat, p.lng], { icon: ICONS[k](), zIndexOffset: k === 'driver' ? 1000 : 0, keyboard: false }).addTo(map);
      } else if (k === 'driver') {
        // Deplacement fluide du livreur entre deux positions
        const from = m.getLatLng(); const t0 = performance.now(); const dur = 900;
        cancelAnimationFrame(anim.current);
        const step = (t) => {
          const r = Math.min(1, (t - t0) / dur);
          m.setLatLng([from.lat + (p.lat - from.lat) * r, from.lng + (p.lng - from.lng) * r]);
          if (r < 1) anim.current = requestAnimationFrame(step);
        };
        anim.current = requestAnimationFrame(step);
      } else {
        m.setLatLng([p.lat, p.lng]);
      }
    }
    // Trajet deja parcouru depuis le point de retrait (trait plein) et point de depart
    const done = [...(trail || []), ...(valid(driver) ? [[driver.lat, driver.lng]] : [])];
    if (done.length > 1) {
      if (trailRef.current) trailRef.current.setLatLngs(done);
      else trailRef.current = L.polyline(done, { color: '#4F8A68', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    } else if (trailRef.current) { trailRef.current.remove(); trailRef.current = null; }
    if (valid(pickup)) {
      if (!startRef.current) {
        startRef.current = L.circleMarker([pickup.lat, pickup.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#4F8A68', fillOpacity: 1 })
          .bindTooltip('Départ', { permanent: true, direction: 'top', offset: [0, -8], className: 'wmap-tip' }).addTo(map);
      } else startRef.current.setLatLng([pickup.lat, pickup.lng]);
    } else if (startRef.current) { startRef.current.remove(); startRef.current = null; }

    // Trajet restant du livreur jusqu'au client
    if (valid(driver) && valid(delivery)) {
      const ll = [[driver.lat, driver.lng], [delivery.lat, delivery.lng]];
      if (lineRef.current) lineRef.current.setLatLngs(ll);
      else lineRef.current = L.polyline(ll, { color: '#4F8A68', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(map);
    } else if (lineRef.current) { lineRef.current.remove(); lineRef.current = null; }

    // Recadrage quand un nouveau point apparait (pas a chaque mouvement)
    const key = Object.keys(pts).filter(k => valid(pts[k])).join(',');
    if (key && key !== fittedKey.current) {
      fittedKey.current = key;
      const all = [...Object.values(pts).filter(valid).map(p => [p.lat, p.lng]), ...(trail || [])];
      if (all.length === 1) map.setView(all[0], 15);
      else map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
    } else if (valid(driver) && !map.getBounds().pad(-0.1).contains([driver.lat, driver.lng])) {
      map.panTo([driver.lat, driver.lng]);
    }
  }, [restaurant?.lat, restaurant?.lng, delivery?.lat, delivery?.lng, driver?.lat, driver?.lng, pickup?.lat, trail?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = () => {
    const map = mapRef.current; if (!map) return;
    const all = [...[restaurant, delivery, driver].filter(valid).map(p => [p.lat, p.lng]), ...(trail || [])];
    if (all.length === 1) map.setView(all[0], 15); else if (all.length) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
  };

  return (
    <div className="wmap" style={{ height }}>
      <div ref={elRef} className="wmap-canvas" />
      <button type="button" className="wmap-btn" onClick={recenter} aria-label="Recentrer la carte"><Navigation size={17} aria-hidden="true" /></button>
      <div className="wmap-legend">
        {valid(driver) && <span><i style={{ background: '#4F8A68' }} />Livreur</span>}
        {(trail || []).length > 1 && <span><i style={{ background: '#4F8A68', borderRadius: 2, width: 12, height: 4 }} />Trajet</span>}
        {valid(restaurant) && <span><i style={{ background: '#8A6A55' }} />Restaurant</span>}
        {valid(delivery) && <span><i style={{ background: '#F58A3D' }} />Livraison</span>}
      </div>
    </div>
  );
}

/**
 * Le client touche la carte ou deplace l'epingle pour placer son point de livraison.
 * value : { lat, lng } | null ; onChange(pos)
 */
export function PickLocationMap({ value, onChange, height = 240 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const start = valid(value) ? value : COTONOU;
    const map = baseMap(elRef.current, start, valid(value) ? 17 : 13);
    mapRef.current = map;
    const place = (lat, lng) => {
      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lng], { icon: ICONS.delivery(), draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => { const p = markerRef.current.getLatLng(); cb.current({ lat: p.lat, lng: p.lng }); });
      } else markerRef.current.setLatLng([lat, lng]);
    };
    if (valid(value)) place(value.lat, value.lng);
    map.on('click', (e) => { place(e.latlng.lat, e.latlng.lng); cb.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    mapRef.current.place = place;
    const fix = setTimeout(() => map.invalidateSize(), 200);
    return () => { clearTimeout(fix); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Position fournie de l'exterieur (bouton "Ma position")
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !valid(value)) return;
    map.place(value.lat, value.lng);
    if (!map.getBounds().contains([value.lat, value.lng]) || map.getZoom() < 15) map.setView([value.lat, value.lng], 17);
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wmap" style={{ height }}>
      <div ref={elRef} className="wmap-canvas" />
      {!valid(value) && <div className="wmap-hint"><LocateFixed size={14} aria-hidden="true" /> Touche la carte à l'endroit exact de livraison</div>}
    </div>
  );
}
