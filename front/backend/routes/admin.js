// ============================================================
// WAYI — Routes Super Admin (Backoffice)
// Gère les restaurants partenaires, le menu du jour et la
// supervision globale de la plateforme.
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/notifications');
const {
  admins, restaurants, dishes, drivers, merchants, orders, users, callLogs,
  PERIODS, CATEGORIES, TASTES, PLATFORM_CONFIG,
  addRestaurant, updateRestaurant, deleteRestaurant,
  addDish, updateDish, deleteDish, getDishById, enrichDish,
  getGlobalAvgDeliveryMinutes, getDriverPerformance, PERFORMANCE_BENCHMARKS,
} = require('../data/store');
const { auth, signToken } = require('../middleware/auth');
const telemarketing = require('../services/telemarketing');
const { settleManualPayment } = require('../services/payment/manual');
const { normalizeBeninMomo } = require('../utils/phone');

const router = express.Router();

const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé au super admin' });
  const admin = admins.find(a => a.id === req.user.id);
  if (!admin) return res.status(403).json({ error: 'Accès réservé au super admin' });
  req.admin = admin;
  next();
};


// Valide et normalise les numéros Mobile Money d'un restaurant (corps de requête). Renvoie une erreur ou null.
function cleanMomoFields(body) {
  for (const key of ['momoMtn', 'momoMoov']) {
    if (!(key in body)) continue;
    const n = normalizeBeninMomo(body[key]);
    if (n === false) return `Numéro ${key === 'momoMtn' ? 'MTN MoMo' : 'Moov Money'} invalide (ex : 01 42 43 63 87).`;
    body[key] = n; // null = effacé
  }
  return null;
}

// POST /api/admin/login — authentification sécurisée (bcrypt + JWT)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    const admin = admins.find(a => a.email === email || a.phone === email);
    if (!admin) return res.status(401).json({ error: 'Identifiants incorrects' });
    const valid = await bcrypt.compare(password, admin.password).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = signToken({ id: admin.id, role: 'admin', email: admin.email });
    const { password: _, ...safe } = admin;
    res.json({ token, admin: safe, message: 'Connexion admin réussie' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/me
router.get('/me', auth, adminAuth, (req, res) => {
  const { password: _, ...safe } = req.admin;
  res.json(safe);
});

// GET /api/admin/dashboard — vue d'ensemble de la plateforme
router.get('/dashboard', auth, adminAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.createdAt?.startsWith(today));
  const delivered = orders.filter(o => o.status === 'delivered');
  const totalRevenue = delivered.reduce((s, o) => s + o.total, 0);
  const platformRevenue = delivered.reduce((s, o) => s + Math.round(o.subtotal * PLATFORM_CONFIG.commissionRate), 0);
  const avgDeliveryMinutes = getGlobalAvgDeliveryMinutes();
  const driverPerformance = getDriverPerformance();

  res.json({
    stats: {
      totalOrders: orders.length,
      todayOrders: todayOrders.length,
      totalRevenue,
      platformRevenue,
      restaurantsCount: restaurants.length,
      dishesCount: dishes.length,
      driversOnline: drivers.filter(d => d.status === 'available').length,
      driversTotal: drivers.length,
      merchantsCount: merchants.length,
      pendingOrders: orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
      unassignedOrders: orders.filter(o => !o.driver && !['delivered', 'cancelled'].includes(o.status)).length,
      avgDeliveryMinutes: avgDeliveryMinutes !== null ? Math.round(avgDeliveryMinutes) : null,
      underperformingDrivers: driverPerformance.filter(d => d.underperforming).length,
    },
    recentOrders: [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
  });
});

// ── RESTAURANTS (le super admin ajoute/édite les restaurants partenaires) ──

// GET /api/admin/restaurants
router.get('/restaurants', auth, adminAuth, (req, res) => {
  res.json({ restaurants, total: restaurants.length });
});

// POST /api/admin/restaurants — ajouter un restaurant propriétaire de plats
router.post('/restaurants', auth, adminAuth, (req, res) => {
  const { name, lat, lng } = req.body;
  if (!name || lat === undefined || lng === undefined) return res.status(400).json({ error: 'name, lat et lng requis' });
  const momoErr = cleanMomoFields(req.body);
  if (momoErr) return res.status(400).json({ error: momoErr });
  const restaurant = addRestaurant(req.body);
  res.status(201).json({ restaurant, message: 'Restaurant ajouté' });
});

// PUT /api/admin/restaurants/:id
router.put('/restaurants/:id', auth, adminAuth, (req, res) => {
  const momoErr = cleanMomoFields(req.body);
  if (momoErr) return res.status(400).json({ error: momoErr });
  const restaurant = updateRestaurant(req.params.id, req.body);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  res.json({ restaurant, message: 'Restaurant mis à jour' });
});

// DELETE /api/admin/restaurants/:id
router.delete('/restaurants/:id', auth, adminAuth, (req, res) => {
  const ok = deleteRestaurant(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Restaurant introuvable' });
  res.json({ message: 'Restaurant et ses plats retirés' });
});

// ── MENU DU JOUR (le super admin gère les plats et leur restaurant d'origine) ──

// GET /api/admin/dishes — tous les plats (avec badge restaurant)
router.get('/dishes', auth, adminAuth, (req, res) => {
  const { period, category, restaurantId } = req.query;
  let result = [...dishes];
  if (period) result = result.filter(d => d.period === period);
  if (category) result = result.filter(d => d.category === category);
  if (restaurantId) result = result.filter(d => d.restaurantId === restaurantId);
  res.json({ dishes: result.map(enrichDish), periods: PERIODS, categories: CATEGORIES, tastes: TASTES, total: result.length });
});

// POST /api/admin/dishes — ajouter un plat au menu du jour + assigner son restaurant
router.post('/dishes', auth, adminAuth, (req, res) => {
  const { restaurantId, period, category, name, price } = req.body;
  if (!restaurantId || !period || !category || !name || !price) {
    return res.status(400).json({ error: 'restaurantId, period, category, name et price requis' });
  }
  if (!restaurants.find(r => r.id === restaurantId)) return res.status(404).json({ error: 'Restaurant introuvable' });
  if (!PERIODS.find(p => p.id === period)) return res.status(400).json({ error: 'Période invalide' });
  if (!CATEGORIES.find(c => c.id === category)) return res.status(400).json({ error: 'Catégorie invalide' });

  const dish = addDish(req.body);
  res.status(201).json({ dish: enrichDish(dish), message: 'Plat ajouté au menu du jour' });
});

// PUT /api/admin/dishes/:id
router.put('/dishes/:id', auth, adminAuth, (req, res) => {
  const dish = updateDish(req.params.id, req.body);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  res.json({ dish: enrichDish(dish), message: 'Plat mis à jour' });
});

// DELETE /api/admin/dishes/:id
router.delete('/dishes/:id', auth, adminAuth, (req, res) => {
  const ok = deleteDish(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Plat introuvable' });
  res.json({ message: 'Plat retiré du menu' });
});

// ── SUPERVISION ──────────────────────────────────────────────

// GET /api/admin/orders — toutes les commandes (filtrable)
router.get('/orders', auth, adminAuth, (req, res) => {
  const { status } = req.query;
  let result = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status) result = result.filter(o => o.status === status);
  res.json({ orders: result, total: result.length });
});

// PUT /api/admin/orders/:id/payment — confirmer ou rejeter un paiement Mobile Money manuel
router.put('/orders/:id/payment', auth, adminAuth, (req, res) => {
  const { action } = req.body;
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.paymentProvider !== 'manual') return res.status(409).json({ error: "Cette commande n'est pas en paiement manuel." });
  if (!['confirm', 'reject'].includes(action)) return res.status(400).json({ error: 'action doit être confirm ou reject' });
  settleManualPayment(order, action, req.admin?.id || 'admin');
  res.json({ order });
});

// PUT /api/admin/orders/:id/assign-driver — attribution manuelle d'un livreur par l'admin
router.put('/orders/:id/assign-driver', auth, adminAuth, (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId requis' });

  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (['delivered', 'cancelled'].includes(order.status)) return res.status(409).json({ error: 'Cette commande est déjà terminée' });

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return res.status(404).json({ error: 'Livreur introuvable' });

  order.driver = { id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, rating: driver.stats.rating };
  order.pingStatus = 'accepted';
  order.pingedDriverId = null;
  order.pingCandidates = [];
  driver.status = 'busy';

  try {
    const { emitOrderStatusChange, emitToUser } = require('../services/realtime');
    emitOrderStatusChange(order.id, order.status, { driver: order.driver, assignedByAdmin: true });
    emitToUser(driver.id, 'order:ping', {
      orderId: order.id, restaurantName: order.restaurantName, restaurantIcon: order.restaurantIcon,
      items: order.items, subtotal: order.subtotal, deliveryFee: order.deliveryFee, address: order.address,
      estimatedEarnings: Math.round((order.deliveryFee || 0) * PLATFORM_CONFIG.driverShare),
      assignedByAdmin: true, expiresInSec: 0,
    });
  } catch {}

  res.json({ message: `${driver.name} assigné à la commande ${order.id}`, order });
});

// POST /api/admin/drivers — créer un compte livreur et lui envoyer ses identifiants par e-mail
router.post('/drivers', auth, adminAuth, async (req, res) => {
  const { name, email, phone, vehicleType, vehiclePlate } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nom et e-mail requis' });
  if (drivers.find(d => d.email === email)) return res.status(409).json({ error: 'Cet e-mail est déjà utilisé' });

  // Mot de passe temporaire généré côté serveur — le livreur se connecte avec, reçu par e-mail.
  // (Pas encore de "changer mon mot de passe" côté app livreur — à ajouter si besoin plus tard.)
  const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase();
  const hashed = await bcrypt.hash(tempPassword, 10);

  const newDriver = {
    id: uuidv4(), role: 'driver', name, email, phone: phone || null,
    password: hashed,
    avatar: name[0].toUpperCase(),
    vehicle: { type: vehicleType || 'moto', plate: vehiclePlate || '' },
    status: 'offline', suspended: false,
    location: { lat: 6.3725, lng: 2.3838, updatedAt: null },
    stats: { totalDeliveries: 0, monthlyEarnings: 0, rating: 5, ratingCount: 0, completionRate: 100 },
    fieldCaptures: [],
    createdAt: new Date().toISOString(),
  };
  drivers.push(newDriver);

  const emailResult = await sendEmail({
    to: email,
    subject: 'Bienvenue chez WAYI, ton compte livreur',
    html: `<p>Bonjour ${name},</p><p>Ton compte livreur WAYI vient d'être créé. Voici tes identifiants pour te connecter sur l'application Livreur :</p><p><b>E-mail :</b> ${email}<br/><b>Mot de passe temporaire :</b> ${tempPassword}</p><p>Connecte-toi dès que possible.</p>`,
  });
  // Même filet de sécurité qu'à l'inscription client : si l'envoi échoue vraiment,
  // on ne bloque pas la création du compte, on renvoie le mot de passe à l'admin
  // pour qu'il puisse le transmettre au livreur par un autre canal.
  const emailFailed = !emailResult?.success;

  const { password: _, ...safeDriver } = newDriver;
  res.status(201).json({
    driver: safeDriver,
    message: 'Livreur créé',
    emailSimulated: !!emailResult?.simulated || emailFailed,
    devPassword: emailFailed ? tempPassword : undefined,
  });
});

// GET /api/admin/drivers — supervision des livreurs
router.get('/drivers', auth, adminAuth, (req, res) => {
  const safe = drivers.map(({ password, fcmTokens, ...d }) => d);
  res.json({ drivers: safe, total: safe.length });
});

// GET /api/admin/drivers/performance — temps moyen de livraison + benchmark
router.get('/drivers/performance', auth, adminAuth, (req, res) => {
  res.json({
    globalAvgDeliveryMinutes: (() => { const v = getGlobalAvgDeliveryMinutes(); return v !== null ? Math.round(v) : null; })(),
    benchmarks: PERFORMANCE_BENCHMARKS,
    drivers: getDriverPerformance().sort((a, b) => (b.underperforming - a.underperforming) || (b.avgDeliveryMinutes || 0) - (a.avgDeliveryMinutes || 0)),
  });
});

// PUT /api/admin/drivers/:id/suspend — exclure un livreur sous-performant (ne reçoit plus de commandes)
router.put('/drivers/:id/suspend', auth, adminAuth, (req, res) => {
  const driver = drivers.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Livreur introuvable' });
  driver.suspended = true;
  if (driver.status === 'available') driver.status = 'offline';
  res.json({ message: `${driver.name} a été suspendu`, driver });
});

// PUT /api/admin/drivers/:id/reactivate
router.put('/drivers/:id/reactivate', auth, adminAuth, (req, res) => {
  const driver = drivers.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Livreur introuvable' });
  const wasPending = !!driver.pendingApproval;
  driver.suspended = false;
  driver.pendingApproval = false;
  res.json({ message: wasPending ? `${driver.name} est validé et peut recevoir des courses` : `${driver.name} a été réactivé`, driver });
});

// POST /api/admin/merchants — créer le compte d'un restaurant partenaire
// (crée à la fois le restaurant et son compte de connexion, avec e-mail de bienvenue)
router.post('/merchants', auth, adminAuth, async (req, res) => {
  const { restaurantName, tagline, icon, zone, lat, lng, contactName, email, phone } = req.body;
  if (!restaurantName || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'restaurantName, lat et lng requis' });
  }
  if (!contactName || !email) return res.status(400).json({ error: 'contactName et e-mail requis' });
  if (merchants.find(m => m.email === email)) return res.status(409).json({ error: 'Cet e-mail est déjà utilisé' });

  // 1. Le restaurant lui-même (fiche publique : nom, position, menu à venir)
  const restaurant = addRestaurant({
    name: restaurantName, tagline: tagline || '', icon: icon || 'utensils',
    zone: zone || '', lat, lng, verified: false,
  });

  // 2. Le compte de connexion du restaurant, avec mot de passe temporaire envoyé par e-mail
  const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase();
  const hashed = await bcrypt.hash(tempPassword, 10);
  const merchant = {
    id: uuidv4(), role: 'merchant', restaurantId: restaurant.id,
    name: contactName, email, phone: phone || null, password: hashed,
    subscription: { plan: 'free', monthlyFee: 0, active: true },
    stats: { monthlyOrders: 0, monthlyRevenue: 0, totalOrders: 0, totalRevenue: 0 },
    createdAt: new Date().toISOString(),
  };
  merchants.push(merchant);

  const emailResult = await sendEmail({
    to: email,
    subject: 'Bienvenue chez WAYI, ton compte restaurant',
    html: `<p>Bonjour ${contactName},</p><p>Le compte de <b>${restaurantName}</b> vient d'être créé sur WAYI. Voici tes identifiants pour te connecter sur l'espace restaurant :</p><p><b>E-mail :</b> ${email}<br/><b>Mot de passe temporaire :</b> ${tempPassword}</p><p>Une fois connecté, tu pourras ajouter les plats de ton menu du jour.</p>`,
  });
  const emailFailed = !emailResult?.success;

  const { password: _, ...safeMerchant } = merchant;
  res.status(201).json({
    restaurant, merchant: safeMerchant,
    message: 'Restaurant et compte créés',
    emailSimulated: !!emailResult?.simulated || emailFailed,
    devPassword: emailFailed ? tempPassword : undefined,
  });
});

// GET /api/admin/merchants — supervision des comptes restaurateurs
router.get('/merchants', auth, adminAuth, (req, res) => {
  const safe = merchants.map(({ password, ...m }) => m);
  res.json({ merchants: safe, total: safe.length });
});

// ── Telemarketing : outil d'appels pour l'équipe WAYI ─────────────────────

// GET /api/admin/telemarketing/targets?type=client|restaurant&segment=...
router.get('/telemarketing/targets', auth, adminAuth, (req, res) => {
  const type = req.query.type === 'restaurant' ? 'restaurant' : 'client';
  const segment = req.query.segment || '';
  if (segment && !telemarketing.SEGMENTS[type][segment]) return res.status(400).json({ error: 'Segment inconnu' });

  const all = telemarketing.buildTargets(type, { includeDoNotCall: req.query.includeDoNotCall === 'true' });
  const targets = telemarketing.withSegmentScript(type, segment, all);
  res.json({
    type, segment, targets, total: targets.length,
    segments: telemarketing.segmentCounts(type, all),
    outcomes: Object.entries(telemarketing.OUTCOMES).map(([key, o]) => ({ key, label: o.label })),
    stats: telemarketing.stats(),
  });
});

// GET /api/admin/telemarketing/calls?targetId=... — historique des appels d'une personne
router.get('/telemarketing/calls', auth, adminAuth, (req, res) => {
  const { targetId } = req.query;
  if (!targetId) return res.status(400).json({ error: 'targetId requis' });
  const calls = callLogs.filter(c => c.targetId === targetId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
  res.json({ calls });
});

// POST /api/admin/telemarketing/calls — enregistrer le résultat d'un appel
router.post('/telemarketing/calls', auth, adminAuth, (req, res) => {
  const { targetType, targetId, outcome, note, callbackAt } = req.body;
  if (!['client', 'restaurant'].includes(targetType)) return res.status(400).json({ error: 'targetType invalide' });
  if (!telemarketing.OUTCOMES[outcome]) return res.status(400).json({ error: 'Résultat d\'appel invalide' });
  if (note && String(note).length > 1000) return res.status(400).json({ error: 'Note trop longue (1000 caractères maximum)' });

  let targetName;
  if (targetType === 'client') {
    const u = users.find(x => x.id === targetId);
    if (!u) return res.status(404).json({ error: 'Client introuvable' });
    targetName = u.name;
  } else {
    const m = merchants.find(x => x.id === targetId);
    if (!m) return res.status(404).json({ error: 'Restaurant introuvable' });
    targetName = restaurants.find(r => r.id === m.restaurantId)?.name || m.name;
  }

  let when = null;
  if (outcome === 'callback') {
    when = callbackAt ? new Date(callbackAt) : new Date(Date.now() + 24 * 60 * 60 * 1000); // par défaut : demain
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Date de rappel invalide' });
  }

  const call = {
    id: uuidv4(), targetType, targetId, targetName,
    agentId: req.admin.id, agentName: req.admin.name || req.admin.email,
    outcome, note: note ? String(note).trim() : '', callbackAt: when ? when.toISOString() : null,
    createdAt: new Date().toISOString(),
  };
  callLogs.push(call);
  res.status(201).json({ call, stats: telemarketing.stats() });
});

module.exports = router;
