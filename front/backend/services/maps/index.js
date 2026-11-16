// ============================================================
// WAYI — Service Cartographie & Géolocalisation
// Google Maps Platform + Mapbox + OpenStreetMap (fallback)
// ============================================================
const axios = require('axios');

const GOOGLE_KEY  = process.env.GOOGLE_MAPS_API_KEY  || '';
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';

// ── HAVERSINE (calcul distance offline) ──────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── ETA ESTIMATION (sans API) ─────────────────────────────────
function estimateETA(distKm, vehicleType = 'moto', trafficFactor = 1.0) {
  const speeds = { moto: 25, velo: 12, tricycle: 18, voiture: 30 };
  const speed = speeds[vehicleType] || 25;
  // +5min de préparation/récupération
  const minutes = Math.round((distKm / speed) * 60 * trafficFactor) + 5;
  return { minutes, label: `${minutes} min`, range: `${minutes}-${minutes + 10} min` };
}

// ── DELIVERY FEE CALCULATOR ───────────────────────────────────
function calculateDeliveryFee(distKm, vehicleType = 'moto', zone = 'calavi') {
  const baseFees = { moto: 500, velo: 400, tricycle: 600, voiture: 800 };
  const perKm    = { moto: 150, velo: 100, tricycle: 200, voiture: 250 };
  const base = baseFees[vehicleType] || 500;
  const fee  = base + distKm * (perKm[vehicleType] || 150);
  return Math.max(500, Math.round(fee / 100) * 100); // arrondi à 100 FCFA
}

// ── GEOCODING ─────────────────────────────────────────────────

/**
 * Géocoder une adresse → coordonnées GPS
 * Essaie Google Maps, puis Nominatim (OSM) en fallback
 */
async function geocodeAddress(address, city = 'Abomey-Calavi, Bénin') {
  const fullAddress = `${address}, ${city}`;

  // 1. Essai Google Maps Geocoding
  if (GOOGLE_KEY) {
    try {
      const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address: fullAddress, key: GOOGLE_KEY, region: 'bj' },
        timeout: 5000,
      });
      if (res.data.status === 'OK' && res.data.results.length > 0) {
        const loc = res.data.results[0].geometry.location;
        return {
          success: true, provider: 'google',
          lat: loc.lat, lng: loc.lng,
          formattedAddress: res.data.results[0].formatted_address,
          placeId: res.data.results[0].place_id,
        };
      }
    } catch (err) { console.warn('[Maps] Google geocode failed, trying Nominatim'); }
  }

  // 2. Fallback Nominatim (OpenStreetMap) — gratuit, sans clé
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: fullAddress, format: 'json', limit: 1, countrycodes: 'bj' },
      headers: { 'User-Agent': 'WayiApp/2.0 (contact@wayi.app)' },
      timeout: 5000,
    });
    if (res.data.length > 0) {
      return {
        success: true, provider: 'nominatim',
        lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon),
        formattedAddress: res.data[0].display_name,
      };
    }
  } catch (err) { console.warn('[Maps] Nominatim failed'); }

  // 3. Fallback : coordonnées par défaut Calavi
  console.warn('[Maps] All geocoders failed, using Calavi default');
  return { success: false, provider: 'default', lat: 6.3702, lng: 2.3824, formattedAddress: 'Abomey-Calavi, Bénin (approximatif)' };
}

// ── REVERSE GEOCODING ─────────────────────────────────────────

async function reverseGeocode(lat, lng) {
  // Google
  if (GOOGLE_KEY) {
    try {
      const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { latlng: `${lat},${lng}`, key: GOOGLE_KEY },
        timeout: 5000,
      });
      if (res.data.status === 'OK') {
        return { success: true, provider: 'google', address: res.data.results[0]?.formatted_address };
      }
    } catch {}
  }

  // Nominatim fallback
  try {
    const res = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: { lat, lon: lng, format: 'json' },
      headers: { 'User-Agent': 'WayiApp/2.0' },
      timeout: 5000,
    });
    return { success: true, provider: 'nominatim', address: res.data.display_name };
  } catch {}

  return { success: false, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
}

// ── ROUTING / DIRECTIONS ──────────────────────────────────────

/**
 * Calculer un itinéraire entre deux points
 */
async function getRoute(originLat, originLng, destLat, destLng, mode = 'driving') {
  const distKm = haversineDistance(originLat, originLng, destLat, destLng);
  const eta = estimateETA(distKm, 'moto');

  // Google Directions
  if (GOOGLE_KEY) {
    try {
      const res = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${originLat},${originLng}`,
          destination: `${destLat},${destLng}`,
          mode: mode === 'moto' ? 'driving' : mode,
          key: GOOGLE_KEY,
          language: 'fr',
        },
        timeout: 8000,
      });
      if (res.data.status === 'OK') {
        const route = res.data.routes[0].legs[0];
        return {
          success: true, provider: 'google',
          distanceKm: route.distance.value / 1000,
          durationMin: Math.round(route.duration.value / 60),
          durationText: route.duration.text,
          distanceText: route.distance.text,
          polyline: res.data.routes[0].overview_polyline.points,
          steps: route.steps.map(s => ({ instruction: s.html_instructions.replace(/<[^>]*>/g, ''), distance: s.distance.text })),
        };
      }
    } catch (err) { console.warn('[Maps] Google Directions failed'); }
  }

  // Mapbox Directions fallback
  if (MAPBOX_TOKEN) {
    try {
      const res = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}`,
        { params: { access_token: MAPBOX_TOKEN, geometries: 'geojson', language: 'fr' }, timeout: 8000 }
      );
      if (res.data.routes?.length > 0) {
        const route = res.data.routes[0];
        return {
          success: true, provider: 'mapbox',
          distanceKm: route.distance / 1000,
          durationMin: Math.round(route.duration / 60),
          durationText: `${Math.round(route.duration / 60)} min`,
          distanceText: `${(route.distance / 1000).toFixed(1)} km`,
          geometry: route.geometry,
        };
      }
    } catch {}
  }

  // Fallback haversine
  return {
    success: true, provider: 'haversine',
    distanceKm: Math.round(distKm * 10) / 10,
    durationMin: eta.minutes,
    durationText: eta.label,
    distanceText: `${Math.round(distKm * 10) / 10} km`,
  };
}

// ── DISTANCE MATRIX ───────────────────────────────────────────

/**
 * Calculer distances/ETAs entre plusieurs origines et destinations
 * Utilisé pour trouver le livreur le plus proche
 */
async function getDistanceMatrix(origins, destinations) {
  if (GOOGLE_KEY && origins.length && destinations.length) {
    try {
      const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
      const destsStr   = destinations.map(d => `${d.lat},${d.lng}`).join('|');
      const res = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: { origins: originsStr, destinations: destsStr, mode: 'driving', key: GOOGLE_KEY, language: 'fr' },
        timeout: 8000,
      });
      if (res.data.status === 'OK') {
        return { success: true, provider: 'google', rows: res.data.rows };
      }
    } catch {}
  }

  // Fallback haversine matrix
  const rows = origins.map(o => ({
    elements: destinations.map(d => {
      const dist = haversineDistance(o.lat, o.lng, d.lat, d.lng);
      const eta = estimateETA(dist);
      return { distance: { value: Math.round(dist * 1000), text: `${dist.toFixed(1)} km` }, duration: { value: eta.minutes * 60, text: eta.label }, status: 'OK' };
    }),
  }));
  return { success: true, provider: 'haversine', rows };
}

// ── NEAREST DRIVER ────────────────────────────────────────────

/**
 * Trouver le livreur disponible le plus proche (avec vraies distances)
 */
async function findNearestAvailableDriver(drivers, userLat, userLng) {
  const available = drivers.filter(d => d.status === 'available');
  if (!available.length) return null;

  // Calculer les distances réelles
  const withDistances = await Promise.all(available.map(async d => {
    const route = await getRoute(d.location.lat, d.location.lng, userLat, userLng);
    return { ...d, distanceKm: route.distanceKm, etaMin: route.durationMin };
  }));

  return withDistances.sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

// ── ZONES CALAVI ──────────────────────────────────────────────

const CALAVI_ZONES = [
  { id: 'z1', name: 'Cité GBÉTO',       lat: 6.3702, lng: 2.3824, radius: 2,   trafficFactor: 1.1 },
  { id: 'z2', name: 'Campus UAC',        lat: 6.3715, lng: 2.3850, radius: 1.5, trafficFactor: 1.2 },
  { id: 'z3', name: 'Akassato',          lat: 6.3650, lng: 2.3780, radius: 3,   trafficFactor: 1.0 },
  { id: 'z4', name: 'GDIZ Glo-Djigbé',  lat: 6.3580, lng: 2.3700, radius: 4,   trafficFactor: 0.9 },
  { id: 'z5', name: 'Godomey',           lat: 6.3780, lng: 2.3900, radius: 2.5, trafficFactor: 1.3 },
  { id: 'z6', name: 'Calavi Centre',     lat: 6.3720, lng: 2.3820, radius: 3,   trafficFactor: 1.1 },
  { id: 'z7', name: 'Kpanroun',          lat: 6.3660, lng: 2.3760, radius: 2,   trafficFactor: 1.0 },
  { id: 'z8', name: 'Agla Nord',         lat: 6.3698, lng: 2.3815, radius: 1.5, trafficFactor: 1.0 },
];

function detectZone(lat, lng) {
  return CALAVI_ZONES.find(z => haversineDistance(lat, lng, z.lat, z.lng) <= z.radius) || CALAVI_ZONES[5];
}

module.exports = {
  haversineDistance, estimateETA, calculateDeliveryFee,
  geocodeAddress, reverseGeocode, getRoute, getDistanceMatrix,
  findNearestAvailableDriver, detectZone,
  CALAVI_ZONES,
};
