// ============================================================
// WAYI — Routes Livreurs
// Authentification sécurisée (bcrypt + JWT) · Présence en ligne
// Partage de position live · Réception de commandes par ping
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { drivers, orders, enrichUserProfile, setOrderStatus, generateReceipt, createPendingRegistration, getPendingRegistration, deletePendingRegistration } = require('../data/store');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/notifications');
const { auth, signToken } = require('../middleware/auth');
const { declineByDriver } = require('../services/dispatch');
const { notify } = require('../services/notifications');

const router = express.Router();

const driverAuth = (req, res, next) => {
  if (req.user.role !== 'driver') return res.status(403).json({ error: 'Accès réservé aux livreurs Wayi' });
  const driver = drivers.find(d => d.id === req.user.id);
  if (!driver) return res.status(403).json({ error: 'Accès réservé aux livreurs Wayi' });
  req.driver = driver;
  next();
};

// POST /api/drivers/login — authentification sécurisée (bcrypt + JWT)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis' });

    const driver = drivers.find(d => d.email === email || d.phone === email);
    if (!driver) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, driver.password).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = signToken({ id: driver.id, role: 'driver', email: driver.email });
    const { password: _, ...safe } = driver;
    res.json({ token, driver: safe, message: 'Connexion livreur réussie' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Inscription d'un livreur depuis l'application ───────────────
// Le compte est cree "en attente de validation" : le livreur peut se connecter,
// mais ne recoit aucune course tant que l'administration ne l'a pas active
// (admin > livreurs > Reactiver).
const pendingKey = (email) => `driver:${String(email || '').trim().toLowerCase()}`;
const VEHICLES = ['moto', 'velo', 'voiture', 'tricycle'];

router.post('/register/start', async (req, res) => {
  try {
    const { name, email, password, phone, vehicleType, vehiclePlate, zone } = req.body;
    if (!name || !email || !password || !phone) return res.status(400).json({ error: 'Nom, téléphone, e-mail et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    if (drivers.find(d => d.email === email.trim())) return res.status(409).json({ error: 'Cet e-mail est déjà enregistré comme livreur' });
    const hashed = await bcrypt.hash(password, 10);
    const data = { name: name.trim(), email: email.trim(), phone: phone.trim(), password: hashed, vehicleType: VEHICLES.includes(vehicleType) ? vehicleType : 'moto', vehiclePlate: (vehiclePlate || '').trim().toUpperCase(), zone: (zone || '').trim() };
    const code = createPendingRegistration(pendingKey(email), data);
    const emailResult = await sendEmail({
      to: data.email,
      subject: 'Ton code de vérification WAYI Livreur',
      html: `<p>Bonjour ${data.name},</p><p>Voici ton code pour créer ton compte livreur WAYI :</p><h2>${code}</h2><p>Ce code expire dans 10 minutes.</p>`,
    });
    const emailFailed = !emailResult?.success;
    res.json({ message: `Code envoyé à ${data.email}`, email: data.email, emailSimulated: !!emailResult?.simulated || emailFailed, devCode: emailFailed ? code : undefined });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/register/resend', async (req, res) => {
  try {
    const pending = getPendingRegistration(pendingKey(req.body.email));
    if (!pending) return res.status(404).json({ error: 'Aucune inscription en attente pour cet e-mail' });
    const code = createPendingRegistration(pendingKey(req.body.email), pending.data);
    const emailResult = await sendEmail({ to: pending.data.email, subject: 'Ton nouveau code WAYI Livreur', html: `<p>Voici ton nouveau code : <h2>${code}</h2></p>` });
    const emailFailed = !emailResult?.success;
    res.json({ message: 'Code renvoyé', emailSimulated: !!emailResult?.simulated || emailFailed, devCode: emailFailed ? code : undefined });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/register/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'E-mail et code requis' });
    const key = pendingKey(email);
    const pending = getPendingRegistration(key);
    if (!pending) return res.status(400).json({ error: 'Inscription expirée, recommence.' });
    if (Date.now() > pending.expiresAt) { deletePendingRegistration(key); return res.status(400).json({ error: 'Code expiré, recommence.' }); }
    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts > 5) { deletePendingRegistration(key); return res.status(429).json({ error: 'Trop de tentatives, recommence.' }); }
    if (pending.code !== String(code).trim()) return res.status(400).json({ error: 'Code incorrect' });
    deletePendingRegistration(key);
    if (drivers.find(d => d.email === pending.data.email)) return res.status(409).json({ error: 'Cet e-mail est déjà enregistré comme livreur' });

    const d = pending.data;
    const driver = {
      id: uuidv4(), role: 'driver', name: d.name, email: d.email, phone: d.phone, password: d.password,
      avatar: d.name[0].toUpperCase(),
      vehicle: { type: d.vehicleType, plate: d.vehiclePlate }, zone: d.zone,
      status: 'offline', suspended: true, pendingApproval: true,
      location: { lat: 6.3725, lng: 2.3838, updatedAt: null },
      stats: { totalDeliveries: 0, monthlyEarnings: 0, rating: 5, ratingCount: 0, completionRate: 100 },
      fieldCaptures: [],
      createdAt: new Date().toISOString(),
    };
    drivers.push(driver);
    const token = signToken({ id: driver.id, role: 'driver', email: driver.email });
    const { password: _, ...safe } = driver;
    res.status(201).json({ token, driver: safe, message: 'Compte livreur créé, en attente de validation' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/drivers/me
// PUT /api/drivers/me/password — changer son mot de passe (utile après un compte
// créé par l'admin avec un mot de passe temporaire)
router.put('/me/password', auth, driverAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });

  const valid = await bcrypt.compare(currentPassword, req.driver.password).catch(() => false);
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

  req.driver.password = await bcrypt.hash(newPassword, 10);
  res.json({ message: 'Mot de passe mis à jour' });
});

router.get('/me', auth, driverAuth, (req, res) => {
  const { password: _, ...safe } = req.driver;
  res.json(safe);
});

// GET /api/drivers/dashboard
router.get('/dashboard', auth, driverAuth, (req, res) => {
  const d = req.driver;
  const myOrders = orders.filter(o => o.driver?.id === d.id);
  // "Aujourd'hui" a l'heure du Benin, et seulement les courses vraiment livrees
  const beninDay = (iso) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Africa/Porto-Novo' });
  const today = beninDay(new Date().toISOString());
  const deliveredToday = myOrders.filter(o => o.status === 'delivered' && o.deliveredAt && beninDay(o.deliveredAt) === today);
  const todayEarnings = deliveredToday.reduce((s, o) => s + Math.round((o.deliveryFee || 0) * 0.80), 0);

  // Commande(s) actuellement "pingées" vers ce livreur
  const incomingPing = orders.find(o => o.pingedDriverId === d.id && o.pingStatus === 'pinging' && !o.driver);
  const activeDelivery = orders.find(o => o.driver?.id === d.id && ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'].includes(o.status));

  res.json({
    driver: { name: d.name, avatar: d.avatar, vehicle: d.vehicle, status: d.status, rating: d.stats.rating, suspended: !!d.suspended, pendingApproval: !!d.pendingApproval },
    stats: {
      todayDeliveries: deliveredToday.length,
      todayEarnings,
      monthlyEarnings: d.stats.monthlyEarnings,
      totalDeliveries: d.stats.totalDeliveries,
      rating: d.stats.rating,
      completionRate: d.stats.completionRate,
    },
    incomingPing: incomingPing ? {
      orderId: incomingPing.id, restaurantName: incomingPing.restaurantName, restaurantIcon: incomingPing.restaurantIcon,
      address: incomingPing.address, landmark: incomingPing.landmark || '', mapsLink: incomingPing.mapsLink || null, deliveryFee: incomingPing.deliveryFee,
      estimatedEarnings: Math.round((incomingPing.deliveryFee || 0) * 0.80),
      expiresAt: incomingPing.pingExpiresAt,
    } : null,
    // Course en cours : carte (restaurant, client, trajet) et contact du client pour l'appli livreur
    activeDelivery: activeDelivery ? (() => {
      const { buildTracking } = require('../utils/tracking');
      const { getUserById } = require('../data/store');
      const buyer = getUserById(activeDelivery.userId);
      return { ...activeDelivery, tracking: buildTracking(activeDelivery), customer: buyer ? { name: buyer.name, phone: buyer.phone } : null };
    })() : null,
    recentDeliveries: myOrders.filter(o => o.status === 'delivered').sort((a, b) => new Date(b.deliveredAt || 0) - new Date(a.deliveredAt || 0)).slice(0, 5),
  });
});

// PUT /api/drivers/status — activer/désactiver sa présence en ligne
router.put('/status', auth, driverAuth, (req, res) => {
  const { status, lat, lng } = req.body;
  if (!['available', 'busy', 'offline'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  if (status === 'available' && req.driver.suspended) {
    return res.status(403).json({ error: 'Ton compte est suspendu pour le moment. Contacte le support Wayi.' });
  }
  req.driver.status = status;
  if (lat && lng) req.driver.location = { lat, lng, updatedAt: new Date().toISOString() };
  res.json({ status, location: req.driver.location, message: `Statut mis à jour : ${status}` });
});

// PUT /api/drivers/location — mise à jour GPS (présence + tracking commande active)
router.put('/location', auth, driverAuth, (req, res) => {
  const { point } = require('../utils/tracking');
  const pos = point(req.body?.lat, req.body?.lng);
  if (!pos) return res.status(400).json({ error: 'Coordonnées invalides' });
  const { lat, lng } = pos;
  req.driver.location = { lat, lng, updatedAt: new Date().toISOString() };

  // Prolonge le trace des livraisons en cours, puis diffuse la position aux clients et restaurants qui suivent
  const { recordTrail } = require('../utils/tracking');
  const mine = orders.filter(o => o.driver?.id === req.driver.id && ['confirmed', 'preparing', 'ready', 'on_the_way'].includes(o.status));
  mine.forEach(o => recordTrail(o, pos));
  try {
    const { getIO } = require('../services/realtime');
    const io = getIO();
    if (io) mine.forEach(o => io.to(`order:${o.id}`).emit('driver:position', { orderId: o.id, lat, lng, timestamp: new Date().toISOString(), driverId: req.driver.id }));
  } catch {}

  res.json({ location: req.driver.location });
});

// POST /api/drivers/capture — enrichissement profil client
router.post('/capture', auth, driverAuth, (req, res) => {
  const { orderId, userId, observations } = req.body;
  if (!orderId || !userId || !observations) return res.status(400).json({ error: 'orderId, userId et observations requis' });

  const validFields = ['buildingType', 'accessDifficulty', 'notes'];
  const cleanObs = {};
  validFields.forEach(f => { if (observations[f] !== undefined) cleanObs[f] = observations[f]; });

  req.driver.fieldCaptures.push({ userId, orderId, deliveredAt: new Date().toISOString(), observations: cleanObs });
  const updatedProfile = enrichUserProfile(userId, { ...cleanObs, lastUpdatedByDriver: req.driver.id, lastUpdatedAt: new Date().toISOString() });

  res.json({ message: 'Capture terrain enregistrée avec succès. Merci !', updatedProfile });
});

// GET /api/drivers/orders — historique du livreur
router.get('/orders', auth, driverAuth, (req, res) => {
  const myOrders = orders.filter(o => o.driver?.id === req.driver.id);
  res.json({ orders: myOrders, total: myOrders.length });
});

// PUT /api/drivers/orders/:orderId/accept — accepter une commande pingée
router.put('/orders/:orderId/accept', auth, driverAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.driver) return res.status(409).json({ error: 'Commande déjà prise en charge' });
  if (req.driver.suspended) return res.status(403).json({ error: 'Ton compte est suspendu pour le moment.' });
  if (['cancelled', 'delivered'].includes(order.status)) return res.status(409).json({ error: "Cette commande n'est plus disponible" });
  // Seul le livreur actuellement pingé (ou n'importe quel dispo si plus personne à ping) peut accepter
  if (order.pingedDriverId && order.pingedDriverId !== req.driver.id) {
    return res.status(409).json({ error: "Ce n'est pas (ou plus) ton tour pour cette commande" });
  }

  order.driver = { id: req.driver.id, name: req.driver.name, phone: req.driver.phone, vehicle: req.driver.vehicle, rating: req.driver.stats.rating };
  order.pingStatus = 'accepted';
  order.pingedDriverId = null;
  order.pingCandidates = [];
  req.driver.status = 'busy';

  try {
    const { emitOrderStatusChange } = require('../services/realtime');
    emitOrderStatusChange(order.id, order.status, { driver: order.driver, pingStatus: 'accepted' });
  } catch {}

  res.json({ message: 'Commande acceptée !', order, estimatedEarnings: Math.round((order.deliveryFee || 0) * 0.80) });
});

// PUT /api/drivers/orders/:orderId/decline — décliner → passe au livreur suivant
router.put('/orders/:orderId/decline', auth, driverAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const declined = declineByDriver(order, req.driver.id);
  if (!declined) return res.status(409).json({ error: "Cette commande ne t'est plus proposée" });
  res.json({ message: 'Commande déclinée, transmise au livreur suivant' });
});

// PUT /api/drivers/orders/:orderId/pickup — le livreur confirme avoir récupéré la commande au restaurant
router.put('/orders/:orderId/pickup', auth, driverAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.driver?.id !== req.driver.id) return res.status(403).json({ error: "Cette commande ne t'est pas assignée" });
  if (!['preparing', 'ready'].includes(order.status)) {
    return res.status(409).json({ error: `Impossible de récupérer une commande au statut "${order.status}"` });
  }

  setOrderStatus(order.id, 'on_the_way');
  require('../utils/tracking').startTrip(order, req.driver);

  try {
    const { emitOrderStatusChange } = require('../services/realtime');
    emitOrderStatusChange(order.id, 'on_the_way', { driver: order.driver });
  } catch {}

  res.json({ message: 'Commande récupérée, en route vers le client', order });
});

// PUT /api/drivers/orders/:orderId/complete — le livreur confirme la livraison
router.put('/orders/:orderId/complete', auth, driverAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.driver?.id !== req.driver.id) return res.status(403).json({ error: "Cette commande ne t'est pas assignée" });
  if (order.status !== 'on_the_way') {
    return res.status(409).json({ error: `Impossible de livrer une commande au statut "${order.status}"` });
  }

  setOrderStatus(order.id, 'delivered');

  // Paiement cash : encaissé à la livraison par le livreur
  if (order.paymentMethod === 'cash') {
    order.paymentStatus = 'paid';
    order.paidAt = new Date().toISOString();
  }
  const receipt = generateReceipt(order);

  // Le livreur redevient disponible pour une nouvelle commande
  const otherActive = orders.some(o => o.id !== order.id && o.driver?.id === req.driver.id && ['confirmed', 'preparing', 'ready', 'on_the_way'].includes(o.status));
  if (!otherActive) req.driver.status = 'available';
  req.driver.stats.totalDeliveries = (req.driver.stats.totalDeliveries || 0) + 1;
  req.driver.stats.monthlyEarnings = (req.driver.stats.monthlyEarnings || 0) + Math.round((order.deliveryFee || 0) * 0.80);

  try {
    const { emitOrderStatusChange } = require('../services/realtime');
    emitOrderStatusChange(order.id, 'delivered', { receipt });
  } catch {}

  try {
    const { getUserById } = require('../data/store');
    const user = getUserById(order.userId);
    if (user) {
      notify({ userId: order.userId, phone: user.phone, email: user.email, event: 'order_delivered', data: { userName: user.name, shopName: order.restaurantName } }).catch(() => {});
    }
  } catch {}

  res.json({ message: 'Commande livrée, merci pour ta course !', order, receipt });
});

module.exports = router;
