const express = require('express');
const crypto = require('crypto');
const { initiatePayment, verifyPayment, detectNetwork, calculateFees, PAYMENT_METHODS, paymentMode, manualNumbers, methodAvailable, kkiapaySandbox } = require('../services/payment');
const { orders, generateReceipt } = require('../data/store');
const { auth } = require('../middleware/auth');
const { emitOrderStatusChange } = require('../services/realtime');
const analytics = require('../services/analytics');
const { payeeFor } = require('../services/payment/manual');

const router = express.Router();

// Transactions Kkiapay en cours de vérification (évite qu'un même identifiant soit validé deux fois en parallèle)
const inFlight = new Set();

// Vérifie auprès de Kkiapay et, si tout concorde, marque la commande payée.
// Retourne { ok, error?, already? }.
async function confirmKkiapayTransaction(order, transactionId) {
  if (order.paymentStatus === 'paid') return { ok: true, already: true };
  if (order.paymentProvider !== 'kkiapay') return { ok: false, error: "Cette commande n'est pas payée par Kkiapay." };
  if (inFlight.has(transactionId)) return { ok: false, error: 'Vérification en cours, réessaie dans un instant.' };
  // Une transaction ne peut payer qu'une seule commande
  if (orders.some(o => o.id !== order.id && o.paymentTransactionId === transactionId)) {
    return { ok: false, error: 'Cette transaction a déjà été utilisée pour une autre commande.' };
  }
  inFlight.add(transactionId);
  try {
    const v = await verifyPayment({ provider: 'kkiapay', transactionId });
    if (!v.success) return { ok: false, error: `Paiement non confirmé par Kkiapay (${v.status || 'inconnu'}).` };
    if (Number.isFinite(v.amount) && v.amount + 0.01 < order.total) {
      console.warn(`[Kkiapay] Montant insuffisant pour ${order.id} : reçu ${v.amount}, attendu ${order.total}`);
      return { ok: false, error: 'Le montant payé est inférieur au total de la commande.' };
    }
    if (v.partnerId && String(v.partnerId) !== order.id) {
      return { ok: false, error: 'Cette transaction correspond à une autre commande.' };
    }
    order.paymentStatus = 'paid';
    order.paidAt = new Date().toISOString();
    order.paymentTransactionId = transactionId;
    let receipt = null;
    try { receipt = generateReceipt(order); } catch {}
    emitOrderStatusChange(order.id, order.status, { paymentConfirmed: true, receipt });
    return { ok: true };
  } finally {
    inFlight.delete(transactionId);
  }
}

// GET /api/payments/methods — méthodes disponibles
router.get('/methods', (req, res) => {
  const mode = paymentMode();
  const methods = PAYMENT_METHODS.filter(m => !m.comingSoon).map(m => ({
    ...m, available: methodAvailable(m.id),
    ...(mode === 'manual' && manualNumbers()[m.id] ? { payTo: manualNumbers()[m.id] } : {}),
  }));
  const kk = mode === 'kkiapay' ? { publicKey: process.env.KKIAPAY_PUBLIC_KEY, sandbox: kkiapaySandbox() } : undefined;
  res.json({ mode, kkiapay: kk, methods, comingSoon: PAYMENT_METHODS.filter(m => m.comingSoon) });
});

// POST /api/payments/detect — détecter réseau mobile
router.post('/detect', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Numéro requis' });
  const network = detectNetwork(phone);
  const fees = calculateFees(req.body.amount || 0, network);
  res.json({ network, method: PAYMENT_METHODS.find(m => m.id === network), fees });
});

// POST /api/payments/initiate — initier un paiement (mobile money / carte / cash)
router.post('/initiate', auth, async (req, res) => {
  const { orderId, method, phone, amount } = req.body;
  if (!orderId || !method || !amount) return res.status(400).json({ error: 'orderId, method et amount requis' });

  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  // Empêche un utilisateur de payer (et donc de contrôler le statut de paiement)
  // sur la commande de quelqu'un d'autre.
  if (order.userId !== req.user.id) return res.status(403).json({ error: 'Cette commande ne t\'appartient pas' });
  // Le montant fait foi côté serveur : on ignore toute valeur envoyée par le client
  // qui ne correspondrait pas exactement au total réel de la commande.
  if (Math.abs(amount - order.total) > 0.01) {
    return res.status(400).json({ error: 'Montant incorrect pour cette commande' });
  }

  try {
    if (method !== 'cash' && order.paymentStatus === 'paid') {
      return res.status(409).json({ error: 'Cette commande est déjà payée.' });
    }
    if (!methodAvailable(method)) {
      return res.status(402).json({ error: "Ce moyen de paiement n'est pas encore disponible. Choisis MTN MoMo, Moov Money ou « Espèces à la livraison »." });
    }
    // Paiement manuel : le client envoie l'argent au numéro WAYI, l'admin confirme la réception.
    if (paymentMode() === 'manual' && method !== 'cash') {
      const { payTo, payee, payeeName } = payeeFor(order, method);
      if (!payTo) return res.status(402).json({ error: "Ce moyen de paiement n'est pas disponible pour ce restaurant. Choisis « Espèces à la livraison »." });
      order.paymentMethod = method;
      order.paymentProvider = 'manual';
      order.paymentTransactionId = `MAN-${order.id}`;
      order.paymentSimulated = false;
      order.paymentStatus = 'awaiting_payment';
      order.paymentTo = payTo;
      order.paymentPayee = payee;         // 'restaurant' ou 'wayi'
      order.paymentPayeeName = payeeName;
      order.paymentFromPhone = phone || null;
      return res.json({
        success: true, manual: true, provider: 'manual', status: 'awaiting_payment',
        orderId: order.id, amount: order.total, payTo, payee, payeeName, method, reference: order.id,
        message: `Envoie ${order.total} FCFA au ${payTo} (${payeeName}), puis confirme dans l'appli.`,
      });
    }
    const result = await initiatePayment({ method, amount, phone: phone || req.body.phone, orderId, callbackUrl: `${process.env.WEBHOOK_BASE_URL}/api/payments/webhook/kkiapay` });
    analytics.trackPayment(req.user.id, orderId, method, amount, result.success);
    if (!result.success) return res.status(402).json({ error: result.error || 'Paiement refusé' });

    if (result.success && result.widget) {
      // Kkiapay : le client paie dans le widget, puis l'appli appelle /verify avec le transactionId.
      order.paymentMethod = method;
      order.paymentProvider = 'kkiapay';
      order.paymentSimulated = false;
      order.paymentStatus = 'awaiting_payment';
      order.paymentFromPhone = phone || null;
      return res.json(result);
    }
    if (result.success) {
      order.paymentProvider = result.provider;
      order.paymentTransactionId = result.transactionId;
      order.paymentSimulated = !!result.simulated;

      if (method === 'cash') {
        // Paiement en espèces : encaissé à la livraison par le livreur (voir /api/drivers/orders/:id/complete)
        order.paymentStatus = 'pending_cash';
      } else {
        order.paymentStatus = 'pending';
        // Mode simulation (pas de vraie clé API) : le paiement se confirme automatiquement
        // après quelques secondes, comme le ferait un vrai callback de l'agrégateur.
        if (result.simulated && result.simulatedSuccessIn) {
          setTimeout(async () => {
            const verif = await verifyPayment({ provider: result.provider, transactionId: result.transactionId });
            if (verif.success) {
              order.paymentStatus = 'paid';
              order.paidAt = new Date().toISOString();
              const receipt = generateReceipt(order);
              emitOrderStatusChange(order.id, order.status, { paymentConfirmed: true, receipt });
            }
          }, result.simulatedSuccessIn);
        }
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur paiement', details: err.message });
  }
});

// POST /api/payments/manual-claim — le client dit « j'ai envoyé l'argent » (+ référence de la transaction)
router.post('/manual-claim', auth, (req, res) => {
  const { orderId, reference, senderPhone } = req.body;
  const order = orders.find(o => o.id === orderId);
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.paymentProvider !== 'manual' || !['awaiting_payment', 'claimed', 'rejected'].includes(order.paymentStatus)) {
    return res.status(409).json({ error: "Cette commande n'attend pas de paiement manuel." });
  }
  order.paymentStatus = 'claimed';
  order.paymentClaim = {
    reference: String(reference || '').trim().slice(0, 60),
    senderPhone: String(senderPhone || order.paymentFromPhone || '').trim().slice(0, 30),
    at: new Date().toISOString(),
  };
  try { const rt = require('../services/realtime'); rt.emitToUser('admin', 'payment:claimed', { orderId: order.id }); rt.emitToUser(order.restaurantId, 'payment:claimed', { orderId: order.id }); } catch {}
  res.json({ ok: true, paymentStatus: order.paymentStatus, message: 'Merci ! WAYI vérifie ton paiement.' });
});

// POST /api/payments/verify — vérifier un paiement
router.post('/verify', auth, async (req, res) => {
  const { transactionId, orderId, provider } = req.body;
  if (!transactionId) return res.status(400).json({ error: 'transactionId requis' });

  // On retrouve d'abord la commande pour vérifier qu'elle appartient bien à l'appelant —
  // sans ça, n'importe quel utilisateur connecté pourrait valider le paiement de n'importe
  // quelle commande.
  const order = orderId
    ? orders.find(o => o.id === orderId)
    : orders.find(o => o.paymentTransactionId === transactionId);
  if (orderId && !order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order && order.userId !== req.user.id) {
    return res.status(403).json({ error: 'Cette commande ne t\'appartient pas' });
  }

  // Kkiapay : vérification réelle (montant, commande, transaction jamais réutilisée)
  if (paymentMode() === 'kkiapay') {
    if (!order) return res.status(400).json({ error: 'orderId requis' });
    const r = await confirmKkiapayTransaction(order, transactionId);
    if (!r.ok) return res.status(402).json({ success: false, error: r.error });
    return res.json({ success: true, status: 'paid', orderId: order.id });
  }

  const result = await verifyPayment({ provider, transactionId });
  if (result.success && order) {
    order.paymentStatus = 'paid';
    order.paidAt = new Date().toISOString();
    generateReceipt(order);
  }
  res.json(result);
});

// POST /api/payments/webhook/kkiapay — webhook Kkiapay
router.post('/webhook/kkiapay', async (req, res) => {
  // KKiaPay signe ses webhooks en renvoyant le secret configuré sur le dashboard dans
  // l'en-tête x-kkiapay-secret (voir docs.kkiapay.me/tableau-de-bord/webhook). Sans
  // vérification, n'importe qui connaissant un transactionId pourrait appeler cette URL
  // publique pour faire passer une commande en "payée" sans avoir réellement payé.
  if (process.env.KKIAPAY_WEBHOOK_SECRET) {
    const received = req.headers['x-kkiapay-secret'] || '';
    const expected = process.env.KKIAPAY_WEBHOOK_SECRET;
    const valid = received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) {
      console.warn('[Webhook/Kkiapay] Signature invalide, requête rejetée');
      return res.status(401).json({ error: 'Signature invalide' });
    }
  } else {
    console.warn('[Webhook/Kkiapay] KKIAPAY_WEBHOOK_SECRET non configurée — webhook accepté sans vérification (à corriger avant la mise en prod réelle).');
  }

  // Mode Kkiapay : on ne croit jamais le contenu du webhook, on re-vérifie la transaction chez Kkiapay.
  if (paymentMode() === 'kkiapay') {
    const { transactionId, partnerId, isPaymentSucces, event } = req.body;
    console.log(`[Webhook/Kkiapay] TxID: ${transactionId} | partnerId: ${partnerId} | event: ${event}`);
    const success = isPaymentSucces === true || event === 'transaction.success';
    if (success && transactionId && partnerId) {
      const order = orders.find(o => o.id === String(partnerId));
      if (order) {
        const r = await confirmKkiapayTransaction(order, String(transactionId));
        if (!r.ok) console.warn(`[Webhook/Kkiapay] ${order.id} non validée : ${r.error}`);
      }
    }
    return res.json({ received: true });
  }

  const { transactionId, status, amount } = req.body;
  console.log(`[Webhook/Kkiapay] TxID: ${transactionId} | Status: ${status}`);

  if (status === 'SUCCESS' && transactionId) {
    const order = orders.find(o => o.paymentTransactionId === transactionId);
    if (order) {
      order.paymentStatus = 'paid';
      order.paidAt = new Date().toISOString();
      const receipt = generateReceipt(order);

      // Le paiement réussi ne veut PAS dire que le restaurant a accepté la commande —
      // ce sont deux choses indépendantes. On ne notifie donc que du paiement lui-même
      // ici (léger signal temps réel pour l'écran de suivi), pas un "commande confirmée"
      // qui doit rester réservé au moment où le restaurant accepte réellement (voir
      // routes/merchants.js PUT /orders/:id/status).
      emitOrderStatusChange(order.id, order.status, { paymentConfirmed: true, receipt });
    }
  }

  res.json({ received: true });
});

// POST /api/payments/webhook/orange — webhook Orange Money
router.post('/webhook/orange', (req, res) => {
  // NOTE : Orange Money ne fait pas encore l'objet d'une intégration réelle (clé "demo_secret"
  // dans services/payment/index.js). Ce garde-fou générique (secret partagé dans un en-tête)
  // est provisoire — à remplacer par le mécanisme de signature réel une fois le compte
  // marchand Orange Money obtenu et sa documentation de webhook consultée.
  if (process.env.ORANGE_MONEY_WEBHOOK_SECRET) {
    const received = req.headers['x-orange-secret'] || '';
    const expected = process.env.ORANGE_MONEY_WEBHOOK_SECRET;
    const valid = received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) return res.status(401).json({ error: 'Signature invalide' });
  } else {
    console.warn('[Webhook/Orange] ORANGE_MONEY_WEBHOOK_SECRET non configurée — webhook accepté sans vérification.');
  }

  const { pay_token, status } = req.body;
  console.log(`[Webhook/Orange] Token: ${pay_token} | Status: ${status}`);
  if (status === 'SUCCESS') {
    const order = orders.find(o => o.paymentTransactionId === pay_token);
    if (order) { order.paymentStatus = 'paid'; order.paidAt = new Date().toISOString(); }
  }
  res.json({ received: true });
});

// POST /api/payments/webhook/whatsapp — webhook WhatsApp entrant
router.post('/webhook/whatsapp', async (req, res) => {
  // Meta signe chaque webhook avec l'en-tête X-Hub-Signature-256 (HMAC-SHA256 du corps
  // brut, avec le App Secret Facebook comme clé). Sans cette vérification, n'importe qui
  // connaissant l'URL du webhook pourrait usurper des messages WhatsApp entrants — par
  // exemple pour faire envoyer par le bot un message à un numéro de son choix.
  if (process.env.WHATSAPP_APP_SECRET) {
    const signatureHeader = req.headers['x-hub-signature-256'] || '';
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update(req.rawBody || Buffer.from(''))
      .digest('hex');
    const valid = signatureHeader.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig));
    if (!valid) {
      console.warn('[Webhook/WhatsApp] Signature invalide, requête rejetée');
      return res.sendStatus(401);
    }
  } else {
    console.warn('[Webhook/WhatsApp] WHATSAPP_APP_SECRET non configurée — webhook accepté sans vérification.');
  }

  const { parseWhatsAppWebhook, handleWhatsAppReply } = require('../services/notifications');
  const msg = parseWhatsAppWebhook(req.body);
  if (msg?.text) await handleWhatsAppReply({ from: msg.from, text: msg.text });
  res.sendStatus(200);
});

// GET /api/payments/webhook/whatsapp — vérification webhook Meta
router.get('/webhook/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verified');
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
