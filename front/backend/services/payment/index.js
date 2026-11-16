// ============================================================
// WAYI — Service de Paiement Unifié
// Kkiapay (agrégateur) + MTN MoMo + Moov Money + Orange Money
// ============================================================
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ── CONFIG ───────────────────────────────────────────────────
const config = {
  kkiapay: {
    publicKey:  process.env.KKIAPAY_PUBLIC_KEY  || 'demo_public_key',
    privateKey: process.env.KKIAPAY_PRIVATE_KEY || 'demo_private_key',
    secret:     process.env.KKIAPAY_SECRET      || 'demo_secret',
    sandbox:    process.env.KKIAPAY_SANDBOX !== 'false',
    host:       process.env.KKIAPAY_API_HOST || (process.env.KKIAPAY_SANDBOX !== 'false'
      ? 'https://api-sandbox.kkiapay.me'
      : 'https://api.kkiapay.me'),
  },
  mtn: {
    baseUrl:         process.env.MTN_MOMO_BASE_URL         || 'https://sandbox.momodeveloper.mtn.com',
    subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY || 'demo_key',
    apiUser:         process.env.MTN_MOMO_API_USER         || uuidv4(),
    apiKey:          process.env.MTN_MOMO_API_KEY          || 'demo_api_key',
    targetEnv:       process.env.MTN_MOMO_TARGET_ENV       || 'sandbox',
  },
  moov: {
    baseUrl:    process.env.MOOV_API_URL    || 'https://api.moov-africa.bj',
    apiKey:     process.env.MOOV_API_KEY    || 'demo_moov_key',
    merchantId: process.env.MOOV_MERCHANT_ID || 'demo_merchant',
  },
  orange: {
    baseUrl:      process.env.ORANGE_MONEY_API_URL    || 'https://api.orange.com/orange-money-webpay/bj/v1',
    authUrl:      process.env.ORANGE_MONEY_AUTH_URL   || 'https://api.orange.com/oauth/v3/token',
    clientId:     process.env.ORANGE_MONEY_CLIENT_ID  || 'demo_client',
    clientSecret: process.env.ORANGE_MONEY_CLIENT_SECRET || 'demo_secret',
  },
  qosic: {
    baseUrl:      process.env.QOSIC_BASE_URL      || 'https://qosic.net/QOSIC_SERVER/api',
    clientId:     process.env.QOSIC_CLIENT_ID     || 'demo_id',
    clientSecret: process.env.QOSIC_CLIENT_SECRET || 'demo_secret',
  },
};

// ── MODE DE PAIEMENT ──────────────────────────────────────────
// 'kkiapay' : les 3 clés Kkiapay sont configurées → widget Kkiapay (MTN MoMo, Moov, carte).
//             KKIAPAY_SANDBOX=false = argent réel ; sinon mode test Kkiapay (aucun vrai prélèvement).
// 'test'    : simulation locale (aucun argent). Hors production, ou si ALLOW_SIMULATED_PAYMENTS=1.
// 'manual'  : pas de clés Kkiapay : le client envoie l'argent sur le numéro Mobile Money du restaurant
//             (ou de WAYI) et le bénéficiaire confirme la réception.
// 'off'     : rien de tout ça → seul le cash à la livraison est accepté.
function hasKkiapayKeys() {
  const k = config.kkiapay;
  const bad = v => !v || /^(demo_|your_)/.test(v);
  return ![k.publicKey, k.privateKey, k.secret].some(bad);
}
function kkiapaySandbox() { return config.kkiapay.sandbox; }
// 'manual' : le client envoie lui-même l'argent au numéro Mobile Money de WAYI, puis WAYI confirme
//            la réception dans l'admin. Aucune clé d'agrégateur nécessaire, mais confirmation humaine.
function manualNumbers() {
  return {
    mtn_momo: process.env.WAYI_MTN_NUMBER || '+2290142436387',
    moov:     process.env.WAYI_MOOV_NUMBER || '+2290194805026',
  };
}
function paymentMode() {
  if (hasKkiapayKeys()) return 'kkiapay';
  if (process.env.ALLOW_SIMULATED_PAYMENTS === '1' || process.env.NODE_ENV !== 'production') return 'test';
  if (process.env.DISABLE_MANUAL_MOMO !== '1' && (manualNumbers().mtn_momo || manualNumbers().moov)) return 'manual';
  return 'off';
}
// Quels moyens sont utilisables selon le mode
function methodAvailable(id) {
  const mode = paymentMode();
  if (id === 'cash') return true;
  if (mode === 'test') return true;
  if (mode === 'kkiapay') return id === 'mtn_momo' || id === 'moov' || id === 'card';
  if (mode === 'manual') return (id === 'mtn_momo' || id === 'moov') && !!manualNumbers()[id];
  return false;
}

// ── PAYMENT METHODS CATALOG ───────────────────────────────────
const PAYMENT_METHODS = [
  { id: 'mtn_momo',  label: 'MTN MoMo',        icon: 'smartphone', provider: 'kkiapay', prefix: ['67','68','69','96','97'] },
  { id: 'moov',      label: 'Moov Money',       icon: 'smartphone', provider: 'kkiapay', prefix: ['94','95','66'] },
  { id: 'orange',    label: 'Orange Money',     icon: 'circle', provider: 'orange',  prefix: ['90','91'] },
  { id: 'card',      label: 'Carte bancaire',   icon: 'credit-card', provider: 'kkiapay', prefix: [] },
  { id: 'cash',      label: 'Cash livraison',   icon: 'banknote', provider: 'internal', prefix: [] },
  { id: 'wayi_pay',  label: 'Wayi Pay',         icon: 'zap', provider: 'internal', prefix: [], comingSoon: true },
];

// ── KKIAPAY (agrégateur principal) ───────────────────────────

/**
 * Kkiapay : le paiement se fait dans le widget Kkiapay, ouvert par l'appli du client.
 * Le serveur ne débite rien lui-même : il prépare la commande et VÉRIFIE ensuite la transaction.
 */
async function initiateKkiapayPayment({ amount, phone, method, orderId }) {
  const mode = paymentMode();
  if (mode === 'kkiapay') {
    return {
      success: true, widget: true, provider: 'kkiapay', status: 'awaiting_payment',
      publicKey: config.kkiapay.publicKey, sandbox: kkiapaySandbox(),
      amount, phone, orderId, method,
    };
  }
  if (mode === 'off' || mode === 'manual') {
    return { success: false, error: "Le paiement en ligne n'est pas encore activé. Choisis « Espèces à la livraison »." };
  }
  return simulatePayment({ amount, phone, method, orderId, provider: 'kkiapay' });
}

/**
 * Vérifier une transaction Kkiapay auprès de Kkiapay (jamais sur la seule parole du client).
 * Même appel que le SDK officiel @kkiapay-org/nodejs-sdk : POST /api/v1/transactions/status.
 */
async function verifyKkiapayPayment(transactionId) {
  if (!hasKkiapayKeys()) {
    if (paymentMode() === 'test' && String(transactionId).startsWith('SIM-')) {
      return { success: true, status: 'SUCCESS', transactionId, verified: true, simulated: true };
    }
    return { success: false, status: 'error', error: 'Kkiapay non configuré' };
  }
  if (String(transactionId).startsWith('SIM-')) return { success: false, status: 'error', error: 'Transaction simulée refusée' };
  const k = config.kkiapay;
  try {
    const { data } = await axios.post(`${k.host}/api/v1/transactions/status`, { transactionId }, {
      headers: { 'x-api-key': k.publicKey, 'x-secret-key': k.secret, 'x-private-key': k.privateKey },
      timeout: 15000,
    });
    const status = String(data?.status || data?.state || '').toUpperCase();
    return {
      success: status === 'SUCCESS', status, transactionId,
      amount: data?.amount !== undefined ? Number(data.amount) : undefined,
      partnerId: data?.partnerId ?? data?.partner_id,
      verified: true,
    };
  } catch (err) {
    console.error('[Kkiapay] Verify error:', err.response?.status, err.response?.data || err.message);
    return { success: false, status: 'error', error: 'Vérification impossible' };
  }
}

// ── MTN MOMO (API directe) ────────────────────────────────────

/**
 * MTN MoMo Collection API — Request to Pay
 */
async function initiateMtnMomoPayment({ amount, phone, orderId }) {
  if (config.mtn.targetEnv === 'sandbox' || !process.env.MTN_MOMO_SUBSCRIPTION_KEY) {
    return simulatePayment({ amount, phone, orderId, provider: 'mtn_momo' });
  }

  const referenceId = uuidv4();
  const phoneFormatted = phone.replace(/\s/g, '').replace('+229', '229');

  try {
    // 1. Request to Pay
    await axios.post(
      `${config.mtn.baseUrl}/collection/v1_0/requesttopay`,
      {
        amount: String(amount),
        currency: 'XOF',
        externalId: orderId,
        payer: { partyIdType: 'MSISDN', partyId: phoneFormatted },
        payerMessage: `Wayi commande ${orderId}`,
        payeeNote: 'Paiement Wayi',
      },
      {
        headers: {
          Authorization: `Bearer ${await getMtnToken()}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': config.mtn.targetEnv,
          'Ocp-Apim-Subscription-Key': config.mtn.subscriptionKey,
          'Content-Type': 'application/json',
        },
      }
    );

    return { success: true, provider: 'mtn_momo', transactionId: referenceId, status: 'pending', amount, phone, orderId };
  } catch (err) {
    console.error('[MTN MoMo] Error:', err.response?.data || err.message);
    return simulatePayment({ amount, phone, orderId, provider: 'mtn_momo' });
  }
}

async function getMtnToken() {
  const credentials = Buffer.from(`${config.mtn.apiUser}:${config.mtn.apiKey}`).toString('base64');
  const res = await axios.post(
    `${config.mtn.baseUrl}/collection/token/`,
    {},
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': config.mtn.subscriptionKey,
      },
    }
  );
  return res.data.access_token;
}

// ── MOOV MONEY ────────────────────────────────────────────────

async function initiateMovPayment({ amount, phone, orderId }) {
  if (!process.env.MOOV_API_KEY) {
    return simulatePayment({ amount, phone, orderId, provider: 'moov' });
  }
  try {
    const phoneFormatted = phone.replace(/\s/g, '').replace('+229', '');
    const res = await axios.post(`${config.moov.baseUrl}/payment/collect`, {
      amount, phone: phoneFormatted, merchant_id: config.moov.merchantId,
      order_id: orderId, currency: 'XOF', description: `Wayi commande ${orderId}`,
    }, {
      headers: { Authorization: `Bearer ${config.moov.apiKey}`, 'Content-Type': 'application/json' },
    });
    return { success: true, provider: 'moov', transactionId: res.data.transaction_id, status: 'pending', amount, phone, orderId };
  } catch (err) {
    return simulatePayment({ amount, phone, orderId, provider: 'moov' });
  }
}

// ── ORANGE MONEY ─────────────────────────────────────────────

async function initiateOrangeMoneyPayment({ amount, phone, orderId }) {
  if (!process.env.ORANGE_MONEY_CLIENT_ID) {
    return simulatePayment({ amount, phone, orderId, provider: 'orange' });
  }
  try {
    // 1. Get OAuth token
    const authRes = await axios.post(config.orange.authUrl,
      `grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${Buffer.from(`${config.orange.clientId}:${config.orange.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const token = authRes.data.access_token;

    // 2. Initiate payment
    const payRes = await axios.post(`${config.orange.baseUrl}/webpayment`, {
      merchant_key: config.orange.clientId,
      currency: 'OUV', amount, order_id: orderId,
      return_url: `${process.env.FRONTEND_URL}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      notif_url: `${process.env.WEBHOOK_BASE_URL}/api/payments/webhook/orange`,
      lang: 'fr', reference: `WAYI-${orderId}`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    return { success: true, provider: 'orange', paymentUrl: payRes.data.payment_url, transactionId: payRes.data.pay_token, status: 'pending', amount, phone, orderId };
  } catch (err) {
    return simulatePayment({ amount, phone, orderId, provider: 'orange' });
  }
}

// ── QOSIC (agrégateur alternatif) ────────────────────────────

async function initiateQosicPayment({ amount, phone, method, orderId }) {
  if (!process.env.QOSIC_CLIENT_ID) {
    return simulatePayment({ amount, phone, orderId, provider: 'qosic' });
  }
  try {
    const phoneFormatted = phone.replace(/\s/g, '').replace('+229', '');
    const networkType = method === 'mtn_momo' ? 'MTN' : 'MOOV';
    const res = await axios.post(`${config.qosic.baseUrl}/requesttopay`, {
      clientid: config.qosic.clientId,
      clientpassword: config.qosic.clientSecret,
      amount: String(amount), phone: phoneFormatted,
      networktype: networkType, transref: orderId,
    }, { headers: { 'Content-Type': 'application/json' } });

    return { success: true, provider: 'qosic', transactionId: res.data.responsecode === '01' ? res.data.transactionId : null, status: res.data.responsecode === '01' ? 'pending' : 'failed', amount, phone, orderId };
  } catch (err) {
    return simulatePayment({ amount, phone, orderId, provider: 'qosic' });
  }
}

// ── SIMULATION (dev/sandbox) ──────────────────────────────────

function simulatePayment({ amount, phone, method, orderId, provider }) {
  const txId = `SIM-${provider?.toUpperCase() || 'PAY'}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  console.log(`[Payment SIMULATION] ${provider} | ${amount} XOF | ${phone} | Order: ${orderId} | TxID: ${txId}`);
  return {
    success: true, simulated: true, provider: provider || 'simulation',
    transactionId: txId, status: 'pending',
    amount, phone, orderId,
    message: `Paiement simulé (${provider}). En production, utilise une vraie clé API.`,
    simulatedSuccessIn: 3000, // ms — le paiement "réussit" après 3s en simulation
  };
}

// ── ROUTEUR PRINCIPAL ─────────────────────────────────────────

/**
 * Initier un paiement selon la méthode choisie
 * Point d'entrée principal pour toute transaction Wayi
 */
async function initiatePayment({ method, amount, phone, orderId, callbackUrl }) {
  console.log(`[Payment] Initiating ${method} | ${amount} XOF | Order: ${orderId}`);

  switch (method) {
    case 'mtn_momo':
      // Essai Kkiapay d'abord (agrégateur), fallback MTN direct
      return initiateKkiapayPayment({ amount, phone, method, orderId, callbackUrl });

    case 'moov':
      return initiateKkiapayPayment({ amount, phone, method, orderId, callbackUrl });

    case 'orange':
      return initiateOrangeMoneyPayment({ amount, phone, orderId });

    case 'card':
      return initiateKkiapayPayment({ amount, phone, method: 'card', orderId, callbackUrl });

    case 'cash':
      // Cash à la livraison — pas de paiement en ligne
      return { success: true, provider: 'cash', transactionId: `CASH-${orderId}`, status: 'pending_delivery', amount, phone, orderId, message: 'Paiement en espèces à la livraison.' };

    case 'qosic':
      return initiateQosicPayment({ amount, phone, method, orderId });

    default:
      return { success: false, error: `Méthode de paiement inconnue : ${method}` };
  }
}

/**
 * Vérifier le statut d'un paiement
 */
async function verifyPayment({ provider, transactionId }) {
  if (provider === 'kkiapay') return verifyKkiapayPayment(transactionId);
  if (transactionId?.startsWith('CASH-')) {
    return { success: true, status: 'success', transactionId, verified: true };
  }
  if (transactionId?.startsWith('SIM-') && paymentMode() === 'test') {
    return { success: true, status: 'success', transactionId, verified: true, simulated: true };
  }
  return { success: false, status: 'unknown', error: 'Provider non supporté pour vérification' };
}

/**
 * Détecter le réseau mobile à partir du préfixe du numéro
 */
function detectNetwork(phone) {
  const cleaned = phone.replace(/\s/g, '').replace('+229', '');
  const prefix = cleaned.substring(0, 2);
  const method = PAYMENT_METHODS.find(m => m.prefix.includes(prefix));
  return method?.id || 'mtn_momo'; // MTN par défaut au Bénin
}

/**
 * Calculer les frais de transaction
 */
function calculateFees(amount, method) {
  const rates = { mtn_momo: 0.01, moov: 0.01, orange: 0.015, card: 0.025, cash: 0, wayi_pay: 0 };
  const rate = rates[method] || 0.01;
  return { amount, fee: Math.round(amount * rate), total: amount + Math.round(amount * rate), rate: `${rate * 100}%` };
}

module.exports = {
  initiatePayment, verifyPayment, detectNetwork, calculateFees,
  initiateKkiapayPayment, verifyKkiapayPayment,
  initiateMtnMomoPayment, initiateMovPayment,
  initiateOrangeMoneyPayment, initiateQosicPayment,
  PAYMENT_METHODS, paymentMode, manualNumbers, methodAvailable, kkiapaySandbox,
};
