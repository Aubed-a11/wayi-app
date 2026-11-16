// ============================================================
// WAYI - Assistant de configuration des services reels
// Usage (dans le dossier backend, en local ou sur le VPS) :
//   npm run configurer
// Pose les questions service par service et met a jour le fichier .env
// sans toucher aux autres lignes. Entree = garder la valeur actuelle,
// "-" = effacer la valeur. Une copie de securite .env.sauvegarde est faite.
// ============================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const ENV = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV });
const { SERVICES, isSet } = require('../utils/integrations');

// File d'attente des lignes : fonctionne au clavier comme avec des reponses collees d'un coup
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const queue = []; const waiting = []; let ended = false;
rl.on('line', l => { const w = waiting.shift(); if (w) w(l.trim()); else queue.push(l.trim()); });
rl.on('close', () => { ended = true; while (waiting.length) waiting.shift()(''); });
const ask = (q) => new Promise(res => {
  process.stdout.write(q);
  if (queue.length) { const a = queue.shift(); process.stdout.write(`${/KEY|SECRET|PASS|TOKEN|URL/.test(q) && a ? '****' : a}\n`); return res(a); }
  if (ended) { process.stdout.write('\n'); return res(''); }
  waiting.push(res);
});
const mask = (v) => (!v ? '(vide)' : v.length <= 8 ? '****' : `${v.slice(0, 4)}...${v.slice(-3)}`);

const HELP = {
  DATABASE_URL: 'ex : postgresql://wayi:MOTDEPASSE@127.0.0.1:5433/wayi  (ou la connection string Neon)',
  KKIAPAY_SANDBOX: 'true = mode test Kkiapay (aucun vrai prélèvement), false = argent réel',
  SMTP_HOST: 'ex : smtp.gmail.com', SMTP_PORT: '465 (SSL) ou 587', SMTP_USER: 'adresse e-mail complète',
  SMTP_PASS: "mot de passe d'application (16 lettres), pas le mot de passe du compte",
  EMAIL_FROM: 'ex : WAYI <ton-adresse@gmail.com>',
  ANTHROPIC_MODEL: 'claude-sonnet-5-5 conseillé',
  WHATSAPP_VERIFY_TOKEN: 'mot de ton choix, à recopier dans Meta pour le webhook',
  FIREBASE_PRIVATE_KEY: 'coller la clé sur une ligne, avec les \\n',
};

function readEnv() {
  return fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
}

function setValues(updates) {
  const lines = readEnv();
  const done = new Set();
  const out = lines.map(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in updates) { done.add(m[1]); return updates[m[1]] === null ? null : `${m[1]}=${quote(updates[m[1]])}`; }
    return l;
  }).filter(l => l !== null);
  const added = Object.entries(updates).filter(([k, v]) => !done.has(k) && v !== null);
  if (added.length) out.push('', `# Ajouté par npm run configurer (${new Date().toISOString().slice(0, 10)})`, ...added.map(([k, v]) => `${k}=${quote(v)}`));
  if (fs.existsSync(ENV)) fs.copyFileSync(ENV, `${ENV}.sauvegarde`);
  fs.writeFileSync(ENV, `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, { mode: 0o600 });
}

function quote(v) { return /[\s#"']/.test(v) && !/^".*"$/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v; }

(async () => {
  console.log('\nWAYI : configuration des services réels');
  console.log("Entrée = garder la valeur actuelle, - = effacer, et on passe au service suivant si tu ne l'as pas encore.\n");
  const updates = {};

  // Bases de securite en production
  if (!isSet('JWT_SECRET') || /change-in-prod|local-dev/.test(process.env.JWT_SECRET || '')) {
    const a = await ask('Le secret de connexion (JWT_SECRET) est celui par défaut. En générer un solide ? (O/n) ');
    if (!/^n/i.test(a)) updates.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  }
  if (process.env.NODE_ENV !== 'production') {
    const a = await ask('Est-ce le serveur de production (VPS) ? (o/N) ');
    if (/^o/i.test(a)) {
      updates.NODE_ENV = 'production';
      if (process.env.ALLOW_DEMO_ORDERS === '1') updates.ALLOW_DEMO_ORDERS = null;
      if (process.env.ALLOW_SIMULATED_PAYMENTS === '1') updates.ALLOW_SIMULATED_PAYMENTS = null;
    }
  }

  for (const s of SERVICES.filter(x => x.besoin !== 'inutile')) {
    const on = s.keys.every(isSet) || (s.alt && s.alt.every(isSet));
    console.log(`\n── ${s.label} [${s.besoin}] ${on ? '(déjà configuré)' : '(pas encore)'}`);
    console.log(`   ${s.pourquoi}`);
    console.log(`   Où l'obtenir : ${s.ou}`);
    const go = await ask(on ? '   Modifier ? (o/N) ' : '   Le configurer maintenant ? (o/N) ');
    if (!/^o/i.test(go)) continue;
    let keys = [...s.keys, ...(s.extra || [])];
    if (s.id === 'email') {
      const w = await ask('   Gmail/SMTP (1) ou Resend (2) ? ');
      keys = w === '2' ? ['RESEND_API_KEY', 'EMAIL_FROM'] : [...s.keys, ...(s.extra || [])];
    }
    for (const k of keys) {
      const cur = process.env[k];
      const v = await ask(`   ${k}${HELP[k] ? ` (${HELP[k]})` : ''}\n   actuel : ${/KEY|SECRET|PASS|TOKEN|URL/.test(k) ? mask(cur) : cur || '(vide)'}\n   > `);
      if (v === '-') updates[k] = null;
      else if (v) updates[k] = v;
    }
  }

  // Contacts du service client donnes par Yivi
  const c = await ask('\n── Contacts du service client (donnés par Yivi aux clients). Les renseigner ? (o/N) ');
  if (/^o/i.test(c)) {
    for (const k of ['SUPPORT_WHATSAPP', 'SUPPORT_PHONE', 'SUPPORT_EMAIL']) {
      const v = await ask(`   ${k} (actuel : ${process.env[k] || '(vide)'}) > `);
      if (v === '-') updates[k] = null; else if (v) updates[k] = v;
    }
  }

  rl.close();
  if (!Object.keys(updates).length) { console.log('\nAucun changement.'); return; }
  setValues(updates);
  console.log(`\n.env mis à jour (${Object.keys(updates).length} valeur(s)). Copie de l'ancien : .env.sauvegarde`);
  console.log('Étape suivante : npm run verifier   (teste chaque clé pour de vrai)');
  console.log('Puis redémarre le serveur (sur le VPS : wayi-pm2 restart wayi-backend).\n');
})();
