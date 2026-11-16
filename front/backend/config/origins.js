// ============================================================
// WAYI — Origines autorisées (CORS)
// Une seule liste, utilisée à la fois par l'API REST (server.js) et par Socket.io
// (services/realtime) : les deux doivent toujours accepter les mêmes sites.
//
// Pour ajouter un domaine sans toucher au code : FRONTEND_URLS dans le .env, séparés
// par des virgules (ex. FRONTEND_URLS=https://autre.exemple.com), puis `pm2 restart`.
// ============================================================

// Les trois applications publiées (déployées séparément sur Vercel).
const PRODUCTION_ORIGINS = [
  'https://www.wayibenin.com',     // application client
  'https://wayibenin.com',         // même application, sans « www »
  'https://driver.wayibenin.com',  // application livreur
  'https://admin.wayibenin.com',   // application restaurant + administration
];

// Applications mobiles Android / iOS (Capacitor) : la page tourne dans l'appli à ces adresses.
// L'authentification passe par un jeton (en-tête Authorization), pas par un cookie.
const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

// Ports de développement local : acceptés seulement hors production.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

// Une origine s'écrit sans « / » final : on l'enlève pour qu'une faute de frappe
// dans le .env (« https://exemple.com/ ») ne bloque pas silencieusement un site.
const normalize = (origin) => String(origin || '').trim().replace(/\/+$/, '');

const fromEnv = [
  ...(process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(',') : []),
  process.env.FRONTEND_URL,
].map(normalize).filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = [...new Set([
  ...PRODUCTION_ORIGINS,
  ...MOBILE_ORIGINS,
  ...fromEnv,
  ...(isProduction ? [] : DEV_ORIGINS),
])];

// Sans en-tête Origin (appel serveur à serveur : webhooks de paiement, curl, santé...), pas de CORS.
const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(normalize(origin));

module.exports = { allowedOrigins, isAllowedOrigin };
