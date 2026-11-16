// ============================================================
// WAYI - Route IA (Yivi)
// POST /api/ai/chat   - conversation avec Yivi (choix, panier, recap de commande, suivi)
//   body : { message, history: [{ role, content, recommendedIds?, recommendedNames? }], cart: [{ id, qty }] }
//   reponse : { reply, recommendations, recommendedIds, recommendedNames,
//               cart (si Yivi l'a modifie), checkout (recap a valider), trackingOrders, simulated }
// GET  /api/ai/status - Yivi tourne-t-elle avec une vraie cle Claude ?
// GET  /api/ai/profile - preferences memorisees par Yivi pour ce client
// ============================================================
const express = require('express');
const { chatWithYivi, isConfigured, modelName, getHealth } = require('../services/ai/yivi');
const { sanitizeCart, toClientCart } = require('../services/ai/tools');
const { getYiviProfile, savePreference } = require('../services/ai/recommend');
const { getUserById, getMenu, getDishById, orders } = require('../data/store');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/chat', auth, async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 1000);
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (!message) return res.status(400).json({ error: 'Message requis' });

  const user = getUserById(req.user.id);
  if (!user) return res.status(403).json({ error: 'Yivi est reserve aux comptes clients.' });

  // Plats deja montres dans CETTE conversation (pour ne pas les reproposer)
  const shownThisChat = new Set();
  const nameToId = Object.fromEntries(getMenu({}).map(d => [d.name, d.id]));
  for (const h of history) {
    for (const id of h.recommendedIds || []) if (getDishById(id)) shownThisChat.add(id);
    for (const name of h.recommendedNames || []) if (nameToId[name]) shownThisChat.add(nameToId[name]);
  }

  // Etape en cours et derniers plats montres (pour comprendre "oui", "le premier", "en cash"...)
  const lastAssistant = [...history].reverse().find(h => h.role === 'assistant') || {};
  const lastWithDishes = [...history].reverse().find(h => h.role === 'assistant' && (h.recommendedIds?.length || h.recommendedNames?.length)) || {};
  const lastShown = (lastWithDishes.recommendedIds?.length ? lastWithDishes.recommendedIds : (lastWithDishes.recommendedNames || []).map(nm => nameToId[nm]))
    .filter(id => id && getDishById(id));
  // Derniere serie d'au moins deux plats (pour "lequel est le moins cher ?" apres une question sur l'un d'eux)
  const lastSetMsg = [...history].reverse().find(h => h.role === 'assistant' && (h.recommendedIds?.length || 0) >= 2);
  const lastSet = (lastSetMsg?.recommendedIds || []).filter(id => getDishById(id));
  const ALLOWED_STEPS = ['confirm_add', 'confirm_order', 'payment_method', 'remove_demo'];
  const ctx = {
    lastShown,
    lastSet,
    awaiting: ALLOWED_STEPS.includes(lastAssistant.awaiting) ? lastAssistant.awaiting : null,
    lastReply: String(lastAssistant.content || ''),
  };

  const session = {
    user,
    cart: sanitizeCart(req.body?.cart),
    shownThisChat,
    seenIds: new Set(),
    ui: { recommendations: [], cartChanged: false, checkout: null, tracking: null },
  };

  try {
    const result = await chatWithYivi({ message, history, session, ctx });
    const menu = getMenu({});
    const recommendations = session.ui.recommendations.map(id => menu.find(d => d.id === id)).filter(Boolean);
    const trackingOrders = session.ui.tracking
      ? orders.filter(o => o.userId === user.id && session.ui.tracking.includes(o.id))
      : null;

    res.json({
      reply: result.reply,
      recommendations,
      recommendedIds: recommendations.map(d => d.id),
      recommendedNames: recommendations.map(d => d.name),
      cart: session.ui.cartChanged ? toClientCart(session.cart) : null,
      checkout: session.ui.checkout,
      trackingOrders,
      awaiting: result.awaiting || null,
      simulated: result.mode !== 'ia',
    });
  } catch (err) {
    console.error('[Yivi] /chat', err);
    res.status(500).json({ error: 'Yivi est indisponible pour le moment' });
  }
});

// GET /api/ai/profile - ce que Yivi a retenu (affichable dans le profil client)
router.get('/profile', auth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Client introuvable' });
  const p = getYiviProfile(user);
  res.json({ aime: p.aime, evite: p.evite, budgetMax: p.budgetMax, notes: p.notes, updatedAt: p.updatedAt });
});

// DELETE /api/ai/profile/:type/:valeur - le client retire une preference
router.delete('/profile/:type/:valeur', auth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Client introuvable' });
  const out = req.params.type === 'budget' ? savePreference(user, 'budget', '0') : savePreference(user, 'oublier', req.params.valeur);
  res.json(out);
});

// GET /api/ai/status - statut operationnel (utilise par le dashboard admin)
router.get('/status', auth, (req, res) => {
  res.json({ configured: isConfigured(), model: isConfigured() ? modelName() : null, ...(isConfigured() ? getHealth() : {}) });
});

module.exports = router;
