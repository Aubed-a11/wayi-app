// ============================================================
// WAYI — Service de Notifications
// WhatsApp Business API (Meta) + Twilio SMS + Firebase FCM
// ============================================================
const axios = require('axios');

const WA_URL     = process.env.WHATSAPP_API_URL       || 'https://graph.facebook.com/v18.0';
const WA_PHONE   = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN   = process.env.WHATSAPP_ACCESS_TOKEN   || '';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID      || '';
const TWILIO_TK  = process.env.TWILIO_AUTH_TOKEN       || '';
const TWILIO_NUM = process.env.TWILIO_PHONE_NUMBER     || '';

// ── TEMPLATES WHATSAPP ────────────────────────────────────────
const WA_TEMPLATES = {
  order_confirmed: (data) => ({
    type: 'template',
    template: {
      name: 'order_confirmed',
      language: { code: 'fr' },
      components: [
        { type: 'body', parameters: [
          { type: 'text', text: data.userName },
          { type: 'text', text: data.orderId },
          { type: 'text', text: data.shopName },
          { type: 'text', text: data.total },
          { type: 'text', text: data.estimatedTime },
        ]},
      ],
    },
  }),
  order_on_the_way: (data) => ({
    type: 'template',
    template: {
      name: 'order_on_the_way',
      language: { code: 'fr' },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: data.driverName },
        { type: 'text', text: data.eta },
        { type: 'text', text: data.driverPhone },
      ]}],
    },
  }),
  order_delivered: (data) => ({
    type: 'template',
    template: {
      name: 'order_delivered',
      language: { code: 'fr' },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.shopName },
        { type: 'text', text: data.ratingUrl || 'wayi.app/rate' },
      ]}],
    },
  }),
};

// ── MESSAGE TEXTS (SMS + WhatsApp texte simple) ───────────────
const MESSAGES = {
  order_confirmed: (d) =>
    `Wayi : Commande confirmée.\n\nBonjour ${d.userName}, ta commande #${d.orderId} est en cours de préparation.\n\nTotal : ${d.total} FCFA\nLivraison estimée : ${d.estimatedTime}\n\nSuis ta commande sur Wayi.`,

  order_preparing: (d) =>
    `Wayi : ta commande #${d.orderId} est en préparation. Un livreur sera assigné sous peu.`,

  order_on_the_way: (d) =>
    `Wayi : Ton livreur est en route.\n\n*${d.driverName}* (${d.vehiclePlate}) arrive dans environ ${d.eta} min.\nAppelle-le : ${d.driverPhone}\n\nCommande : #${d.orderId}`,

  order_delivered: (d) =>
    `Wayi : Livré.\n\nBonjour ${d.userName}, ta commande est arrivée. Bon appétit.\n\nNote ta commande : ${d.ratingUrl || 'wayi.app'}\n\nMerci de faire confiance à Wayi.`,

  order_cancelled: (d) =>
    `Wayi : Commande #${d.orderId} annulée.\n\nRaison : ${d.reason || 'Annulation demandée'}. Si tu as payé en ligne, le remboursement sera effectué sous 24 à 48h.\n\nBesoin d'aide ? Réponds à ce message.`,

  promo_alert: (d) =>
    `Wayi : Offre exclusive.\n\n${d.title}\n${d.description}\n\nCode : *${d.code}*\nValable jusqu'au ${d.validUntil}\n\nCommande maintenant sur Wayi.`,

  driver_new_order: (d) =>
    `Wayi Driver : Nouvelle livraison disponible.\n\n${d.shopName}\nLivraison : ${d.address}\nTes gains : ${d.earnings} FCFA\n\nRéponds OUI pour accepter ou NON pour refuser.`,

  merchant_new_order: (d) =>
    `Wayi Commerce : Nouvelle commande #${d.orderId}.\n\n${d.itemsSummary}\nTotal : ${d.total} FCFA\n\nRéponds PRÊT quand la commande est prête.`,

  pharmacy_guard: (d) =>
    `Wayi Pharma : Pharmacie de garde ce soir.\n\n*${d.pharmacyName}*\n${d.address}\n${d.phone}\n${d.hours}\n\nLivraison disponible via Wayi.`,
};

// ── WHATSAPP BUSINESS API ─────────────────────────────────────

async function sendWhatsApp({ to, type = 'text', text, templateData, templateName }) {
  const phone = to.replace(/\s/g, '').replace('+', '');

  // Mode simulation si pas de config
  if (!WA_TOKEN || !WA_PHONE) {
    console.log(`[WhatsApp SIMULATION] → ${to}: ${text?.substring(0, 80)}...`);
    return { success: true, simulated: true, messageId: `SIM-WA-${Date.now()}`, to, text };
  }

  try {
    let messageBody;

    if (type === 'template' && templateName) {
      const templateFn = WA_TEMPLATES[templateName];
      messageBody = templateFn ? templateFn(templateData) : { type: 'text', text: { body: text } };
    } else {
      messageBody = { type: 'text', text: { body: text, preview_url: false } };
    }

    const res = await axios.post(
      `${WA_URL}/${WA_PHONE}/messages`,
      { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, ...messageBody },
      { headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );

    return { success: true, provider: 'whatsapp', messageId: res.data.messages?.[0]?.id, to };
  } catch (err) {
    console.error('[WhatsApp] Error:', err.response?.data || err.message);
    // Fallback vers SMS si WhatsApp échoue
    return sendSMS({ to, message: text });
  }
}

// ── TWILIO SMS ────────────────────────────────────────────────

async function sendSMS({ to, message }) {
  if (!TWILIO_SID || !TWILIO_TK) {
    console.log(`[SMS SIMULATION] → ${to}: ${message?.substring(0, 60)}...`);
    return { success: true, simulated: true, messageId: `SIM-SMS-${Date.now()}`, to };
  }

  try {
    const twilio = require('twilio');
    const client = twilio(TWILIO_SID, TWILIO_TK);
    const msg = await client.messages.create({
      body: message.replace(/\*/g, ''), // Supprimer le markdown WhatsApp
      from: TWILIO_NUM,
      to,
    });
    return { success: true, provider: 'twilio', messageId: msg.sid, to };
  } catch (err) {
    console.error('[Twilio] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── EMAIL (Resend) ────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'WAYI <no-reply@wayi.bj>';

// ── SMTP (envoi via un compte e-mail classique, ex: Gmail) ─────
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const nodemailer = require('nodemailer');
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true pour le port 465 (SSL direct), false pour 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return smtpTransporter;
}

async function sendEmail({ to, subject, html }) {
  // Tous les e-mails portent la mise en page WAYI (logo, couleurs)
  html = require('../email/templates').wrap(html, subject);
  // 1. SMTP (compte e-mail classique) — prioritaire si configuré
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = getSmtpTransporter();
      const info = await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
      return { success: true, provider: 'smtp', messageId: info.messageId, to };
    } catch (err) {
      console.error('[SMTP] Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 2. Resend (API), si une clé est configurée
  if (RESEND_API_KEY) {
    try {
      const { data } = await axios.post(
        'https://api.resend.com/emails',
        { from: EMAIL_FROM, to, subject, html },
        { headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, provider: 'resend', messageId: data.id, to };
    } catch (err) {
      console.error('[Resend] Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // 3. Simulation (aucun service configuré)
  console.log(`[Email SIMULATION] → ${to} | ${subject}\n${html?.replace(/<[^>]+>/g, ' ').trim()}`);
  return { success: true, simulated: true, messageId: `SIM-EMAIL-${Date.now()}`, to };
}

// ── FIREBASE FCM (Push Notifications) ────────────────────────

async function sendPushNotification({ token, title, body, data = {}, imageUrl }) {
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.log(`[FCM SIMULATION] → ${token?.substring(0, 20)}...: ${title} — ${body}`);
    return { success: true, simulated: true, messageId: `SIM-FCM-${Date.now()}` };
  }

  try {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    // Une seule initialisation : la refaire a chaque envoi faisait echouer tous les envois suivants
    const app = getApps().find(a => a.name === 'wayi') || initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    }, 'wayi');

    const message = {
      token,
      notification: imageUrl ? { title, body, imageUrl } : { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    };

    const response = await getMessaging(app).send(message);
    return { success: true, provider: 'fcm', messageId: response };
  } catch (err) {
    console.error('[FCM] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── NOTIFICATION ORCHESTRATOR ─────────────────────────────────
// Point d'entrée principal — choisit le bon canal

// ── EMAIL (confirmation de commande) ──────────────────────────
const EMAIL_SUBJECTS = {
  order_confirmed:  (d) => `Commande confirmée · ${d.orderId}`,
  order_delivered:  (d) => `Livré ! Bon appétit`,
  order_cancelled:  (d) => `Commande annulée · ${d.orderId}`,
};
function emailBody(event, d) {
  const mails = require('../email/templates');
  if (event === 'order_confirmed') return mails.orderConfirmed(d);
  if (event === 'order_delivered') return mails.orderDelivered(d);
  if (event === 'order_cancelled') return mails.orderCancelled(d);
  return mails.wrap(`<p>${d.userName || ''}</p>`, 'WAYI');
}
async function sendOrderEmail({ email, event, data }) {
  const subjectFn = EMAIL_SUBJECTS[event];
  if (!email || !subjectFn) return null;
  return sendEmail({ to: email, subject: subjectFn(data), html: emailBody(event, data) });
}

async function notify({ userId, phone, email, fcmToken, event, data }) {
  const messageText = MESSAGES[event]?.(data);
  if (!messageText) { console.warn(`[Notify] Unknown event: ${event}`); return; }

  const results = [];

  // 1. WhatsApp (canal principal)
  if (phone) {
    const wa = await sendWhatsApp({ to: phone, text: messageText });
    results.push({ channel: 'whatsapp', ...wa });
  }

  // 2. E-mail (confirmation formelle, avec reçu détaillé)
  if (email) {
    const mail = await sendOrderEmail({ email, event, data });
    if (mail) results.push({ channel: 'email', ...mail });
  }

  // 3. Push notification FCM
  if (fcmToken) {
    const PUSH_TITLES = {
      order_confirmed:  'Commande confirmée',
      order_on_the_way: 'Ton livreur arrive',
      order_delivered:  'Livraison effectuée',
      promo_alert:      'Offre exclusive',
    };
    const push = await sendPushNotification({
      token: fcmToken,
      title: PUSH_TITLES[event] || 'Wayi',
      body: messageText.replace(/\*/g, '').substring(0, 120),
      data: { event, orderId: data.orderId || '', userId: userId || '' },
    });
    results.push({ channel: 'fcm', ...push });
  }

  console.log(`[Notify] Event "${event}" -> ${results.length} channel(s) for user ${userId}`);
  return results;
}

// ── WEBHOOK HANDLER (WhatsApp entrant) ───────────────────────

function parseWhatsAppWebhook(body) {
  try {
    const entry = body.entry?.[0]?.changes?.[0]?.value;
    if (!entry?.messages) return null;
    const msg = entry.messages[0];
    return {
      from: msg.from,
      type: msg.type,
      text: msg.text?.body || '',
      messageId: msg.id,
      timestamp: msg.timestamp,
    };
  } catch { return null; }
}

// Répondre aux messages WhatsApp entrants (OUI/NON/PRÊT/etc.)
async function handleWhatsAppReply({ from, text }) {
  const response = text?.toLowerCase().trim();
  let reply = '';

  if (['oui', 'yes', 'ok', 'accepter'].includes(response)) {
    reply = 'Super, tu as accepté la livraison. Lance Wayi Driver pour voir les détails.';
  } else if (['non', 'no', 'refuser'].includes(response)) {
    reply = 'Compris, la livraison sera proposée à un autre livreur.';
  } else if (['prêt', 'pret', 'ready'].includes(response)) {
    reply = 'Parfait, on prévient le livreur que ta commande est prête à être récupérée.';
  } else {
    reply = `Bonjour, je suis l'assistant Wayi.\n\nPour de l'aide, contacte notre support :\n+229 XX XX XX XX\nsupport@wayi.app`;
  }

  return sendWhatsApp({ to: from, text: reply });
}

module.exports = {
  sendWhatsApp, sendSMS, sendEmail, sendPushNotification, notify,
  parseWhatsAppWebhook, handleWhatsAppReply,
  MESSAGES,
};
