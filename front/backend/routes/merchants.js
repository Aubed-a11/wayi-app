// ============================================================
// WAYI — Routes Restaurants partenaires (espace commerçant)
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { merchants, restaurants, dishes, orders, PLATFORM_CONFIG, reviews, getUserById, drivers, calcDistance, addDish, updateDish, deleteDish, enrichDish, getDishById, PERIODS, CATEGORIES, addRestaurant, createPendingRegistration, getPendingRegistration, deletePendingRegistration } = require('../data/store');
const { auth, signToken } = require('../middleware/auth');
const { notify, sendEmail } = require('../services/notifications');

const { normalizeBeninMomo } = require('../utils/phone');
const { settleManualPayment } = require('../services/payment/manual');

const router = express.Router();

const merchantAuth = (req, res, next) => {
  if (req.user.role !== 'merchant') return res.status(403).json({ error: 'Accès réservé aux restaurants partenaires' });
  const merchant = merchants.find(m => m.id === req.user.id);
  if (!merchant) return res.status(403).json({ error: 'Accès réservé aux restaurants partenaires' });
  req.merchant = merchant;
  req.restaurant = restaurants.find(r => r.id === merchant.restaurantId);
  next();
};

// POST /api/merchants/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis' });
    const merchant = merchants.find(m => m.email === email || m.phone === email);
    if (!merchant) return res.status(401).json({ error: 'Identifiants incorrects' });
    const valid = await bcrypt.compare(password, merchant.password).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = signToken({ id: merchant.id, role: 'merchant', email: merchant.email });
    const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safe } = merchant;
    res.json({ token, merchant: safe, message: 'Connexion réussie' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/merchants/register/start — un restaurant crée lui-même son compte
// (même principe que l'inscription client : code envoyé par e-mail avant activation)
router.post('/register/start', async (req, res) => {
  try {
    const { restaurantName, contactName, email, password, phone, zone, lat, lng } = req.body;
    if (!restaurantName || !contactName || !email || !password) {
      return res.status(400).json({ error: 'Nom du restaurant, contact, e-mail et mot de passe requis' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    if (merchants.find(m => m.email === email)) return res.status(409).json({ error: 'Cet e-mail est déjà enregistré' });

    const hashed = await bcrypt.hash(password, 10);
    const code = createPendingRegistration(email, { restaurantName, contactName, email, phone, zone, lat, lng, password: hashed });

    const emailResult = await sendEmail({
      to: email,
      subject: 'Ton code de vérification WAYI',
      html: `<p>Bonjour ${contactName},</p><p>Voici ton code de vérification pour créer le compte de <b>${restaurantName}</b> sur WAYI :</p><h2>${code}</h2><p>Ce code expire dans 10 minutes.</p>`,
    });
    // Même filet de sécurité que côté client : si l'envoi échoue vraiment, on ne
    // bloque pas l'inscription, le code est renvoyé au front pour affichage direct.
    const emailFailed = !emailResult?.success;

    res.json({
      message: `Code envoyé à ${email}`,
      email,
      emailSimulated: !!emailResult?.simulated || emailFailed,
      devCode: (emailFailed || (emailResult?.simulated && process.env.NODE_ENV !== 'production')) ? code : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/merchants/register/resend
router.post('/register/resend', async (req, res) => {
  try {
    const { email } = req.body;
    const pending = getPendingRegistration(email);
    if (!pending) return res.status(404).json({ error: 'Aucune inscription en attente pour cet e-mail' });

    const code = createPendingRegistration(email, pending.data);
    const emailResult = await sendEmail({
      to: email,
      subject: 'Ton nouveau code de vérification WAYI',
      html: `<p>Voici ton nouveau code : <h2>${code}</h2></p>`,
    });
    const emailFailed = !emailResult?.success;
    res.json({
      message: `Code renvoyé à ${email}`,
      emailSimulated: !!emailResult?.simulated || emailFailed,
      devCode: (emailFailed || (emailResult?.simulated && process.env.NODE_ENV !== 'production')) ? code : undefined,
    });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/merchants/register/verify — crée le restaurant + le compte à la validation du code
router.post('/register/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'E-mail et code requis' });

    const pending = getPendingRegistration(email);
    if (!pending) return res.status(400).json({ error: 'Inscription expirée, recommence.' });
    if (Date.now() > pending.expiresAt) { deletePendingRegistration(email); return res.status(400).json({ error: 'Code expiré, recommence.' }); }

    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts > 5) { deletePendingRegistration(email); return res.status(429).json({ error: 'Trop de tentatives, recommence.' }); }
    if (pending.code !== code) return res.status(400).json({ error: 'Code incorrect' });

    deletePendingRegistration(email);

    // Utilise la position renseignée à l'inscription ; à défaut (champ laissé vide),
    // repli sur le centre d'Abomey-Calavi, ajustable ensuite depuis l'admin.
    const lat = pending.data.lat !== undefined && pending.data.lat !== '' ? parseFloat(pending.data.lat) : 6.3720;
    const lng = pending.data.lng !== undefined && pending.data.lng !== '' ? parseFloat(pending.data.lng) : 2.3820;
    const restaurant = addRestaurant({
      name: pending.data.restaurantName, zone: pending.data.zone || '',
      lat: Number.isFinite(lat) ? lat : 6.3720, lng: Number.isFinite(lng) ? lng : 2.3820,
      verified: false,
    });
    const merchant = {
      id: uuidv4(), role: 'merchant', restaurantId: restaurant.id,
      name: pending.data.contactName, email: pending.data.email, phone: pending.data.phone || null,
      password: pending.data.password,
      subscription: { plan: 'free', monthlyFee: 0, active: true },
      stats: { monthlyOrders: 0, monthlyRevenue: 0, totalOrders: 0, totalRevenue: 0 },
      createdAt: new Date().toISOString(),
    };
    merchants.push(merchant);

    const token = signToken({ id: merchant.id, role: 'merchant', email: merchant.email });
    const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeMerchant } = merchant;
    res.status(201).json({ token, merchant: safeMerchant, restaurant, message: 'Compte restaurant créé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// PUT /api/merchants/me/password — changer son mot de passe (utile après un compte
// créé par l'admin avec un mot de passe temporaire)
router.put('/me/password', auth, merchantAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });

  const valid = await bcrypt.compare(currentPassword, req.merchant.password).catch(() => false);
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

  req.merchant.password = await bcrypt.hash(newPassword, 10);
  res.json({ message: 'Mot de passe mis à jour' });
});

router.get('/dashboard', auth, merchantAuth, (req, res) => {
  const m = req.merchant;
  const restaurant = req.restaurant;
  const myOrders = orders.filter(o => o.restaurantId === restaurant?.id);
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = myOrders.filter(o => o.createdAt?.startsWith(today));
  const pendingOrders = myOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
  const myReviews = reviews.filter(r => r.restaurantId === restaurant?.id);
  const avgRating = myReviews.length ? (myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length).toFixed(1) : restaurant?.rating;

  const tierInfo = PLATFORM_CONFIG.subscriptionPlans[m.subscription.plan] || {};

  res.json({
    merchant: { name: m.name, restaurantName: restaurant?.name, restaurantIcon: restaurant?.icon, restaurantLogo: restaurant?.logo, subscription: m.subscription, subscriptionInfo: tierInfo },
    stats: {
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders.reduce((s, o) => s + (o.subtotal || 0), 0),
      monthlyOrders: m.stats.monthlyOrders,
      monthlyRevenue: m.stats.monthlyRevenue,
      totalOrders: m.stats.totalOrders,
      totalRevenue: m.stats.totalRevenue,
      rating: parseFloat(avgRating),
      reviewCount: myReviews.length,
    },
    pendingOrders: pendingOrders.slice(0, 10),
    commissionRate: PLATFORM_CONFIG.commissionRate,
    priorityScore: restaurant?.priorityScore,
    message: tierInfo.label
      ? `Ton abonnement ${tierInfo.label} te donne la priorité ${tierInfo.priority}/3 sur le menu du jour.`
      : "Tu es sur l'offre gratuite. Un abonnement te fait apparaître en priorité dans le menu du jour.",
  });
});

// GET/PUT /api/merchants/payout — numéros Mobile Money sur lesquels le restaurant encaisse
router.get('/payout', auth, merchantAuth, (req, res) => {
  res.json({ momoMtn: req.restaurant?.momoMtn || '', momoMoov: req.restaurant?.momoMoov || '', mode: require('../services/payment').paymentMode() });
});
router.put('/payout', auth, merchantAuth, (req, res) => {
  const out = {};
  for (const [key, label] of [['momoMtn', 'MTN MoMo'], ['momoMoov', 'Moov Money']]) {
    if (!(key in req.body)) continue;
    const n = normalizeBeninMomo(req.body[key]);
    if (n === false) return res.status(400).json({ error: `Numéro ${label} invalide (ex : 01 42 43 63 87).` });
    out[key] = n;
  }
  if (!req.restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  Object.assign(req.restaurant, out);
  res.json({ momoMtn: req.restaurant.momoMtn || '', momoMoov: req.restaurant.momoMoov || '', message: 'Numéros enregistrés' });
});

// PUT /api/merchants/orders/:id/payment — le restaurant confirme (ou non) avoir reçu l'argent sur son numéro
router.put('/orders/:id/payment', auth, merchantAuth, (req, res) => {
  const { action } = req.body;
  const order = orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurant?.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.paymentProvider !== 'manual' || order.paymentPayee !== 'restaurant') {
    return res.status(409).json({ error: "Ce paiement n'a pas été envoyé sur ton numéro : c'est WAYI qui le confirme." });
  }
  if (!['awaiting_payment', 'claimed'].includes(order.paymentStatus)) return res.status(409).json({ error: 'Paiement déjà traité.' });
  if (!['confirm', 'reject'].includes(action)) return res.status(400).json({ error: 'action doit être confirm ou reject' });
  settleManualPayment(order, action, req.restaurant.id);
  res.json({ order });
});

// GET /api/merchants/orders
router.get('/orders', auth, merchantAuth, (req, res) => {
  const { status } = req.query;
  let myOrders = orders.filter(o => o.restaurantId === req.restaurant?.id);
  if (status) myOrders = myOrders.filter(o => o.status === status);
  // Prenom du client pour que le restaurant reconnaisse la commande (sans autres donnees)
  const withName = myOrders.map(o => ({ ...o, customerName: (getUserById(o.userId)?.name || '').split(' ')[0] }));
  res.json({ orders: withName, total: withName.length });
});

// PUT /api/merchants/orders/:id/status
// GET /api/merchants/orders/:id/tracking - ou est le livreur et ou va-t-il (suivi en direct cote restaurant)
router.get('/orders/:id/tracking', auth, merchantAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurant?.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const { buildTracking } = require('../utils/tracking');
  res.json(buildTracking(order));
});

router.put('/orders/:id/status', auth, merchantAuth, (req, res) => {
  const { status } = req.body;
  const order = orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurant?.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });

  // Machine à états stricte : le restaurant doit d'abord accepter ou rejeter une commande
  // en attente avant que quoi que ce soit d'autre ne se passe côté client/livreur.
  const ALLOWED_TRANSITIONS = {
    pending:   ['preparing', 'cancelled'], // accepter ou rejeter
    preparing: ['ready', 'cancelled'],     // marquer prêt (ou annuler en cas de souci)
  };
  const allowedNext = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(409).json({ error: `Transition invalide : "${order.status}" vers "${status}"` });
  }

  // Paiement manuel (envoi vers le numéro WAYI) : on ne prépare qu'une fois la réception confirmée.
  if (status === 'preparing' && ['awaiting_payment', 'claimed', 'rejected'].includes(order.paymentStatus)) {
    return res.status(409).json({ error: order.paymentPayee === 'restaurant'
      ? "Confirme d'abord la réception du paiement (bouton « J'ai reçu l'argent ») avant d'accepter cette commande."
      : "Le paiement de cette commande n'est pas encore confirmé par WAYI. Patiente un instant avant de la préparer." });
  }

  const wasAccepting = order.status === 'pending' && status === 'preparing';
  const wasRejecting = order.status === 'pending' && status === 'cancelled';

  order.status = status;
  order.statusHistory.push({ status, label: { preparing: 'Commande acceptée, en préparation', ready: 'Plat prêt', cancelled: 'Commande annulée par le restaurant' }[status], time: new Date().toISOString() });

  // Commande annulee alors qu'un livreur etait deja assigne : il est libere et prevenu
  if (status === 'cancelled' && order.driver?.id) {
    const d = drivers.find(x => x.id === order.driver.id);
    const stillBusy = orders.some(o => o.id !== order.id && o.driver?.id === order.driver.id && ['confirmed', 'preparing', 'ready', 'on_the_way'].includes(o.status));
    if (d && !stillBusy && d.status === 'busy') d.status = 'available';
    try { require('../services/realtime').emitToUser(order.driver.id, 'order:cancelled', { orderId: order.id, restaurantName: order.restaurantName }); } catch {}
  }

  // Le restaurant accepte : on cherche tout de suite un livreur (proposition au plus proche,
  // puis au suivant s'il ne repond pas). Sans cet appel, aucun livreur n'etait prevenu.
  if (wasAccepting && !order.driver) {
    try { require('../services/dispatch').startDispatch(order, req.restaurant); } catch (e) { console.error('[Dispatch]', e.message); }
  }

  // Prévenir en temps réel le client qui suit sa commande, et le livreur déjà
  // assigné (si un livreur a accepté la course avant que le plat soit prêt).
  const { emitOrderStatusChange, emitToUser } = require('../services/realtime');
  emitOrderStatusChange(order.id, order.status, { restaurantMarkedReady: status === 'ready' });
  if (status === 'ready' && order.driver?.id) {
    emitToUser(order.driver.id, 'order:ready_for_pickup', {
      orderId: order.id, restaurantName: order.restaurantName,
    });
  }

  // Le client n'est notifié "commande reçue et en préparation" que MAINTENANT, quand le
  // restaurant accepte réellement — jamais avant. C'est aussi le tout premier moment où
  // le vrai e-mail de confirmation part (voir services/notifications).
  const buyer = getUserById(order.userId);
  if (buyer && wasAccepting) {
    notify({
      userId: buyer.id, phone: buyer.phone, email: buyer.email,
      event: 'order_confirmed',
      data: { userName: buyer.name, orderId: order.id, restaurantName: order.restaurantName, shopName: order.restaurantName, total: order.total.toLocaleString(), estimatedTime: '25-35 min' },
    }).catch(() => {});
  } else if (buyer && wasRejecting) {
    notify({
      userId: buyer.id, phone: buyer.phone, email: buyer.email,
      event: 'order_cancelled',
      data: { userName: buyer.name, orderId: order.id, reason: 'Le restaurant ne peut pas honorer cette commande pour le moment.' },
    }).catch(() => {});
  }

  res.json({ order, message: `Commande ${order.id} : ${status}` });
});

// GET /api/merchants/orders/:id/available-drivers — livreurs disponibles, triés par proximité
router.get('/orders/:id/available-drivers', auth, merchantAuth, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurant?.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });

  const restaurant = restaurants.find(r => r.id === req.restaurant.id);
  const list = drivers
    .filter(d => d.status === 'available' && !d.suspended)
    .map(d => ({
      id: d.id, name: d.name, vehicle: d.vehicle, rating: d.stats?.rating,
      distanceKm: restaurant && d.location?.lat
        ? Math.round(calcDistance(restaurant.lat, restaurant.lng, d.location.lat, d.location.lng) * 10) / 10
        : null,
    }))
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  res.json({ drivers: list, total: list.length });
});

// PUT /api/merchants/orders/:id/assign-driver — le restaurant choisit lui-même le livreur
router.put('/orders/:id/assign-driver', auth, merchantAuth, (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId requis' });

  const order = orders.find(o => o.id === req.params.id && o.restaurantId === req.restaurant?.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (!['preparing', 'ready'].includes(order.status)) {
    return res.status(409).json({ error: "La commande doit être en préparation ou prête pour assigner un livreur" });
  }

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return res.status(404).json({ error: 'Livreur introuvable' });
  if (driver.status !== 'available' || driver.suspended) return res.status(409).json({ error: "Ce livreur n'est plus disponible" });

  order.driver = { id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, rating: driver.stats?.rating };
  order.pingStatus = 'accepted';
  order.pingedDriverId = null;
  order.pingCandidates = [];
  driver.status = 'busy';

  try {
    const { emitOrderStatusChange, emitToUser } = require('../services/realtime');
    emitOrderStatusChange(order.id, order.status, { driver: order.driver, assignedByRestaurant: true });
    emitToUser(driver.id, 'order:ping', {
      orderId: order.id, restaurantName: order.restaurantName, restaurantIcon: order.restaurantIcon,
      items: order.items, subtotal: order.subtotal, deliveryFee: order.deliveryFee, address: order.address, landmark: order.landmark || '', mapsLink: order.mapsLink || null,
      estimatedEarnings: Math.round((order.deliveryFee || 0) * PLATFORM_CONFIG.driverShare),
      assignedByAdmin: true, expiresInSec: 0,
    });
  } catch {}
  try { require('../services/push').pingToDriver(driver.id, order); } catch {}

  res.json({ message: `${driver.name} assigné à la commande ${order.id}`, order });
});

// GET /api/merchants/dishes — les plats du restaurant (lecture seule ; gérés par le super admin)
router.get('/dishes', auth, merchantAuth, (req, res) => {
  const myDishes = dishes.filter(d => d.restaurantId === req.restaurant?.id);
  res.json({ dishes: myDishes.map(enrichDish), total: myDishes.length, maxDishes: PLATFORM_CONFIG.subscriptionPlans[req.merchant.subscription.plan]?.maxDishes });
});

// POST /api/merchants/dishes — le restaurant ajoute un plat à SON menu
router.post('/dishes', auth, merchantAuth, (req, res) => {
  const { period, category, name, price } = req.body;
  if (!period || !category || !name || !price) {
    return res.status(400).json({ error: 'period, category, name et price requis' });
  }
  if (!PERIODS.find(p => p.id === period)) return res.status(400).json({ error: 'Période invalide' });
  if (!CATEGORIES.find(c => c.id === category)) return res.status(400).json({ error: 'Catégorie invalide' });

  const maxDishes = PLATFORM_CONFIG.subscriptionPlans[req.merchant.subscription.plan]?.maxDishes;
  const currentCount = dishes.filter(d => d.restaurantId === req.restaurant.id).length;
  if (maxDishes && currentCount >= maxDishes) {
    return res.status(409).json({ error: `Limite de ${maxDishes} plats atteinte pour ton abonnement actuel` });
  }

  const dish = addDish({ ...req.body, restaurantId: req.restaurant.id });
  res.status(201).json({ dish: enrichDish(dish), message: 'Plat ajouté à ton menu' });
});

// PUT /api/merchants/dishes/:id — modifier un plat de SON menu
router.put('/dishes/:id', auth, merchantAuth, (req, res) => {
  const existing = getDishById(req.params.id);
  if (!existing || existing.restaurantId !== req.restaurant.id) return res.status(404).json({ error: 'Plat introuvable' });
  const { restaurantId, ...patch } = req.body; // le restaurant ne peut pas déplacer un plat vers un autre restaurant
  const dish = updateDish(req.params.id, patch);
  res.json({ dish: enrichDish(dish), message: 'Plat mis à jour' });
});

// DELETE /api/merchants/dishes/:id — retirer un plat de SON menu
router.delete('/dishes/:id', auth, merchantAuth, (req, res) => {
  const existing = getDishById(req.params.id);
  if (!existing || existing.restaurantId !== req.restaurant.id) return res.status(404).json({ error: 'Plat introuvable' });
  deleteDish(req.params.id);
  res.json({ message: 'Plat retiré de ton menu' });
});

// POST /api/merchants/dishes/photo — photo d'un plat envoyee depuis l'appli (image en base64)
// Enregistree dans backend/uploads/dishes et servie sur /uploads/dishes/...
router.post('/dishes/photo', auth, merchantAuth, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { data, ext } = req.body || {};
  const type = String(ext || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  if (!['jpg', 'png', 'webp'].includes(type)) return res.status(400).json({ error: 'Format de photo non accepté (JPG, PNG ou WebP).' });
  const buf = Buffer.from(String(data || ''), 'base64');
  if (buf.length < 1000) return res.status(400).json({ error: 'Photo vide ou illisible.' });
  if (buf.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Photo trop lourde (3 Mo maximum).' });
  // Verifie que c'est bien une image (signature du fichier)
  const sig = buf.subarray(0, 12).toString('hex');
  const isImage = sig.startsWith('ffd8ff') || sig.startsWith('89504e47') || (sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP');
  if (!isImage) return res.status(400).json({ error: "Ce fichier n'est pas une image." });
  const dir = path.join(__dirname, '..', 'uploads', 'dishes');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${req.restaurant.id}-${uuidv4()}.${type}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.status(201).json({ url: `${base}/uploads/dishes/${name}` });
});

// POST /api/merchants/logo : logo du restaurant envoye depuis l'appli (image en base64)
// Affiche a cote du nom du restaurant dans les menus. Enregistre dans uploads/logos.
router.post('/logo', auth, merchantAuth, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  if (!req.restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  const { data, ext } = req.body || {};
  const type = String(ext || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  if (!['jpg', 'png', 'webp'].includes(type)) return res.status(400).json({ error: 'Format non accepté (JPG, PNG ou WebP).' });
  const buf = Buffer.from(String(data || ''), 'base64');
  if (buf.length < 500) return res.status(400).json({ error: 'Image vide ou illisible.' });
  if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Logo trop lourd (2 Mo maximum).' });
  const sig = buf.subarray(0, 12).toString('hex');
  const isImage = sig.startsWith('ffd8ff') || sig.startsWith('89504e47') || (sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP');
  if (!isImage) return res.status(400).json({ error: "Ce fichier n'est pas une image." });
  const dir = path.join(__dirname, '..', 'uploads', 'logos');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${req.restaurant.id}-${uuidv4()}.${type}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  req.restaurant.logo = `${base}/uploads/logos/${name}`;
  res.status(201).json({ url: req.restaurant.logo, message: 'Logo enregistré' });
});

// GET /api/merchants/subscription/plans
router.get('/subscription/plans', (req, res) => {
  res.json({ plans: PLATFORM_CONFIG.subscriptionPlans });
});

// GET /api/merchants/analytics
router.get('/analytics', auth, merchantAuth, (req, res) => {
  const delivered = orders.filter(o => o.restaurantId === req.restaurant?.id && o.status === 'delivered');
  const totalRevenue = delivered.reduce((s, o) => s + (o.subtotal || 0), 0);
  const platformFees = Math.round(totalRevenue * PLATFORM_CONFIG.commissionRate);

  // Gains par plat : quantité vendue + chiffre d'affaires brut + net après commission Wayi
  const dishStats = {};
  delivered.forEach(o => (o.items || []).forEach(i => {
    if (!dishStats[i.name]) dishStats[i.name] = { name: i.name, icon: i.icon, qty: 0, revenue: 0 };
    dishStats[i.name].qty += i.qty;
    dishStats[i.name].revenue += i.price * i.qty;
  }));
  const dishEarnings = Object.values(dishStats)
    .map(d => ({ ...d, net: Math.round(d.revenue * (1 - PLATFORM_CONFIG.commissionRate)) }))
    .sort((a, b) => b.revenue - a.revenue);

  res.json({
    revenue: { total: totalRevenue, platformFees, net: totalRevenue - platformFees, commissionRate: `${PLATFORM_CONFIG.commissionRate * 100}%` },
    orders: { total: delivered.length, avgBasket: delivered.length ? Math.round(totalRevenue / delivered.length) : 0 },
    dishEarnings,
    topDishes: dishEarnings.slice(0, 5),
    rating: req.restaurant?.rating,
    priorityScore: req.restaurant?.priorityScore,
  });
});

module.exports = router;
