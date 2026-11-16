const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const { users, drivers, merchants, admins, createPendingRegistration, getPendingRegistration, deletePendingRegistration, PLATFORM_CONFIG } = require('../data/store');
const { signToken, auth } = require('../middleware/auth');
const { sendEmail } = require('../services/notifications');
const { initiatePayment, verifyPayment } = require('../services/payment');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { sanitizeMapsLink, parseCoordsFromLink, mapsLinkFromCoords, validCoords } = require('../utils/mapsLink');

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail et mot de passe requis' });

    // On garde la vérification sur le téléphone en plus de l'e-mail, par compatibilité
    // avec d'éventuels comptes créés avant le retrait du champ téléphone du formulaire.
    const user = users.find(u => u.email === email || u.phone === email);
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = signToken({ id: user.id, email: user.email });
    const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
    res.json({ token, user: safeUser, message: 'Connexion réussie' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login-any — connexion unique de l'application WAYI.
// Cherche l'e-mail (ou le telephone) dans tous les types de comptes : client, restaurant,
// livreur, administration. Renvoie chaque compte dont le mot de passe correspond, avec
// son jeton : l'appli ouvre directement le bon espace (ou demande lequel s'il y en a plusieurs).
router.post('/login-any', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail et mot de passe requis' });
    const match = (a) => a.email === email || (a.phone && a.phone === email);
    const ok = async (a) => a?.password && bcrypt.compare(password, a.password).catch(() => false);
    const strip = ({ password: _, inbox: _inbox, fcmTokens: _fcm, ...rest }) => rest;
    const accounts = [];

    const user = users.find(match);
    if (user && await ok(user)) accounts.push({ role: 'client', token: signToken({ id: user.id, email: user.email }), name: user.name, user: strip(user) });
    const merchant = merchants.find(match);
    if (merchant && await ok(merchant)) accounts.push({ role: 'merchant', token: signToken({ id: merchant.id, role: 'merchant', email: merchant.email }), name: merchant.name });
    const driver = drivers.find(match);
    if (driver && await ok(driver)) accounts.push({ role: 'driver', token: signToken({ id: driver.id, role: 'driver', email: driver.email }), name: driver.name, pendingApproval: !!driver.pendingApproval });
    const admin = admins.find(match);
    if (admin && await ok(admin)) accounts.push({ role: 'admin', token: signToken({ id: admin.id, role: 'admin', email: admin.email }), name: admin.name });

    if (!accounts.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register/start — envoie un code de vérification par e-mail
router.post('/register/start', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nom, e-mail et mot de passe requis' });

    if (phone && users.find(u => u.phone === phone))
      return res.status(409).json({ error: 'Ce numéro est déjà enregistré' });
    if (users.find(u => u.email === email))
      return res.status(409).json({ error: 'Cet e-mail est déjà enregistré' });

    const hashed = await bcrypt.hash(password, 10);
    const code = createPendingRegistration(email, { name, phone, email, password: hashed });

    const emailResult = await sendEmail({
      to: email,
      subject: 'Ton code de vérification WAYI',
      html: `<p>Bonjour ${name},</p><p>Voici ton code de vérification WAYI :</p><h2>${code}</h2><p>Ce code expire dans 10 minutes.</p>`,
    });

    // L'e-mail peut échouer soit parce qu'aucun service n'est configuré (mode simulation),
    // soit parce que le service configuré répond une erreur (ex : clé API invalide/expirée).
    // Dans les deux cas, on ne bloque pas l'inscription : on le signale au front, qui affiche
    // le code directement (mesure temporaire tant que l'envoi réel n'est pas fiable en prod).
    const emailFailed = !emailResult?.success;

    res.json({
      message: `Code envoyé à ${email}`,
      email,
      emailSimulated: !!emailResult?.simulated || emailFailed,
      devCode: emailFailed ? code : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register/verify — vérifie le code et crée le compte
router.post('/register/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'E-mail et code requis' });

    const pending = getPendingRegistration(email);
    if (!pending) return res.status(400).json({ error: 'Aucune inscription en attente pour cet e-mail. Recommence.' });
    if (Date.now() > pending.expiresAt) {
      deletePendingRegistration(email);
      return res.status(400).json({ error: 'Code expiré. Recommence l\'inscription.' });
    }
    pending.attempts += 1;
    if (pending.attempts > 5) {
      deletePendingRegistration(email);
      return res.status(429).json({ error: 'Trop de tentatives. Recommence l\'inscription.' });
    }
    if (pending.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Code incorrect' });
    }

    const { name, phone, password } = pending.data;
    const newUser = {
      id: uuidv4(), name, phone, email,
      password, avatar: name[0].toUpperCase(),
      city: 'Abomey-Calavi', addresses: [], favoriteDishes: [],
      location: { lat: 6.3725, lng: 2.3838, zone: 'Abomey-Calavi' },
      emailVerified: true,
      loyaltyPoints: 0, ordersCount: 0, savedTotal: 0,
      wayiPlus: { count: 0, target: 10, active: false },
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    deletePendingRegistration(email);

    const token = signToken({ id: newUser.id, email: newUser.email });
    const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = newUser;
    res.status(201).json({ token, user: safeUser, message: 'Compte créé et e-mail vérifié' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/register/resend — renvoie un nouveau code
router.post('/register/resend', async (req, res) => {
  try {
    const { email } = req.body;
    const pending = getPendingRegistration(email);
    if (!pending) return res.status(400).json({ error: 'Aucune inscription en attente pour cet e-mail.' });

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
      devCode: emailFailed ? code : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ── Mot de passe oublié ─────────────────────────────────────────
// 1) /forgot-password : envoie un code à 6 chiffres par e-mail (si le compte existe)
// 2) /reset-password  : vérifie le code puis enregistre le nouveau mot de passe
// Sécurité : réponse identique que le compte existe ou non (pas de fuite d'information),
// code valable 10 minutes, 5 essais maximum, un nouveau code au plus toutes les 60 secondes,
// et le code n'est JAMAIS renvoyé dans la réponse (contrairement à l'inscription en phase de test).
const pendingResets = new Map(); // email -> { code, expiresAt, attempts, sentAt }
const normEmail = (e) => String(e || '').trim().toLowerCase();

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Entre une adresse e-mail valide' });

    const generic = { message: 'Si un compte existe avec cet e-mail, un code vient de lui être envoyé.' };
    // Tous les types de comptes : client, restaurant, livreur, administration
    const user = [...users, ...merchants, ...drivers, ...admins].find(u => normEmail(u.email) === email);
    if (!user) return res.json(generic);

    const prev = pendingResets.get(email);
    if (prev && Date.now() - prev.sentAt < 60 * 1000) {
      return res.status(429).json({ error: 'Patiente une minute avant de demander un nouveau code.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    pendingResets.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0, sentAt: Date.now() });

    const first = (user.name || '').split(' ')[0] || '';
    const result = await sendEmail({
      to: user.email,
      subject: 'Ton code pour changer de mot de passe WAYI',
      html: `<p>Bonjour ${first},</p><p>Voici ton code pour choisir un nouveau mot de passe WAYI :</p><h2>${code}</h2><p>Ce code expire dans 10 minutes. Si tu n'as rien demandé, ignore simplement ce message : ton mot de passe reste inchangé.</p>`,
    });
    if (!result?.success) console.warn('[Auth] Envoi du code de réinitialisation impossible pour', email);
    res.json({ ...generic, emailUnavailable: !result?.success || undefined });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    const { code, password } = req.body || {};
    if (!email || !code || !password) return res.status(400).json({ error: 'E-mail, code et nouveau mot de passe requis' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

    const pending = pendingResets.get(email);
    if (!pending) return res.status(400).json({ error: 'Aucune demande en cours pour cet e-mail. Demande un nouveau code.' });
    if (Date.now() > pending.expiresAt) {
      pendingResets.delete(email);
      return res.status(400).json({ error: 'Code expiré. Demande un nouveau code.' });
    }
    pending.attempts += 1;
    if (pending.attempts > 5) {
      pendingResets.delete(email);
      return res.status(429).json({ error: 'Trop de tentatives. Demande un nouveau code.' });
    }
    if (pending.code !== String(code).trim()) return res.status(400).json({ error: 'Code incorrect' });

    // Meme e-mail sur plusieurs espaces (ex : client et restaurant) : le nouveau mot de passe vaut pour tous
    const accounts = [...users, ...merchants, ...drivers, ...admins].filter(u => normEmail(u.email) === email);
    if (!accounts.length) { pendingResets.delete(email); return res.status(400).json({ error: 'Compte introuvable' }); }

    const hashed = await bcrypt.hash(String(password), 10);
    accounts.forEach(a => { a.password = hashed; });
    pendingResets.delete(email);
    res.json({ message: 'Mot de passe changé. Tu peux te connecter.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/social — connexion Google / Facebook
// NOTE: implémentation fonctionnelle mais simplifiée. En production, le token reçu du SDK
// client (Google Identity Services / Facebook Login) doit être vérifié côté serveur auprès
// du fournisseur avant de faire confiance à l'email/nom transmis. Ici, en l'absence de
// GOOGLE_CLIENT_ID / FACEBOOK_APP_SECRET configurés, on fait confiance au payload pour la démo.
// POST /api/auth/social — connexion Google ou Facebook, avec vérification réelle du jeton
router.post('/social', async (req, res) => {
  try {
    const { provider, idToken, accessToken } = req.body;
    if (!['google', 'facebook'].includes(provider)) return res.status(400).json({ error: 'Fournisseur invalide' });

    let email, name;

    if (provider === 'google') {
      if (!googleClient) {
        return res.status(503).json({ error: "Connexion Google non configurée sur ce serveur. Ajoute GOOGLE_CLIENT_ID dans backend/.env." });
      }
      if (!idToken) return res.status(400).json({ error: 'Jeton Google manquant' });
      try {
        const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        email = payload.email;
        name = payload.name;
      } catch {
        return res.status(401).json({ error: 'Jeton Google invalide ou expiré' });
      }
    } else {
      if (!process.env.FACEBOOK_APP_ID) {
        return res.status(503).json({ error: "Connexion Facebook non configurée sur ce serveur. Ajoute FACEBOOK_APP_ID dans backend/.env." });
      }
      if (!accessToken) return res.status(400).json({ error: 'Jeton Facebook manquant' });
      try {
        const fbRes = await axios.get('https://graph.facebook.com/me', {
          params: { fields: 'id,name,email', access_token: accessToken },
        });
        email = fbRes.data.email;
        name = fbRes.data.name;
      } catch {
        return res.status(401).json({ error: 'Jeton Facebook invalide ou expiré' });
      }
      if (!email) {
        return res.status(400).json({ error: "Ton compte Facebook n'a pas partagé d'adresse e-mail. Autorise l'accès à ton e-mail pour continuer." });
      }
    }

    let user = users.find(u => u.email === email);
    if (!user) {
      user = {
        id: uuidv4(), name: name || email.split('@')[0], phone: null, email,
        password: null, avatar: (name || email)[0].toUpperCase(),
        city: 'Abomey-Calavi', addresses: [], favoriteDishes: [],
        location: { lat: 6.3725, lng: 2.3838, zone: 'Abomey-Calavi' },
        emailVerified: true, authProvider: provider,
        loyaltyPoints: 0, ordersCount: 0, savedTotal: 0,
        wayiPlus: { count: 0, target: 10, active: false },
        createdAt: new Date().toISOString(),
      };
      users.push(user);
    }

    const token = signToken({ id: user.id, phone: user.phone });
    const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
    res.json({ token, user: safeUser, message: `Connexion ${provider} réussie` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.json(safeUser);
});

// PUT /api/auth/me
router.put('/me', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { name, email, city } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (city) user.city = city;
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.json({ user: safeUser, message: 'Profil mis à jour' });
});

// POST /api/auth/addresses — ajouter une nouvelle adresse de livraison
router.post('/addresses', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { label, address, lat, lng, isDefault, mapsLink, landmark } = req.body;
  if (!label || !address) return res.status(400).json({ error: 'label et address requis' });

  // Lien Google Maps facultatif : refusé s'il ne vient pas d'un site de cartes connu.
  const cleanLink = sanitizeMapsLink(mapsLink);
  if (mapsLink && String(mapsLink).trim() && !cleanLink) {
    return res.status(400).json({ error: 'Ce lien ne semble pas venir de Google Maps. Dans Google Maps, appuie sur Partager puis Copier le lien.' });
  }
  // Position : GPS du téléphone en priorité, sinon coordonnées lues dans le lien.
  const gps = validCoords(Number(lat), Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
  const fromLink = parseCoordsFromLink(cleanLink);
  const pos = gps || fromLink;

  if (!user.addresses) user.addresses = [];
  if (isDefault) user.addresses.forEach(a => { a.isDefault = false; });

  const newAddress = {
    id: `a${Date.now()}`, label: String(label).slice(0, 60), address: String(address).slice(0, 250),
    landmark: landmark ? String(landmark).trim().slice(0, 200) : '',
    mapsLink: cleanLink || (gps ? mapsLinkFromCoords(gps.lat, gps.lng) : null),
    lat: pos ? pos.lat : user.location?.lat, lng: pos ? pos.lng : user.location?.lng,
    hasPosition: !!(pos || cleanLink),
    isDefault: isDefault || user.addresses.length === 0,
  };
  user.addresses.push(newAddress);
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.status(201).json({ address: newAddress, user: safeUser });
});

// PUT /api/auth/addresses/:id/default — définir comme adresse par défaut
router.put('/addresses/:id/default', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const found = (user.addresses || []).find(a => a.id === req.params.id);
  if (!found) return res.status(404).json({ error: 'Adresse introuvable' });
  user.addresses.forEach(a => { a.isDefault = a.id === req.params.id; });
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.json({ user: safeUser });
});

// PUT /api/auth/addresses/:id/position - placer (ou corriger) le point exact de livraison sur la carte
router.put('/addresses/:id/position', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const found = (user.addresses || []).find(a => a.id === req.params.id);
  if (!found) return res.status(404).json({ error: 'Adresse introuvable' });
  const lat = Number(req.body?.lat); const lng = Number(req.body?.lng);
  if (!validCoords(lat, lng)) return res.status(400).json({ error: 'Position invalide' });
  found.lat = lat; found.lng = lng; found.hasPosition = true;
  found.mapsLink = mapsLinkFromCoords(lat, lng);
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.json({ user: safeUser, address: found });
});

// DELETE /api/auth/addresses/:id
router.delete('/addresses/:id', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const idx = (user.addresses || []).findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Adresse introuvable' });
  const wasDefault = user.addresses[idx].isDefault;
  user.addresses.splice(idx, 1);
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  const { password: _, inbox: _inbox, fcmTokens: _fcm, ...safeUser } = user;
  res.json({ user: safeUser });
});

// GET /api/auth/favorites — plats favoris du client, enrichis (icône, restaurant...)
router.get('/favorites', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { enrichDish, getDishById } = require('../data/store');
  const dishes = (user.favoriteDishes || []).map(getDishById).filter(Boolean).map(enrichDish);
  res.json({ dishes, total: dishes.length });
});

// POST /api/auth/favorites/:dishId — ajouter un plat aux favoris
router.post('/favorites/:dishId', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { getDishById } = require('../data/store');
  if (!getDishById(req.params.dishId)) return res.status(404).json({ error: 'Plat introuvable' });
  if (!user.favoriteDishes) user.favoriteDishes = [];
  if (!user.favoriteDishes.includes(req.params.dishId)) user.favoriteDishes.push(req.params.dishId);
  res.json({ favoriteDishes: user.favoriteDishes });
});

// DELETE /api/auth/favorites/:dishId — retirer un plat des favoris
router.delete('/favorites/:dishId', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  user.favoriteDishes = (user.favoriteDishes || []).filter(id => id !== req.params.dishId);
  res.json({ favoriteDishes: user.favoriteDishes });
});

// GET /api/auth/subscription/plans — formules d'abonnement client disponibles
router.get('/subscription/plans', (req, res) => {
  res.json({ plans: PLATFORM_CONFIG.clientSubscriptionPlans });
});

// Active (ou prolonge) l'abonnement d'un client une fois le paiement confirmé.
function activateSubscription(user, plan) {
  const planConfig = PLATFORM_CONFIG.clientSubscriptionPlans[plan];
  const now = new Date();
  // Si un abonnement est déjà actif et pas expiré, on prolonge à partir de sa date de fin
  // plutôt que de repartir de zéro (évite de perdre des jours déjà payés).
  const base = user.subscription?.active && new Date(user.subscription.expiresAt) > now
    ? new Date(user.subscription.expiresAt) : now;
  const expiresAt = new Date(base.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);
  user.subscription = { plan, active: true, startedAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
  delete user.pendingSubscription;
  return { planConfig, expiresAt };
}

// POST /api/auth/subscribe — lance le paiement d'un abonnement (livraison gratuite pendant sa durée)
// En mode simulation (sandbox), l'abonnement s'active tout de suite. En réel, il reste "en attente"
// tant que le paiement n'est pas confirmé (voir /subscribe/confirm) : "paiement lancé" ne veut pas
// dire "payé", sans quoi il suffirait d'abandonner la demande de paiement pour avoir l'abonnement.
router.post('/subscribe', auth, async (req, res) => {
  const { plan, method, phone } = req.body;
  const planConfig = PLATFORM_CONFIG.clientSubscriptionPlans[plan];
  if (!planConfig) return res.status(400).json({ error: 'Formule invalide' });
  if (!method || method === 'cash') return res.status(400).json({ error: "L'abonnement ne peut pas être payé en espèces" });

  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  try {
    const result = await initiatePayment({
      method, amount: planConfig.price, phone,
      orderId: `SUB-${user.id}-${Date.now()}`,
    });
    if (!result.success) return res.status(402).json({ error: 'Paiement refusé, réessaie.' });

    if (result.simulated) {
      const { expiresAt } = activateSubscription(user, plan);
      return res.json({ subscription: user.subscription, message: `Abonnement ${planConfig.label} activé, livraison gratuite jusqu'au ${expiresAt.toLocaleDateString('fr')}.` });
    }

    user.pendingSubscription = { plan, provider: result.provider, transactionId: result.transactionId, createdAt: new Date().toISOString() };
    res.json({ pending: true, paymentUrl: result.paymentUrl, message: 'Valide le paiement sur ton téléphone, puis appuie sur "Vérifier mon paiement".' });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors du paiement de l'abonnement" });
  }
});

// POST /api/auth/subscribe/confirm — vérifie auprès du prestataire que le paiement est bien passé
// avant d'activer l'abonnement. La transaction vérifiée est celle enregistrée côté serveur pour cet
// utilisateur, jamais un identifiant envoyé par le client.
router.post('/subscribe/confirm', auth, async (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user?.pendingSubscription) return res.status(404).json({ error: 'Aucun paiement d\'abonnement en attente' });

  const pending = user.pendingSubscription;
  try {
    const verif = await verifyPayment({ provider: pending.provider, transactionId: pending.transactionId });
    if (!(verif.success && verif.status === 'success')) {
      return res.status(402).json({ error: "Paiement pas encore confirmé. Valide-le sur ton téléphone puis réessaie." });
    }
    const { planConfig, expiresAt } = activateSubscription(user, pending.plan);
    res.json({ subscription: user.subscription, message: `Abonnement ${planConfig.label} activé, livraison gratuite jusqu'au ${expiresAt.toLocaleDateString('fr')}.` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la vérification du paiement' });
  }
});

module.exports = router;
