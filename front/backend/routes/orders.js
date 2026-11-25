// ============================================================
// WAYI — Routes Commandes
// Le panier peut contenir des plats de plusieurs restaurants :
// une commande distincte est créée automatiquement par restaurant
// (chacun a sa propre préparation + son propre livreur).
// ============================================================
const express = require('express');
const {
  orders, getOrdersByUser, addOrder, getDishById, getRestaurantById, getUserById,
  calcDistance, calcDeliveryFee, outOfZone, outOfZoneMessage, setOrderStatus, getReceiptByOrderId, addRating, drivers, reviews,
} = require('../data/store');
const { auth } = require('../middleware/auth');
const { sanitizeMapsLink, mapsLinkFromCoords } = require('../utils/mapsLink');
const { paymentMode, PAYMENT_METHODS, methodAvailable } = require('../services/payment');

const router = express.Router();

// GET /api/orders — historique utilisateur (groupé par lot de commande)
router.get('/', auth, (req, res) => {
  const userOrders = getOrdersByUser(req.user.id);
  res.json({ orders: userOrders, total: userOrders.length });
});

// POST /api/orders — créer une ou plusieurs commandes à partir du panier
// body: { items: [{ dishId, qty }], address, paymentMethod, lat, lng }
router.post('/', auth, (req, res) => {
  const { items, address, paymentMethod, lat, lng, mapsLink, landmark } = req.body;
  const cleanLink = sanitizeMapsLink(mapsLink) || mapsLinkFromCoords(lat, lng);
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Panier vide' });
  if (items.length > 50) return res.status(400).json({ error: 'Panier trop grand' });
  // Quantite entiere entre 1 et 50 par plat : une quantite negative ou enorme fausserait le total
  for (const it of items) {
    const q = it?.qty === undefined ? 1 : Number(it.qty);
    if (!Number.isInteger(q) || q < 1 || q > 50) return res.status(400).json({ error: 'Quantité invalide (entre 1 et 50 par plat).' });
  }

  // Moyen de paiement : connu, et disponible. On refuse AVANT de créer la commande,
  // pour ne jamais laisser une commande "fantôme" sans paiement possible.
  const method = paymentMethod || 'cash';
  const known = PAYMENT_METHODS.find(m => m.id === method && !m.comingSoon);
  if (!known) return res.status(400).json({ error: "Moyen de paiement inconnu." });
  if (!methodAvailable(method)) {
    return res.status(409).json({ error: paymentMode() === 'manual'
      ? "Ce moyen de paiement n'est pas encore disponible. Choisis MTN MoMo, Moov Money ou « Espèces à la livraison »."
      : "Le paiement en ligne n'est pas encore activé. Choisis « Espèces à la livraison »." });
  }

  // Regrouper les articles par restaurant
  const groups = {};
  for (const it of items) {
    const dish = getDishById(it.dishId);
    if (!dish) return res.status(404).json({ error: `Plat introuvable : ${it.dishId}` });
    // Les plats de démonstration n'ont pas de vrai restaurant derrière : personne ne les préparerait.
    // Pour tester le parcours complet, définir ALLOW_DEMO_ORDERS=1 dans le .env du serveur.
    if (dish.demo && process.env.ALLOW_DEMO_ORDERS !== '1') {
      return res.status(409).json({ error: `« ${dish.name} » est un plat d'exemple : ce restaurant n'est pas encore partenaire de WAYI. La commande sera ouverte très bientôt.` });
    }
    if (!groups[dish.restaurantId]) groups[dish.restaurantId] = [];
    groups[dish.restaurantId].push({ dish, qty: it.qty || 1 });
  }

  const batchId = `LOT-${Date.now()}`;
  const createdOrders = [];

  // Abonnement client actif ? La livraison est alors gratuite sur toute commande
  // tant que l'abonnement n'a pas expiré.
  const buyer = getUserById(req.user.id);
  const hasActiveSubscription = !!(buyer?.subscription?.active && new Date(buyer.subscription.expiresAt) > new Date());

  // Point hors zone (ex : GPS du telephone a l'etranger) : on refuse avant de creer quoi que ce soit
  if (lat && lng) {
    const far = Math.max(...Object.keys(groups).map(rid => { const r = getRestaurantById(rid); return r?.lat ? calcDistance(lat, lng, r.lat, r.lng) : 0; }));
    if (outOfZone(far)) return res.status(422).json({ error: outOfZoneMessage(far), outOfZone: true });
  }

  // Code promo de bienvenue : premiere commande uniquement (toutes les commandes de ce panier)
  const { welcomeDiscount, discountAmount } = require('../services/promo');
  const promo = welcomeDiscount(buyer);

  for (const [restaurantId, dishItems] of Object.entries(groups)) {
    const restaurant = getRestaurantById(restaurantId);
    const subtotal = dishItems.reduce((s, i) => s + i.dish.price * i.qty, 0);

    const distKm = lat && lng ? calcDistance(lat, lng, restaurant.lat, restaurant.lng) : 2;
    const deliveryFee = hasActiveSubscription ? 0 : calcDeliveryFee(distKm);
    const discount = discountAmount(promo, subtotal);
    const total = subtotal + deliveryFee - discount;

    const order = {
      id: `WY-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`,
      batchId,
      userId: req.user.id,
      restaurantId,
      restaurantName: restaurant.name,
      restaurantIcon: restaurant.icon,
      status: 'pending',
      statusHistory: [{ status: 'pending', label: 'En attente de confirmation du restaurant', time: new Date().toISOString() }],
      items: dishItems.map(i => ({ dishId: i.dish.id, name: i.dish.name, icon: i.dish.icon, price: i.dish.price, qty: i.qty })),
      subtotal,
      deliveryFee,
      freeDeliveryApplied: hasActiveSubscription,
      discount,
      promoCode: discount > 0 ? promo.code : null,
      total,
      address: address || 'Adresse par défaut',
      landmark: landmark ? String(landmark).trim().slice(0, 200) : '',
      mapsLink: cleanLink || null,
      lat: lat ?? null,
      lng: lng ?? null,
      paymentMethod: paymentMethod || 'cash',
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      driver: null,
      pingStatus: 'pending',
      pingCandidates: [],
      pingedDriverId: null,
      pingExpiresAt: null,
      rating: null,
      review: null,
    };

    addOrder(order);
    createdOrders.push(order);

    // Le restaurant doit explicitement accepter ou rejeter la commande avant que quoi que
    // ce soit d'autre ne se passe : pas de notification "confirmée" au client, pas de
    // recherche de livreur tant que ce n'est pas fait (voir PUT /api/merchants/orders/:id/status).
    // On prévient simplement le restaurant en temps réel qu'une nouvelle commande attend.
    try {
      const { emitToUser } = require('../services/realtime');
      emitToUser(restaurantId, 'order:new_pending', { orderId: order.id });
    } catch {}
    try { require('../services/push').newOrderToRestaurant(order); } catch {}
  }

  res.status(201).json({
    batchId,
    orders: createdOrders,
    total: createdOrders.reduce((s, o) => s + o.total, 0),
    message: createdOrders.length > 1
      ? `${createdOrders.length} commandes créées (une par restaurant)`
      : 'Commande passée avec succès !',
  });
});

// POST /api/orders/quote — frais de livraison et total EXACTS avant commande
// (memes calculs que la creation de commande). body: { items: [{ dishId, qty }] }
router.post('/quote', auth, (req, res) => {
  const { cartSummary, sanitizeCart } = require('../services/ai/tools');
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Client introuvable' });
  const cart = sanitizeCart((req.body?.items || []).map(i => ({ id: i.dishId, qty: i.qty })));
  const { point } = require('../utils/tracking');
  const s = cartSummary(user, cart, point(req.body?.lat, req.body?.lng));
  res.json({ outOfZone: !!s.hors_zone, outOfZoneMessage: s.hors_zone || null, subtotal: s.sous_total, deliveryFee: s.frais_livraison, discount: s.reduction || 0, promoCode: s.code_promo || null, promoLabel: s.code_promo_libelle || null, total: s.total, freeDelivery: s.livraison_gratuite_abonnement, restaurants: s.restaurants.map(r => ({ name: r.restaurant, deliveryFee: r.frais_livraison })) });
});

// GET /api/orders/:id — détail + suivi
router.get('/:id', auth, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });

  const steps = [
    { key: 'pending',    label: 'Commande envoyée',    sub: `En attente de confirmation de ${order.restaurantName}`, done: true },
    { key: 'confirmed',  label: 'Commande confirmée',  sub: `${order.restaurantName} a accepté ta commande`, done: ['preparing', 'ready', 'on_the_way', 'delivered'].includes(order.status) },
    { key: 'preparing',  label: 'En préparation',      sub: `${order.restaurantName} prépare ton plat`, done: ['preparing', 'ready', 'on_the_way', 'delivered'].includes(order.status) },
    { key: 'ready',      label: 'Plat prêt',           sub: order.driver ? `${order.driver.name} va venir le récupérer` : 'En attente du livreur', done: ['ready', 'on_the_way', 'delivered'].includes(order.status) },
    { key: 'on_the_way', label: 'Livreur en route',    sub: `${order.driver?.name || 'Ton livreur'} arrive bientôt`, done: ['on_the_way', 'delivered'].includes(order.status) },
    { key: 'delivered',  label: 'Livré !',             sub: 'Bon appétit !', done: order.status === 'delivered' },
  ];

  // Carte de suivi : positions du restaurant, du point de livraison et du livreur
  const { buildTracking } = require('../utils/tracking');
  res.json({ ...order, steps, tracking: buildTracking(order) });
});

// GET /api/orders/:id/receipt — reçu détaillé (disponible une fois payé/livré)
router.get('/:id/receipt', auth, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const receipt = getReceiptByOrderId(order.id);
  if (!receipt) return res.status(404).json({ error: 'Reçu pas encore disponible' });
  res.json(receipt);
});

// PUT /api/orders/:id/rate — noter séparément le plat, le livreur, et le service
router.put('/:id/rate', auth, (req, res) => {
  const { dishRating, driverRating, serviceRating, review } = req.body;
  const ratings = { dishRating, driverRating, serviceRating };
  const provided = Object.values(ratings).filter(r => r !== undefined && r !== null);
  if (!provided.length) return res.status(400).json({ error: 'Au moins une note (plat, livreur ou service) est requise' });
  for (const [key, val] of Object.entries(ratings)) {
    if (val !== undefined && val !== null && (val < 1 || val > 5)) {
      return res.status(400).json({ error: `${key} doit être entre 1 et 5` });
    }
  }

  const order = orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.status !== 'delivered') return res.status(409).json({ error: 'Tu pourras noter cette commande une fois livrée.' });
  if (order.dishRating || order.driverRating || order.serviceRating) {
    return res.status(409).json({ error: 'Cette commande a déjà été notée' });
  }

  if (dishRating) {
    order.dishRating = dishRating;
    const restaurant = getRestaurantById(order.restaurantId);
    addRating(restaurant, dishRating);
    if (review) reviews.push({ restaurantId: order.restaurantId, rating: dishRating, comment: review });
  }
  if (driverRating && order.driver?.id) {
    order.driverRating = driverRating;
    const driver = drivers.find(d => d.id === order.driver.id);
    if (driver) addRating(driver.stats, driverRating);
  }
  if (serviceRating) {
    order.serviceRating = serviceRating;
  }
  order.review = review || null;

  res.json({ order, message: 'Merci pour ton avis !' });
});

// DELETE /api/orders/:id — annuler
router.delete('/:id', auth, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.status !== 'pending') return res.status(400).json({ error: "Impossible d'annuler : le restaurant a déjà répondu à cette commande" });
  setOrderStatus(order.id, 'cancelled'); // garde la trace dans l'historique de la commande
  try {
    const { emitToUser, emitOrderStatusChange } = require('../services/realtime');
    emitToUser(order.restaurantId, 'order:cancelled_by_client', { orderId: order.id });
    emitOrderStatusChange(order.id, 'cancelled', {});
  } catch {}
  res.json({ message: 'Commande annulée avec succès' });
});

module.exports = router;
