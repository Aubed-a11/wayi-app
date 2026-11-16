// Cree backend/.env pour le developpement local s'il n'existe pas encore.
// Donnees en memoire (pas de base PostgreSQL), paiements simules, plats d'exemple commandables.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(file)) { console.log('[local] backend/.env existe deja, on le garde.'); process.exit(0); }
// Cle Claude lue dans cle-claude.txt (racine du projet, jamais envoye sur GitHub)
const keyFile = path.join(__dirname, '..', '..', 'cle-claude.txt');
const claudeKey = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
const lines = [
  '# Genere pour le local par scripts/creer-env-local.js (modifiable)',
  'NODE_ENV=development',
  'PORT=3001',
  'JWT_SECRET=wayi-local-dev-secret-a-ne-pas-utiliser-en-production',
  'ALLOW_DEMO_ORDERS=1',
  'ALLOW_SIMULATED_PAYMENTS=1',
  '# Yivi avec la vraie IA (laisser vide pour le mode secours)',
  'ANTHROPIC_API_KEY=' + claudeKey,
  'ANTHROPIC_MODEL=claude-sonnet-5-5',
  '',
];
fs.writeFileSync(file, lines.join('\n'));
console.log('[local] backend/.env cree (mode local).');
