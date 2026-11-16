const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Sans JWT_SECRET définie, on génère un secret aléatoire à chaque démarrage plutôt que
// de retomber sur une valeur fixe (qui serait visible par quiconque a accès au code).
// Conséquence : tous les tokens émis avant un redémarrage sans JWT_SECRET deviennent
// invalides après ce redémarrage (déconnexion forcée) — c'est le compromis choisi pour
// ne jamais servir un secret prévisible. Définis JWT_SECRET dans backend/.env pour l'éviter.
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET non définie dans .env — un secret temporaire aléatoire est utilisé pour cette instance uniquement.');
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
if (process.env.NODE_ENV === 'production' && /^wayi-super-secret/.test(process.env.JWT_SECRET || '')) {
  console.warn('[SECURITY] JWT_SECRET a encore la valeur d\'exemple de .env.example : remplace-la par une longue valeur aléatoire (openssl rand -hex 48).');
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

// Vérifie un token avec LE MÊME secret que l'API REST (utilisé aussi par Socket.io).
const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = { auth, signToken, verifyToken };
