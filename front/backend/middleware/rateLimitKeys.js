// ============================================================
// WAYI — Clé des limites de requêtes (anti-abus)
//
// Sur un serveur où un routeur TCP (nginx « stream ») est placé devant les sites sans transmettre
// l'adresse du visiteur, le backend voit TOUJOURS 127.0.0.1 : avec la clé par défaut (l'adresse),
// tous les utilisateurs partageraient une seule limite et quelques-uns suffiraient à bloquer tout le
// monde. Dans ce cas on limite par identifiant (e-mail visé) ou par jeton de connexion. Avec une
// vraie adresse (déploiement classique, ou routeur configuré pour la transmettre), le comportement
// reste exactement le même qu'avant : une limite par adresse.
// ============================================================
const crypto = require('crypto');

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

// Vrai quand req.ip n'est pas l'adresse d'un visiteur mais celle du routeur local.
const sharedAddress = (req) => isLoopback(req.ip);

function clientKey(req) {
  if (!sharedAddress(req)) return req.ip; // vraie adresse : comportement habituel
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const id = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 120) : '';
  if (id) return `id:${id}`;
  const auth = req.headers && req.headers.authorization;
  if (auth) return `tok:${crypto.createHash('sha1').update(String(auth)).digest('hex').slice(0, 16)}`;
  return 'anon'; // visiteur sans identifiant ni jeton : seul cas où tout le monde partage la même case
}

// Visiteurs anonymes (navigation du menu...) sans adresse fiable : ils partagent une case, on la
// rend donc beaucoup plus large pour ne pas bloquer le public ; les cas sensibles (connexion,
// inscription) ont une clé par identifiant, donc une limite exacte.
const ANON_FACTOR = 20;

// Construit un limiteur. `max` vaut pour une vraie adresse, un identifiant ou un jeton.
function makeLimiter(rateLimit, { windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: (req) => (sharedAddress(req) && clientKey(req) === 'anon' ? max * ANON_FACTOR : max),
    keyGenerator: clientKey,
  });
}

// Plafond global des tentatives de connexion, utile SEULEMENT quand l'adresse est inconnue : sans lui,
// un attaquant qui change d'e-mail à chaque essai échapperait à la limite par identifiant.
function makeGlobalLoginCap(rateLimit, { windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    keyGenerator: () => 'global-login',
    skip: (req) => !sharedAddress(req),
  });
}

module.exports = { clientKey, sharedAddress, makeLimiter, makeGlobalLoginCap, ANON_FACTOR };
