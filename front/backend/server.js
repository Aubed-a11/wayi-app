require('dotenv').config();
// Les valeurs d'exemple ("your_...") ne doivent pas faire croire qu'un service est branche
const { scrubPlaceholders, report: servicesReport } = require('./utils/integrations');
const ignoredExamples = scrubPlaceholders();
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const aiRoutes          = require('./routes/ai');
const menuRoutes        = require('./routes/menu');
const restaurantsRoutes = require('./routes/restaurants');
const ordersRoutes      = require('./routes/orders');
const driversRoutes     = require('./routes/drivers');
const merchantRoutes    = require('./routes/merchants');
const paymentRoutes     = require('./routes/payments');

const { initSocket, getRealtimeStats } = require('./services/realtime');
const { getPool: getDb }                = require('./services/database/postgres');
const { hydrateFromDatabase, persistToDatabase, applySecurityOverrides, seedDemoMenuIfEmpty, seedPartners } = require('./data/store');

const app    = express();
// Nécessaire car le trafic passe par un reverse proxy Nginx (X-Forwarded-For) :
// sans ça, express-rate-limit refuse de démarrer correctement (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;
// Sur un serveur où Nginx est devant, HOST=127.0.0.1 : l'API n'est alors joignable que par Nginx
// (pas directement depuis Internet sur le port). Par défaut, toutes les interfaces (développement).
const HOST   = process.env.HOST || '0.0.0.0';

// Origines autorisées (client, livreur, admin/restaurant) : voir config/origins.js,
// partagé avec Socket.io pour que l'API et le temps réel acceptent les mêmes sites.
const { allowedOrigins, isAllowedOrigin } = require('./config/origins');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    // Une ligne claire dans les logs (pm2 logs) : quelle origine a été refusée, et lesquelles sont permises.
    console.warn(`[CORS] Origine refusée : ${origin} (autorisées : ${allowedOrigins.join(', ')})`);
    const err = new Error('Origine non autorisée par CORS');
    err.status = 403;
    callback(err);
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({
  limit: '5mb',
  // Conserve le corps brut de la requête : nécessaire pour vérifier la signature
  // HMAC des webhooks (WhatsApp/Meta signe les octets bruts, pas le JSON re-sérialisé).
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
// Limites de requêtes (anti-abus). Voir middleware/rateLimitKeys.js : derrière un routeur qui ne transmet pas
// l'adresse du visiteur, la limite se fait par identifiant ou par jeton au lieu d'être partagée par tous.
const { makeLimiter, makeGlobalLoginCap } = require('./middleware/rateLimitKeys');
const LOGIN_PATHS = ['/api/auth/login', '/api/drivers/login', '/api/merchants/login', '/api/admin/login'];
app.use(LOGIN_PATHS, makeGlobalLoginCap(rateLimit, { windowMs: 15 * 60 * 1000, max: 300 }));
// Limite stricte seulement sur ce qui touche aux mots de passe et codes (et pas sur /auth/me,
// les favoris ou les adresses, appeles en usage normal et qui bloquaient le client apres 30 actions).
app.use(['/api/auth/login', '/api/auth/login-any', '/api/drivers/login', '/api/drivers/register', '/api/merchants/login', '/api/merchants/register', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/social'], makeLimiter(rateLimit, { windowMs: 15 * 60 * 1000, max: 30 }));
app.use('/api/drivers/login', makeLimiter(rateLimit, { windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api/merchants/login', makeLimiter(rateLimit, { windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api/admin/login', makeLimiter(rateLimit, { windowMs: 15 * 60 * 1000, max: 10 }));
app.use('/api/ai/chat', makeLimiter(rateLimit, { windowMs: 60 * 1000, max: 20 }));
app.use('/api', makeLimiter(rateLimit, { windowMs: 60 * 1000, max: 300 }));

app.get('/', (_req, res) => res.json({
  name: 'WAYI API', tagline: 'Livraison de repas, saveurs certifiées.',
  version: '1.0.0',
  services: { payment: ['Kkiapay', 'MTN MoMo', 'Moov', 'Orange Money'], maps: ['Google Maps', 'Mapbox', 'OSM'], notifications: ['WhatsApp', 'SMS', 'FCM'], ai: ['Yivi (Claude)'], realtime: ['Socket.io'], analytics: ['Segment'], database: ['PostgreSQL'] },
}));

app.use('/api/auth',        authRoutes);
app.use('/api/devices',     require('./routes/devices'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',       adminRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/menu',        menuRoutes);
app.use('/api/restaurants', restaurantsRoutes);
app.use('/api/orders',      ordersRoutes);
app.use('/api/drivers',     driversRoutes);
app.use('/api/merchants',   merchantRoutes);
// Univers WAYI Bénin (Mode masqué tant que le back office ne l'active pas)
const modeRoutes = require('./routes/mode');
app.get('/api/verticals', ...modeRoutes.verticals);
app.use('/api/mode', modeRoutes);
// Photos des plats envoyees depuis l'appli
// Photos envoyees (plats, logos, annonces Mode) : affichables depuis les sites WAYI (autre sous-domaine)
app.use('/uploads', (_req, res, next) => { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); });
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads'), { maxAge: '30d', fallthrough: false }));
app.use('/api/payments',    paymentRoutes);

app.get('/health', async (_req, res) => {
  // Vraie requête à la base (2 s maximum) : « configurée » ne veut pas dire « joignable ».
  let database = 'in-memory';
  const pool = getDb();
  if (pool) {
    try {
      await Promise.race([pool.query('SELECT 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
      database = 'postgresql';
    } catch { database = 'postgresql-injoignable'; }
  }
  res.json({
  status: 'ok', uptime: Math.round(process.uptime()), version: '1.0.0',
  realtime: getRealtimeStats(), database,
  services: Object.fromEntries(servicesReport().map(x => [x.id, x.actif])),
  });
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.path} introuvable` }));
app.use((err, _req, res, _next) => {
  if (err.status === 403) return res.status(403).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

initSocket(server);

// Sauvegarde périodique de l'état complet (voir data/store.js pour l'approche).
// Sans effet si la base de données n'est pas configurée (persistToDatabase se contente alors
// de ne rien faire), donc sans danger à laisser actif dans tous les cas.
const SAVE_INTERVAL_MS = 30 * 1000;
const saveIntervalHandle = setInterval(persistToDatabase, SAVE_INTERVAL_MS);

// Sauvegarde une dernière fois avant de s'arrêter proprement (redéploiement,
// `pm2 restart`, Ctrl+C...), pour réduire au minimum la fenêtre de perte de données.
async function shutdown(signal) {
  console.log(`\n[Server] Signal ${signal} reçu, sauvegarde de l'état avant arrêt...`);
  clearInterval(saveIntervalHandle);
  try {
    const saved = await persistToDatabase();
    console.log(saved ? '[Server] État sauvegardé en base. Arrêt.' : '[Server] Rien à sauvegarder (base de données non configurée). Arrêt.');
  } catch (err) {
    console.error('[Server] Échec de la sauvegarde finale :', err.message);
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function start() {
  // Restaure l'état sauvegardé (commandes, comptes créés, etc.) AVANT d'accepter
  // la moindre requête, pour ne jamais servir un mélange de données de démo et
  // de données réelles.
  await hydrateFromDatabase();
  // Menu de démonstration (Cotonou) : uniquement si la plateforme est encore vide.
  const seeded = seedDemoMenuIfEmpty();
  if (seeded) console.log(`  Menu de démonstration : ${seeded} plats ajoutés`);
  seedPartners();
  // Commandes acceptees sans livreur (ex. apres un redemarrage) : la recherche reprend
  try { const n = require('./services/dispatch').resumeDispatches(require('./data/store').orders); if (n) console.log(`  Recherche de livreur relancee pour ${n} commande(s)`); } catch (e) { console.error('[Dispatch]', e.message); }
  // Mots de passe administrateur/démo définis dans le .env : appliqués après la restauration de l'état.
  applySecurityOverrides();

  server.listen(PORT, HOST, () => {
    const list = servicesReport();
    const line = (x) => `  ${x.actif ? '[OK]       ' : x.besoin === 'inutile' ? '[inutile]  ' : '[a faire]  '}${x.label}${!x.actif && x.besoin !== 'inutile' ? ` (${x.besoin})` : ''}`;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  WAYI API -> http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}   (${process.env.NODE_ENV || 'development'})`);
    console.log('  Cartes et suivi livreur : OpenStreetMap (sans clé)   Temps réel : Socket.io');
    console.log('-'.repeat(60));
    list.filter(x => x.besoin !== 'inutile' || x.actif).forEach(x => console.log(line(x)));
    const todo = list.filter(x => !x.actif && x.besoin === 'indispensable');
    if (ignoredExamples.length) console.log(`  Valeurs d'exemple ignorées dans le .env : ${ignoredExamples.join(', ')}`);
    console.log(todo.length
      ? `  Pour passer en réel : npm run configurer, puis npm run verifier`
      : '  Tous les services indispensables sont branchés.');
    console.log(`${'='.repeat(60)}\n`);
  });
}

start();

module.exports = { app, server };
