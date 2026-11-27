// ============================================================
// WAYI Bénin : API de l'univers Mode (/api/mode)
// Masquée (404) tant que l'univers n'est pas ouvert pour ce compte.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { auth, verifyToken, signToken } = require('../middleware/auth');
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
const SHOP_LABEL = 'Boutique partenaire WAYI';
const shopById = (id) => mode.shops.find(x => x.id === id);
const userName = (id) => users.find(u => u.id === id)?.name || shopById(id)?.name || 'Membre WAYI';
// Compte boutique connecté (jeton role 'shop', boutique active)
const shopOf = (req) => (req.user?.role === 'shop' ? mode.shops.find(x => x.id === req.user.id && x.active && (x.pv || 0) === (req.user.pv || 0)) : null);
const firstName = (id) => userName(id).split(' ')[0];

// Univers visible pour ce compte ? Sinon la route n'existe pas (404), comme si rien n'était là
function needLive(req, res, next) {
  const user = clientOf(req);
  // Les boutiques préparent leur catalogue même quand le Mode est masqué
  if (isAdmin(req) || shopOf(req) || M.modeAccess(user) === 'live') return next();
  return res.status(404).json({ error: `Route ${req.originalUrl} introuvable` });
}
// Client ou boutique : celui qui agit (vendeur, participant d'une conversation...)
function needActor(req, res, next) {
  const shop = shopOf(req);
  if (shop) { req.actor = { id: shop.id, kind: 'shop', shop }; return next(); }
  const u = clientOf(req);
  if (!u) return res.status(401).json({ error: 'Connecte-toi avec ton compte WAYI.' });
  req.client = u; req.actor = { id: u.id, kind: 'client' };
  next();
}
function needShop(req, res, next) {
  const shop = shopOf(req);
  if (!shop) return res.status(401).json({ error: 'Connecte-toi avec ton compte boutique.' });
  req.shop = shop; req.actor = { id: shop.id, kind: 'shop', shop };
  next();
}
const stockOf = (l) => (l.variants || []).reduce((n, v) => n + v.qty, 0);
const sizesOf = (l) => (l.variants ? l.variants.filter(v => v.qty > 0).map(v => v.size) : [l.size]);
function needClient(req, res, next) {
  const u = clientOf(req);
  if (!u) return res.status(401).json({ error: 'Connecte-toi avec ton compte client WAYI.' });
  req.client = u;
  next();
}

function sellerView(listing, viewerId) {
  const stats = M.sellerStats(listing.sellerId);
  const mine = viewerId === listing.sellerId;
  // Boutique partenaire : son nom reste caché, comme les restaurants
  if (listing.shopId) return mine ? { shop: true, name: shopById(listing.shopId)?.name || SHOP_LABEL, ...stats } : { shop: true, verified: true, name: SHOP_LABEL, initials: null, ...stats };
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
    id: l.id, title: l.title, price: l.price, size: l.variants ? (sizesOf(l).join(' / ') || l.size) : l.size, city: l.city,
    shop: !!l.shopId, sizes: sizesOf(l),
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
    variants: l.variants ? l.variants.map(v => ({ size: v.size, available: v.qty > 0, low: v.qty > 0 && v.qty <= 2, ...(viewerId === l.sellerId ? { qty: v.qty } : {}) })) : null,
  };
}

function validateListing(body, partial = false, isShop = false) {
  const out = {};
  const need = (k) => !partial || k in body;
  if (isShop && need('variants')) {
    const list = (Array.isArray(body.variants) ? body.variants : [])
      .map(v => ({ size: clean(v?.size, 20), qty: Math.max(0, Math.min(999, Math.round(Number(v?.qty) || 0))) }))
      .filter(v => v.size);
    const seen = new Set();
    out.variants = list.filter(v => !seen.has(v.size) && seen.add(v.size)).slice(0, 30);
    if (!out.variants.length) return { error: 'Ajoute au moins une taille avec sa quantité.' };
    if (!partial && !out.variants.some(v => v.qty > 0)) return { error: 'Indique la quantité en stock.' };
    out.size = out.variants.map(v => v.size).join(' / ');
    body = { ...body, size: out.size };
  }
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

// Verrou propre au tableau de bord Mode : en plus de la connexion admin, un code d'accès
// (choisi par l'admin, gardé chiffré) ouvre une session Mode de 2 heures.
const jwt = require('jsonwebtoken');
const SEC = mode.security;
const MAX_TRIES = 5, LOCK_MIN = 15, SESSION = '2h';
const modeSecret = () => `${process.env.JWT_SECRET || 'wayi_secret_key_change_in_production'}:mode-admin`;
function audit(req, event, ok = true) {
  SEC.log.unshift({ at: now(), event, ok, admin: req.user?.email || null, ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 45) });
  SEC.log.length = Math.min(SEC.log.length, 60);
}
const lockedFor = () => (SEC.lockedUntil && new Date(SEC.lockedUntil) > new Date() ? Math.ceil((new Date(SEC.lockedUntil) - new Date()) / 60000) : 0);
function modeAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Accès réservé au super admin' });
  const t = req.headers['x-mode-token'];
  try {
    const p = jwt.verify(String(t || ''), modeSecret());
    if (p.scope === 'mode-admin' && p.sub === req.user.id && p.cv === SEC.codeVersion && SEC.codeHash) return next();
  } catch { /* session Mode absente ou expirée */ }
  return res.status(423).json({ error: 'Tableau de bord Mode verrouillé', code: 'MODE_LOCKED' });
}
const issueModeToken = (req) => jwt.sign({ sub: req.user.id, scope: 'mode-admin', cv: SEC.codeVersion }, modeSecret(), { expiresIn: SESSION });
const strongCode = (c) => typeof c === 'string' && c.length >= 6 && c.length <= 64;

router.get('/admin/lock', auth, adminOnly, (_req, res) => {
  res.json({ hasCode: !!SEC.codeHash, lockedMinutes: lockedFor() });
});
router.post('/admin/lock/setup', auth, adminOnly, async (req, res) => {
  if (SEC.codeHash) return res.status(409).json({ error: "Un code d'accès existe déjà." });
  const code = String(req.body?.code || '');
  if (!strongCode(code)) return res.status(400).json({ error: '6 caractères minimum.' });
  SEC.codeHash = await bcrypt.hash(code, 10); SEC.codeVersion += 1; SEC.failures = 0; SEC.lockedUntil = null;
  audit(req, "Code d'accès créé");
  res.status(201).json({ modeToken: issueModeToken(req) });
});
router.post('/admin/unlock', auth, adminOnly, async (req, res) => {
  if (!SEC.codeHash) return res.status(409).json({ error: "Crée d'abord le code d'accès." });
  const wait = lockedFor();
  if (wait) return res.status(429).json({ error: `Trop d'essais. Réessaie dans ${wait} min.` });
  const ok = await bcrypt.compare(String(req.body?.code || ''), SEC.codeHash).catch(() => false);
  if (!ok) {
    SEC.failures += 1;
    if (SEC.failures >= MAX_TRIES) { SEC.lockedUntil = new Date(Date.now() + LOCK_MIN * 60000).toISOString(); SEC.failures = 0; }
    audit(req, 'Code incorrect', false);
    const left = SEC.lockedUntil && lockedFor() ? 0 : MAX_TRIES - SEC.failures;
    return res.status(401).json({ error: left ? `Code incorrect. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.` : `Code incorrect. Accès bloqué ${LOCK_MIN} min.` });
  }
  SEC.failures = 0; SEC.lockedUntil = null;
  audit(req, 'Ouverture');
  res.json({ modeToken: issueModeToken(req) });
});
router.post('/admin/lock/change', auth, modeAdmin, async (req, res) => {
  const { current, next: nextCode } = req.body || {};
  if (!await bcrypt.compare(String(current || ''), SEC.codeHash).catch(() => false)) { audit(req, 'Changement de code refusé', false); return res.status(401).json({ error: 'Code actuel incorrect' }); }
  if (!strongCode(String(nextCode || ''))) return res.status(400).json({ error: '6 caractères minimum.' });
  SEC.codeHash = await bcrypt.hash(String(nextCode), 10); SEC.codeVersion += 1; // toutes les sessions Mode ouvertes sont fermées
  audit(req, "Code d'accès changé");
  res.json({ modeToken: issueModeToken(req) });
});
router.get('/admin/lock/log', auth, modeAdmin, (_req, res) => res.json({ log: SEC.log }));

function adminListing(l) {
  return {
    ...card(l, null), description: l.description, photos: l.photos, views: l.views || 0,
    seller: { id: l.sellerId, name: userName(l.sellerId), shop: !!l.shopId, email: users.find(u => u.id === l.sellerId)?.email || shopById(l.sellerId)?.email || null, ...M.sellerStats(l.sellerId) },
    variants: l.variants || null, stock: l.variants ? stockOf(l) : null,
    reports: mode.reports.filter(r => r.listingId === l.id && r.status === 'open').length,
    hiddenReason: l.hiddenReason || null,
  };
}

router.get('/admin/overview', auth, modeAdmin, (_req, res) => {
  const active = mode.listings.filter(l => l.status === 'active');
  const sellers = new Set(mode.listings.filter(l => l.status !== 'deleted').map(l => l.sellerId));
  const done = mode.orders.filter(o => o.status === 'delivered');
  res.json({
    settings: mode.settings,
    security: { sessionHours: 2, lastAccess: SEC.log.find(l => l.event === 'Ouverture') || null, failedRecently: SEC.log.filter(l => !l.ok && new Date(l.at) > new Date(Date.now() - 86400000)).length },
    stats: {
      listings: active.length, sellers: sellers.size,
      openReports: mode.reports.filter(r => r.status === 'open').length,
      orders: mode.orders.length, sales: done.length,
      volume: done.reduce((s, o) => s + o.price, 0),
      commission: done.reduce((s, o) => s + o.commission, 0),
      launchSellers: mode.launchSellers.length,
      shops: mode.shops.filter(x => x.active).length,
    },
    meta: { categories: M.CATEGORIES, conditions: M.CONDITIONS, cities: M.CITIES, reasons: M.REPORT_REASONS, steps: M.ORDER_STEPS, payments: M.PAYMENT_METHODS, states: M.STATES },
  });
});

router.put('/admin/settings', auth, modeAdmin, (req, res) => {
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

router.get('/admin/listings', auth, modeAdmin, (req, res) => {
  const st = req.query.status;
  const list = mode.listings.filter(l => l.status !== 'deleted' && (!st || l.status === st))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ listings: list.map(adminListing) });
});

router.put('/admin/listings/:id', auth, modeAdmin, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const { status, reason } = req.body || {};
  if (status === 'hidden') { l.status = 'hidden'; l.hiddenReason = clean(reason, 200) || 'Masquée par la modération'; }
  else if (status === 'active') { l.status = 'active'; l.hiddenReason = null; }
  else return res.status(400).json({ error: 'Statut inconnu' });
  l.updatedAt = now();
  res.json({ listing: adminListing(l) });
});

router.get('/admin/reports', auth, modeAdmin, (_req, res) => {
  const list = [...mode.reports].sort((a, b) => (a.status === 'open') === (b.status === 'open') ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1);
  res.json({
    reports: list.map(r => {
      const l = mode.listings.find(x => x.id === r.listingId);
      return { ...r, reasonLabel: M.label(M.REPORT_REASONS, r.reason), reporter: userName(r.userId), listing: l ? adminListing(l) : null };
    }),
  });
});

router.put('/admin/reports/:id', auth, modeAdmin, (req, res) => {
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
    listing: l ? { id: l.id, title: l.title, photo: l.photos?.[0] || null, size: o.size || l.size, city: l.city } : { title: o.title, size: o.size },
    size: o.size || null, shop: !!o.shopId,
    role: asSeller ? 'seller' : 'buyer',
    // Le vendeur voit l'acheteur (pour la remise) ; l'acheteur voit le vendeur selon la visibilité de l'annonce
    counterpart: asSeller
      ? { name: userName(o.buyerId), phone: users.find(u => u.id === o.buyerId)?.phone || null }
      : { name: o.shopId ? SHOP_LABEL : o.anonymous ? 'Vendeur anonyme' : firstName(o.sellerId) },
    sellerAmount: asSeller ? o.price - o.commission : undefined,
    commission: asSeller ? o.commission : undefined,
    launchOffer: asSeller ? !!o.launchOffer : undefined,
  };
}

router.get('/admin/orders', auth, modeAdmin, (_req, res) => {
  res.json({
    orders: [...mode.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(o => ({
      ...orderView(o, o.sellerId), buyer: userName(o.buyerId), buyerPhone: users.find(u => u.id === o.buyerId)?.phone || null,
      seller: userName(o.sellerId), shop: !!o.shopId, commission: o.commission,
    })),
  });
});

function setOrderStatus(o, status, by) {
  o.status = status;
  o.history.push({ status, at: now(), by });
  const l = mode.listings.find(x => x.id === o.listingId);
  if (l?.variants) {
    // Boutique : la pièce revient en stock si la commande est annulée
    if (status === 'cancelled') { const v = l.variants.find(x => x.size === o.size); if (v) v.qty += 1; if (l.status === 'sold' && stockOf(l) > 0) l.status = 'active'; }
    return;
  }
  if (l && status === 'delivered') { l.status = 'sold'; l.soldAt = now(); }
  if (l && status === 'cancelled' && l.status === 'reserved') l.status = 'active';
}

router.put('/admin/orders/:id', auth, modeAdmin, (req, res) => {
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

// ── Boutiques partenaires (comptes créés par WAYI) ───────────
const safeShop = ({ password: _p, failedLogins: _f, lockedUntil: _l, pv: _v, ...x }) => x;
// Jeton boutique lié à la version du mot de passe : le changer déconnecte les autres appareils
const shopToken = (shop) => signToken({ id: shop.id, role: 'shop', email: shop.email, pv: shop.pv || 0 });
function shopStats(id) {
  const ls = mode.listings.filter(l => l.sellerId === id && l.status !== 'deleted');
  const os = mode.orders.filter(o => o.sellerId === id);
  const done = os.filter(o => o.status === 'delivered');
  return {
    listings: ls.filter(l => l.status === 'active').length, soldOut: ls.filter(l => l.status === 'sold').length,
    stock: ls.reduce((n, l) => n + (l.variants ? stockOf(l) : 0), 0),
    toPrepare: os.filter(o => o.status === 'confirmed').length,
    inProgress: os.filter(o => ['awaiting_payment', 'confirmed', 'handed', 'on_the_way'].includes(o.status)).length,
    sales: done.length, earned: done.reduce((n, o) => n + o.price - o.commission, 0),
    ...M.sellerStats(id),
  };
}

router.get('/admin/shops', auth, modeAdmin, (_req, res) => {
  res.json({ shops: mode.shops.map(x => ({ ...safeShop(x), stats: shopStats(x.id) })) });
});

router.post('/admin/shops', auth, modeAdmin, async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Nom de la boutique requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'E-mail invalide' });
  if (mode.shops.some(x => x.email === email)) return res.status(409).json({ error: 'Cet e-mail a déjà un compte boutique' });
  const rate = b.commissionRate === '' || b.commissionRate == null ? null : Number(b.commissionRate);
  if (rate !== null && !(rate >= 0 && rate <= 0.5)) return res.status(400).json({ error: 'Commission entre 0 et 50 %' });
  const temp = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase();
  const shop = {
    id: `shop-${uuidv4().slice(0, 8)}`, name, email, password: await bcrypt.hash(temp, 10),
    contactName: clean(b.contactName, 80), phone: clean(b.phone, 30), city: M.CITIES.includes(b.city) ? b.city : 'Cotonou',
    commissionRate: rate, active: true, createdAt: now(),
    mustChangePassword: true, pv: 0, failedLogins: 0, lockedUntil: null,
  };
  mode.shops.push(shop);
  let mail = null;
  try {
    const { sendEmail } = require('../services/notifications');
    const mails = require('../services/email/templates');
    mail = await sendEmail({
      to: email, subject: 'Bienvenue chez WAYI, ton espace boutique',
      html: mails.welcomeAccount({ name: shop.contactName || name, role: `boutique partenaire (${name})`, email, password: temp, url: 'https://admin.wayibenin.com', extra: 'Dans ton espace boutique, tu publies tes articles avec leurs tailles et ton stock, puis tu prépares les commandes que WAYI t\'envoie.' }),
    });
  } catch { mail = null; }
  const failed = !mail?.success;
  res.status(201).json({
    shop: safeShop(shop), emailSent: !failed && !mail?.simulated,
    devPassword: (failed || (mail?.simulated && process.env.NODE_ENV !== 'production')) ? temp : undefined,
  });
});

router.put('/admin/shops/:id', auth, modeAdmin, (req, res) => {
  const shop = shopById(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
  const b = req.body || {};
  if ('active' in b) {
    shop.active = !!b.active;
    // Boutique suspendue : ses articles sortent du catalogue
    for (const l of mode.listings) if (l.shopId === shop.id && l.status === 'active' && !shop.active) { l.status = 'paused'; l.pausedBy = 'admin'; }
    if (shop.active) for (const l of mode.listings) if (l.shopId === shop.id && l.pausedBy === 'admin') { l.status = stockOf(l) > 0 ? 'active' : 'sold'; delete l.pausedBy; }
  }
  if ('name' in b && clean(b.name, 80).length >= 2) shop.name = clean(b.name, 80);
  if ('phone' in b) shop.phone = clean(b.phone, 30);
  if ('contactName' in b) shop.contactName = clean(b.contactName, 80);
  if ('city' in b && M.CITIES.includes(b.city)) shop.city = b.city;
  if ('commissionRate' in b) {
    const rate = b.commissionRate === '' || b.commissionRate == null ? null : Number(b.commissionRate);
    if (rate !== null && !(rate >= 0 && rate <= 0.5)) return res.status(400).json({ error: 'Commission entre 0 et 50 %' });
    shop.commissionRate = rate;
  }
  res.json({ shop: { ...safeShop(shop), stats: shopStats(shop.id) } });
});

// Connexion de la boutique (espace pro, admin.wayibenin.com)
router.post('/shop/login', async (req, res) => {
  const email = clean(req.body?.email, 120).toLowerCase();
  const shop = mode.shops.find(x => x.email === email);
  if (shop?.lockedUntil && new Date(shop.lockedUntil) > new Date()) {
    return res.status(429).json({ error: `Trop d'essais. Réessaie dans ${Math.ceil((new Date(shop.lockedUntil) - new Date()) / 60000)} min.` });
  }
  const ok = shop && await bcrypt.compare(String(req.body?.password || ''), shop.password).catch(() => false);
  if (!ok) {
    if (shop) {
      shop.failedLogins = (shop.failedLogins || 0) + 1;
      if (shop.failedLogins >= 5) { shop.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString(); shop.failedLogins = 0; }
    }
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  if (!shop.active) return res.status(403).json({ error: 'Compte boutique suspendu. Contacte WAYI.' });
  shop.failedLogins = 0; shop.lockedUntil = null; shop.lastLoginAt = now();
  res.json({ token: shopToken(shop), shop: safeShop(shop) });
});

router.get('/shop/me', auth, needShop, (req, res) => {
  res.json({ shop: safeShop(req.shop), stats: shopStats(req.shop.id), modeState: mode.settings.state, meta: { categories: M.CATEGORIES, conditions: M.CONDITIONS, sizes: M.SIZES, maxPhotos: mode.settings.maxPhotos, commissionRate: req.shop.commissionRate ?? mode.settings.commissionRate } });
});

router.put('/shop/password', auth, needShop, async (req, res) => {
  const { current, next: nextPw } = req.body || {};
  if (!await bcrypt.compare(String(current || ''), req.shop.password).catch(() => false)) return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
  if (String(nextPw || '').length < 8) return res.status(400).json({ error: '8 caractères minimum' });
  if (String(nextPw) === String(current)) return res.status(400).json({ error: 'Choisis un mot de passe différent.' });
  req.shop.password = await bcrypt.hash(String(nextPw), 10);
  req.shop.pv = (req.shop.pv || 0) + 1; req.shop.mustChangePassword = false;
  res.json({ ok: true, token: shopToken(req.shop) });
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
    && (!category || l.category === category) && (!size || sizesOf(l).includes(size))
    && (!req.query.source || (req.query.source === 'shop' ? !!l.shopId : !l.shopId))
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
  const others = l.anonymous && !l.shopId ? [] : mode.listings.filter(x => x.sellerId === l.sellerId && x.status === 'active' && !x.anonymous && x.id !== l.id).slice(0, 12).map(x => card(x, viewer));
  res.json({ seller: sellerView(l, viewer), reviews, distribution: dist, listings: others });
});

router.get('/mine', auth, needActor, (req, res) => {
  const me = req.actor.id;
  const list = mode.listings.filter(l => l.sellerId === me && l.status !== 'deleted')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ listings: list.map(l => ({ ...card(l, me), views: l.views || 0, hiddenReason: l.hiddenReason || null, variants: l.variants || null, stock: l.variants ? stockOf(l) : null, description: l.description, photos: l.photos })), stats: M.sellerStats(me) });
});

router.post('/photos', auth, needActor, (req, res) => {
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
  const name = `${req.actor.id}-${uuidv4()}.${type}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const base = (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.status(201).json({ url: `${base}/uploads/mode/${name}` });
});

router.post('/listings', auth, needActor, (req, res) => {
  const isShop = req.actor.kind === 'shop';
  const { data, error } = validateListing(req.body || {}, false, isShop);
  if (error) return res.status(400).json({ error });
  const mineActive = mode.listings.filter(l => l.sellerId === req.actor.id && l.status === 'active').length;
  if (mineActive >= (isShop ? 1000 : 100)) return res.status(429).json({ error: `Tu as déjà ${isShop ? 1000 : 100} annonces en ligne.` });
  const l = { id: `ann-${uuidv4().slice(0, 8)}`, sellerId: req.actor.id, description: '', anonymous: false, ...data, ...(isShop ? { shopId: req.actor.id, anonymous: false } : {}), status: 'active', views: 0, createdAt: now(), updatedAt: now() };
  mode.listings.push(l);
  if (isShop) return res.status(201).json({ listing: detail(l, req.actor.id) });
  // Offre de lancement : les premiers vendeurs, dans l'ordre de leur première annonce
  const offer = mode.settings.launchOffer;
  let launch = false;
  if (offer.enabled && !mode.launchSellers.includes(req.client.id) && mode.launchSellers.length < offer.sellers) { mode.launchSellers.push(req.client.id); launch = true; }
  res.status(201).json({ listing: detail(l, req.client.id), launchOffer: launch || mode.launchSellers.includes(req.client.id) });
});

router.put('/listings/:id', auth, needActor, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && x.sellerId === req.actor.id && x.status !== 'deleted');
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  const body = req.body || {};
  const isShop = !!l.shopId;
  if ('status' in body) {
    if (l.status === 'hidden') return res.status(403).json({ error: 'Annonce masquée par la modération. Écris à WAYI pour la rétablir.' });
    if (!isShop && (l.status === 'reserved' || l.status === 'sold')) return res.status(409).json({ error: 'Cette annonce a déjà une commande.' });
    if (!['active', 'paused'].includes(body.status)) return res.status(400).json({ error: 'Statut inconnu' });
    l.status = body.status;
  }
  const { data, error } = validateListing(body, true, isShop);
  if (error) return res.status(400).json({ error });
  if (isShop) { delete data.anonymous; }
  Object.assign(l, data, { updatedAt: now() });
  // Boutique : épuisé sans stock, remis en ligne au réassort
  if (isShop && l.status !== 'hidden' && l.status !== 'paused') l.status = stockOf(l) > 0 ? 'active' : 'sold';
  res.json({ listing: detail(l, req.actor.id) });
});

router.delete('/listings/:id', auth, needActor, (req, res) => {
  const l = mode.listings.find(x => x.id === req.params.id && x.sellerId === req.actor.id && x.status !== 'deleted');
  if (!l) return res.status(404).json({ error: 'Annonce introuvable' });
  if (l.status === 'reserved' || mode.orders.some(o => o.listingId === l.id && !['delivered', 'cancelled'].includes(o.status))) return res.status(409).json({ error: 'Une commande est en cours sur cette annonce.' });
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
  const shopHidden = !iAmSeller && !!c.shopId;
  const last = c.messages[c.messages.length - 1];
  const readAt = c.readAt?.[me] || '';
  return {
    id: c.id, listingId: c.listingId,
    listing: l ? { id: l.id, title: l.title, price: l.price, photo: l.photos?.[0] || null, status: l.status } : null,
    role: iAmSeller ? 'seller' : 'buyer',
    other: { name: shopHidden ? SHOP_LABEL : !iAmSeller && c.anonymous ? 'Vendeur anonyme' : userName(otherId), anonymous: !shopHidden && !iAmSeller && c.anonymous, shop: shopHidden },
    last: last ? { text: last.text, at: last.at, mine: last.from === me } : null,
    unread: c.messages.filter(m => m.from !== me && m.at > readAt).length,
    updatedAt: c.updatedAt,
  };
}

router.get('/conversations', auth, needActor, (req, res) => {
  const me = req.actor.id;
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
    c = { id: `conv-${uuidv4().slice(0, 8)}`, listingId: l.id, buyerId: req.client.id, sellerId: l.sellerId, shopId: l.shopId || null, anonymous: !!l.anonymous, messages: [], readAt: {}, createdAt: now(), updatedAt: now() };
    mode.conversations.push(c);
  }
  const text = cleanLong(req.body?.text, 1000);
  if (text) addMessage(c, req.client.id, text);
  res.status(201).json({ conversation: convView(c, req.client.id) });
});

function myConv(req, res) {
  const me = req.actor.id;
  const c = mode.conversations.find(x => x.id === req.params.id && (x.buyerId === me || x.sellerId === me));
  if (!c) { res.status(404).json({ error: 'Conversation introuvable' }); return null; }
  return c;
}

router.get('/conversations/:id', auth, needActor, (req, res) => {
  const c = myConv(req, res); if (!c) return;
  const me = req.actor.id;
  c.readAt = { ...(c.readAt || {}), [me]: now() };
  res.json({ conversation: convView(c, me), messages: c.messages.slice(-200).map(m => ({ id: m.id, text: m.text, at: m.at, mine: m.from === me })) });
});

router.post('/conversations/:id/messages', auth, needActor, (req, res) => {
  const c = myConv(req, res); if (!c) return;
  const text = cleanLong(req.body?.text, 1000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const m = addMessage(c, req.actor.id, text);
  res.status(201).json({ message: { id: m.id, text: m.text, at: m.at, mine: true } });
});

// ── Commandes ────────────────────────────────────────────────
router.post('/orders', auth, needClient, (req, res) => {
  const { listingId, method, phone, address, size } = req.body || {};
  const l = mode.listings.find(x => x.id === listingId);
  if (!l || l.status !== 'active') return res.status(409).json({ error: "Cet article n'est plus disponible." });
  const variant = l.variants ? l.variants.find(v => v.size === size) : null;
  if (l.variants && !variant) return res.status(400).json({ error: 'Choisis ta taille.' });
  if (variant && variant.qty < 1) return res.status(409).json({ error: `La taille ${variant.size} est épuisée.` });
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
    shopId: l.shopId || null, size: variant ? variant.size : l.size,
    price: l.price, deliveryFee: fee, total: l.price + fee,
    commissionRate: rate, commission: Math.round(l.price * rate), launchOffer,
    method, phone: digits || null, address: addr,
    // Mobile Money : en attente de la confirmation du paiement par WAYI ; à la livraison : confirmée tout de suite
    paymentStatus: 'pending', status: method === 'cash' ? 'confirmed' : 'awaiting_payment',
    history: [], createdAt: now(),
  };
  o.history.push({ status: o.status, at: o.createdAt, by: 'buyer' });
  mode.orders.push(o);
  // Particulier : article unique réservé ; boutique : une pièce retirée du stock
  if (variant) { variant.qty -= 1; if (stockOf(l) === 0) l.status = 'sold'; }
  else l.status = 'reserved';
  // Un message automatique prévient le vendeur dans la messagerie
  let c = mode.conversations.find(x => x.listingId === l.id && x.buyerId === req.client.id);
  if (!c) { c = { id: `conv-${uuidv4().slice(0, 8)}`, listingId: l.id, buyerId: req.client.id, sellerId: l.sellerId, shopId: l.shopId || null, anonymous: !!l.anonymous, messages: [], readAt: {}, createdAt: now(), updatedAt: now() }; mode.conversations.push(c); }
  addMessage(c, req.client.id, `Commande ${o.number} passée pour « ${l.title} »${variant ? `, taille ${variant.size}` : ''}. Livraison : ${addr.label}.`);
  res.status(201).json({ order: orderView(o, req.client.id) });
});

router.get('/orders', auth, needActor, (req, res) => {
  const me = req.actor.id;
  const mine = mode.orders.filter(o => o.buyerId === me || o.sellerId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ purchases: mine.filter(o => o.buyerId === me).map(o => orderView(o, me)), sales: mine.filter(o => o.sellerId === me).map(o => orderView(o, me)) });
});

router.get('/orders/:id', auth, needActor, (req, res) => {
  const me = req.actor.id;
  const o = mode.orders.find(x => x.id === req.params.id && (x.buyerId === me || x.sellerId === me));
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  res.json({ order: orderView(o, me) });
});

// Le vendeur remet l'article au livreur ; l'acheteur confirme la réception ou annule avant la remise
router.put('/orders/:id/status', auth, needActor, (req, res) => {
  const me = req.actor.id;
  const o = mode.orders.find(x => x.id === req.params.id && (x.buyerId === me || x.sellerId === me));
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const { status } = req.body || {};
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
