// ============================================================
// WAYI — Data Store
// Menu du jour multi-restaurants : Petit-déj · Déjeuner · Dîner
// Chaque plat appartient à UN restaurant partenaire labellisé
// ============================================================
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { getPool, loadAppState, saveAppState } = require('../services/database/postgres');

// Mot de passe démo commun, haché au démarrage (jamais stocké en clair)
const DEMO_PASSWORD_HASH = bcrypt.hashSync('wayi2026', 10);

const PLATFORM_CONFIG = {
  commissionRate: 0.15,
  // Livraison au kilometre : distance restaurant -> client x prix du km.
  // Moins d'un km compte pour un km. Montant arrondi aux 5 FCFA superieurs.
  deliveryBasePrice: 0,
  deliveryPerKm: 75,
  deliveryMinKm: 1,
  // Au-dela, l'adresse est hors zone : on refuse au lieu de facturer des frais absurdes
  maxDeliveryKm: 20,
  driverShare: 0.80,
  // Recherche de livreur : uniquement ceux a moins de X minutes du restaurant,
  // en visant une arrivee au moment ou le plat est pret.
  driverMaxMinutes: Number(process.env.DRIVER_MAX_MINUTES) || 25,
  driverSpeedKmh: 22,      // vitesse moyenne d'une moto en ville
  roadFactor: 1.35,        // la route est plus longue que la ligne droite
  // Formules du contrat de partenariat restaurant (article 4)
  subscriptionPlans: {
    ahovi:  { price: 5000,  label: 'Ahovi',  maxDishes: 5,  priority: 1, priorityLabel: 'standard',      durationMonths: 6, badge: null },
    ahossi: { price: 10750, label: 'Ahossi', maxDishes: 15, priority: 2, priorityLabel: 'intermédiaire', durationMonths: 3, badge: 'star' },
    aholou: { price: 20000, label: 'Aholou', maxDishes: 20, priority: 3, priorityLabel: 'maximale',      durationMonths: 3, badge: 'flame' },
  },
  // Abonnements clients : livraison gratuite pendant la durée de l'abonnement.
  clientSubscriptionPlans: {
    weekly:  { price: 1500, label: 'Hebdomadaire', durationDays: 7,  benefit: 'Livraison gratuite pendant 7 jours' },
    monthly: { price: 5000, label: 'Mensuel',      durationDays: 30, benefit: 'Livraison gratuite pendant 30 jours' },
  },
};

// ─── PÉRIODES DE REPAS ─────────────────────────────────────────
const PERIODS = [
  { id: 'petit_dejeuner', label: 'Petit-déjeuner', icon: 'sunrise', hours: '6h - 10h' },
  { id: 'dejeuner',       label: 'Déjeuner',        icon: 'sun', hours: '12h - 15h' },
  { id: 'gouter',         label: 'Goûter',          icon: 'cookie', hours: '15h - 18h' },
  { id: 'diner',          label: 'Dîner',           icon: 'moon', hours: '19h - 22h' },
];

// ─── CATÉGORIES ─────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'plats_locaux', label: 'Plats locaux', icon: 'soup' },
  { id: 'healthy',      label: 'Healthy',       icon: 'salad' },
  { id: 'burgers',      label: 'Fast-food',       icon: 'sandwich' },
  { id: 'grillades',    label: 'Grillades',     icon: 'flame' },
  { id: 'boissons',     label: 'Boissons',      icon: 'cup-soda' },
];

// Heure du Benin (UTC+1), quel que soit le fuseau du serveur (le VPS est souvent en UTC)
function beninHour() {
  const h = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', hour12: false }).format(new Date());
  return parseInt(h, 10) % 24;
}

function currentPeriod() {
  const h = beninHour();
  if (h < 11) return 'petit_dejeuner';
  if (h < 15) return 'dejeuner';
  if (h < 18) return 'gouter';
  return 'diner';
}

// ─── RESTAURANTS PARTENAIRES (labellisés) ─────────────────────
// Plateforme prête pour de vrais tests : plus de restaurants fictifs — chaque
// restaurant est désormais ajouté via la création de compte (voir POST
// /api/admin/merchants), qui crée à la fois le restaurant et son compte de connexion.
const restaurants = [];

// ─── GOÛTS (étiquette affichée sur la photo du plat) ───────────
const TASTES = [
  { id: 'sale',   label: 'Salé' },
  { id: 'sucre',  label: 'Sucré' },
  { id: 'epice',  label: 'Épicé' },
  { id: 'umami',  label: 'Umami' },
  { id: 'frais',  label: 'Frais' },
  { id: 'doux',   label: 'Doux' },
];

// ─── PLATS (menu du jour, organisé par période + catégorie) ────
// image : URL fournie par le restaurant/l'admin (null = repli sur l'icône)
const dishes = [];

// ─── LABELS WAYI (petit label affiché sur chaque plat) ────────
const DISH_LABELS = [
  { id: 'terroir',  label: 'Terroir' },
  { id: 'braise',   label: 'Braise' },
  { id: 'ocean',    label: 'Océan' },
  { id: 'fraicheur', label: 'Fraîcheur' },
  { id: 'gourmand', label: 'Gourmand' },
];

// Le menu de démonstration n'est semé qu'une seule fois (drapeau persisté),
// pour ne pas réapparaître si l'équipe supprime les restaurants de démo.
let demoSeeded = false;
// Restaurants partenaires deja inseres une fois (ne reviennent pas s'ils sont supprimes depuis l'admin)
const partnersSeeded = [];
// Nettoyages ponctuels deja appliques (chacun ne s'execute qu'une fois)
const cleanupsDone = [];

function enrichDish(dish) {
  const r = restaurants.find(x => x.id === dish.restaurantId);
  return {
    ...dish,
    restaurant: r ? { id: r.id, name: r.name, icon: r.icon, logo: r.logo, logoOverlay: r.logoOverlay || null, tagline: r.tagline, rating: r.rating, verified: r.verified, demo: !!r.demo, prepTime: r.prepTime } : null,
  };
}

// ─── ROTATION HEBDOMADAIRE ─────────────────────────────────────
// Un restaurant avec r.weeklyDishes = N ne montre que N plats par semaine :
// la semaine change chaque lundi a 00:00 (heure du Benin) et on passe aux N
// plats suivants de sa carte, en boucle.
const WEEK_MS = 7 * 24 * 3600 * 1000;
const ROTATION_REF = Date.UTC(2026, 10, 22, 23, 0, 0); // lundi 23/11/2026 00:00 heure du Benin
function weekIndex(at = Date.now()) { return Math.floor((at - ROTATION_REF) / WEEK_MS); }
function weekBounds(idx = weekIndex()) {
  const start = new Date(ROTATION_REF + idx * WEEK_MS);
  return { start: start.toISOString(), end: new Date(start.getTime() + WEEK_MS).toISOString() };
}
function rotationFor(restaurant, idx = weekIndex()) {
  const all = dishes.filter(d => d.restaurantId === restaurant.id && d.available !== false);
  // Ordre de passage choisi pour le restaurant (sinon l'ordre d'ajout des plats)
  const order = restaurant.rotationOrder || [];
  if (order.length) {
    const pos = (d) => { const i = order.indexOf(d.id); return i < 0 ? order.length : i; };
    all.sort((a, b) => pos(a) - pos(b));
  }
  const n = Number(restaurant.weeklyDishes) || 0;
  if (!n || all.length <= n) return new Set(all.map(d => d.id));
  const start = ((idx * n) % all.length + all.length) % all.length;
  const ids = new Set();
  for (let k = 0; k < n; k++) ids.add(all[(start + k) % all.length].id);
  return ids;
}
// Plat visible par les clients cette semaine ?
function isDishOnline(dish, at = Date.now()) {
  const r = restaurants.find(x => x.id === dish.restaurantId);
  if (!r || !r.weeklyDishes) return true;
  return rotationFor(r, weekIndex(at)).has(dish.id);
}

function getMenu({ period, category, search } = {}) {
  let result = dishes.filter(d => isDishOnline(d));
  if (period) result = result.filter(d => d.period === period);
  if (category) result = result.filter(d => d.category === category);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(d =>
      d.name.toLowerCase().includes(q) ||
      restaurants.find(r => r.id === d.restaurantId)?.name.toLowerCase().includes(q)
    );
  }

  // Signaux de popularité : nombre de fois commandé et nombre de mises en favori,
  // calculés une seule fois sur l'ensemble des commandes/utilisateurs (pas seulement
  // les plats filtrés ci-dessus), pour que le classement reste cohérent quel que soit
  // le filtre actif à l'écran.
  const orderCounts = {};
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    for (const item of o.items || []) orderCounts[item.dishId] = (orderCounts[item.dishId] || 0) + (item.qty || 1);
  }
  const favoriteCounts = {};
  for (const u of users) for (const id of u.favoriteDishes || []) favoriteCounts[id] = (favoriteCounts[id] || 0) + 1;

  const TOP_N = 5;
  const popularIds = new Set(
    Object.entries(orderCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
  );
  const lovedIds = new Set(
    Object.entries(favoriteCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id)
  );

  return result.map(d => ({ ...enrichDish(d), isPopular: popularIds.has(d.id), isLoved: lovedIds.has(d.id) }));
}

function getDishById(id) { return dishes.find(d => d.id === id); }
function getRestaurantById(id) { return restaurants.find(r => r.id === id); }
function getDishesByRestaurant(id) { return dishes.filter(d => d.restaurantId === id).map(enrichDish); }

// ─── USERS (clients) ────────────────────────────────────────────
// Plus de compte client de demonstration : chaque client s'inscrit dans l'appli.
const users = [];

// ─── DRIVERS ──────────────────────────────────────────────────
// Plus de livreur de demonstration : les livreurs s'inscrivent et sont valides par l'admin.
const drivers = [];

// ─── SUPER ADMIN (gère le menu du jour, les restaurants, le backoffice) ──
const admins = [
  {
    id: 'ad1', role: 'admin', name: 'Super Admin WAYI',
    phone: '+229 90 00 00 00', email: 'admin@wayi.bj', password: DEMO_PASSWORD_HASH,
  },
];

// ─── MERCHANTS (restaurateurs partenaires) ─────────────────────
// Plateforme prête pour de vrais tests : plus de compte restaurant fictif —
// chaque restaurant crée son compte via POST /api/admin/merchants.
const merchants = [];

// ─── REVIEWS ──────────────────────────────────────────────────
const reviews = [];

// Journal des appels du module Telemarketing (un enregistrement par appel passé par l'équipe WAYI).
const callLogs = [];

// ─── ORDERS ───────────────────────────────────────────────────
const orders = [];
const receipts = []; // { receiptId, orderId, ... } généré automatiquement au paiement/livraison

function generateReceipt(order) {
  const existing = receipts.find(r => r.orderId === order.id);
  if (existing) return existing;

  const commission = Math.round(order.subtotal * PLATFORM_CONFIG.commissionRate);
  const restaurantPayout = order.subtotal - commission;
  const driverPayout = Math.round((order.deliveryFee || 0) * PLATFORM_CONFIG.driverShare);

  const receipt = {
    receiptId: `REC-${order.id}`,
    orderId: order.id,
    restaurantId: order.restaurantId,
    restaurantName: order.restaurantName,
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    commission,
    restaurantPayout,
    driverPayout,
    paymentMethod: order.paymentMethod,
    paymentTransactionId: order.paymentTransactionId || null,
    driverName: order.driver?.name || null,
    issuedAt: new Date().toISOString(),
  };
  receipts.push(receipt);
  return receipt;
}
function getReceiptByOrderId(orderId) { return receipts.find(r => r.orderId === orderId); }

const STATUS_LABELS = { confirmed: 'Commande confirmée', preparing: 'En préparation', on_the_way: 'Livreur en route', delivered: 'Livré !', cancelled: 'Commande annulée' };
function setOrderStatus(orderId, status) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return null;
  order.status = status;
  order.statusHistory.push({ status, label: STATUS_LABELS[status] || status, time: new Date().toISOString() });
  if (status === 'delivered') order.deliveredAt = new Date().toISOString();
  return order;
}

// ─── Temps de livraison & benchmark des livreurs ────────────────
// Seuils utilisés pour repérer un livreur sous-performant, appliqués
// uniquement s'il a un minimum de courses (sinon pas assez de signal).
const PERFORMANCE_BENCHMARKS = {
  minDeliveriesForBenchmark: 3,
  maxAvgDeliveryTimeRatio: 1.25, // 25% plus lent que la moyenne globale = alerte
  minRating: 4.3,
  minCompletionRate: 90,
};

function deliveryMinutes(order) {
  if (!order.deliveredAt || !order.createdAt) return null;
  return (new Date(order.deliveredAt) - new Date(order.createdAt)) / 60000;
}

function getGlobalAvgDeliveryMinutes() {
  const times = orders.filter(o => o.status === 'delivered').map(deliveryMinutes).filter(t => t !== null);
  if (!times.length) return null;
  return times.reduce((s, t) => s + t, 0) / times.length;
}

function getDriverPerformance() {
  const globalAvg = getGlobalAvgDeliveryMinutes();

  return drivers.map(d => {
    const deliveredOrders = orders.filter(o => o.driver?.id === d.id && o.status === 'delivered');
    const times = deliveredOrders.map(deliveryMinutes).filter(t => t !== null);
    const avgDeliveryMinutes = times.length ? times.reduce((s, t) => s + t, 0) / times.length : null;
    const hasEnoughData = deliveredOrders.length >= PERFORMANCE_BENCHMARKS.minDeliveriesForBenchmark;

    const flags = [];
    if (hasEnoughData && globalAvg && avgDeliveryMinutes > globalAvg * PERFORMANCE_BENCHMARKS.maxAvgDeliveryTimeRatio) {
      flags.push('livraisons lentes');
    }
    if (d.stats.rating < PERFORMANCE_BENCHMARKS.minRating) flags.push('note faible');
    if (d.stats.completionRate < PERFORMANCE_BENCHMARKS.minCompletionRate) flags.push('taux de complétion faible');

    return {
      id: d.id, name: d.name, avatar: d.avatar, vehicle: d.vehicle, status: d.status, suspended: !!d.suspended, pendingApproval: !!d.pendingApproval, phone: d.phone, zone: d.zone,
      rating: d.stats.rating, completionRate: d.stats.completionRate, totalDeliveries: d.stats.totalDeliveries,
      deliveriesInPeriod: deliveredOrders.length,
      avgDeliveryMinutes: avgDeliveryMinutes !== null ? Math.round(avgDeliveryMinutes) : null,
      hasEnoughData,
      underperforming: flags.length > 0,
      flags,
    };
  });
}

// Met à jour une moyenne pondérée (restaurant ou livreur) avec une nouvelle note
function addRating(entity, newRating) {
  if (!entity) return;
  const count = entity.ratingCount || 0;
  const currentAvg = entity.rating || 0;
  const total = currentAvg * count + newRating;
  entity.ratingCount = count + 1;
  entity.rating = Math.round((total / entity.ratingCount) * 10) / 10;
}

function getUserById(id) { return users.find(u => u.id === id); }

// ─── Vérification e-mail à l'inscription (code OTP) ────────────
// Stocké en mémoire, avec expiration courte — pas un compte tant que non vérifié
const pendingRegistrations = new Map(); // email → { code, data, expiresAt, attempts }

function createPendingRegistration(email, data) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingRegistrations.set(email, { code, data, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
  return code;
}
function getPendingRegistration(email) { return pendingRegistrations.get(email); }
function deletePendingRegistration(email) { pendingRegistrations.delete(email); }
function getOrdersByUser(userId) { return orders.filter(o => o.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function addOrder(order) { orders.push(order); return order; }
function updateOrder(id, patch) {
  const o = orders.find(x => x.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  return o;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function calcDistance(lat1, lng1, lat2, lng2) { return haversine(lat1, lng1, lat2, lng2); }
function calcDeliveryFee(distKm) {
  const km = Math.max(Number(distKm) || 0, PLATFORM_CONFIG.deliveryMinKm || 0);
  const raw = (PLATFORM_CONFIG.deliveryBasePrice || 0) + km * PLATFORM_CONFIG.deliveryPerKm;
  return Math.ceil(raw / 5) * 5;
}
// Distance la plus grande entre le point de livraison et les restaurants de la commande
function outOfZone(distKm) { return Number.isFinite(distKm) && distKm > PLATFORM_CONFIG.maxDeliveryKm; }
function outOfZoneMessage(distKm) {
  return `Ce point de livraison est à ${Math.round(distKm)} km du restaurant. WAYI livre pour l'instant Cotonou, Calavi et leurs environs (${PLATFORM_CONFIG.maxDeliveryKm} km maximum). Touche la carte à l'endroit où tu veux être livré au Bénin.`;
}
function findNearestDriver(lat, lng) {
  const available = drivers.filter(d => d.status === 'available' && !d.suspended);
  if (!available.length) return drivers[0];
  return available.reduce((closest, d) => {
    const dist = calcDistance(lat, lng, d.location.lat, d.location.lng);
    return !closest || dist < closest.dist ? { d, dist } : closest;
  }, null)?.d || available[0];
}
// Temps de trajet estime (minutes) pour une distance a vol d'oiseau en km
function travelMinutes(km) {
  return Math.max(1, Math.ceil((km * PLATFORM_CONFIG.roadFactor) / PLATFORM_CONFIG.driverSpeedKmh * 60));
}
// Livreurs disponibles a moins de maxMinutes du point, avec leur temps de trajet
function driversWithin(lat, lng, maxMinutes = PLATFORM_CONFIG.driverMaxMinutes) {
  return drivers
    .filter(d => d.status === 'available' && !d.suspended && !d.pendingApproval && d.location && d.location.lat != null)
    .map(d => { const km = calcDistance(lat, lng, d.location.lat, d.location.lng); return { driver: d, km, minutes: travelMinutes(km) }; })
    .filter(x => x.minutes <= maxMinutes);
}
function findNearbyDrivers(lat, lng, { limit = 5, maxKm = 8 } = {}) {
  return drivers
    .filter(d => d.status === 'available' && !d.suspended)
    .map(d => ({ driver: d, dist: calcDistance(lat, lng, d.location.lat, d.location.lng) }))
    .filter(x => x.dist <= maxKm)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map(x => x.driver);
}
function enrichUserProfile(userId, data) {
  const u = getUserById(userId);
  if (!u) return null;
  u.clientProfile = { ...(u.clientProfile || {}), ...data };
  return u.clientProfile;
}

// ─── Gestion Backoffice (Super Admin) ──────────────────────────
function addRestaurant(data) {
  const restaurant = {
    id: uuidv4(),
    name: data.name,
    icon: data.icon || 'utensils',
    logo: data.logo || null,
    tagline: data.tagline || '',
    rating: data.rating ?? 4.5,
    verified: data.verified ?? true,
    priorityScore: data.priorityScore ?? 50,
    zone: data.zone || '',
    lat: data.lat,
    lng: data.lng,
    prepTime: data.prepTime || '20-30',
    momoMtn: data.momoMtn || null,   // numéro MTN MoMo sur lequel le restaurant encaisse
    momoMoov: data.momoMoov || null, // numéro Moov Money sur lequel le restaurant encaisse
  };
  restaurants.push(restaurant);
  return restaurant;
}
function updateRestaurant(id, patch) {
  const r = getRestaurantById(id);
  if (!r) return null;
  Object.assign(r, patch);
  return r;
}
function deleteRestaurant(id) {
  const idx = restaurants.findIndex(r => r.id === id);
  if (idx === -1) return false;
  restaurants.splice(idx, 1);
  // Retire aussi les plats de ce restaurant du menu du jour
  for (let i = dishes.length - 1; i >= 0; i--) {
    if (dishes[i].restaurantId === id) dishes.splice(i, 1);
  }
  return true;
}
function addDish(data) {
  const dish = {
    id: uuidv4(),
    restaurantId: data.restaurantId,
    period: data.period,
    category: data.category,
    name: data.name,
    icon: data.icon || 'utensils',
    image: data.image || null,
    taste: data.taste || null,
    label: data.label || null,
    price: data.price,
    desc: data.desc || '',
    // Formulation du produit (CAB) : une ligne par élément, saisie par le restaurant
    characteristics: data.characteristics || '',
    advantages: data.advantages || '',
    benefits: data.benefits || '',
  };
  dishes.push(dish);
  return dish;
}
function updateDish(id, patch) {
  const d = getDishById(id);
  if (!d) return null;
  Object.assign(d, patch);
  return d;
}
function deleteDish(id) {
  const idx = dishes.findIndex(d => d.id === id);
  if (idx === -1) return false;
  dishes.splice(idx, 1);
  return true;
}

// ─── Persistance PostgreSQL (sauvegarde/restauration de l'état complet) ──
// Voir services/database/supabase.js pour le détail de l'approche et ses limites.

function snapshotState() {
  return { mode: require('./mode').mode, users, drivers, merchants, admins, restaurants, dishes, reviews, orders, receipts, callLogs, demoSeeded, partnersSeeded, cleanupsDone };
}

// Remplace le CONTENU des tableaux existants (sans changer leur référence,
// puisque toutes les routes les ont déjà importés par destructuring).
function replaceContents(arr, data) {
  if (!Array.isArray(data)) return;
  arr.length = 0;
  arr.push(...data);
}

function restoreState(saved) {
  if (!saved) return;
  replaceContents(users, saved.users);
  replaceContents(drivers, saved.drivers);
  replaceContents(merchants, saved.merchants);
  replaceContents(admins, saved.admins);
  replaceContents(restaurants, saved.restaurants);
  replaceContents(dishes, saved.dishes);
  replaceContents(reviews, saved.reviews);
  replaceContents(orders, saved.orders);
  replaceContents(receipts, saved.receipts);
  replaceContents(callLogs, saved.callLogs); // absent des anciennes sauvegardes : sans effet dans ce cas
  require('./mode').restoreMode(saved.mode); // absent des anciennes sauvegardes : sans effet
  if (saved.demoSeeded) demoSeeded = true;
  replaceContents(partnersSeeded, saved.partnersSeeded || []);
  purgeDemoAccounts();
  replaceContents(cleanupsDone, saved.cleanupsDone || []);
  if (process.env.DEMO_MENU !== '1') purgeDemoRestaurants();
  keepOnlyGuedaliaOnce();
  removeGuedaliaOnce();
  removeGuedaliaHistoryOnce();
}

// Nettoyage demande le 25/11/2026 : retirer tous les restaurants et plats
// existants et ne garder que Guedalia. S'execute une seule fois : les
// restaurants ajoutes ensuite ne sont jamais touches. Historique des commandes conserve.
function keepOnlyGuedaliaOnce() {
  const KEY = 'garder-uniquement-guedalia-2026-11-25';
  if (cleanupsDone.includes(KEY)) return;
  const keep = new Set(['resto-guedalia']);
  const gone = new Set(restaurants.filter(r => !keep.has(r.id)).map(r => r.id));
  for (let i = restaurants.length - 1; i >= 0; i--) if (gone.has(restaurants[i].id)) restaurants.splice(i, 1);
  let n = 0;
  for (let i = dishes.length - 1; i >= 0; i--) if (!keep.has(dishes[i].restaurantId)) { dishes.splice(i, 1); n++; }
  let m = 0;
  for (let i = merchants.length - 1; i >= 0; i--) if (gone.has(merchants[i].restaurantId)) { merchants.splice(i, 1); m++; }
  cleanupsDone.push(KEY);
  console.log(`[Store] Nettoyage : ${gone.size} restaurant(s), ${n} plat(s) et ${m} compte(s) restaurant retires. Seul Guedalia reste.`);
}

// Suppression demandee le 27/11/2026 : retirer Guedalia (restaurant, plats, compte).
// S'execute une seule fois. Historique des commandes et avis conserve.
function removeGuedaliaOnce() {
  const KEY = 'supprimer-guedalia-2026-11-27';
  if (cleanupsDone.includes(KEY)) return;
  const id = 'resto-guedalia';
  const r = restaurants.findIndex(x => x.id === id);
  if (r !== -1) restaurants.splice(r, 1);
  let n = 0;
  for (let i = dishes.length - 1; i >= 0; i--) if (dishes[i].restaurantId === id) { dishes.splice(i, 1); n++; }
  let m = 0;
  for (let i = merchants.length - 1; i >= 0; i--) if (merchants[i].restaurantId === id) { merchants.splice(i, 1); m++; }
  cleanupsDone.push(KEY);
  console.log(`[Store] Guedalia supprime : restaurant ${r !== -1 ? 'retire' : 'absent'}, ${n} plat(s), ${m} compte(s).`);
}

// Suppression demandee le 27/11/2026 : effacer aussi l'historique de Guedalia
// (commandes, recus, avis, appels du telemarketing). S'execute une seule fois.
function removeGuedaliaHistoryOnce() {
  const KEY = 'supprimer-historique-guedalia-2026-11-27';
  if (cleanupsDone.includes(KEY)) return;
  const id = 'resto-guedalia';
  const gone = new Set(orders.filter(o => o.restaurantId === id).map(o => o.id));
  const drop = (arr, test) => { let n = 0; for (let i = arr.length - 1; i >= 0; i--) if (test(arr[i])) { arr.splice(i, 1); n++; } return n; };
  const o = drop(orders, x => gone.has(x.id));
  const r = drop(receipts, x => gone.has(x.orderId));
  const v = drop(reviews, x => x.restaurantId === id || gone.has(x.orderId));
  const c = drop(callLogs, x => x.targetId === id || x.targetId === 'merchant-guedalia');
  cleanupsDone.push(KEY);
  console.log(`[Store] Historique Guedalia efface : ${o} commande(s), ${r} recu(s), ${v} avis, ${c} appel(s).`);
}

// Restaurants et plats fictifs (menu de demonstration) : retires des donnees au demarrage.
// Les commandes passees restent dans l'historique.
function purgeDemoRestaurants() {
  const isDemo = (r) => r && (r.demo === true || String(r.id || '').startsWith('demo-resto-'));
  const gone = new Set(restaurants.filter(isDemo).map(r => r.id));
  if (!gone.size && !dishes.some(d => d.demo === true)) return 0;
  for (let i = restaurants.length - 1; i >= 0; i--) if (gone.has(restaurants[i].id)) restaurants.splice(i, 1);
  let n = 0;
  for (let i = dishes.length - 1; i >= 0; i--) {
    if (dishes[i].demo === true || gone.has(dishes[i].restaurantId)) { dishes.splice(i, 1); n++; }
  }
  for (let i = merchants.length - 1; i >= 0; i--) if (gone.has(merchants[i].restaurantId)) merchants.splice(i, 1);
  console.log(`[Store] ${gone.size} restaurant(s) fictif(s) et ${n} plat(s) de demonstration supprime(s).`);
  return gone.size;
}

// Comptes de demonstration d'origine (Adele, Kokou, Chantal) : retires des
// donnees sauvegardees au demarrage, ils ne doivent plus exister en ligne.
const DEMO_ACCOUNTS = [
  ['users', 'u1', 'adele@gmail.com'],
  ['drivers', 'dr1', 'kokou@wayi.bj'],
  ['drivers', 'dr2', 'chantal@wayi.bj'],
];
function purgeDemoAccounts() {
  const lists = { users, drivers };
  let removed = 0;
  for (const [kind, id, email] of DEMO_ACCOUNTS) {
    const list = lists[kind];
    const i = list.findIndex(a => a.id === id && String(a.email || '').toLowerCase() === email);
    if (i < 0) continue;
    list.splice(i, 1);
    removed++;
    for (const o of orders) {
      if (kind === 'users' && o.userId === id) { o.userId = 'supprime'; o.address = 'Adresse supprimee'; }
      if (kind === 'drivers' && o.driver?.id === id) o.driver = { id: 'supprime', name: 'Livreur (compte supprime)' };
    }
  }
  if (removed) console.log(`[Store] ${removed} compte(s) de demonstration supprime(s).`);
  return removed;
}

// Appelée une fois au démarrage du serveur, avant d'accepter des requêtes.
// Sauvegarde sur fichier (data/sauvegarde/*.json, la plus récente) : utilisée
// uniquement quand aucune base PostgreSQL n'est configurée (lancement en local).
function latestBackupFile() {
  const fs = require('fs');
  const path = require('path');
  if (process.env.DATA_FILE) return fs.existsSync(process.env.DATA_FILE) ? process.env.DATA_FILE : null;
  const dir = path.join(__dirname, 'sauvegarde');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function hydrateFromBackupFile() {
  const file = latestBackupFile();
  if (!file) return false;
  try {
    const saved = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    if (!saved || typeof saved !== 'object') return false;
    restoreState(saved);
    console.log(`[Store] Données chargées depuis la sauvegarde ${require('path').basename(file)} (${users.length} client(s), ${restaurants.length} restaurant(s), ${dishes.length} plat(s), ${orders.length} commande(s)).`);
    return true;
  } catch (e) {
    console.warn('[Store] Sauvegarde illisible, ignorée :', e.message);
    return false;
  }
}

async function hydrateFromDatabase() {
  if (!getPool()) { hydrateFromBackupFile(); return; } // Pas de base : on reprend la sauvegarde si elle existe
  const saved = await loadAppState();
  if (saved) {
    restoreState(saved);
    console.log(`[Store] État restauré depuis PostgreSQL (${orders.length} commande(s), ${users.length} utilisateur(s), ${restaurants.length} restaurant(s)).`);
  } else {
    console.log('[Store] Aucun état sauvegardé en base pour le moment — démarrage avec les données de démo (elles seront sauvegardées automatiquement).');
  }
}

// Remplace les mots de passe de démonstration par ceux définis dans l'environnement du serveur (.env).
// Appelée à CHAQUE démarrage, APRÈS la restauration de l'état sauvegardé (qui contient l'ancien hash).
//   ADMIN_PASSWORD : mot de passe du compte administrateur (10 caractères minimum)
//   ADMIN_EMAIL    : (facultatif) e-mail de connexion de l'administrateur
//   DEMO_PASSWORD  : (facultatif) mot de passe des comptes de démo client et livreurs
function applySecurityOverrides() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD } = process.env;
  const admin = admins[0];

  if (admin && ADMIN_EMAIL && ADMIN_EMAIL.trim()) admin.email = ADMIN_EMAIL.trim();
  if (admin && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 10) console.warn('[SECURITY] ADMIN_PASSWORD fait moins de 10 caractères : ignoré.');
    else admin.password = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  }

  if (DEMO_PASSWORD) {
    if (DEMO_PASSWORD.length < 10) console.warn('[SECURITY] DEMO_PASSWORD fait moins de 10 caractères : ignoré.');
    else {
      const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
      for (const acc of [...users, ...drivers]) if (['u1', 'd1', 'd2'].includes(acc.id)) acc.password = hash;
    }
  }

  // En production, on prévient bruyamment si le compte admin garde le mot de passe de démo.
  if (process.env.NODE_ENV === 'production' && admin && bcrypt.compareSync('wayi2026', admin.password)) {
    console.warn('[SECURITY] Le compte administrateur utilise encore le mot de passe de démo, connu de tous. Définissez ADMIN_PASSWORD dans le .env du serveur.');
  }
}

// Appelée périodiquement + à l'arrêt du serveur (voir server.js). Un verrou simple
// évite deux sauvegardes qui se chevaucheraient si l'une prend plus de temps que prévu.
let saveInFlight = false;
async function persistToDatabase() {
  if (!getPool() || saveInFlight) return false;
  saveInFlight = true;
  try {
    return await saveAppState(snapshotState());
  } finally {
    saveInFlight = false;
  }
}

// ─── MENU DE DÉMONSTRATION (Cotonou) ──────────────────────────
// Semé une seule fois, uniquement sur une plateforme encore vide (aucun
// restaurant, partenaire ni commande). Désactivable avec NO_DEMO_MENU=1.
// Vrais restaurants partenaires (data/partenaires) : inseres une seule fois, avec leurs plats.
function seedPartners() {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, 'partenaires');
  if (!fs.existsSync(dir)) return 0;
  let added = 0;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const { RESTAURANT, DISHES, ACCOUNT } = require(path.join(dir, f));
    // Restaurants retires de la plateforme : jamais remis (l'ancien fichier peut rester sur le serveur)
    if (['resto-guedalia'].includes(RESTAURANT.id)) continue;
    const known = restaurants.find(r => r.id === RESTAURANT.id);
    // Compte de l'espace restaurant, cree une seule fois
    const accKey = `compte:${RESTAURANT.id}`;
    if (ACCOUNT && !partnersSeeded.includes(accKey) && !merchants.some(m => m.restaurantId === RESTAURANT.id || m.email === ACCOUNT.email)) {
      merchants.push({
        id: ACCOUNT.id, role: 'merchant', restaurantId: RESTAURANT.id, name: ACCOUNT.name, email: ACCOUNT.email,
        phone: null, password: ACCOUNT.passwordHash,
        subscription: { plan: 'free', monthlyFee: 0, active: true },
        stats: { monthlyOrders: 0, monthlyRevenue: 0, totalOrders: 0, totalRevenue: 0 },
        createdAt: new Date().toISOString(),
      });
      partnersSeeded.push(accKey);
      console.log(`[Store] Compte restaurant cree : ${ACCOUNT.email}`);
    }
    if (known && (RESTAURANT.oldTaglines || []).includes(known.tagline)) known.tagline = RESTAURANT.tagline;
    if (known && RESTAURANT.weeklyDishes && known.weeklyDishes === undefined) known.weeklyDishes = RESTAURANT.weeklyDishes;
    if (known && RESTAURANT.logoOverlay && !known.logoOverlay) known.logoOverlay = RESTAURANT.logoOverlay;
    if (known && RESTAURANT.rotationOrder && known.rotationOrder === undefined) known.rotationOrder = RESTAURANT.rotationOrder;
    if (known && (RESTAURANT.oldPositions || []).some(([a, b]) => known.lat === a && known.lng === b)) {
      known.lat = RESTAURANT.lat; known.lng = RESTAURANT.lng; known.zone = RESTAURANT.zone;
    }
    // Plats ajoutes apres coup (nouvelle version de la carte) : inseres une seule fois
    for (let v = 2; v <= (RESTAURANT.menuVersion || 1); v++) {
      const key = `${RESTAURANT.id}:plats-v${v}`;
      if (!known || partnersSeeded.includes(key)) continue;
      for (const d of DISHES.filter(x => x.since === v)) {
        if (!dishes.find(x => x.id === d.id)) { dishes.push({ icon: 'utensils', characteristics: '', advantages: '', benefits: '', ...d, since: undefined }); added++; }
      }
      partnersSeeded.push(key);
      console.log(`[Store] ${RESTAURANT.name} : plats de la version ${v} ajoutes`);
    }
    // Formule du contrat appliquee une seule fois au compte du restaurant
    const planKey = `${RESTAURANT.id}:formule-${RESTAURANT.plan}`;
    const plan = RESTAURANT.plan && PLATFORM_CONFIG.subscriptionPlans[RESTAURANT.plan];
    if (plan && !partnersSeeded.includes(planKey)) {
      const m = merchants.find(x => x.restaurantId === RESTAURANT.id);
      if (m) {
        m.subscription = { plan: RESTAURANT.plan, monthlyFee: plan.price, active: true, since: new Date().toISOString() };
        if (known) known.priorityScore = 50 + plan.priority * 10;
        partnersSeeded.push(planKey);
        console.log(`[Store] ${RESTAURANT.name} : formule ${plan.label} appliquee`);
      }
    }
    // Retrait unique des photos des plats (le restaurant enverra ses vraies photos)
    const photoKey = RESTAURANT.photosRemoved && `${RESTAURANT.id}:${RESTAURANT.photosRemoved}`;
    if (photoKey && !partnersSeeded.includes(photoKey)) {
      let n = 0;
      for (const d of dishes) if (d.restaurantId === RESTAURANT.id && d.image) { d.image = null; n++; }
      partnersSeeded.push(photoKey);
      console.log(`[Store] ${RESTAURANT.name} : ${n} photo(s) de plats retiree(s)`);
    }
    if (partnersSeeded.includes(RESTAURANT.id)) continue;
    if (!restaurants.find(r => r.id === RESTAURANT.id)) {
      restaurants.push({ icon: 'utensils', rating: null, verified: true, priorityScore: 60, momoMtn: null, momoMoov: null,
        createdAt: new Date().toISOString(), ...RESTAURANT, oldTaglines: undefined, oldPositions: undefined, plan: undefined, menuVersion: undefined, weeklyDishes: RESTAURANT.weeklyDishes, rotationOrder: RESTAURANT.rotationOrder });
    }
    for (const d of DISHES) {
      if (dishes.find(x => x.id === d.id)) continue;
      dishes.push({ icon: 'utensils', characteristics: '', advantages: '', benefits: '', ...d, since: undefined });
      added++;
    }
    partnersSeeded.push(RESTAURANT.id);
    console.log(`[Store] Restaurant partenaire ajoute : ${RESTAURANT.name} (${DISHES.length} plats)`);
  }
  seedReviewAccount();
  return added;
}

// Compte de test pour la verification des stores (cree une seule fois)
function seedReviewAccount() {
  const A = require('./comptes-revue');
  const key = 'compte:revue-stores';
  if (partnersSeeded.includes(key) || users.some(u => u.email === A.email)) return;
  users.push({
    id: A.id, name: A.name, phone: A.phone, email: A.email, password: A.passwordHash, avatar: 'T',
    city: 'Abomey-Calavi', addresses: [], favoriteDishes: [],
    location: { lat: 6.441, lng: 2.352, zone: 'Abomey-Calavi' },
    emailVerified: true, loyaltyPoints: 0, ordersCount: 0, savedTotal: 0,
    wayiPlus: { count: 0, target: 10, active: false }, reviewAccount: true,
    createdAt: new Date().toISOString(),
  });
  partnersSeeded.push(key);
  console.log('[Store] Compte de test des stores cree : ' + A.email);
}

function seedDemoMenuIfEmpty() {
  // Plus de restaurants fictifs sur la plateforme. Menu de demonstration seulement
  // pour les tests automatiques (DEMO_MENU=1), jamais en ligne.
  if (process.env.DEMO_MENU !== '1' || process.env.NODE_ENV === 'production') return 0;
  if (demoSeeded) return 0;
  if (restaurants.length || merchants.length || orders.length || dishes.length) return 0;
  const { DEMO_RESTAURANTS, DEMO_DISHES } = require('./demoMenu');
  for (const r of DEMO_RESTAURANTS) {
    restaurants.push({
      id: r.id, name: r.name, icon: 'utensils', logo: null, tagline: r.tagline,
      rating: null,            // aucune note inventée
      verified: false,         // pas encore labellisé : à valider avec le vrai restaurant
      demo: true,
      priorityScore: 50, zone: r.zone, lat: r.lat, lng: r.lng, prepTime: r.prepTime,
    });
  }
  for (const d of DEMO_DISHES) {
    const dish = addDish({
      restaurantId: `demo-resto-${d.resto}`, period: d.period, category: d.category, name: d.name,
      image: d.image, taste: d.taste, price: d.price, label: d.label, desc: d.desc,
      characteristics: d.characteristics, advantages: d.advantages, benefits: d.benefits,
    });
    dish.demo = true;
  }
  demoSeeded = true;
  return DEMO_DISHES.length;
}

module.exports = { snapshotState, restoreState, outOfZone, outOfZoneMessage,
  PLATFORM_CONFIG, PERIODS, CATEGORIES, TASTES, DISH_LABELS, currentPeriod, beninHour, seedDemoMenuIfEmpty, seedPartners, travelMinutes, driversWithin,
  restaurants, dishes, users, drivers, merchants, admins, reviews, orders, receipts, callLogs,
  enrichDish, getMenu, getDishById, isDishOnline, rotationFor, weekIndex, weekBounds, getRestaurantById, getDishesByRestaurant,
  getUserById, getOrdersByUser, addOrder, updateOrder,
  createPendingRegistration, getPendingRegistration, deletePendingRegistration,
  generateReceipt, getReceiptByOrderId, setOrderStatus, addRating,
  getGlobalAvgDeliveryMinutes, getDriverPerformance, PERFORMANCE_BENCHMARKS,
  calcDistance, calcDeliveryFee, findNearestDriver, findNearbyDrivers, enrichUserProfile,
  addRestaurant, updateRestaurant, deleteRestaurant, addDish, updateDish, deleteDish,
  hydrateFromDatabase, persistToDatabase, applySecurityOverrides,
};
