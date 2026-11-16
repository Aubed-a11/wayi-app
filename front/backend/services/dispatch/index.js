// ============================================================
// WAYI — Service de Dispatch (ping séquentiel des livreurs)
// Quand une commande est créée, on "ping" le livreur disponible
// le plus proche. S'il n'accepte pas dans le délai imparti (ou
// s'il décline), la commande est proposée au suivant.
// ============================================================
const { drivers, PLATFORM_CONFIG, findNearbyDrivers } = require('../../data/store');

const PING_TIMEOUT_MS = 20000; // 20s pour accepter/décliner

function buildPingPayload(order) {
  return {
    orderId: order.id,
    restaurantName: order.restaurantName,
    restaurantIcon: order.restaurantIcon,
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    address: order.address,
    landmark: order.landmark || '',
    mapsLink: order.mapsLink || null,
    estimatedEarnings: Math.round((order.deliveryFee || 0) * PLATFORM_CONFIG.driverShare),
    expiresInSec: PING_TIMEOUT_MS / 1000,
  };
}

/**
 * Démarre le dispatch d'une commande : cherche les livreurs disponibles
 * proches du restaurant et lance la cascade de ping.
 */
function startDispatch(order, restaurant) {
  const candidates = findNearbyDrivers(restaurant.lat, restaurant.lng, { limit: 5, maxKm: 8 }).map(d => d.id);
  order.pingCandidates = candidates;
  order.pingStatus = candidates.length ? 'pinging' : 'unassigned';
  order.pingedDriverId = null;
  order.pingExpiresAt = null;

  if (!candidates.length) {
    notifyUnassigned(order);
    return;
  }
  pingNext(order);
}

function pingNext(order) {
  const { emitToUser, emitOrderStatusChange } = require('../realtime');

  if (order.driver) return; // déjà pris en charge
  if (!order.pingCandidates?.length) {
    order.pingStatus = 'unassigned';
    notifyUnassigned(order);
    return;
  }

  const driverId = order.pingCandidates.shift();
  const driver = drivers.find(d => d.id === driverId);
  if (!driver || driver.status !== 'available') {
    return pingNext(order); // livreur plus disponible entre temps → suivant
  }

  order.pingedDriverId = driverId;
  order.pingStatus = 'pinging';
  order.pingExpiresAt = new Date(Date.now() + PING_TIMEOUT_MS).toISOString();

  const sent = emitToUser(driverId, 'order:ping', buildPingPayload(order));
  try { require('../push').pingToDriver(driverId, order); } catch { /* facultatif */ }
  emitOrderStatusChange(order.id, order.status, { pingStatus: 'pinging', pingedDriver: driver.name });

  setTimeout(() => {
    if (order.driver) return; // déjà accepté entre temps
    if (order.pingedDriverId === driverId && order.pingStatus === 'pinging') {
      pingNext(order); // pas de réponse → livreur suivant
    }
  }, PING_TIMEOUT_MS);

  return sent;
}

function notifyUnassigned(order) {
  const { emitOrderStatusChange } = require('../realtime');
  emitOrderStatusChange(order.id, order.status, {
    pingStatus: 'unassigned',
    message: 'Recherche d\'un livreur en cours…',
  });
}

/**
 * Un livreur décline explicitement → on passe immédiatement au suivant.
 */
function declineByDriver(order, driverId) {
  if (order.pingedDriverId !== driverId) return false;
  order.pingedDriverId = null;
  pingNext(order);
  return true;
}

module.exports = { startDispatch, pingNext, declineByDriver, PING_TIMEOUT_MS };
