// ============================================================
// WAYI : recherche de livreur
// Des que le restaurant accepte la commande, on cherche un livreur
// PENDANT la preparation, pour qu'il arrive au restaurant au moment
// ou le plat est pret. Seuls les livreurs a moins de
// PLATFORM_CONFIG.driverMaxMinutes de trajet du restaurant sont proposes.
// La commande est proposee a un livreur a la fois (20 s pour repondre),
// puis au suivant. Sans livreur, on recommence toutes les 30 s.
// ============================================================
const { drivers, restaurants, PLATFORM_CONFIG, driversWithin } = require('../../data/store');

const PING_TIMEOUT_MS = 20000;   // 20 s pour accepter ou refuser
const RETRY_MS = 30000;          // nouvelle recherche si personne n'a ete trouve
const MAX_TRIES = 60;            // environ 30 minutes de recherche
const retryTimers = new Map();

// Temps de preparation annonce par le restaurant ("25-35" -> 30 min)
function prepMinutes(restaurant) {
  const nums = String(restaurant?.prepTime || '').match(/\d+/g)?.map(Number) || [];
  if (!nums.length) return 25;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const beninTime = (date) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', minute: '2-digit' }).format(date);

// Infos de timing pour un livreur donne
function timingFor(order, minutes) {
  const readyAt = order.readyAt ? new Date(order.readyAt) : new Date();
  const readyIn = Math.max(0, Math.round((readyAt - Date.now()) / 60000));
  const departIn = Math.max(0, readyIn - minutes);
  return {
    travelMinutes: minutes,
    readyInMinutes: readyIn,
    readyAtLabel: beninTime(readyAt),
    departInMinutes: departIn,
    departAtLabel: beninTime(new Date(Date.now() + departIn * 60000)),
  };
}

function buildPingPayload(order, minutes) {
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
    ...timingFor(order, minutes),
  };
}

/**
 * Classe les livreurs proches : celui dont l'arrivee tombe le plus pres du
 * moment ou le plat sera pret passe en premier. Arriver en retard compte
 * trois fois plus qu'arriver en avance (le plat ne doit pas refroidir).
 */
function rankCandidates(order, restaurant) {
  const readyIn = order.readyAt ? Math.max(0, (new Date(order.readyAt) - Date.now()) / 60000) : prepMinutes(restaurant);
  const declined = new Set(order.declinedBy || []);
  return driversWithin(restaurant.lat, restaurant.lng)
    .filter(x => !declined.has(x.driver.id))
    .map(x => ({ ...x, score: x.minutes > readyIn ? (x.minutes - readyIn) * 3 : (readyIn - x.minutes) }))
    .sort((a, b) => a.score - b.score || a.minutes - b.minutes)
    .map(x => ({ id: x.driver.id, minutes: x.minutes }));
}

/**
 * Demarre la recherche (appele quand le restaurant accepte la commande).
 */
function startDispatch(order, restaurant) {
  if (!restaurant) restaurant = restaurants.find(r => r.id === order.restaurantId);
  if (!restaurant || order.driver) return;
  if (!order.readyAt) order.readyAt = new Date(Date.now() + prepMinutes(restaurant) * 60000).toISOString();
  order.dispatchTries = (order.dispatchTries || 0) + 1;
  order.pingCandidates = rankCandidates(order, restaurant);
  order.pingedDriverId = null;
  order.pingExpiresAt = null;
  order.pingStatus = order.pingCandidates.length ? 'pinging' : 'unassigned';
  if (!order.pingCandidates.length) {
    notifyUnassigned(order);
    scheduleRetry(order);
    return;
  }
  pingNext(order);
}

function stillNeedsDriver(order) {
  return !order.driver && ['confirmed', 'preparing', 'ready'].includes(order.status);
}

function scheduleRetry(order) {
  clearTimeout(retryTimers.get(order.id));
  if (!stillNeedsDriver(order) || (order.dispatchTries || 0) >= MAX_TRIES) return;
  retryTimers.set(order.id, setTimeout(() => {
    retryTimers.delete(order.id);
    if (stillNeedsDriver(order)) startDispatch(order);
  }, RETRY_MS));
}

function pingNext(order) {
  const { emitToUser, emitOrderStatusChange } = require('../realtime');

  if (!stillNeedsDriver(order)) return;
  if (!order.pingCandidates?.length) {
    order.pingStatus = 'unassigned';
    order.pingedDriverId = null;
    notifyUnassigned(order);
    scheduleRetry(order);
    return;
  }

  const next = order.pingCandidates.shift();
  const driverId = typeof next === 'string' ? next : next.id;
  const minutes = typeof next === 'string' ? null : next.minutes;
  const driver = drivers.find(d => d.id === driverId);
  if (!driver || driver.status !== 'available' || driver.suspended) return pingNext(order);

  order.pingedDriverId = driverId;
  order.pingedTravelMinutes = minutes;
  order.pingStatus = 'pinging';
  order.pingExpiresAt = new Date(Date.now() + PING_TIMEOUT_MS).toISOString();

  const sent = emitToUser(driverId, 'order:ping', buildPingPayload(order, minutes || 0));
  try { require('../push').pingToDriver(driverId, order); } catch { /* facultatif */ }
  emitOrderStatusChange(order.id, order.status, { pingStatus: 'pinging', pingedDriver: driver.name });

  setTimeout(() => {
    if (order.driver) return;
    if (order.pingedDriverId === driverId && order.pingStatus === 'pinging') {
      order.declinedBy = [...new Set([...(order.declinedBy || []), driverId])]; // ne pas le relancer tout de suite
      pingNext(order);
    }
  }, PING_TIMEOUT_MS);

  return sent;
}

function notifyUnassigned(order) {
  const { emitOrderStatusChange } = require('../realtime');
  emitOrderStatusChange(order.id, order.status, {
    pingStatus: 'unassigned',
    message: "Recherche d'un livreur proche en cours…",
  });
}

/**
 * Un livreur refuse : on passe tout de suite au suivant.
 */
function declineByDriver(order, driverId) {
  if (order.pingedDriverId !== driverId) return false;
  order.pingedDriverId = null;
  order.declinedBy = [...new Set([...(order.declinedBy || []), driverId])];
  pingNext(order);
  return true;
}

/**
 * Apres un redemarrage du serveur : relance la recherche pour les commandes
 * acceptees qui n'ont toujours pas de livreur.
 */
function resumeDispatches(orders) {
  let n = 0;
  for (const o of orders) {
    if (stillNeedsDriver(o) && o.status !== 'confirmed' && (o.dispatchTries || 0) < MAX_TRIES) {
      o.pingStatus = 'unassigned';
      o.pingedDriverId = null;
      setTimeout(() => startDispatch(o), 5000 + n * 500);
      n++;
    }
  }
  return n;
}

module.exports = { startDispatch, pingNext, declineByDriver, resumeDispatches, timingFor, prepMinutes, PING_TIMEOUT_MS };
