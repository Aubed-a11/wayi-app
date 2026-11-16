// ============================================================
// WAYI - Services externes : ce qui est branche "en reel"
// Une seule liste sert au bilan du demarrage, a /health, au script
// de configuration (npm run configurer) et au script de verification
// (npm run verifier). Les valeurs d'exemple du .env.example
// ("your_...", "xxxx", "ton-adresse@gmail.com"...) sont ignorees :
// sinon un service se croirait configure avec une fausse cle.
// ============================================================

const PLACEHOLDER = /^(your_|demo_|xxx|ACxxxx|EAAxxxx|AIzaSy\.\.\.|pk\.eyJ1IjoieW91ci11c2VyIn0|sk-ant-api03-xxxx|ton[-_]|change[-_]?me)|your[_-]|x{6,}|ton_mot_de_passe|ton-adresse@|xxxx xxxx|\.\.\.your|-----BEGIN PRIVATE KEY-----\\nXXXXXX/i;

function isSet(key) {
  const v = (process.env[key] || '').trim();
  return !!v && !PLACEHOLDER.test(v);
}

// Retire les valeurs d'exemple de l'environnement, pour que chaque service retombe proprement en simulation
function scrubPlaceholders() {
  const removed = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v.trim() && PLACEHOLDER.test(v.trim()) && /^[A-Z][A-Z0-9_]+$/.test(k)) {
      delete process.env[k];
      removed.push(k);
    }
  }
  return removed;
}

// besoin : indispensable | conseille | facultatif | inutile
const SERVICES = [
  {
    id: 'database', label: 'Base de données PostgreSQL', besoin: 'indispensable',
    keys: ['DATABASE_URL'],
    pourquoi: "Sans elle, comptes, commandes et menus sont effacés à chaque redémarrage du serveur.",
    ou: 'Sur le VPS : PostgreSQL en Docker (voir DEPLOIEMENT.md). Ou gratuit en ligne : neon.tech, puis copier la "connection string".',
  },
  {
    id: 'kkiapay', label: 'Paiement Kkiapay (MTN MoMo, Moov, carte)', besoin: 'indispensable',
    keys: ['KKIAPAY_PUBLIC_KEY', 'KKIAPAY_PRIVATE_KEY', 'KKIAPAY_SECRET'], extra: ['KKIAPAY_SANDBOX', 'KKIAPAY_WEBHOOK_SECRET'],
    pourquoi: 'Encaisse les paiements Mobile Money et carte. Sans lui, seules les espèces à la livraison sont proposées.',
    ou: "app.kkiapay.me : créer le compte marchand avec le RCCM, Développeurs > Clés API. Commencer avec KKIAPAY_SANDBOX=true, puis false. Webhook : https://TON-API/api/payments/webhook/kkiapay",
  },
  {
    id: 'email', label: 'E-mails (codes de vérification, reçus)', besoin: 'indispensable',
    keys: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'], alt: ['RESEND_API_KEY'], extra: ['SMTP_PORT', 'EMAIL_FROM'],
    pourquoi: "Le code de vérification à l'inscription et le mot de passe oublié partent par e-mail. Sans ça, personne ne peut créer de compte.",
    ou: "Gmail : myaccount.google.com/apppasswords (validation en 2 étapes activée), SMTP_HOST=smtp.gmail.com, SMTP_PORT=465. Ou resend.com (RESEND_API_KEY) avec un domaine vérifié.",
  },
  {
    id: 'claude', label: 'IA Claude (Yivi)', besoin: 'conseillé',
    keys: ['ANTHROPIC_API_KEY'], extra: ['ANTHROPIC_MODEL'],
    pourquoi: 'Yivi converse avec la vraie IA. Sans crédit, elle reste en mode secours (règles).',
    ou: 'console.anthropic.com : Billing pour ajouter du crédit, API Keys pour la clé.',
  },
  {
    id: 'whatsapp', label: 'WhatsApp Business (Meta)', besoin: 'conseillé',
    keys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], extra: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    pourquoi: 'Messages automatiques au client (commande acceptée, livrée). Sans lui, ces messages ne partent que par e-mail.',
    ou: "developers.facebook.com : créer une app Business, ajouter WhatsApp, un numéro dédié et un token permanent (utilisateur système).",
  },
  {
    id: 'twilio', label: 'SMS Twilio', besoin: 'facultatif',
    keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    pourquoi: "Secours si WhatsApp échoue. Payant par SMS (cher vers le Bénin) : à n'activer que si besoin.",
    ou: 'console.twilio.com',
  },
  {
    id: 'firebase', label: 'Notifications push Firebase', besoin: 'inutile',
    keys: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'],
    pourquoi: "Plus nécessaire : les notifications passent par la boîte interne du serveur, sauvegardée dans ta base de données.",
    ou: "console.firebase.google.com : créer le projet WAYI, Paramètres > Comptes de service > Générer une clé privée (project_id, client_email, private_key).",
  },
  {
    id: 'maps', label: 'Google Maps', besoin: 'inutile',
    keys: ['GOOGLE_MAPS_API_KEY'],
    pourquoi: "Les cartes et le suivi du livreur utilisent OpenStreetMap, gratuit et sans clé.",
    ou: '-',
  },
  {
    id: 'segment', label: 'Statistiques Segment', besoin: 'inutile',
    keys: ['SEGMENT_WRITE_KEY'],
    pourquoi: 'Outil marketing optionnel. Les statistiques utiles sont déjà dans le tableau de bord admin.',
    ou: '-',
  },
];

function serviceState(s) {
  const main = s.keys.every(isSet);
  const alt = s.alt ? s.alt.every(isSet) : false;
  return main || alt;
}

function report() {
  return SERVICES.map(s => ({ id: s.id, label: s.label, besoin: s.besoin, actif: serviceState(s) }));
}

module.exports = { SERVICES, isSet, scrubPlaceholders, serviceState, report, PLACEHOLDER };
