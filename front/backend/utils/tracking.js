// ============================================================
// WAYI - Donnees de suivi d'une commande (carte en direct)
// Position du livreur, du restaurant et du point de livraison,
// partagees par le suivi client et le suivi restaurant.
// ============================================================
const { drivers, getRestaurantById } = require('../data/store');

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const point = (lat, lng) => { const a = num(lat); const b = num(lng); return valid(a, b) ? { lat: a, lng: b } : null; };

// Le livreur n'est visible que pendant la course (pas avant l'assignation, pas apres la livraison)
const LIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'on_the_way'];

function distKm(a, b) {
  const R = 6371; const t = (x) => x * Math.PI / 180;
  const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Debut de la course : le livreur vient de recuperer le repas au restaurant
function startTrip(order, driver) {
  const r = getRestaurantById(order.restaurantId);
  const from = point(driver?.location?.lat, driver?.location?.lng) || point(r?.lat, r?.lng);
  const at = new Date().toISOString();
  order.pickup = from ? { ...from, at } : { at };
  order.trail = from ? [{ ...from, t: at }] : [];
}

// Chaque nouvelle position du livreur prolonge le trace (points espaces d'au moins 10 m)
function recordTrail(order, pos) {
  if (order.status !== 'on_the_way' || !pos) return;
  if (!Array.isArray(order.trail)) order.trail = [];
  const last = order.trail[order.trail.length - 1];
  if (last && distKm(last, pos) < 0.01) return;
  order.trail.push({ lat: pos.lat, lng: pos.lng, t: new Date().toISOString() });
  // Garde le trace leger : au-dela de 600 points, on garde un point sur deux (sauf le depart)
  if (order.trail.length > 600) order.trail = [order.trail[0], ...order.trail.slice(1).filter((_, i) => i % 2 === 1)];
}

function trailKm(trail = []) {
  let km = 0;
  for (let i = 1; i < trail.length; i++) km += distKm(trail[i - 1], trail[i]);
  return km;
}

function buildTracking(order) {
  const r = getRestaurantById(order.restaurantId);
  const d = order.driver?.id ? drivers.find(x => x.id === order.driver.id) : null;
  const driverPos = d && LIVE_STATUSES.includes(order.status) ? point(d.location?.lat, d.location?.lng) : null;
  return {
    orderId: order.id,
    status: order.status,
    restaurant: r ? { name: r.name, ...(point(r.lat, r.lng) || {}) } : null,
    delivery: { ...(point(order.lat, order.lng) || {}), address: order.address, landmark: order.landmark || '', mapsLink: order.mapsLink || null },
    // Trajet depuis le point de retrait (pendant la livraison)
    pickup: order.pickup?.lat != null ? { lat: order.pickup.lat, lng: order.pickup.lng, at: order.pickup.at } : (order.pickup?.at ? { at: order.pickup.at } : null),
    trail: ['on_the_way', 'delivered'].includes(order.status) ? (order.trail || []).map(p => [p.lat, p.lng]) : [],
    traveledKm: Math.round(trailKm(order.trail) * 100) / 100,
    driver: d ? {
      name: d.name, phone: d.phone, vehicle: d.vehicle?.type || null, plate: d.vehicle?.plate || null,
      ...(driverPos || {}), updatedAt: driverPos ? (d.location?.updatedAt || null) : null,
    } : null,
  };
}

module.exports = { buildTracking, point, LIVE_STATUSES, startTrip, recordTrail, distKm };
