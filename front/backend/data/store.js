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
  deliveryBasePrice: 500,
  deliveryPerKm: 150,
  // Au-dela, l'adresse est hors zone : on refuse au lieu de facturer des frais absurdes
  maxDeliveryKm: 20,
  driverShare: 0.80,
  subscriptionPlans: {
    basic:    { price: 15000,  label: 'Basic',    maxDishes: 20,  priority: 1, badge: null },
    standard: { price: 35000,  label: 'Standard', maxDishes: 60,  priority: 2, badge: 'star' },
    premium:  { price: 75000,  label: 'Premium',  maxDishes: 200, priority: 3, badge: 'flame' },
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
  { id: 'burgers',      label: 'Burgers',       icon: 'sandwich' },
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

function enrichDish(dish) {
  const r = restaurants.find(x => x.id === dish.restaurantId);
  return {
    ...dish,
    restaurant: r ? { id: r.id, name: r.name, icon: r.icon, logo: r.logo, tagline: r.tagline, rating: r.rating, verified: r.verified, demo: !!r.demo, prepTime: r.prepTime } : null,
  };
}

function getMenu({ period, category, search } = {}) {
  let result = [...dishes];
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
const users = [
  {
    id: 'u1', role: 'buyer',
    name: 'Adèle Bossou', phone: '+229 96 34 12 78', email: 'adele@gmail.com', password: DEMO_PASSWORD_HASH,
    avatar: 'A', city: 'Abomey-Calavi',
    location: { lat: 6.3702, lng: 2.3824, zone: 'Cité GBÉTO', address: 'Cité GBÉTO, Imm. B, Appt 5' },
    addresses: [
      { id: 'a1', label: 'Domicile', address: 'Cité GBÉTO, Calavi, Imm. B, Appt 5', lat: 6.3702, lng: 2.3824, isDefault: true },
    ],
    loyaltyPoints: 240, ordersCount: 24, savedTotal: 12400,
    wayiPlus: { count: 6, target: 10, active: true },
    favoriteRestaurants: [],
    favoriteDishes: [],
    subscription: null,
    createdAt: '2026-01-15T10:00:00Z',
  },
];

// ─── DRIVERS ──────────────────────────────────────────────────
const drivers = [
  {
    id: 'dr1', role: 'driver', name: 'Kokou Zannou', phone: '+229 97 11 22 33', email: 'kokou@wayi.bj',
    password: DEMO_PASSWORD_HASH,
    avatar: 'K', vehicle: { type: 'moto', plate: 'AB 1234 RB' }, status: 'offline', suspended: false,
    location: { lat: 6.3710, lng: 2.3830, updatedAt: null },
    stats: { totalDeliveries: 340, monthlyEarnings: 185000, rating: 4.8, ratingCount: 340, completionRate: 97 },
    fieldCaptures: [],
  },
  {
    id: 'dr2', role: 'driver', name: 'Chantal Houssou', phone: '+229 96 55 44 33', email: 'chantal@wayi.bj',
    password: DEMO_PASSWORD_HASH,
    avatar: 'C', vehicle: { type: 'moto', plate: 'AC 5678 RB' }, status: 'offline', suspended: false,
    location: { lat: 6.3730, lng: 2.3810, updatedAt: null },
    stats: { totalDeliveries: 210, monthlyEarnings: 132000, rating: 4.9, ratingCount: 210, completionRate: 99 },
    fieldCaptures: [],
  },
];

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
  return Math.round((PLATFORM_CONFIG.deliveryBasePrice + distKm * PLATFORM_CONFIG.deliveryPerKm) / 50) * 50;
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
  return { users, drivers, merchants, admins, restaurants, dishes, reviews, orders, receipts, callLogs, demoSeeded };
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
  if (saved.demoSeeded) demoSeeded = true;
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
function seedDemoMenuIfEmpty() {
  if (process.env.NO_DEMO_MENU === '1' || demoSeeded) return 0;
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
  PLATFORM_CONFIG, PERIODS, CATEGORIES, TASTES, DISH_LABELS, currentPeriod, beninHour, seedDemoMenuIfEmpty,
  restaurants, dishes, users, drivers, merchants, admins, reviews, orders, receipts, callLogs,
  enrichDish, getMenu, getDishById, getRestaurantById, getDishesByRestaurant,
  getUserById, getOrdersByUser, addOrder, updateOrder,
  createPendingRegistration, getPendingRegistration, deletePendingRegistration,
  generateReceipt, getReceiptByOrderId, setOrderStatus, addRating,
  getGlobalAvgDeliveryMinutes, getDriverPerformance, PERFORMANCE_BENCHMARKS,
  calcDistance, calcDeliveryFee, findNearestDriver, findNearbyDrivers, enrichUserProfile,
  addRestaurant, updateRestaurant, deleteRestaurant, addDish, updateDish, deleteDish,
  hydrateFromDatabase, persistToDatabase, applySecurityOverrides,
};
