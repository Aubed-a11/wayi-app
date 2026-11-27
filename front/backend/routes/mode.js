// ============================================================
// WAYI Bénin : API de l'univers Mode (/api/mode)
// Masquée (404) tant que l'univers n'est pas ouvert pour ce compte.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { auth, verifyToken } = require('../middleware/auth');
const { users, admins } = require('../data/store');
const M = require('../data/mode');

const { mode } = M;
const payTo = (method) => {
  try { const n = require('../services/payment').manualNumbers(); return method === 'mtn' ? n.mtn_momo : method === 'moov' ? n.moov : null; } catch { return null; }
};
const router = express.Router();

// ── Utilitaires ──────────────────────────────────────────────
// Lit le jeton s'il y en a un, sans l'exiger
function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) { try { req.user = verifyToken(token); } catch { /* visiteur */ } }
  next();
}
const clientOf = (req) => (req.user && !req.user.role ? users.find(u => u.id === req.user.id) : null);
const isAdmin = (req) => req.user?.role === 'admin' && admins.some(a => a.id === req.user.id);
const now = () => new Date().toISOString();
const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLong = (v, max = 1500) => String(v ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const userName = (id) => users.find(u => u.id === id)?.name || 'Membre WAYI';
const firstName = (id) => userName(id).split(' ')[0];

// Univers visible pour ce compte ? Sinon la route n'existe pas (404), comme si rien n'était là
function needLive(req, res, next) {
  const user = clientOf(req);
  if (isAdmin(req) || M.modeAccess(user) === 'live') return next();
  return res.status(404).json({ error: `Route ${req.originalUrl} introuvable` });
}
function needClient(req, res, next) {
  const u = clientOf(req);
  if (!u) return res.status(401).json({ error: 'Connecte-toi avec ton compte client WAYI.' });
  req.client = u;
  next();
}

function sellerView(listing, viewerId) {
  const stats = M.sellerStats(listing.sellerId);
  const mine = viewerId === listing.sellerId;
  if (listing.anonymous && !mine) return { anonymous: true, name: 'Vendeur anonyme', initials: null, ...stats };
  const name = userName(listing.sellerId);
  const parts = name.split(' ').filter(Boolean);
  return {
    anonymous: !!listing.anonymous, id: listing.sellerId,
    name: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name,
    initials: parts.slice(0, 2).map(p => p[0]).join('').toUpperCase(),
    ...stats,
  };
}

function card(l, viewerId) {
  return {
    id: l.id, title: l.title, price: l.price, size: l.size, city: l.city,
    category: l.category, categoryLabel: M.label(M.CATEGORIES, l.category),
    condition: l.condition, conditionLabel: M.label(M.CONDITIONS, l.condition),
    photo: l.photos?.[0] || null, photosCount: l.photos?.length || 0,
    anonymous: !!l.anonymous, status: l.status, createdAt: l.createdAt,
    favorite: !!viewerId && (mode.favorites[viewerId] || []).includes(l.id),
    mine: viewerId === l.sellerId,
  };
}

function detail(l, viewerId) {
  return {
    ...card(l, viewerId),
    description: l.description, photos: l.photos || [], views: l.views || 0,
    favoritesCount: Object.values(mode.favorites).filter(f => f.includes(l.id)).length,
    seller: sellerView(l, viewerId),
    deliveryFee: mode.settings.deliveryFee,
  };
}

function validateListing(body, partial = false) {
  const out = {};
  const need = (k) => !partial || k in body;
  if (need('title')) { out.title = clean(body.title, 80); if (out.title.length < 3) return { error: 'Donne un titre à ton annonce (3 caractères minimum).' }; }
  if (need('category')) { if (!M.CATEGORIES.some(c => c.id === body.category)) return { error: 'Choisis une catégorie.' }; out.category = body.category; }
  if (need('size')) { out.size = clean(body.size, 20); if (!out.size) return { error: 'Indique la taille.' }; }
  if (need('condition')) { if (!M.CONDITIONS.some(c => c.id === body.condition)) return { error: "Indique l'état de l'article." }; out.condition = body.condition; }
  if (need('price')) { const p = Math.round(Number(body.price)); if (!Number.isFinite(p) || p < 100 || p > 5000000) return { error: 'Indique un prix entre 100 et 5 000 000 FCFA.' }; out.price = p; }
  if (need('city')) { if (!M.CITIES.includes(body.city)) return { error: 'Choisis ta ville.' }; out.city = body.city; }
  if ('description' in body) out.description = cleanLong(body.description, 1500);
  if ('anonymous' in body) out.anonymous = !!body.anonymous;
  if (need('photos')) {
    const photos = Array.isArray(body.photos) ? body.photos.filter(u => typeof u === 'string' && /^https?:\/\/\S+$/.test(u)).slice(0, mode.settings.maxPhotos) : [];
    if (!photos.length) return { error: 'Ajoute au moins une photo.' };
    out.photos = photos;
  }
  return { data: out };
}

// ── Univers disponibles (appelé par le site au démarrage) ────
// Monté aussi sur /api/verticals
function verticals(req, res) {
  const user = clientOf(req);
  const m = isAdmin(req) ? 'live' : M.modeAccess(user);
  res.json({
    brand: m === 'hidden' ? 'WAYI' : 'WAYI Bénin',
    verticals: [
      { id: 'food', label: 'Restaurant', state: 'live' },
      { id: 'mode', label: 'Mode', state: m },
    ],
  });
}

router.use(optionalAuth);

// ── Administration (back office) ─────────────────────────────
const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'Accès réservé au super admin' }));

function adminListing(l) {
  return {
    ...card(l, null), description: l.description, photos: l.photos, views: l.views || 0,
    seller: { id: l.sellerId, name: userName(l.sellerId), email: users.find(u => u.id === l.sellerId)?.email || null, ...M.sellerStats(l.sellerId) },
    reports: mode.reports.filter(r => r.listingId === l.id && r.status === 'open').length,
    hiddenReason: l.hiddenReason || null,
  };
}

router.get('/admin/overview', auth, adminOnly, (_req, res) => {
  const active = mode.listings.filter(l => l.status === 'active');
  const sellers = new Set(mode.listings.filter(l => l.status !== 'deleted').map(l => l.sellerId));
  const done = mode.orders.filter(o => o.status === 'delivered');
  res.json({
    settings: mode.settings,
    stats: {
      listings: active.length, sellers: sellers.size,
      openReports: mode.reports.filter(r => r.status === 'open').length,
      orders: mode.orders.length, sales: done.length,
      volume: done.reduce((s, o) => s + o.price, 0),
      commission: done.reduce((s, o) => s + o.commission, 0),
      launchSellers: mode.launchSellers.length,
    },
    meta: { categories: M.CATEGORIES, conditions: M.CONDITIONS, cities: M.CITIES, reasons: M.REPORT_REASONS, steps: M.ORDER_STEPS, payments: M.PAYMENT_METHODS, states: M.STATES },
  });
});

router.put('/admin/settings', auth, adminOnly, (req, res) => {
  const s = mode.settings;
  const b = req.body || {};
  if ('state' in b) { if (!M.STATES.includes(b.state)) return res.status(400).json({ error: 'État inconnu' }); s.state = b.state; }
  if ('testers' in b) {
    const list = (Array.isArray(b.testers) ? b.testers : String(b.testers).split(/[\s,;]+/))
      .map(e => String(e).trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    s.testers = [...new Set(list)].slice(0, 50);
  }
  if ('commissionRate' in b) { const r = Number(b.commissionRate); if (!(r >= 0 && r <= 0.5)) return res.status(400).json({ error: 'Commission entre 0 et 50 %' }); s.commissionRate = Math.round(r * 1000) / 1000; }
  if ('deliveryFee' in b) { const f = Math.round(Number(b.deliveryFee)); if (!(f >= 0 && f <= 20000)) return res.status(400).json({ error: 'Frais de livraison invalides' }); s.deliveryFee = f; }
  if (b.launchOffer && typeof b.launchOffer === 'object') {
    const o = b.launchOffer;
    s.launchOffer = {
      enabled: 'enabled' in o ? !!o.enabled : s.launchOffer.enabled,
      sellers: Math.max(0, Math.min(1000, Math.round(Number(o.sellers ?? s.launchOffer.sellers)))),
      sales: Math.max(0, Math.min(100, Math.round(Number(o.sales ?? s.launchOffer.sales)))),
    };
  }
  console.log(`[Mode] Réglages mis à jour par ${req.user.email} : état ${s.state}`);
  res.json({ settings: s });
});

router.get('/admin/listings', auth, adminOnly, (req, res) => {
  const st = req.query.status;
  const list = mode.listings.filter(l => l.status !== 'deleted' && (!st || l.status === st))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ listings: list.map(adminListing) });
});

router.put('/admin/listings/:id', auth, adminOnly, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const { status, reason } = req.body || {};
  if (status === 'hidden') { l.status = 'hidden'; l.hiddenReason = clean(reason, 200) || 'Masquée par la modération'; }
  else if (status === 'active') { l.status = 'active'; l.hiddenReason = null; }
  else return res.status(400).json({ error: 'Statut inconnu' });
  l.updatedAt = now();
  res.json({ listing: adminListing(l) });
});

router.get('/admin/reports', auth, adminOnly, (_req, res) => {
  const list = [...mode.reports].sort((a, b) => (a.status === 'open') === (b.status === 'open') ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1);
  res.json({
    reports: list.map(r => {
      const l = mode.listings.find(x => x.id === r.listingId);
      return { ...r, reasonLabel: M.label(M.REPORT_REASONS, r.reason), reporter: userName(r.userId), listing: l ? adminListing(l) : null };
    }),
  });
});

router.put('/admin/reports/:id', auth, adminOnly, (req, res) => {
  const r = mode.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Signalement introuvable' });
  const { action } = req.body || {};
  if (!['hide', 'dismiss'].includes(action)) return res.status(400).json({ error: 'Action inconnue' });
  const l = mode.listings.find(x => x.id === r.listingId);
  const related = mode.reports.filter(x => x.listingId === r.listingId && x.status === 'open');
  if (action === 'hide' && l) { l.status = 'hidden'; l.hiddenReason = `Signalement : ${M.label(M.REPORT_REASONS, r.reason)}`; l.updatedAt = now(); }
  for (const x of related) { x.status = action === 'hide' ? 'resolved' : 'dismissed'; x.closedAt = now(); }
  res.json({ ok: true });
});

function orderView(o, viewerId) {
  const l = mode.listings.find(x => x.id === o.listingId);
  const asSeller = viewerId === o.sellerId;
  return {
    id: o.id, number: o.number, status: o.status, paymentStatus: o.paymentStatus, method: o.method,
    methodLabel: M.label(M.PAYMENT_METHODS, o.method),
    price: o.price, deliveryFee: o.deliveryFee, total: o.total, createdAt: o.createdAt, history: o.history,
    // Paiement Mobile Money a envoyer au numero WAYI tant qu'il n'est pas confirme
    payTo: o.paymentStatus === 'pending' && o.method !== 'cash' ? payTo(o.method) : null,
    address: o.address, reviewed: mode.reviews.some(r => r.orderId === o.id),
    listing: l ? { id: l.id, title: l.title, photo: l.photos?.[0] || null, size: l.size, city: l.city } : { title: o.title },
    role: asSeller ? 'seller' : 'buyer',
    // Le vendeur voit l'acheteur (pour la remise) ; l'acheteur voit le vendeur selon la visibilité de l'annonce
    counterpart: asSeller
      ? { name: userName(o.buyerId), phone: users.find(u => u.id === o.buyerId)?.phone || null }
      : { name: o.anonymous ? 'Vendeur anonyme' : firstName(o.sellerId) },
    sellerAmount: asSeller ? o.price - o.commission : undefined,
    commission: asSeller ? o.commission : undefined,
    launchOffer: asSeller ? !!o.launchOffer : undefined,
  };
}

router.get('/admin/orders', auth, adminOnly, (_req, res) => {
  res.json({
    orders: [...mode.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(o => ({
      ...orderView(o, o.sellerId), buyer: userName(o.buyerId), buyerPhone: users.find(u => u.id === o.buyerId)?.phone || null,
      seller: userName(o.sellerId), commission: o.commission,
    })),
  });
});

function setOrderStatus(o, status, by) {
  o.status = status;
  o.history.push({ status, at: now(), by });
  const l = mode.listings.find(x => x.id === o.listingId);
  if (l && status === 'delivered') { l.status = 'sold'; l.soldAt = now(); }
  if (l && status === 'cancelled' && l.status === 'reserved') l.status = 'active';
}

router.put('/admin/orders/:id', auth, adminOnly, (req, res) => {
  const o = mode.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const { status, payment } = req.body || {};
  if (payment === 'paid' && o.paymentStatus === 'pending') {
    o.paymentStatus = 'paid';
    if (o.status === 'awaiting_payment') setOrderStatus(o, 'confirmed', 'admin');
  }
  if (status) {
    if (![...M.ORDER_STEPS.map(s => s.id), 'cancelled'].includes(status)) return res.status(400).json({ error: 'Statut inconnu' });
    setOrderStatus(o, status, 'admin');
    if (status === 'delivered' && o.method === 'cash') o.paymentStatus = 'paid';
  }
  res.json({ order: orderView(o, o.sellerId) });
});

// ── À partir d'ici : seulement si l'univers est ouvert pour ce compte ──
router.use(needLive);

router.get('/meta', (_req, res) => {
  const s = mode.settings;
  res.json({
    categories: M.CATEGORIES, conditions: M.CONDITIONS, sizes: M.SIZES, cities: M.CITIES,
    reasons: M.REPORT_REASONS, payments: M.PAYMENT_METHODS, steps: M.ORDER_STEPS,
    deliveryFee: s.deliveryFee, maxPhotos: s.maxPhotos,
    launchOffer: s.launchOffer.enabled && mode.launchSellers.length < s.launchOffer.sellers
      ? { sellers: s.launchOffer.sellers, sales: s.launchOffer.sales, left: s.launchOffer.sellers - mode.launchSellers.length } : null,
  });
});

router.get('/listings', (req, res) => {
  const viewer = clientOf(req)?.id;
  const { q, category, size, condition, city, sort } = req.query;
  const minPrice = Number(req.query.minPrice) || 0;
  const maxPrice = Number(req.query.maxPrice) || Infinity;
  const words = clean(q, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ').filter(Boolean);
  let list = mode.listings.filter(l => l.status === 'active'
    && (!category || l.category === category) && (!size || l.size === size)
    && (!condition || l.condition === condition) && (!city || l.city === city)
    && l.price >= minPrice && l.price <= maxPrice);
  if (words.length) {
    list = list.filter(l => {
      const hay = `${l.title} ${l.description || ''} ${M.label(M.CATEGORIES, l.category)} ${l.size}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return words.every(w => hay.includes(w));
    });
  }
  if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = Math.min(Number(req.query.limit) || 60, 120);
  res.json({ total: list.length, listings: list.slice(0, limit).map(l => card(l, viewer)) });
});

router.get('/listings/:id', (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id);
  const viewer = clientOf(req)?.id;
  if (!l || l.status === 'deleted' || (l.status === 'hidden' && l.sellerId !== viewer)) return res.status(404).json({ error: 'Cette annonce n\'est plus disponible.' });
  if (viewer !== l.sellerId) l.views = (l.views || 0) + 1;
  res.json({ listing: detail(l, viewer) });
});

// Profil du vendeur vu depuis une annonce (ne révèle rien d'une vente anonyme)
router.get('/listings/:id/seller', (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id);
  if (!l || l.status === 'deleted') return res.status(404).json({ error: 'Annonce introuvable' });
  const viewer = clientOf(req)?.id;
  const reviews = mode.reviews.filter(r => r.sellerId === l.sellerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30).map(r => ({ id: r.id, rating: r.rating, comment: r.comment, author: firstName(r.buyerId), createdAt: r.createdAt }));
  const dist = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: mode.reviews.filter(r => r.sellerId === l.sellerId && r.rating === n).length }));
  const others = l.anonymous ? [] : mode.listings.filter(x => x.sellerId === l.sellerId && x.status === 'active' && !x.anonymous && x.id !== l.id).slice(0, 12).map(x => card(x, viewer));
  res.json({ seller: sellerView(l, viewer), reviews, distribution: dist, listings: others });
});

router.get('/mine', auth, needClient, (req, res) => {
  const list = mode.listings.filter(l => l.sellerId === req.client.id && l.status !== 'deleted')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ listings: list.map(l => ({ ...card(l, req.client.id), views: l.views || 0, hiddenReason: l.hiddenReason || null })), stats: M.sellerStats(req.client.id) });
});

router.post('/photos', auth, needClient, (req, res) => {
  const { data, ext } = req.body || {};
  const type = String(ext || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  if (!['jpg', 'png', 'webp'].includes(type)) return res.status(400).json({ error: 'Format de photo non accepté (JPG, PNG ou WebP).' });
  const buf = Buffer.from(String(data || ''), 'base64');
  if (buf.length < 1000) return res.status(400).json({ error: 'Photo vide ou illisible.' });
  if (buf.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Photo trop lourde (3 Mo maximum).' });
  const sig = buf.subarray(0, 12).toString('hex');
  const isImage = sig.startsWith('ffd8ff') || sig.startsWith('89504e47') || (sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP');
  if (!isImage) return res.status(400).json({ error: "Ce fichier n'est pas une image." });
  const dir = path.join(__dirname, '..', 'uploads', 'mode');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${req.client.id}-${uuidv4()}.${type}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.status(201).json({ url: `${base}/uploads/mode/${name}` });
});

router.post('/listings', auth, needClient, (req, res) => {
  const { data, error } = validateListing(req.body || {});
  if (error) return res.status(400).json({ error });
  const mineActive = mode.listings.filter(l => l.sellerId === req.client.id && l.status === 'active').length;
  if (mineActive >= 100) return res.status(429).json({ error: 'Tu as déjà 100 annonces en ligne.' });
  const l = { id: `ann-${uuidv4().slice(0, 8)}`, sellerId: req.client.id, description: '', anonymous: false, ...data, status: 'active', views: 0, createdAt: now(), updatedAt: now() };
  mode.listings.push(l);
  // Offre de lancement : les premiers vendeurs, dans l'ordre de leur première annonce
  const offer = mode.settings.launchOffer;
  let launch = false;
  if (offer.enabled && !mode.launchSellers.includes(req.client.id) && mode.launchSellers.length < offer.sellers) { mode.launchSellers.push(req.client.id); launch = true; }
  res.status(201).json({ listing: detail(l, req.client.id), launchOffer: launch || mode.launchSellers.includes(req.client.id) });
});

router.put('/listings/:id', auth, needClient, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && x.sellerId === req.client.id && x.status !== 'deleted');
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const body = req.body || {};
  if ('status' in body) {
    if (l.status === 'hidden') return res.status(403).json({ error: 'Annonce masquée par la modération. Écris à WAYI pour la rétablir.' });
    if (l.status === 'reserved' || l.status === 'sold') return res.status(409).json({ error: 'Cette annonce a déjà une commande.' });
    if (!['active', 'paused'].includes(body.status)) return res.status(400).json({ error: 'Statut inconnu' });
    l.status = body.status;
  }
  const { data, error } = validateListing(body, true);
  if (error) return res.status(400).json({ error });
  Object.assign(l, data, { updatedAt: now() });
  res.json({ listing: detail(l, req.client.id) });
});

router.delete('/listings/:id', auth, needClient, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && x.sellerId === req.client.id && x.status !== 'deleted');
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.status === 'reserved') return res.status(409).json({ error: 'Une commande est en cours sur cette annonce.' });
  l.status = 'deleted'; l.updatedAt = now();
  res.json({ ok: true });
});

// Favoris
router.get('/favorites', auth, needClient, (req, res) => {
  const ids = mode.favorites[req.client.id] || [];
  const list = ids.map(id => mode.listings.find(l => l.id === id)).filter(l => l && ['active', 'reserved', 'sold'].includes(l.status));
  res.json({ listings: list.map(l => card(l, req.client.id)) });
});
router.post('/favorites/:id', auth, needClient, (req, res) => {
  if (!mode.listings.some(l => l.id === req.params.id && l.status === 'active')) return res.status(404).json({ error: 'Annonce introuvable' });
  const list = mode.favorites[req.client.id] || (mode.favorites[req.client.id] = []);
  if (!list.includes(req.params.id)) list.unshift(req.params.id);
  res.json({ ok: true });
});
router.delete('/favorites/:id', auth, needClient, (req, res) => {
  mode.favorites[req.client.id] = (mode.favorites[req.client.id] || []).filter(id => id !== req.params.id);
  res.json({ ok: true });
});

// Signalement
router.post('/listings/:id/report', auth, needClient, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && x.status !== 'deleted');
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.sellerId === req.client.id) return res.status(400).json({ error: 'Tu ne peux pas signaler ta propre annonce.' });
  const reason = req.body?.reason;
  if (!M.REPORT_REASONS.some(r => r.id === reason)) return res.status(400).json({ error: 'Choisis une raison.' });
  if (mode.reports.some(r => r.listingId === l.id && r.userId === req.client.id && r.status === 'open')) return res.json({ ok: true, already: true });
  mode.reports.push({ id: `sig-${uuidv4().slice(0, 8)}`, listingId: l.id, userId: req.client.id, reason, details: cleanLong(req.body?.details, 500), status: 'open', createdAt: now() });
  res.status(201).json({ ok: true });
});

// ── Messagerie acheteur / vendeur ────────────────────────────
function convView(c, me) {
  const l = mode.listings.find(x => x.id === c.listingId);
  const iAmSeller = c.sellerId === me;
  const otherId = iAmSeller ? c.buyerId : c.sellerId;
  const last = c.messages[c.messages.length - 1];
  const readAt = c.readAt?.[me] || '';
  return {
    id: c.id, listingId: c.listingId,
    listing: l ? { id: l.id, title: l.title, price: l.price, photo: l.photos?.[0] || null, status: l.status } : null,
    role: iAmSeller ? 'seller' : 'buyer',
    other: { name: !iAmSeller && c.anonymous ? 'Vendeur anonyme' : userName(otherId), anonymous: !iAmSeller && c.anonymous },
    last: last ? { text: last.text, at: last.at, mine: last.from === me } : null,
    unread: c.messages.filter(m => m.from !== me && m.at > readAt).length,
    updatedAt: c.updatedAt,
  };
}

router.get('/conversations', auth, needClient, (req, res) => {
  const me = req.client.id;
  const list = mode.conversations.filter(c => c.buyerId === me || c.sellerId === me).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const views = list.map(c => convView(c, me));
  res.json({ conversations: views, unread: views.reduce((s, c) => s + c.unread, 0) });
});

function addMessage(c, from, text) {
  const msg = { id: uuidv4().slice(0, 10), from, text, at: now() };
  c.messages.push(msg);
  if (c.messages.length > 500) c.messages.splice(0, c.messages.length - 500);
  c.updatedAt = msg.at;
  c.readAt = { ...(c.readAt || {}), [from]: msg.at };
  return msg;
}

router.post('/listings/:id/conversation', auth, needClient, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && ['active', 'reserved'].includes(x.status));
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.sellerId === req.client.id) return res.status(400).json({ error: "C'est ton annonce." });
  let c = mode.conversations.find(x => x.listingId === l.id && x.buyerId === req.client.id);
  if (!c) {
    c = { id: `conv-${uuidv4().slice(0, 8)}`, listingId: l.id, buyerId: req.client.id, sellerId: l.sellerId, anonymous: !!l.anonymous, messages: [], readAt: {}, createdAt: now(), updatedAt: now() };
    mode.conversations.push(c);
  }
  const text = cleanLong(req.body?.text, 1000);
  if (text) addMessage(c, req.client.id, text);
  res.status(201).json({ conversation: convView(c, req.client.id) });
});

function myConv(req, res) {
  const c = mode.conversations.find(x => x.id === req.params.id && (x.buyerId === req.client.id || x.sellerId === req.client.id));
  if (!c) { res.status(404).json({ error: 'Conversation introuvable' }); return null; }
  return c;
}

router.get('/conversations/:id', auth, needClient, (req, res) => {
  const c = myConv(req, res); if (!c) return;
  const me = req.client.id;
  c.readAt = { ...(c.readAt || {}), [me]: now() };
  res.json({ conversation: convView(c, me), messages: c.messages.slice(-200).map(m => ({ id: m.id, text: m.text, at: m.at, mine: m.from === me })) });
});

router.post('/conversations/:id/messages', auth, needClient, (req, res) => {
  const c = myConv(req, res); if (!c) return;
  const text = cleanLong(req.body?.text, 1000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const m = addMessage(c, req.client.id, text);
  res.status(201).json({ message: { id: m.id, text: m.text, at: m.at, mine: true } });
});

// ── Commandes ────────────────────────────────────────────────
router.post('/orders', auth, needClient, (req, res) => {
  const { listingId, method, phone, address } = req.body || {};
  const l = mode.listings.find(x => x.id === listingId);
  if (!l || l.status !== 'active') return res.status(409).json({ error: "Cet article n'est plus disponible." });
  if (l.sellerId === req.client.id) return res.status(400).json({ error: 'Tu ne peux pas acheter ton propre article.' });
  if (!M.PAYMENT_METHODS.some(p => p.id === method)) return res.status(400).json({ error: 'Choisis un mode de paiement.' });
  const addr = { label: clean(address?.label, 120), details: clean(address?.details, 200) };
  if (addr.label.length < 3) return res.status(400).json({ error: 'Indique ton adresse de livraison.' });
  const digits = String(phone || req.client.phone || '').replace(/\D/g, '');
  if (method !== 'cash' && digits.length < 8) return res.status(400).json({ error: 'Indique ton numéro Mobile Money.' });
  const { rate, launchOffer } = M.commissionFor(l.sellerId);
  const fee = mode.settings.deliveryFee;
  const o = {
    id: uuidv4(), number: `M${String(mode.orders.length + 1).padStart(5, '0')}`,
    listingId: l.id, title: l.title, buyerId: req.client.id, sellerId: l.sellerId, anonymous: !!l.anonymous,
    price: l.price, deliveryFee: fee, total: l.price + fee,
    commissionRate: rate, commission: Math.round(l.price * rate), launchOffer,
    method, phone: digits || null, address: addr,
    // Mobile Money : en attente de la confirmation du paiement par WAYI ; à la livraison : confirmée tout de suite
    paymentStatus: 'pending', status: method === 'cash' ? 'confirmed' : 'awaiting_payment',
    history: [], createdAt: now(),
  };
  o.history.push({ status: o.status, at: o.createdAt, by: 'buyer' });
  mode.orders.push(o);
  l.status = 'reserved';
  // Un message automatique prévient le vendeur dans la messagerie
  let c = mode.conversations.find(x => x.listingId === l.id && x.buyerId === req.client.id);
  if (!c) { c = { id: `conv-${uuidv4().slice(0, 8)}`, listingId: l.id, buyerId: req.client.id, sellerId: l.sellerId, anonymous: !!l.anonymous, messages: [], readAt: {}, createdAt: now(), updatedAt: now() }; mode.conversations.push(c); }
  addMessage(c, req.client.id, `Commande ${o.number} passée pour « ${l.title} ». Livraison : ${addr.label}.`);
  res.status(201).json({ order: orderView(o, req.client.id) });
});

router.get('/orders', auth, needClient, (req, res) => {
  const me = req.client.id;
  const mine = mode.orders.filter(o => o.buyerId === me || o.sellerId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ purchases: mine.filter(o => o.buyerId === me).map(o => orderView(o, me)), sales: mine.filter(o => o.sellerId === me).map(o => orderView(o, me)) });
});

router.get('/orders/:id', auth, needClient, (req, res) => {
  const o = mode.orders.find(x => x.id === req.params.id && (x.buyerId === req.client.id || x.sellerId === req.client.id));
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: orderView(o, req.client.id) });
});

// Le vendeur remet l'article au livreur ; l'acheteur confirme la réception ou annule avant la remise
router.put('/orders/:id/status', auth, needClient, (req, res) => {
  const o = mode.orders.find(x => x.id === req.params.id && (x.buyerId === req.client.id || x.sellerId === req.client.id));
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const { status } = req.body || {};
  const me = req.client.id;
  const isSeller = o.sellerId === me;
  const allowed =
    (isSeller && status === 'handed' && o.status === 'confirmed') ||
    (!isSeller && status === 'delivered' && ['handed', 'on_the_way'].includes(o.status)) ||
    (status === 'cancelled' && ['awaiting_payment', 'confirmed'].includes(o.status));
  if (!allowed) return res.status(409).json({ error: 'Action impossible à cette étape.' });
  setOrderStatus(o, status, isSeller ? 'seller' : 'buyer');
  if (status === 'delivered' && o.method === 'cash') o.paymentStatus = 'paid';
  res.json({ order: orderView(o, me) });
});

router.post('/orders/:id/review', auth, needClient, (req, res) => {
  const o = mode.orders.find(x => x.id === req.params.id && x.buyerId === req.client.id);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  if (o.status !== 'delivered') return res.status(409).json({ error: 'Tu pourras noter le vendeur après la livraison.' });
  if (mode.reviews.some(r => r.orderId === o.id)) return res.status(409).json({ error: 'Tu as déjà noté cette vente.' });
  const rating = Math.round(Number(req.body?.rating));
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Donne une note de 1 à 5.' });
  mode.reviews.push({ id: `avis-${uuidv4().slice(0, 8)}`, orderId: o.id, sellerId: o.sellerId, buyerId: o.buyerId, rating, comment: cleanLong(req.body?.comment, 500), createdAt: now() });
  res.status(201).json({ ok: true, seller: M.sellerStats(o.sellerId) });
});

module.exports = router;
module.exports.verticals = [optionalAuth, verticals];
